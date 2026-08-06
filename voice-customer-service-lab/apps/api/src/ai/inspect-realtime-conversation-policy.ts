import { loadCustomerServicePromptPolicy } from "../agent/customer-service-prompt-policy.js";
import { ConservativeTokenCounter } from "../knowledge/token-counter.js";
import { LanguageModelError } from "./ai-ports.js";
import { SessionConversationMemory } from "./conversation-memory.js";
import { loadRagAnswerPolicy } from "./rag-answer-policy.js";
import { RealtimeConversationPolicy } from "./realtime-conversation-policy.js";
import { SafeFallbackPolicy } from "./safe-fallback-policy.js";
import { BasicSensitiveConversationDetector } from "./sensitive-conversation-detector.js";

const customerPolicy = loadCustomerServicePromptPolicy("config/customer-service-policy.v1.json");
const ragPolicy = loadRagAnswerPolicy("config/rag-answer-policy.v1.json");
const conversationPolicy = new RealtimeConversationPolicy({
  customerPolicy,
  ragPolicy,
});
const tokenCounter = new ConservativeTokenCounter();
const sensitiveDetector = new BasicSensitiveConversationDetector();
const scope = { tenantId: "tenant_demo_store", sessionId: "session_policy_demo" };

const regularMemory = createMemory(
  conversationPolicy.memory.max_completed_turns,
  conversationPolicy.memory.max_tokens,
);
regularMemory.recordCompletedTurn(scope, turn("退货需要什么条件？", "我会根据当前资料核对。"));
const sensitiveExclusion = regularMemory.recordCompletedTurn(
  scope,
  turn("验证码 123456", "请不要发送验证码。"),
);
const context = conversationPolicy.buildGroundedContext(regularMemory.read(scope).turns);

const turnLimitedMemory = createMemory(2, 512);
turnLimitedMemory.recordCompletedTurn(scope, turn("问题一", "回答一"));
turnLimitedMemory.recordCompletedTurn(scope, turn("问题二", "回答二"));
const turnLimit = turnLimitedMemory.recordCompletedTurn(scope, turn("问题三", "回答三"));

const tokenLimitedMemory = createMemory(6, 64);
tokenLimitedMemory.recordCompletedTurn(
  scope,
  turn("商品质量问题".repeat(3), "需要依据商城资料".repeat(3)),
);
const tokenLimit = tokenLimitedMemory.recordCompletedTurn(
  scope,
  turn("退货适用条件".repeat(3), "仍需核对有效证据".repeat(3)),
);

const fallback = new SafeFallbackPolicy(ragPolicy);
const cancelledController = new AbortController();
cancelledController.abort();

process.stdout.write(
  `${JSON.stringify(
    {
      mode: "offline-realtime-rag-policy",
      cloud_calls: 0,
      policy: {
        version: conversationPolicy.version,
        welcome_message: conversationPolicy.welcomeMessage,
        memory: conversationPolicy.memory,
      },
      grounded_context: {
        sections: [...context.systemInstruction.matchAll(/^\[([^\]]+)\]$/gmu)].map(
          (match) => match[1],
        ),
        history_message_count: context.history.length,
      },
      memory_experiments: {
        turn_limit: summarizeWrite(turnLimit),
        token_limit: summarizeWrite(tokenLimit),
        sensitive_exclusion: {
          outcome: sensitiveExclusion.outcome,
          stored_turns: sensitiveExclusion.snapshot.turns.length,
        },
      },
      fallback_decisions: {
        no_evidence: fallback.forEvidence("none"),
        provider_unavailable: fallback.forFailure(
          new LanguageModelError("LLM_PROVIDER_UNAVAILABLE", "offline fixture", true),
        ),
        cancelled: fallback.forFailure(new Error("cancelled"), cancelledController.signal),
      },
    },
    null,
    2,
  )}\n`,
);

function createMemory(maxCompletedTurns: number, maxTokens: number) {
  return new SessionConversationMemory({
    maxCompletedTurns,
    maxTokens,
    tokenCounter,
    sensitiveDetector,
  });
}

function turn(userText: string, assistantText: string) {
  return { userText, assistantText, answerMode: "grounded_answer" as const };
}

function summarizeWrite(result: ReturnType<SessionConversationMemory["recordCompletedTurn"]>) {
  return {
    outcome: result.outcome,
    evicted_by: result.evictedBy,
    stored_turns: result.snapshot.turns.length,
    estimated_tokens: result.snapshot.estimatedTokens,
  };
}
