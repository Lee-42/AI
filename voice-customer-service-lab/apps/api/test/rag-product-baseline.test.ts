import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

const answerModeSchema = z.enum([
  "grounded_answer",
  "clarify",
  "direct_answer",
  "abstain",
  "tool_required",
  "handoff",
  "out_of_scope",
  "safety_refusal",
]);

const evidenceStatusSchema = z.enum([
  "sufficient",
  "none",
  "conflicting",
  "stale",
  "not_applicable",
]);

const corpusSchema = z
  .object({
    schema_version: z.literal(1),
    corpus_id: z.string().min(1),
    notice: z.string().min(1),
    documents: z
      .array(
        z
          .object({
            source_id: z.string().min(1),
            title: z.string().min(1),
            version: z.string().min(1),
            status: z.enum(["active", "stale"]),
            effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            effective_to: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .nullable(),
            body: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const evaluationDatasetSchema = z
  .object({
    schema_version: z.literal(1),
    dataset_id: z.string().min(1),
    locale: z.literal("zh-CN"),
    corpus_id: z.string().min(1),
    cases: z
      .array(
        z
          .object({
            id: z.string().regex(/^rag-[a-z0-9-]+$/),
            category: z.string().min(1),
            question: z.string().min(1),
            expected_mode: answerModeSchema,
            evidence_status: evidenceStatusSchema,
            gold_source_ids: z.array(z.string().min(1)),
            required_facts: z.array(z.string().min(1)).min(1),
            forbidden_claims: z.array(z.string().min(1)).min(1),
            citation_required: z.boolean(),
            critical: z.boolean(),
          })
          .strict(),
      )
      .min(16),
  })
  .strict();

const answerPolicySchema = z
  .object({
    schema_version: z.literal(1),
    policy_id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
    version: z.string().regex(/^[a-z0-9][a-z0-9._@-]{2,63}$/i),
    locale: z.literal("zh-CN"),
    answer_modes: z
      .object({
        grounded_answer: z.string().min(1),
        clarify: z.string().min(1),
        direct_answer: z.string().min(1),
        abstain: z.string().min(1),
        tool_required: z.string().min(1),
        handoff: z.string().min(1),
        out_of_scope: z.string().min(1),
        safety_refusal: z.string().min(1),
      })
      .strict(),
    evidence_gate: z
      .object({
        allowed_scope: z.array(z.string().min(1)).min(1),
        sufficient_requires: z.array(z.string().min(1)).min(1),
        failure_modes: z
          .object({
            none: z.literal("abstain"),
            conflicting: z.literal("abstain"),
            stale: z.literal("abstain"),
            not_applicable: z.literal("route_without_rag"),
          })
          .strict(),
      })
      .strict(),
    invariants: z.array(z.string().min(1)).min(1),
    fallbacks: z
      .object({
        no_evidence: z.string().min(1),
        conflicting_evidence: z.string().min(1),
        stale_evidence: z.string().min(1),
        tool_required: z.string().min(1),
        human_handoff: z.string().min(1),
        service_unavailable: z.string().min(1),
        service_error: z.string().min(1),
      })
      .strict(),
    direct_responses: z
      .object({
        clarify: z.string().min(1),
        identity: z.string().min(1),
        out_of_scope: z.string().min(1),
        safety_refusal: z.string().min(1),
      })
      .strict(),
    generation: z
      .object({
        max_output_tokens: z.number().int().min(64).max(1024),
        temperature: z.number().min(0).max(0.5),
        top_p: z.number().min(0.1).max(1),
        grounded_system_instruction: z.string().min(1).max(4_000),
      })
      .strict(),
    voice_response: z
      .object({
        max_sentences: z.number().int().min(1).max(8),
        speak_urls: z.literal(false),
        speak_source_ids: z.literal(false),
        ui_requires_structured_citations: z.literal(true),
      })
      .strict(),
  })
  .strict();

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8"));
}

describe("RAG product and evaluation baseline", () => {
  const corpus = corpusSchema.parse(readJson("eval/rag/synthetic-corpus.v1.json"));
  const dataset = evaluationDatasetSchema.parse(readJson("eval/rag/answer-boundary.v1.json"));
  const policy = answerPolicySchema.parse(readJson("config/rag-answer-policy.v1.json"));

  it("uses matching, versioned synthetic artifacts with unique identifiers", () => {
    expect(dataset.corpus_id).toBe(corpus.corpus_id);
    expect(corpus.notice).toContain("虚构");

    const sourceIds = corpus.documents.map((document) => document.source_id);
    const caseIds = dataset.cases.map((evaluationCase) => evaluationCase.id);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    expect(new Set(caseIds).size).toBe(caseIds.length);
  });

  it("covers every answer mode and evidence state", () => {
    expect(new Set(dataset.cases.map((item) => item.expected_mode))).toEqual(
      new Set(answerModeSchema.options),
    );
    expect(new Set(dataset.cases.map((item) => item.evidence_status))).toEqual(
      new Set(evidenceStatusSchema.options),
    );
    expect(Object.keys(policy.answer_modes).sort()).toEqual([...answerModeSchema.options].sort());
  });

  it("requires traceable evidence for grounded answers", () => {
    const knownSources = new Set(corpus.documents.map((document) => document.source_id));

    for (const evaluationCase of dataset.cases) {
      for (const sourceId of evaluationCase.gold_source_ids) {
        expect(knownSources.has(sourceId), `${evaluationCase.id}: unknown ${sourceId}`).toBe(true);
      }

      if (evaluationCase.expected_mode === "grounded_answer") {
        expect(evaluationCase.evidence_status, evaluationCase.id).toBe("sufficient");
        expect(evaluationCase.gold_source_ids.length, evaluationCase.id).toBeGreaterThan(0);
        expect(evaluationCase.citation_required, evaluationCase.id).toBe(true);
      } else {
        expect(evaluationCase.citation_required, evaluationCase.id).toBe(false);
      }
    }
  });

  it("fails closed for missing, conflicting and stale evidence", () => {
    const failedEvidenceStates = new Set(["none", "conflicting", "stale"]);
    const failedEvidenceCases = dataset.cases.filter((item) =>
      failedEvidenceStates.has(item.evidence_status),
    );

    expect(new Set(failedEvidenceCases.map((item) => item.evidence_status))).toEqual(
      failedEvidenceStates,
    );
    for (const evaluationCase of failedEvidenceCases) {
      expect(evaluationCase.expected_mode, evaluationCase.id).toBe("abstain");
      expect(evaluationCase.citation_required, evaluationCase.id).toBe(false);
    }
  });

  it("marks all authorization, high-impact and safety cases as critical", () => {
    const criticalModes = new Set(["tool_required", "handoff", "out_of_scope", "safety_refusal"]);

    for (const evaluationCase of dataset.cases.filter((item) =>
      criticalModes.has(item.expected_mode),
    )) {
      expect(evaluationCase.critical, evaluationCase.id).toBe(true);
      expect(evaluationCase.evidence_status, evaluationCase.id).toBe("not_applicable");
      expect(evaluationCase.gold_source_ids, evaluationCase.id).toEqual([]);
    }
  });
});
