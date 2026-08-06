import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { loadCustomerServicePromptPolicy } from "../src/agent/customer-service-prompt-policy.js";
import { LanguageModelError } from "../src/ai/ai-ports.js";
import type { AiOrchestrator, AiTurnRequest, AiTurnResponse } from "../src/ai/ai-types.js";
import { AiOrchestratorError } from "../src/ai/ai-types.js";
import { SessionConversationMemory } from "../src/ai/conversation-memory.js";
import { createDebugAiOrchestrator } from "../src/ai/create-debug-ai-orchestrator.js";
import { createRealtimeRagService } from "../src/ai/create-realtime-rag-service.js";
import { loadRagAnswerPolicy } from "../src/ai/rag-answer-policy.js";
import { RealtimeConversationPolicy } from "../src/ai/realtime-conversation-policy.js";
import { RealtimeRagService, type RealtimeRagTurnCommand } from "../src/ai/realtime-rag-service.js";
import { SafeFallbackPolicy } from "../src/ai/safe-fallback-policy.js";
import { BasicSensitiveConversationDetector } from "../src/ai/sensitive-conversation-detector.js";
import { loadServerConfig } from "../src/core/config.js";

const customerPolicyPath = "config/customer-service-policy.v1.json";
const ragPolicyPath = "config/rag-answer-policy.v1.json";
const scope = { tenantId: "tenant_demo_store", sessionId: "ses_realtime_rag" };

