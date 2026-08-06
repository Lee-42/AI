import type { ServerConfig } from "../core/config.js";
import type { AiOrchestrator } from "./ai-types.js";
import { createLanguageModel } from "./create-language-model.js";
import { DebugTurnRouter } from "./debug-turn-router.js";
import { DefaultAiOrchestrator } from "./default-ai-orchestrator.js";
import { loadRagAnswerPolicy, type VersionedRagAnswerPolicy } from "./rag-answer-policy.js";
import { SyntheticKnowledgeRetriever } from "./synthetic-knowledge-retriever.js";

export function createAiOrchestrator(
  config: ServerConfig,
  answerPolicy: VersionedRagAnswerPolicy = loadRagAnswerPolicy(config.ai.answerPolicyPath),
): AiOrchestrator {
  return new DefaultAiOrchestrator({
    router: new DebugTurnRouter(),
    retriever: new SyntheticKnowledgeRetriever(),
    model: createLanguageModel(config),
    answerPolicy,
  });
}

export function createDebugAiOrchestrator(config: ServerConfig): AiOrchestrator {
  if (!config.ai.debugApiEnabled) {
    throw new Error("The debug AI runtime cannot be created while its API is disabled.");
  }
  return createAiOrchestrator(config);
}
