import { loadCustomerServicePromptPolicy } from "../agent/customer-service-prompt-policy.js";
import type { ServerConfig } from "../core/config.js";
import { ConservativeTokenCounter } from "../knowledge/token-counter.js";
import type { AiOrchestrator } from "./ai-types.js";
import { SessionConversationMemory } from "./conversation-memory.js";
import { createAiOrchestrator } from "./create-debug-ai-orchestrator.js";
import { loadRagAnswerPolicy } from "./rag-answer-policy.js";
import { RealtimeConversationPolicy } from "./realtime-conversation-policy.js";
import { RealtimeRagService } from "./realtime-rag-service.js";
import { SafeFallbackPolicy } from "./safe-fallback-policy.js";
import { BasicSensitiveConversationDetector } from "./sensitive-conversation-detector.js";

export function createRealtimeRagService(
  config: ServerConfig,
  options: { readonly orchestrator?: AiOrchestrator } = {},
): RealtimeRagService {
  const customerPolicy = loadCustomerServicePromptPolicy(config.customerServicePolicyPath);
  const ragPolicy = loadRagAnswerPolicy(config.ai.answerPolicyPath);
  const conversationPolicy = new RealtimeConversationPolicy({ customerPolicy, ragPolicy });
  const memory = new SessionConversationMemory({
    maxCompletedTurns: conversationPolicy.memory.max_completed_turns,
    maxTokens: conversationPolicy.memory.max_tokens,
    tokenCounter: new ConservativeTokenCounter(),
    sensitiveDetector: new BasicSensitiveConversationDetector(),
  });

  return new RealtimeRagService({
    orchestrator: options.orchestrator ?? createAiOrchestrator(config, ragPolicy),
    conversationPolicy,
    memory,
    fallbackPolicy: new SafeFallbackPolicy(ragPolicy),
  });
}
