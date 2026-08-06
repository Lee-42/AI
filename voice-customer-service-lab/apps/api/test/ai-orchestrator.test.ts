import { describe, expect, it, vi } from "vitest";

import type {
  AiAnswerPolicy,
  KnowledgeEvidence,
  KnowledgeRetriever,
  TurnRouter,
} from "../src/ai/ai-ports.js";
import { DefaultAiOrchestrator } from "../src/ai/default-ai-orchestrator.js";
import { MockLanguageModel } from "../src/ai/mock-language-model.js";

const activeEvidence: KnowledgeEvidence = {
  chunkId: `chk_${"a".repeat(64)}`,
  sourceId: "policy-return-general@2026-01",
  title: "退换货通用规则",
  version: "2026-01",
  content: "普通商品可在签收后七个自然日内发起退货申请。",
  status: "active",
  score: 0.91,
};

const answerPolicy: AiAnswerPolicy = {
  version: "commerce-rag-zh-cn@2026-08-04.1",
  maxOutputTokens: 256,
  temperature: 0.1,
  topP: 0.3,
  groundedSystemInstruction: "只根据证据回答，并返回来源引用。",
  responseFor: ({ mode, evidenceStatus }) => `固定回复：${mode}/${evidenceStatus}`,
};

const baseRequest = {
  tenantId: "tenant_demo_store",
  sessionId: "ses_ai_architecture",
  roundId: "round_ai_001",
  locale: "zh-CN" as const,
  text: "普通商品签收后几天可以申请退货？",
  groundedContext: {
    systemInstruction: "组合后的系统策略",
    history: [
      { role: "user" as const, content: "上一轮问题" },
      { role: "assistant" as const, content: "上一轮回答" },
    ],
  },
};

describe("DefaultAiOrchestrator", () => {
  it("coordinates routing, retrieval and grounded generation through ports", async () => {
    const router = createRouter("grounded_answer");
    const retriever = createRetriever({ status: "sufficient", evidence: [activeEvidence] });
    const model = new MockLanguageModel({
      responseText: "普通商品可在签收后七个自然日内发起退货申请。",
    });
    const orchestrator = new DefaultAiOrchestrator({
      router,
      retriever,
      model,
      answerPolicy,
    });

    const response = await orchestrator.answer(baseRequest);

    expect(response).toMatchObject({
      answerMode: "grounded_answer",
      evidenceStatus: "sufficient",
      spokenText: "普通商品可在签收后七个自然日内发起退货申请。",
      citations: [
        {
          sourceId: activeEvidence.sourceId,
          title: activeEvidence.title,
          version: activeEvidence.version,
        },
      ],
      execution: {
        policyVersion: answerPolicy.version,
        router: "test-router",
        retriever: "test-retriever",
        model: "mock-llm",
      },
    });
    expect(router.route).toHaveBeenCalledOnce();
    expect(retriever.retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: baseRequest.tenantId, limit: 5 }),
    );
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]).toMatchObject({
      systemInstruction: "组合后的系统策略",
      history: [
        { role: "user", content: "上一轮问题" },
        { role: "assistant", content: "上一轮回答" },
      ],
    });

    const serializedModelRequest = JSON.stringify(model.calls[0]);
    expect(serializedModelRequest).not.toContain(baseRequest.tenantId);
    expect(serializedModelRequest).not.toContain(baseRequest.sessionId);
    expect(serializedModelRequest).not.toContain(baseRequest.roundId);
  });

  it("abstains without calling the model when evidence is missing", async () => {
    const retriever = createRetriever({ status: "none", evidence: [] });
    const model = new MockLanguageModel();
    const orchestrator = new DefaultAiOrchestrator({
      router: createRouter("grounded_answer"),
      retriever,
      model,
      answerPolicy,
    });

    const response = await orchestrator.answer(baseRequest);

    expect(response).toMatchObject({
      answerMode: "abstain",
      evidenceStatus: "none",
      spokenText: "固定回复：abstain/none",
      citations: [],
      execution: { retriever: "test-retriever", model: null },
    });
    expect(model.calls).toHaveLength(0);
  });

  it("keeps private order facts out of the RAG and LLM adapters", async () => {
    const retriever = createRetriever({ status: "none", evidence: [] });
    const model = new MockLanguageModel();
    const orchestrator = new DefaultAiOrchestrator({
      router: createRouter("tool_required"),
      retriever,
      model,
      answerPolicy,
    });

    const response = await orchestrator.answer({
      ...baseRequest,
      text: "我的订单到哪里了？",
    });

    expect(response).toMatchObject({
      answerMode: "tool_required",
      evidenceStatus: "not_applicable",
      citations: [],
    });
    expect(retriever.retrieve).not.toHaveBeenCalled();
    expect(model.calls).toHaveLength(0);
  });

  it("rejects model citations that were not returned by the retriever", async () => {
    const orchestrator = new DefaultAiOrchestrator({
      router: createRouter("grounded_answer"),
      retriever: createRetriever({ status: "sufficient", evidence: [activeEvidence] }),
      model: new MockLanguageModel({ citedSourceIds: ["hallucinated-source"] }),
      answerPolicy,
    });

    await expect(orchestrator.answer(baseRequest)).rejects.toMatchObject({
      code: "AI_INVALID_MODEL_OUTPUT",
      retryable: false,
    });
  });

  it("rejects an invalid sufficient result before calling the model", async () => {
    const model = new MockLanguageModel();
    const orchestrator = new DefaultAiOrchestrator({
      router: createRouter("grounded_answer"),
      retriever: createRetriever({ status: "sufficient", evidence: [] }),
      model,
      answerPolicy,
    });

    await expect(orchestrator.answer(baseRequest)).rejects.toMatchObject({
      code: "AI_INVALID_RETRIEVAL_RESULT",
    });
    expect(model.calls).toHaveLength(0);
  });

  it("rejects sufficient evidence without chunk provenance before calling the model", async () => {
    const model = new MockLanguageModel();
    const orchestrator = new DefaultAiOrchestrator({
      router: createRouter("grounded_answer"),
      retriever: createRetriever({
        status: "sufficient",
        evidence: [{ ...activeEvidence, chunkId: "" }],
      }),
      model,
      answerPolicy,
    });

    await expect(orchestrator.answer(baseRequest)).rejects.toMatchObject({
      code: "AI_INVALID_RETRIEVAL_RESULT",
    });
    expect(model.calls).toHaveLength(0);
  });

  it("honors cancellation before invoking any dependency", async () => {
    const controller = new AbortController();
    controller.abort();
    const router = createRouter("grounded_answer");
    const retriever = createRetriever({ status: "sufficient", evidence: [activeEvidence] });
    const model = new MockLanguageModel();
    const orchestrator = new DefaultAiOrchestrator({
      router,
      retriever,
      model,
      answerPolicy,
    });

    await expect(
      orchestrator.answer({ ...baseRequest, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "AI_TURN_ABORTED" });
    expect(router.route).not.toHaveBeenCalled();
    expect(retriever.retrieve).not.toHaveBeenCalled();
    expect(model.calls).toHaveLength(0);
  });
});

function createRouter(mode: Awaited<ReturnType<TurnRouter["route"]>>["mode"]): TurnRouter {
  return {
    name: "test-router",
    route: vi.fn(async ({ text }) => ({
      mode,
      query: text,
      reason: `test_${mode}`,
    })),
  };
}

function createRetriever(
  result: Awaited<ReturnType<KnowledgeRetriever["retrieve"]>>,
): KnowledgeRetriever {
  return {
    name: "test-retriever",
    retrieve: vi.fn(async () => result),
  };
}
