import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { AiAnswerPolicy, AiAnswerPolicyRequest } from "./ai-ports.js";

const boundedText = z.string().trim().min(1).max(4_000);
const ragAnswerPolicySchema = z
  .object({
    schema_version: z.literal(1),
    policy_id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
    version: z.string().regex(/^[a-z0-9][a-z0-9._@-]{2,63}$/i),
    locale: z.literal("zh-CN"),
    answer_modes: z.record(z.string(), boundedText),
    evidence_gate: z.object({}).passthrough(),
    invariants: z.array(boundedText).min(1),
    fallbacks: z
      .object({
        no_evidence: boundedText,
        conflicting_evidence: boundedText,
        stale_evidence: boundedText,
        tool_required: boundedText,
        human_handoff: boundedText,
        service_unavailable: boundedText,
        service_error: boundedText,
      })
      .strict(),
    direct_responses: z
      .object({
        clarify: boundedText,
        identity: boundedText,
        out_of_scope: boundedText,
        safety_refusal: boundedText,
      })
      .strict(),
    generation: z
      .object({
        max_output_tokens: z.number().int().min(64).max(1_024),
        temperature: z.number().min(0).max(0.5),
        top_p: z.number().min(0.1).max(1),
        grounded_system_instruction: boundedText,
      })
      .strict(),
    voice_response: z.object({}).passthrough(),
  })
  .strict();

type RagAnswerPolicyDocument = Readonly<z.infer<typeof ragAnswerPolicySchema>>;
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

export class VersionedRagAnswerPolicy implements AiAnswerPolicy {
  readonly version: string;
  readonly locale: "zh-CN";
  readonly maxOutputTokens: number;
  readonly temperature: number;
  readonly topP: number;
  readonly groundedSystemInstruction: string;
  readonly serviceUnavailableResponse: string;
  readonly serviceErrorResponse: string;
  readonly #document: RagAnswerPolicyDocument;

  constructor(document: RagAnswerPolicyDocument) {
    this.#document = document;
    this.version = document.version;
    this.locale = document.locale;
    this.maxOutputTokens = document.generation.max_output_tokens;
    this.temperature = document.generation.temperature;
    this.topP = document.generation.top_p;
    this.groundedSystemInstruction = document.generation.grounded_system_instruction;
    this.serviceUnavailableResponse = document.fallbacks.service_unavailable;
    this.serviceErrorResponse = document.fallbacks.service_error;
  }

  responseFor(request: AiAnswerPolicyRequest): string {
    if (request.mode === "abstain") {
      if (request.evidenceStatus === "conflicting") {
        return this.#document.fallbacks.conflicting_evidence;
      }
      if (request.evidenceStatus === "stale") {
        return this.#document.fallbacks.stale_evidence;
      }
      return this.#document.fallbacks.no_evidence;
    }

    switch (request.mode) {
      case "clarify":
        return this.#document.direct_responses.clarify;
      case "direct_answer":
        return this.#document.direct_responses.identity;
      case "tool_required":
        return this.#document.fallbacks.tool_required;
      case "handoff":
        return this.#document.fallbacks.human_handoff;
      case "out_of_scope":
        return this.#document.direct_responses.out_of_scope;
      case "safety_refusal":
        return this.#document.direct_responses.safety_refusal;
      case "grounded_answer":
        throw new Error("Grounded answers must be generated from sufficient evidence.");
    }
  }
}

export function loadRagAnswerPolicy(path: string): VersionedRagAnswerPolicy {
  const resolvedPath = isAbsolute(path) ? path : resolve(repositoryRoot, path);
  let contents: string;
  try {
    contents = readFileSync(resolvedPath, "utf8");
  } catch {
    throw new Error(`Cannot read RAG_ANSWER_POLICY_PATH (${path}).`);
  }

  try {
    const document = ragAnswerPolicySchema.parse(JSON.parse(contents));
    assertNoEmbeddedSecrets(document);
    return new VersionedRagAnswerPolicy(document);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("RAG policy text must not")) {
      throw error;
    }
    throw new Error(
      `RAG_ANSWER_POLICY_PATH (${path}) must contain one valid versioned answer policy.`,
    );
  }
}

function assertNoEmbeddedSecrets(document: RagAnswerPolicyDocument): void {
  const text = JSON.stringify(document);
  if (/(?:api[_ -]?key|access[_ -]?token|secret|password)\s*[:=]\s*[^\s",]{4,}/i.test(text)) {
    throw new Error("RAG policy text must not contain credentials or secret assignments.");
  }
}
