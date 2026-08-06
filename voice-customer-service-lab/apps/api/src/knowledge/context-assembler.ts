import type { RerankedKnowledgeCandidate } from "./candidate-reranker.js";
import type { TokenCounter } from "./token-counter.js";

export interface EvidenceBudgetPolicy {
  readonly modelContextWindowTokens: number;
  readonly protocolOverheadTokens: number;
  readonly maxOutputTokens: number;
  readonly safetyMarginTokens: number;
}

export interface ContextAssemblyResult {
  readonly availableTokens: number;
  readonly usedTokens: number;
  readonly included: readonly RerankedKnowledgeCandidate[];
  readonly excluded: readonly {
    readonly chunkId: string;
    readonly reason: "budget_exceeded";
  }[];
}

export function calculateEvidenceTokenBudget(input: {
  readonly tokenCounter: TokenCounter;
  readonly systemInstruction: string;
  readonly question: string;
  readonly policy: EvidenceBudgetPolicy;
}): number {
  assertPositiveInteger(input.policy.modelContextWindowTokens, "modelContextWindowTokens");
  assertNonNegativeInteger(input.policy.protocolOverheadTokens, "protocolOverheadTokens");
  assertNonNegativeInteger(input.policy.maxOutputTokens, "maxOutputTokens");
  assertNonNegativeInteger(input.policy.safetyMarginTokens, "safetyMarginTokens");
  const promptTokens = checkedTokenCount(
    input.tokenCounter.count(input.systemInstruction) + input.tokenCounter.count(input.question),
  );
  return Math.max(
    0,
    input.policy.modelContextWindowTokens -
      promptTokens -
      input.policy.protocolOverheadTokens -
      input.policy.maxOutputTokens -
      input.policy.safetyMarginTokens,
  );
}

export class ContextAssembler {
  readonly #tokenCounter: TokenCounter;

  constructor(options: { readonly tokenCounter: TokenCounter }) {
    this.#tokenCounter = options.tokenCounter;
  }

  assemble(input: {
    readonly candidates: readonly RerankedKnowledgeCandidate[];
    readonly availableTokens: number;
  }): ContextAssemblyResult {
    assertNonNegativeInteger(input.availableTokens, "availableTokens");
    const included: RerankedKnowledgeCandidate[] = [];
    const excluded: Array<{ chunkId: string; reason: "budget_exceeded" }> = [];
    let usedTokens = 0;

    for (const candidate of input.candidates) {
      const blockTokens = checkedTokenCount(
        this.#tokenCounter.count(formatEvidenceBlock(candidate)),
      );
      if (usedTokens + blockTokens <= input.availableTokens) {
        included.push(candidate);
        usedTokens += blockTokens;
      } else {
        excluded.push({ chunkId: candidate.chunkId, reason: "budget_exceeded" });
      }
    }

    return { availableTokens: input.availableTokens, usedTokens, included, excluded };
  }
}

export function formatEvidenceBlock(candidate: RerankedKnowledgeCandidate): string {
  return [
    `<EVIDENCE source_id="${escapeAttribute(candidate.sourceId)}" chunk_id="${escapeAttribute(candidate.chunkId)}" version="${escapeAttribute(candidate.revision)}" title="${escapeAttribute(candidate.title)}">`,
    candidate.content,
    "</EVIDENCE>",
  ].join("\n");
}

function escapeAttribute(value: string): string {
  return value.replace(/[&"<>]/gu, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      '"': "&quot;",
      "<": "&lt;",
      ">": "&gt;",
    };
    return replacements[character] ?? character;
  });
}

function checkedTokenCount(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("TokenCounter must return a non-negative integer.");
  }
  return value;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
}
