import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { loadServerConfig } from "../src/core/config.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("AI debug API", () => {
  it("is unavailable by default", async () => {
    const app = createApp({ APP_ENV: "test" });
    const sessionId = await createSession(app, "debug-disabled-session");

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/ai/debug-turns`,
      headers: { "idempotency-key": "debug-disabled-turn" },
      payload: { text: "普通商品多久可以退货？" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatchObject({
      code: "AI_DEBUG_API_DISABLED",
      retryable: false,
    });
  });

  it("runs a grounded Mock turn and replays one idempotent result", async () => {
    const app = createApp({ APP_ENV: "test", LLM_DEBUG_API_ENABLED: "true" });
    const sessionId = await createSession(app, "debug-enabled-session");
    const request = {
      method: "POST" as const,
      url: `/api/v1/sessions/${sessionId}/ai/debug-turns`,
      headers: { "idempotency-key": "debug-grounded-turn" },
      payload: { text: "普通商品签收后几天可以申请退货？" },
    };

    const first = await app.inject(request);
    const replay = await app.inject(request);
    const changed = await app.inject({
      ...request,
      payload: { text: "普通现货多久出库？" },
    });
    const body = first.json();

    expect(first.statusCode).toBe(201);
    expect(first.headers["cache-control"]).toBe("no-store");
    expect(body).toMatchObject({
      schema_version: 1,
      command_replayed: false,
      session_id: sessionId,
      answer_mode: "grounded_answer",
      evidence_status: "sufficient",
      citations: [
        {
          source_id: "policy-return-general@2026-01",
          title: "退换货通用规则",
          version: "2026-01",
        },
      ],
      execution: {
        policy_version: "commerce-rag-zh-cn@2026-08-04.1",
        router: "debug-rule-router",
        retriever: "synthetic-fixture-retriever",
        model: "mock-llm",
        provider_request_id: null,
        model_usage: { input_tokens: 0, output_tokens: 0 },
      },
    });
    expect(body.round_id).toMatch(/^round_[a-f0-9]{32}$/u);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({
      command_replayed: true,
      round_id: body.round_id,
    });
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error.code).toBe("AI_DEBUG_IDEMPOTENCY_KEY_REUSED");
  });

  it("rejects client-supplied tenant identity and missing idempotency", async () => {
    const app = createApp({ APP_ENV: "test", LLM_DEBUG_API_ENABLED: "true" });
    const sessionId = await createSession(app, "debug-validation-session");
    const url = `/api/v1/sessions/${sessionId}/ai/debug-turns`;

    const injectedTenant = await app.inject({
      method: "POST",
      url,
      headers: { "idempotency-key": "debug-invalid-tenant" },
      payload: { text: "普通商品多久可以退货？", tenant_id: "tenant_attacker" },
    });
    const missingKey = await app.inject({
      method: "POST",
      url,
      payload: { text: "普通商品多久可以退货？" },
    });

    expect(injectedTenant.statusCode).toBe(400);
    expect(missingKey.statusCode).toBe(400);
  });

  it("publishes one stable debug operation without exposing credential fields", async () => {
    const app = createApp({ APP_ENV: "test", LLM_DEBUG_API_ENABLED: "true" });
    await app.ready();
    const operation = app.swagger().paths?.["/api/v1/sessions/{session_id}/ai/debug-turns"]?.post;

    expect(operation?.operationId).toBe("createAiDebugTurn");
    expect(JSON.stringify(operation)).not.toMatch(/api.?key|authorization|secret/i);
  });
});

function createApp(environment: Record<string, string>) {
  const app = buildApp(loadServerConfig(environment));
  apps.push(app);
  return app;
}

async function createSession(app: ReturnType<typeof buildApp>, idempotencyKey: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    headers: { "idempotency-key": idempotencyKey },
    payload: { locale: "zh-CN" },
  });
  expect(response.statusCode).toBe(201);
  return response.json().session.session_id as string;
}
