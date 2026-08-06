export const AI_ANSWER_MODES = [
  "grounded_answer",
  "clarify",
  "direct_answer",
  "abstain",
  "tool_required",
  "handoff",
  "out_of_scope",
  "safety_refusal",
] as const;

export type AiAnswerMode = (typeof AI_ANSWER_MODES)[number];

export const AI_EVIDENCE_STATUSES = [
  "sufficient",
  "none",
  "conflicting",
  "stale",
  "not_applicable",
] as const;

export type AiEvidenceStatus = (typeof AI_EVIDENCE_STATUSES)[number];
export type RetrievalEvidenceStatus = Exclude<AiEvidenceStatus, "not_applicable">;

export interface GroundedHistoryMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface GroundedConversationContext {
  readonly systemInstruction: string;
  readonly history: readonly GroundedHistoryMessage[];
}

export interface AiTurnRequest {
  /** Resolved from the trusted server-side Session, never parsed from user text. */
  readonly tenantId: string;
  readonly sessionId: string;
  readonly roundId: string;
  readonly locale: "zh-CN";
  readonly text: string;
  readonly groundedContext: GroundedConversationContext;
  readonly signal?: AbortSignal;
}

export interface AiCitation {
  readonly sourceId: string;
  readonly title: string;
  readonly version: string;
}

export interface AiExecutionMetadata {
  readonly policyVersion: string;
  readonly router: string;
  readonly retriever: string | null;
  readonly model: string | null;
  readonly routeReason: string;
  readonly providerRequestId: string | null;
  readonly modelUsage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  } | null;
}

export interface AiTurnResponse {
  readonly sessionId: string;
  readonly roundId: string;
  readonly answerMode: AiAnswerMode;
  readonly evidenceStatus: AiEvidenceStatus;
  readonly spokenText: string;
  readonly citations: readonly AiCitation[];
  /** Internal trace metadata; an HTTP adapter must explicitly allow-list anything exposed publicly. */
  readonly execution: AiExecutionMetadata;
}

export interface AiOrchestrator {
  answer(request: AiTurnRequest): Promise<AiTurnResponse>;
}

export class AiOrchestratorError extends Error {
  constructor(
    readonly code:
      | "AI_TURN_ABORTED"
      | "AI_INVALID_ROUTE"
      | "AI_INVALID_RETRIEVAL_RESULT"
      | "AI_INVALID_MODEL_OUTPUT",
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AiOrchestratorError";
  }
}
