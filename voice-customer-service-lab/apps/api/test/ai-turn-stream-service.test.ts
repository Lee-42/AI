import { describe, expect, it } from "vitest";

import { AiTurnStreamService } from "../src/ai/ai-turn-stream-service.js";
import type { AiTurnResponse } from "../src/ai/ai-types.js";
import { AiOrchestratorError } from "../src/ai/ai-types.js";
import type { RealtimeRagTurnPort, RealtimeRagTurnResult } from "../src/ai/realtime-rag-service.js";

describe("AiTurnStreamService", () => {
  it("emits a stable started event before the RAG result and completes with policy metadata", async () => {
    const pending = deferred<RealtimeRagTurnResult>();
    const ragService = fakeRagService(() => ({
      roundId: "rnd_stream001",
      replayed: false,
      result: pending.promise,
    }));
    const service = new AiTurnStreamService({ ragService, deltaCharacters: 4 });
    const iterator = service.stream(command());

    await expect(iterator.next()).resolves.toMatchObject({
      value: { event_type: "stream.started", round_id: "rnd_stream001", sequence: 1 },
      done: false,
    });

    pending.resolve(turnResult(response("退货期限是七天。")));
    const events = await collect(iterator);

    expect(events.at(-1)?.event_type).toBe("answer.completed");
    expect(events.every((event) => event.round_id === "rnd_stream001")).toBe(true);
    expect(events.slice(0, -1).every((event) => event.event_type === "answer.delta")).toBe(true);
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index + 2));
    expect(
      events
        .filter((event) => event.event_type === "answer.delta")
        .map((event) => event.payload.text_delta)
        .join(""),
    ).toBe("退货期限是七天。");
    expect(events.at(-1)?.payload).toMatchObject({
      policy_version: "customer-policy+rag-policy",
      citations: [{ source_id: "policy-return@1" }],
    });
  });

  it("turns an AbortSignal into one terminal cancellation event without a text delta", async () => {
    const controller = new AbortController();
    const ragService = fakeRagService((turn) => ({
      roundId: "rnd_stream002",
      replayed: false,
      result: new Promise((_, reject) => {
        turn.signal?.addEventListener(
          "abort",
          () => reject(new AiOrchestratorError("AI_TURN_ABORTED", "cancelled")),
          { once: true },
        );
      }),
    }));
    const service = new AiTurnStreamService({ ragService });
    const iterator = service.stream(command(controller.signal));

    expect((await iterator.next()).value?.event_type).toBe("stream.started");
    const terminal = iterator.next();
    controller.abort();

    await expect(terminal).resolves.toMatchObject({
      value: { event_type: "stream.cancelled", payload: { reason: "caller_cancelled" } },
      done: false,
    });
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });
});

function command(signal?: AbortSignal) {
  return {
    tenantId: "tenant_demo_store",
    sessionId: "ses_stream001",
    text: "普通商品多久可以退货？",
    idempotencyKey: "stream-turn-key",
    ...(signal ? { signal } : {}),
  };
}

function fakeRagService(openTurn: RealtimeRagTurnPort["openTurn"]): RealtimeRagTurnPort {
  return {
    welcomeMessage: "欢迎使用测试客服。",
    openTurn,
    answer: async (turn) => openTurn(turn).result,
    clearSession: () => undefined,
  };
}

function turnResult(response: AiTurnResponse): RealtimeRagTurnResult {
  return {
    response,
    replayed: false,
    completion: "answered",
    memoryOutcome: "stored",
  };
}

function response(spokenText: string): AiTurnResponse {
  return {
    sessionId: "ses_stream001",
    roundId: "rnd_stream001",
    answerMode: "grounded_answer",
    evidenceStatus: "sufficient",
    spokenText,
    citations: [{ sourceId: "policy-return@1", title: "退换货规则", version: "1" }],
    execution: {
      policyVersion: "customer-policy+rag-policy",
      router: "test-router",
      retriever: "test-retriever",
      model: "test-model",
      routeReason: "knowledge_query",
      providerRequestId: null,
      modelUsage: { inputTokens: 10, outputTokens: 8 },
    },
  };
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const value of values) collected.push(value);
  return collected;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
