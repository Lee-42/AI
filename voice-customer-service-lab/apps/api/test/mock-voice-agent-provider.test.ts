import { describe, expect, it } from "vitest";

import type { AiTurnResponse } from "../src/ai/ai-types.js";
import { MockVoiceAgentProvider } from "../src/providers/mock-voice-agent-provider.js";

describe("MockVoiceAgentProvider", () => {
  it("replays create and end commands without duplicating resources", async () => {
    const provider = createProvider();
    const command = {
      body: { locale: "zh-CN" as const },
      idempotencyKey: "same-create-key",
      correlationId: "cor_000001",
    };

    const first = await provider.createSession(command);
    const replay = await provider.createSession(command);
    const ended = await provider.endSession({
      sessionId: first.session.session_id,
      idempotencyKey: "same-end-key",
      correlationId: "cor_000002",
    });
    const endedReplay = await provider.endSession({
      sessionId: first.session.session_id,
      idempotencyKey: "same-end-key",
      correlationId: "cor_000003",
    });

    expect(replay.session.session_id).toBe(first.session.session_id);
    expect(replay.command_replayed).toBe(true);
    expect(replay.events).toEqual(first.events);
    expect(ended.session.state).toBe("ended");
    expect(endedReplay.command_replayed).toBe(true);
    expect(endedReplay.events).toEqual(ended.events);
  });

  it("emits the fixed welcome as assistant events without a user transcript", async () => {
    const provider = createProvider();
    const created = await provider.createSession({
      body: { locale: "zh-CN" },
      idempotencyKey: "create-for-welcome",
      correlationId: "cor_000001",
    });

    const readyIndex = created.events.findIndex((event) => event.event_type === "session.ready");
    const welcomeIndex = created.events.findIndex(
      (event) => event.event_type === "turn.ai.transcript.delta",
    );
    const welcomeDelta = created.events[welcomeIndex];

    expect(readyIndex).toBeGreaterThanOrEqual(0);
    expect(welcomeIndex).toBeGreaterThan(readyIndex);
    if (welcomeDelta?.event_type !== "turn.ai.transcript.delta") {
      throw new Error("Expected one welcome transcript event.");
    }
    expect(welcomeDelta.payload.text_delta).toBe("您好，我是测试 AI 客服。请问有什么可以帮您？");
    expect(created.events.some((event) => event.event_type.startsWith("turn.user."))).toBe(false);
  });

  it("maps a validated RAG response into normalized assistant events", async () => {
    const provider = createProvider();
    const created = await provider.createSession({
      body: { locale: "zh-CN" },
      idempotencyKey: "create-for-turn",
      correlationId: "cor_000001",
    });

    const result = await provider.submitMockTurn({
      sessionId: created.session.session_id,
      text: "我要转人工",
      idempotencyKey: "same-turn-key",
      correlationId: "cor_000002",
      answer: ragAnswer(created.session.session_id),
    });
    const aiDelta = result.events.find((event) => event.event_type === "turn.ai.transcript.delta");
    const aiStarted = result.events.find(
      (event) => event.event_type === "turn.ai.response.started",
    );

    expect(aiDelta?.payload).toEqual({ text_delta: "这是经过校验的 RAG 回答。", index: 0 });
    expect(aiStarted?.payload.model_route).toBe("rag/mock-llm");
    expect(result.events.every((event) => event.round_id === "rnd_rag_000001")).toBe(true);
    expect(JSON.stringify(result.events)).not.toContain("这是 Mock 客服回复");
    expect(result.events.at(-1)?.event_type).toBe("turn.ai.response.completed");
  });

  it("replays one Mock turn and rejects key reuse with another payload", async () => {
    const provider = createProvider();
    const created = await provider.createSession({
      body: { locale: "zh-CN" },
      idempotencyKey: "create-for-retry",
      correlationId: "cor_000001",
    });
    const command = {
      sessionId: created.session.session_id,
      text: "查询订单",
      idempotencyKey: "turn-retry-key",
      correlationId: "cor_000002",
      answer: ragAnswer(created.session.session_id),
    };

    const first = await provider.submitMockTurn(command);
    const replay = await provider.submitMockTurn(command);

    expect(replay.command_replayed).toBe(true);
    expect(replay.events).toEqual(first.events);
    expect(replay.session.revision).toBe(first.session.revision);
    await expect(provider.submitMockTurn({ ...command, text: "不同问题" })).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
    });
  });
});

function createProvider() {
  let value = 0;
  return new MockVoiceAgentProvider({
    sessionTtlSeconds: 1200,
    welcomeMessage: "您好，我是测试 AI 客服。请问有什么可以帮您？",
    clock: () => new Date("2026-07-29T00:00:00.000Z"),
    idFactory: (prefix) => {
      value += 1;
      return `${prefix}_${String(value).padStart(6, "0")}`;
    },
  });
}

function ragAnswer(sessionId: string): AiTurnResponse {
  return {
    sessionId,
    roundId: "rnd_rag_000001",
    answerMode: "grounded_answer",
    evidenceStatus: "sufficient",
    spokenText: "这是经过校验的 RAG 回答。",
    citations: [
      { sourceId: "policy-return-general@2026-01", title: "退换货规则", version: "2026-01" },
    ],
    execution: {
      policyVersion: "customer-policy+rag-policy",
      router: "test-router",
      retriever: "test-retriever",
      model: "mock-llm",
      routeReason: "public_policy_question",
      providerRequestId: null,
      modelUsage: { inputTokens: 0, outputTokens: 0 },
    },
  };
}
