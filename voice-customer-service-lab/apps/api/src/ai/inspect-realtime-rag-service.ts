import { loadCustomerServicePromptPolicy } from "../agent/customer-service-prompt-policy.js";
import { ConservativeTokenCounter } from "../knowledge/token-counter.js";
import { SessionConversationMemory } from "./conversation-memory.js";
import { DebugTurnRouter } from "./debug-turn-router.js";
import { DefaultAiOrchestrator } from "./default-ai-orchestrator.js";
import { MockLanguageModel } from "./mock-language-model.js";
import { loadRagAnswerPolicy } from "./rag-answer-policy.js";
import { RealtimeConversationPolicy } from "./realtime-conversation-policy.js";
import { RealtimeRagService } from "./realtime-rag-service.js";
import { SafeFallbackPolicy } from "./safe-fallback-policy.js";
import { BasicSensitiveConversationDetector } from "./sensitive-conversation-detector.js";
import { SyntheticKnowledgeRetriever } from "./synthetic-knowledge-retriever.js";

const customerPolicy = loadCustomerServicePromptPolicy("config/customer-service-policy.v1.json");
const ragPolicy = loadRagAnswerPolicy("config/rag-answer-policy.v1.json");
const conversationPolicy = new RealtimeConversationPolicy({ customerPolicy, ragPolicy });
const memory = new SessionConversationMemory({
  maxCompletedTurns: conversationPolicy.memory.max_completed_turns,
  maxTokens: conversationPolicy.memory.max_tokens,
  tokenCounter: new ConservativeTokenCounter(),
  sensitiveDetector: new BasicSensitiveConversationDetector(),
});
const model = new MockLanguageModel();
const orchestrator = new DefaultAiOrchestrator({
  router: new DebugTurnRouter(),
  retriever: new SyntheticKnowledgeRetriever(),
  model,
  answerPolicy: ragPolicy,
});
const service = new RealtimeRagService({
  orchestrator,
  conversationPolicy,
  memory,
  fallbackPolicy: new SafeFallbackPolicy(ragPolicy),
});
const scope = { tenantId: "tenant_demo_store", sessionId: "session_rag_service_demo" };

await service.answer({
  ...scope,
  text: "普通商品签收后几天可以申请退货？",
  idempotencyKey: "offline-turn-0001",
});
const second = await service.answer({
  ...scope,
  text: "那质量问题呢？",
  idempotencyKey: "offline-turn-0002",
});
const replay = await service.answer({
  ...scope,
  text: "那质量问题呢？",
  idempotencyKey: "offline-turn-0002",
});
const memoryBeforeClear = memory.read(scope).turns.length;
service.clearSession(scope);
const memoryAfterClear = memory.read(scope).turns.length;

process.stdout.write(
  `${JSON.stringify(
    {
      mode: "offline-realtime-rag-service",
      cloud_calls: 0,
      policy_version: second.response.execution.policyVersion,
      welcome_message: service.welcomeMessage,
      second_turn_history_messages: model.calls[1]?.history.length ?? 0,
      replayed: replay.replayed,
      stable_round_id: replay.response.roundId === second.response.roundId,
      memory_before_clear: memoryBeforeClear,
      memory_after_clear: memoryAfterClear,
    },
    null,
    2,
  )}\n`,
);