describe("RealtimeRagService", () => {
  it("creates a zero-cost Mock runtime independently from the debug API gate", async () => {
    const config = loadServerConfig({ APP_ENV: "test", LLM_DEBUG_API_ENABLED: "false" });
    const service = createRealtimeRagService(config);

    const result = await service.answer(command("turn-key-0001", "普通商品多久可以退货？"));

    expect(service.welcomeMessage).toContain("AI 客服");
    expect(result).toMatchObject({
      completion: "answered",
      response: {
        answerMode: "grounded_answer",
        spokenText: expect.stringContaining("七个自然日"),
        execution: { model: "mock-llm" },
      },
    });
    expect(() => createDebugAiOrchestrator(config)).toThrow(/API is disabled/u);
  });

  it("passes bounded completed History to the next turn and stores complete pairs", async () => {
    const { service, memory, orchestrator, conversationPolicy } = createFixture();

    const first = await service.answer(command("turn-key-0001", "退货规则是什么？"));
    const second = await service.answer(command("turn-key-0002", "那质量问题呢？"));

    expect(first.memoryOutcome).toBe("stored");
    expect(second.memoryOutcome).toBe("stored");
    expect(orchestrator.calls[0]?.groundedContext.history).toEqual([]);
    expect(orchestrator.calls[1]?.groundedContext.history).toEqual([
      { role: "user", content: "退货规则是什么？" },
      { role: "assistant", content: "已根据证据回答：退货规则是什么？" },
    ]);
    expect(second.response.execution.policyVersion).toBe(conversationPolicy.version);
    expect(memory.read(scope).turns).toHaveLength(2);
  });

  it("shares one in-flight turn and one memory write for concurrent same-key requests", async () => {
    const pending = deferred<AiTurnResponse>();
    const orchestrator = new RecordingOrchestrator(async () => pending.promise);
    const { service, memory } = createFixture({ orchestrator });

    const first = service.openTurn(command("turn-key-0001", "退货规则是什么？"));
    const replay = service.openTurn(command("turn-key-0001", "  退货规则是什么？  "));

    expect(first.roundId).toMatch(/^rnd_[a-f0-9]{32}$/u);
    expect(replay.roundId).toBe(first.roundId);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(orchestrator.calls).toHaveLength(1);

    const recordedRequest = orchestrator.calls[0];
    if (!recordedRequest) throw new Error("Expected one recorded Orchestrator request.");
    pending.resolve(responseFor(recordedRequest));
    const [firstResult, replayResult] = await Promise.all([first.result, replay.result]);

    expect(firstResult.replayed).toBe(false);
    expect(replayResult.replayed).toBe(true);
    expect(replayResult.response.roundId).toBe(firstResult.response.roundId);
    expect(memory.read(scope).turns).toHaveLength(1);
  });

  it("rejects reuse of a scoped idempotency key with different normalized text", async () => {
    const { service } = createFixture();
    const first = service.openTurn(command("turn-key-0001", "退货规则是什么？"));

    expect(() => service.openTurn(command("turn-key-0001", "发票规则是什么？"))).toThrow(
      expect.objectContaining({
        code: "RAG_IDEMPOTENCY_KEY_REUSED",
        statusCode: 409,
        retryable: false,
      }),
    );
    await first.result;
  });

  it("replays a completed response with its original Round ID", async () => {
    const { service, orchestrator } = createFixture();
    const first = await service.answer(command("turn-key-0001", "退货规则是什么？"));
    const replay = await service.answer(command("turn-key-0001", "退货规则是什么？"));

    expect(orchestrator.calls).toHaveLength(1);
    expect(replay).toMatchObject({ replayed: true, response: { roundId: first.response.roundId } });
  });

  it("excludes sensitive and oversized pairs from memory", async () => {
    const sensitiveFixture = createFixture();
    const sensitive = await sensitiveFixture.service.answer(
      command("turn-key-0001", "验证码 123456 怎么处理？"),
    );
    const oversizedFixture = createFixture({ maxTokens: 10 });
    const oversized = await oversizedFixture.service.answer(
      command("turn-key-0002", "这个问题和回答会超过十个字符"),
    );

    expect(sensitive.memoryOutcome).toBe("excluded_sensitive");
    expect(sensitiveFixture.memory.read(scope).turns).toEqual([]);
    expect(oversized.memoryOutcome).toBe("excluded_oversized");
    expect(oversizedFixture.memory.read(scope).turns).toEqual([]);
  });

  it("returns a fixed degraded response without recording provider failures", async () => {
    const orchestrator = new RecordingOrchestrator(async () => {
      throw new LanguageModelError("LLM_PROVIDER_UNAVAILABLE", "provider secret", true);
    });
    const { service, memory, ragPolicy, conversationPolicy } = createFixture({ orchestrator });

    const result = await service.answer(command("turn-key-0001", "退货规则是什么？"));

    expect(result).toMatchObject({
      completion: "degraded",
      memoryOutcome: "not_recorded_failure",
      response: {
        answerMode: "abstain",
        spokenText: ragPolicy.serviceUnavailableResponse,
        execution: {
          policyVersion: conversationPolicy.version,
          router: "realtime-rag-service",
          routeReason: "provider_unavailable",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("provider secret");
    expect(memory.read(scope).turns).toEqual([]);
  });

  it("keeps cancellation silent and removes the incomplete replay record", async () => {
    let attempts = 0;
    const orchestrator = new RecordingOrchestrator(async (request) => {
      attempts += 1;
      if (attempts === 1) {
        throw new AiOrchestratorError("AI_TURN_ABORTED", "cancelled");
      }
      return responseFor(request);
    });
    const { service, memory } = createFixture({ orchestrator });

    await expect(
      service.answer(command("turn-key-0001", "退货规则是什么？")),
    ).rejects.toMatchObject({
      code: "AI_TURN_ABORTED",
    });
    const retry = await service.answer(command("turn-key-0001", "退货规则是什么？"));

    expect(attempts).toBe(2);
    expect(retry.replayed).toBe(false);
    expect(memory.read(scope).turns).toHaveLength(1);
  });

  it("clears memory and replay only for the exact Tenant and Session scope", async () => {
    const { service, memory, orchestrator } = createFixture();
    const tenantA = command("turn-key-0001", "退货规则是什么？");
    const tenantB = { ...tenantA, tenantId: "tenant_other_store" };
    const firstA = await service.answer(tenantA);
    const firstB = await service.answer(tenantB);

    service.clearSession(scope);
    const nextA = await service.answer(tenantA);
    const replayB = await service.answer(tenantB);

    expect(nextA.replayed).toBe(false);
    expect(nextA.response.roundId).not.toBe(firstA.response.roundId);
    expect(replayB.replayed).toBe(true);
    expect(replayB.response.roundId).toBe(firstB.response.roundId);
    expect(orchestrator.calls).toHaveLength(3);
    expect(memory.read(scope).turns).toHaveLength(1);
    expect(memory.read({ ...scope, tenantId: tenantB.tenantId }).turns).toHaveLength(1);
  });

  it("does not resurrect Session memory when an in-flight turn finishes after cleanup", async () => {
    const pending = deferred<AiTurnResponse>();
    const orchestrator = new RecordingOrchestrator(async () => pending.promise);
    const { service, memory } = createFixture({ orchestrator });
    const handle = service.openTurn(command("turn-key-0001", "退货规则是什么？"));

    service.clearSession(scope);
    const recordedRequest = orchestrator.calls[0];
    if (!recordedRequest) throw new Error("Expected one in-flight Orchestrator request.");
    pending.resolve(responseFor(recordedRequest));
    const result = await handle.result;

    expect(result.memoryOutcome).toBe("not_recorded_session_closed");
    expect(memory.read(scope).turns).toEqual([]);
  });

  it("runs the offline vertical-slice inspector without printing conversation content", () => {
    const result = spawnSync("pnpm", ["exec", "tsx", "src/ai/inspect-realtime-rag-service.ts"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: "offline-realtime-rag-service",
      cloud_calls: 0,
      second_turn_history_messages: 2,
      replayed: true,
      stable_round_id: true,
      memory_before_clear: 2,
      memory_after_clear: 0,
    });
    expect(result.stdout).not.toContain("普通商品签收后几天可以申请退货");
    expect(result.stdout).not.toContain("那质量问题呢");
    expect(result.stdout).not.toContain("EVIDENCE");
  });
});

function command(idempotencyKey: string, text: string): RealtimeRagTurnCommand {
  return { ...scope, text, idempotencyKey };
}

function createFixture(
  options: { readonly orchestrator?: RecordingOrchestrator; readonly maxTokens?: number } = {},
) {
  const customerPolicy = loadCustomerServicePromptPolicy(customerPolicyPath);
  const ragPolicy = loadRagAnswerPolicy(ragPolicyPath);
  const conversationPolicy = new RealtimeConversationPolicy({ customerPolicy, ragPolicy });
  const memory = new SessionConversationMemory({
    maxCompletedTurns: conversationPolicy.memory.max_completed_turns,
    maxTokens: options.maxTokens ?? conversationPolicy.memory.max_tokens,
    tokenCounter: { name: "literal-length", count: (text) => text.length },
    sensitiveDetector: new BasicSensitiveConversationDetector(),
  });
  const orchestrator = options.orchestrator ?? new RecordingOrchestrator();
  const service = new RealtimeRagService({
    orchestrator,
    conversationPolicy,
    memory,
    fallbackPolicy: new SafeFallbackPolicy(ragPolicy),
  });
  return { service, memory, orchestrator, ragPolicy, conversationPolicy };
}

class RecordingOrchestrator implements AiOrchestrator {
  readonly calls: AiTurnRequest[] = [];
  readonly #answer: (request: AiTurnRequest) => Promise<AiTurnResponse>;

  constructor(
    answer: (request: AiTurnRequest) => Promise<AiTurnResponse> = async (request) =>
      responseFor(request),
  ) {
    this.#answer = answer;
  }

  async answer(request: AiTurnRequest): Promise<AiTurnResponse> {
    this.calls.push(request);
    return this.#answer(request);
  }
}

function responseFor(request: AiTurnRequest): AiTurnResponse {
  return {
    sessionId: request.sessionId,
    roundId: request.roundId,
    answerMode: "grounded_answer",
    evidenceStatus: "sufficient",
    spokenText: `已根据证据回答：${request.text}`,
    citations: [
      { sourceId: "policy-return-general@2026-01", title: "退换货规则", version: "2026-01" },
    ],
    execution: {
      policyVersion: "orchestrator-policy",
      router: "recording-router",
      retriever: "recording-retriever",
      model: "recording-model",
      routeReason: "public_policy_question",
      providerRequestId: null,
      modelUsage: { inputTokens: 0, outputTokens: 0 },
    },
  };
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
