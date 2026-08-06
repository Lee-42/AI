import { describe, expect, it, vi } from "vitest";

import { VolcengineArkLanguageModel } from "../src/ai/volcengine-ark-language-model.js";
import { SecretValue } from "../src/core/secret-value.js";

const request = {
  locale: "zh-CN" as const,
  systemInstruction: "组合后的系统策略",
  history: [
    { role: "user" as const, content: "上一轮问题" },
    { role: "assistant" as const, content: "上一轮回答" },
  ],
  question: "普通商品多久可以申请退货？",
  evidence: [
    {
      sourceId: "policy-return-general@2026-01",
      title: "退换货通用规则",
      content: "普通商品可在签收后七个自然日内发起退货申请。",
    },
  ],
  maxOutputTokens: 256,
  temperature: 0.1,
  topP: 0.3,
};

describe("VolcengineArkLanguageModel", () => {
  it("maps the provider request and validates a grounded response", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({
        id: "021-provider-request",
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content:
                "普通商品可在签收后七个自然日内发起退货申请。[policy-return-general@2026-01]",
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 28, total_tokens: 148 },
      }),
    );
    const model = createModel(fetchImpl);

    const result = await model.generateGroundedAnswer(request);

    expect(result).toEqual({
      text: "普通商品可在签收后七个自然日内发起退货申请。",
      citedSourceIds: ["policy-return-general@2026-01"],
      finishReason: "stop",
      usage: { inputTokens: 120, outputTokens: 28 },
      providerRequestId: "021-provider-request",
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/chat/completions");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer unit-test-ark-key",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "ep-unit-test-model",
      max_tokens: 256,
      temperature: 0.1,
      top_p: 0.3,
      stream: false,
    });
    expect(body.messages.map(({ role }: { role: string }) => role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(body.messages[0]).toEqual({ role: "system", content: request.systemInstruction });
    expect(body.messages[1]).toEqual({ role: "user", content: "上一轮问题" });
    expect(body.messages[2]).toEqual({ role: "assistant", content: "上一轮回答" });
    expect(body.messages[3].content).toContain("EVIDENCE:");
    expect(body.messages[3].content).toContain(request.evidence[0]?.sourceId);
    expect(JSON.stringify(body.messages)).not.toContain("tenant_demo_store");
    expect(JSON.stringify(body)).not.toContain("unit-test-ark-key");
  });

  it("maps authentication and rate-limit responses without exposing provider bodies", async () => {
    const authenticationModel = createModel(
      vi.fn<typeof fetch>(
        async () => new Response('{"error":"unit-test-provider-secret"}', { status: 401 }),
      ),
    );
    const limitedModel = createModel(
      vi.fn<typeof fetch>(async () => new Response("too many", { status: 429 })),
    );

    await expect(authenticationModel.generateGroundedAnswer(request)).rejects.toMatchObject({
      code: "LLM_PROVIDER_AUTHENTICATION_FAILED",
      retryable: false,
      message: expect.not.stringContaining("unit-test-provider-secret"),
    });
    await expect(limitedModel.generateGroundedAnswer(request)).rejects.toMatchObject({
      code: "LLM_PROVIDER_RATE_LIMITED",
      retryable: true,
    });
  });

  it("rejects malformed provider JSON", async () => {
    const model = createModel(
      vi.fn<typeof fetch>(async () => Response.json({ choices: [], secret: "do-not-log" })),
    );

    await expect(model.generateGroundedAnswer(request)).rejects.toMatchObject({
      code: "LLM_INVALID_RESPONSE",
      retryable: false,
      message: expect.not.stringContaining("do-not-log"),
    });
  });

  it("does not issue a request for an already cancelled turn", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const model = createModel(fetchImpl);
    const controller = new AbortController();
    controller.abort();

    await expect(
      model.generateGroundedAnswer({ ...request, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "AI_TURN_ABORTED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function createModel(fetchImpl: typeof fetch) {
  return new VolcengineArkLanguageModel({
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "ep-unit-test-model",
    apiKey: new SecretValue("unit-test-ark-key"),
    timeoutMs: 5_000,
    fetchImpl,
  });
}
