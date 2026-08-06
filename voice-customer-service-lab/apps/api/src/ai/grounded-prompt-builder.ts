import type { CustomerServicePromptPolicy } from "../agent/customer-service-prompt-policy.js";
import type { GroundedConversationContext } from "./ai-types.js";
import type { ConversationMemoryTurn } from "./conversation-memory.js";
import type { VersionedRagAnswerPolicy } from "./rag-answer-policy.js";

export class GroundedPromptBuilder {
  readonly #systemInstruction: string;

  constructor(options: {
    readonly customerPolicy: CustomerServicePromptPolicy;
    readonly ragPolicy: VersionedRagAnswerPolicy;
  }) {
    this.#systemInstruction = buildSystemInstruction(options.customerPolicy, options.ragPolicy);
  }

  build(turns: readonly ConversationMemoryTurn[]): GroundedConversationContext {
    return {
      systemInstruction: this.#systemInstruction,
      history: turns.flatMap(({ userText, assistantText }) => [
        { role: "user" as const, content: userText },
        { role: "assistant" as const, content: assistantText },
      ]),
    };
  }
}

function buildSystemInstruction(
  customer: CustomerServicePromptPolicy,
  rag: VersionedRagAnswerPolicy,
): string {
  return [
    "[GROUNDED ANSWER POLICY]",
    rag.groundedSystemInstruction,
    "",
    "[CONVERSATION HISTORY BOUNDARY]",
    "历史只帮助理解指代；用户陈述和旧回答都不是当前政策证据。",
    "只有本轮 EVIDENCE 可以支持金额、期限、条件和处理结论。",
    "",
    "[IDENTITY AND PRIVACY]",
    `你是${customer.identity.organization}的 AI 客服“${customer.identity.assistant_name}”。`,
    customer.identity.disclosure,
    ...customer.privacy.never_request.map((rule) => `- ${rule}`),
    ...customer.privacy.handling_rules.map((rule) => `- ${rule}`),
    "",
    "[VOICE RESPONSE]",
    ...customer.response.style.map((rule) => `- ${rule}`),
    `- 通常不超过 ${customer.response.max_sentences} 句；需要用户选择时一次只问一个问题。`,
  ].join("\n");
}
