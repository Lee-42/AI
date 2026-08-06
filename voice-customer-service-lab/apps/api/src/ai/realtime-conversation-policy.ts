import type { CustomerServicePromptPolicy } from "../agent/customer-service-prompt-policy.js";
import type { GroundedConversationContext } from "./ai-types.js";
import type { ConversationMemoryTurn } from "./conversation-memory.js";
import { GroundedPromptBuilder } from "./grounded-prompt-builder.js";
import type { VersionedRagAnswerPolicy } from "./rag-answer-policy.js";

export class RealtimeConversationPolicy {
  readonly version: string;
  readonly locale: "zh-CN";
  readonly welcomeMessage: string;
  readonly memory: CustomerServicePromptPolicy["conversation_memory"];
  readonly #promptBuilder: GroundedPromptBuilder;

  constructor(options: {
    readonly customerPolicy: CustomerServicePromptPolicy;
    readonly ragPolicy: VersionedRagAnswerPolicy;
  }) {
    if (options.customerPolicy.locale !== options.ragPolicy.locale) {
      throw new Error("Customer-service and RAG policy locales must match.");
    }

    this.version = `${options.customerPolicy.version}+${options.ragPolicy.version}`;
    this.locale = options.customerPolicy.locale;
    this.welcomeMessage = options.customerPolicy.identity.welcome_message;
    this.memory = Object.freeze({ ...options.customerPolicy.conversation_memory });
    this.#promptBuilder = new GroundedPromptBuilder(options);
  }

  buildGroundedContext(turns: readonly ConversationMemoryTurn[]): GroundedConversationContext {
    return this.#promptBuilder.build(turns);
  }
}
