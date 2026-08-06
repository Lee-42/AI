import { describe, expect, it } from "vitest";

import { LanguageModelError } from "../src/ai/ai-ports.js";
import { AiOrchestratorError } from "../src/ai/ai-types.js";
import { loadRagAnswerPolicy } from "../src/ai/rag-answer-policy.js";
import { SafeFallbackPolicy } from "../src/ai/safe-fallback-policy.js";

const ragPolicyPath = "config/rag-answer-policy.v1.json";

describe("safe fallback policy", () => {
  it.each([
    ["none", "no_evidence"],
    ["conflicting", "conflicting_evidence"],
    ["stale", "stale_evidence"],
  ] as const)("speaks the fixed %s evidence fallback", (status, reason) => {
    const rag = loadRagAnswerPolicy(ragPolicyPath);
    const policy = new SafeFallbackPolicy(rag);

    expect(policy.forEvidence(status)).toEqual({
      action: "speak",
      spokenText: rag.responseFor({
        mode: "abstain",
        evidenceStatus: status,
        routeReason: "safe_fallback_policy",
      }),
      reason,
      retryable: false,
      recordInMemory: true,
    });
  });

  it.each([
    "LLM_PROVIDER_TIMEOUT",
    "LLM_PROVIDER_RATE_LIMITED",
    "LLM_PROVIDER_UNAVAILABLE",
  ] as const)("maps %s to the retryable service response", (code) => {
    const rag = loadRagAnswerPolicy(ragPolicyPath);
    const policy = new SafeFallbackPolicy(rag);
    const error = new LanguageModelError(code, "provider-secret=do-not-leak", true);

    expect(policy.forFailure(error)).toEqual({
      action: "speak",
      spokenText: rag.serviceUnavailableResponse,
      reason: "provider_unavailable",
      retryable: true,
      recordInMemory: false,
    });
  });

  it.each([
    "LLM_PROVIDER_AUTHENTICATION_FAILED",
    "LLM_PROVIDER_REJECTED",
    "LLM_INVALID_RESPONSE",
  ] as const)("maps %s to the non-retryable service-error response", (code) => {
    const rag = loadRagAnswerPolicy(ragPolicyPath);
    const policy = new SafeFallbackPolicy(rag);
    const error = new LanguageModelError(code, "credential-like-value", false);

    expect(policy.forFailure(error)).toEqual({
      action: "speak",
      spokenText: rag.serviceErrorResponse,
      reason: "internal_error",
      retryable: false,
      recordInMemory: false,
    });
  });

  it("maps unknown exceptions without exposing their messages", () => {
    const rag = loadRagAnswerPolicy(ragPolicyPath);
    const decision = new SafeFallbackPolicy(rag).forFailure(new Error("api_key=unit-test-secret"));

    expect(decision).toMatchObject({
      action: "speak",
      spokenText: rag.serviceErrorResponse,
      reason: "internal_error",
      retryable: false,
      recordInMemory: false,
    });
    expect(JSON.stringify(decision)).not.toContain("unit-test-secret");
  });

  it("keeps cancellation silent before considering a provider error", () => {
    const policy = new SafeFallbackPolicy(loadRagAnswerPolicy(ragPolicyPath));
    const controller = new AbortController();
    controller.abort();

    expect(
      policy.forFailure(
        new LanguageModelError("LLM_PROVIDER_UNAVAILABLE", "provider unavailable", true),
        controller.signal,
      ),
    ).toEqual({
      action: "silent",
      spokenText: null,
      reason: "cancelled",
      retryable: false,
      recordInMemory: false,
    });
    expect(policy.forFailure(new AiOrchestratorError("AI_TURN_ABORTED", "cancelled"))).toEqual({
      action: "silent",
      spokenText: null,
      reason: "cancelled",
      retryable: false,
      recordInMemory: false,
    });
  });
});
