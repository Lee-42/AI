import type {
  AiAnswerMode,
  AiEvidenceStatus,
  AiTurnRequest,
  RetrievalEvidenceStatus,
} from "./ai-types.js";

export interface TurnRoutingRequest {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly roundId: string;
  readonly locale: AiTurnRequest["locale"];
  readonly text: string;
  readonly signal?: AbortSignal;
}

export interface TurnRouteDecision {
  readonly mode: AiAnswerMode;
  /** A normalized retrieval query, not an authorization or identity source. */
  readonly query: string;
  /** Stable, low-cardinality reason suitable for tests and metrics. */
  readonly reason: string;
}

export interface TurnRouter {
  readonly name: string;
  route(request: TurnRoutingRequest): Promise<TurnRouteDecision>;
}

export interface KnowledgeRetrievalRequest {
  /** Bound by the server-side Session so adapters can enforce tenant isolation. */
  readonly tenantId: string;
  readonly query: string;
  readonly locale: AiTurnRequest["locale"];
  readonly limit: number;
  readonly signal?: AbortSignal;
}

export interface KnowledgeEvidence {
  readonly sourceId: string;
  readonly title: string;
  readonly version: string;
  readonly content: string;
  readonly status: "active" | "stale";
  readonly score: number | null;
}

export interface KnowledgeRetrievalResult {
  readonly status: RetrievalEvidenceStatus;
  readonly evidence: readonly KnowledgeEvidence[];
}

export interface KnowledgeRetriever {
  readonly name: string;
  retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalResult>;
}

export interface GroundedModelEvidence {
  readonly sourceId: string;
  readonly title: string;
  readonly content: string;
}

export interface GenerateGroundedAnswerRequest {
  readonly locale: AiTurnRequest["locale"];
  readonly systemInstruction: string;
  readonly question: string;
  readonly evidence: readonly GroundedModelEvidence[];
  readonly maxOutputTokens: number;
  readonly temperature: number;
  readonly topP: number;
  readonly signal?: AbortSignal;
}

export interface LanguageModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface GeneratedGroundedAnswer {
  readonly text: string;
  /** Untrusted model output; the orchestrator must validate these against retrieved evidence. */
  readonly citedSourceIds: readonly string[];
  readonly finishReason: "stop" | "length";
  readonly usage: LanguageModelUsage;
  readonly providerRequestId: string | null;
}

export interface LanguageModel {
  readonly name: string;
  generateGroundedAnswer(request: GenerateGroundedAnswerRequest): Promise<GeneratedGroundedAnswer>;
}

export interface AiAnswerPolicyRequest {
  readonly mode: AiAnswerMode;
  readonly evidenceStatus: AiEvidenceStatus;
  readonly routeReason: string;
}

export interface AiAnswerPolicy {
  readonly version: string;
  readonly maxOutputTokens: number;
  readonly temperature: number;
  readonly topP: number;
  readonly groundedSystemInstruction: string;
  responseFor(request: AiAnswerPolicyRequest): string;
}

export class LanguageModelError extends Error {
  constructor(
    readonly code:
      | "LLM_PROVIDER_AUTHENTICATION_FAILED"
      | "LLM_PROVIDER_RATE_LIMITED"
      | "LLM_PROVIDER_REJECTED"
      | "LLM_PROVIDER_UNAVAILABLE"
      | "LLM_PROVIDER_TIMEOUT"
      | "LLM_INVALID_RESPONSE",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LanguageModelError";
  }
}
