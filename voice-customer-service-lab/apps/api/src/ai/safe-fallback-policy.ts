import { LanguageModelError } from "./ai-ports.js";
import type { RetrievalEvidenceStatus } from "./ai-types.js";
import { AiOrchestratorError } from "./ai-types.js";
import type { VersionedRagAnswerPolicy } from "./rag-answer-policy.js";

export type SafeFallbackReason =
  | "no_evidence"
  | "conflicting_evidence"
  | "stale_evidence"
  | "provider_unavailable"
  | "internal_error"
  | "cancelled";

export type SafeFallbackDecision =
  | {
      readonly action: "speak";
      readonly spokenText: string;
      readonly reason: Exclude<SafeFallbackReason, "cancelled">;
      readonly retryable: boolean;
      readonly recordInMemory: boolean;
    }
  | {
      readonly action: "silent";
      readonly spokenText: null;
      readonly reason: "cancelled";
      readonly retryable: false;
      readonly recordInMemory: false;
    };

type FailedEvidenceStatus = Exclude<RetrievalEvidenceStatus, "sufficient">;

export class SafeFallbackPolicy {
  readonly #ragPolicy: VersionedRagAnswerPolicy;

  constructor(ragPolicy: VersionedRagAnswerPolicy) {
    this.#ragPolicy = ragPolicy;
  }

  forEvidence(status: FailedEvidenceStatus): SafeFallbackDecision {
    return {
      action: "speak",
      spokenText: this.#ragPolicy.responseFor({
        mode: "abstain",
        evidenceStatus: status,
        routeReason: "safe_fallback_policy",
      }),
      reason: evidenceReason(status),
      retryable: false,
      recordInMemory: true,
    };
  }

  forFailure(error: unknown, signal?: AbortSignal): SafeFallbackDecision {
    if (
      signal?.aborted ||
      (error instanceof AiOrchestratorError && error.code === "AI_TURN_ABORTED")
    ) {
      return {
        action: "silent",
        spokenText: null,
        reason: "cancelled",
        retryable: false,
        recordInMemory: false,
      };
    }

    if (
      error instanceof LanguageModelError &&
      ["LLM_PROVIDER_TIMEOUT", "LLM_PROVIDER_RATE_LIMITED", "LLM_PROVIDER_UNAVAILABLE"].includes(
        error.code,
      )
    ) {
      return {
        action: "speak",
        spokenText: this.#ragPolicy.serviceUnavailableResponse,
        reason: "provider_unavailable",
        retryable: true,
        recordInMemory: false,
      };
    }

    return {
      action: "speak",
      spokenText: this.#ragPolicy.serviceErrorResponse,
      reason: "internal_error",
      retryable: false,
      recordInMemory: false,
    };
  }
}

function evidenceReason(
  status: FailedEvidenceStatus,
): "no_evidence" | "conflicting_evidence" | "stale_evidence" {
  switch (status) {
    case "none":
      return "no_evidence";
    case "conflicting":
      return "conflicting_evidence";
    case "stale":
      return "stale_evidence";
  }
}
