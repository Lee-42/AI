import type {
  KnowledgeEvidence,
  KnowledgeRetrievalRequest,
  KnowledgeRetrievalResult,
  KnowledgeRetriever,
} from "../ai/ai-ports.js";
import type { CandidateReranker, RerankedKnowledgeCandidate } from "./candidate-reranker.js";
import {
  ContextAssembler,
  calculateEvidenceTokenBudget,
  type EvidenceBudgetPolicy,
} from "./context-assembler.js";
import type { HybridKnowledgeSearch } from "./hybrid-knowledge-search.js";
import type { KnowledgeQueryPlan } from "./knowledge-query-planner.js";
import type { TokenCounter } from "./token-counter.js";

export type KnowledgeCandidateExclusionReason = "below_threshold" | "budget_exceeded";

export interface KnowledgeCandidateExclusion {
  readonly chunkId: string;
  readonly sourceId: string;
  readonly reason: KnowledgeCandidateExclusionReason;
}

export interface GroundedKnowledgeRetrievalTrace {
  readonly result: KnowledgeRetrievalResult;
  readonly plan: KnowledgeQueryPlan;
  readonly reranked: readonly RerankedKnowledgeCandidate[];
  readonly tokenBudget: { readonly available: number; readonly used: number };
  readonly excluded: readonly KnowledgeCandidateExclusion[];
}

export interface GroundedKnowledgeRetrieverOptions {
  readonly search: HybridKnowledgeSearch;
  readonly reranker: CandidateReranker;
  readonly tokenCounter: TokenCounter;
  readonly systemInstruction: string;
  readonly budgetPolicy: EvidenceBudgetPolicy;
  readonly minimumRerankScore?: number;
  readonly candidateMultiplier?: number;
}

/** Converts broad retrieval candidates into evidence that is safe to send to the model. */
export class GroundedKnowledgeRetriever implements KnowledgeRetriever {
  readonly name: string;
  readonly #search: HybridKnowledgeSearch;
  readonly #reranker: CandidateReranker;
  readonly #tokenCounter: TokenCounter;
  readonly #contextAssembler: ContextAssembler;
  readonly #systemInstruction: string;
  readonly #budgetPolicy: EvidenceBudgetPolicy;
  readonly #minimumRerankScore: number;
  readonly #candidateMultiplier: number;

  constructor(options: GroundedKnowledgeRetrieverOptions) {
    this.#search = options.search;
    this.#reranker = options.reranker;
    this.#tokenCounter = options.tokenCounter;
    this.#contextAssembler = new ContextAssembler({ tokenCounter: options.tokenCounter });
    this.#systemInstruction = options.systemInstruction;
    this.#budgetPolicy = options.budgetPolicy;
    this.#minimumRerankScore = options.minimumRerankScore ?? 0.35;
    this.#candidateMultiplier = options.candidateMultiplier ?? 3;
    this.name = `grounded:${options.reranker.name}:${options.tokenCounter.name}`;

    if (!Number.isFinite(this.#minimumRerankScore)) {
      throw new Error("minimumRerankScore must be finite.");
    }
    if (
      !Number.isInteger(this.#candidateMultiplier) ||
      this.#candidateMultiplier < 1 ||
      this.#candidateMultiplier > 6
    ) {
      throw new Error("candidateMultiplier must be an integer from 1 to 6.");
    }
  }

  async retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalResult> {
    return (await this.retrieveWithDiagnostics(request)).result;
  }

  async retrieveWithDiagnostics(
    request: KnowledgeRetrievalRequest,
  ): Promise<GroundedKnowledgeRetrievalTrace> {
    if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 20) {
      throw new Error("Grounded retrieval limit must be an integer from 1 to 20.");
    }
    const searchResult = await this.#search.search({
      tenantId: request.tenantId,
      query: request.query,
      limit: Math.min(20, request.limit * this.#candidateMultiplier),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    const reranked = this.#reranker.rerank({
      plan: searchResult.plan,
      candidates: searchResult.candidates,
    });
    const belowThreshold = reranked.filter(
      (candidate) => candidate.rerankScore < this.#minimumRerankScore,
    );
    const relevant = reranked.filter(
      (candidate) => candidate.rerankScore >= this.#minimumRerankScore,
    );
    const availableTokens = calculateEvidenceTokenBudget({
      tokenCounter: this.#tokenCounter,
      systemInstruction: this.#systemInstruction,
      question: request.query,
      policy: this.#budgetPolicy,
    });
    const thresholdExclusions = belowThreshold.map((candidate) => ({
      chunkId: candidate.chunkId,
      sourceId: candidate.sourceId,
      reason: "below_threshold" as const,
    }));

    if (relevant.length === 0) {
      return trace(searchResult.plan, reranked, availableTokens, 0, thresholdExclusions, {
        status: "none",
        evidence: [],
      });
    }

    const conflicting = conflictingCandidates(relevant).slice(0, request.limit);
    if (conflicting.length > 0) {
      return trace(searchResult.plan, reranked, availableTokens, 0, thresholdExclusions, {
        status: "conflicting",
        evidence: conflicting.map(toEvidence),
      });
    }

    const assembly = this.#contextAssembler.assemble({
      candidates: relevant.slice(0, request.limit),
      availableTokens,
    });
    const byChunkId = new Map(relevant.map((candidate) => [candidate.chunkId, candidate]));
    const budgetExclusions = assembly.excluded.flatMap((excluded) => {
      const candidate = byChunkId.get(excluded.chunkId);
      return candidate
        ? [{ chunkId: candidate.chunkId, sourceId: candidate.sourceId, reason: excluded.reason }]
        : [];
    });
    const result: KnowledgeRetrievalResult =
      assembly.included.length === 0
        ? { status: "none", evidence: [] }
        : { status: "sufficient", evidence: assembly.included.map(toEvidence) };
    return trace(
      searchResult.plan,
      reranked,
      availableTokens,
      assembly.usedTokens,
      [...thresholdExclusions, ...budgetExclusions],
      result,
    );
  }
}

function conflictingCandidates(
  candidates: readonly RerankedKnowledgeCandidate[],
): readonly RerankedKnowledgeCandidate[] {
  const sourcesByGroup = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    if (candidate.conflictGroup) {
      const sources = sourcesByGroup.get(candidate.conflictGroup) ?? new Set<string>();
      sources.add(candidate.sourceId);
      sourcesByGroup.set(candidate.conflictGroup, sources);
    }
  }
  const conflictGroups = new Set(
    [...sourcesByGroup.entries()]
      .filter(([, sourceIds]) => sourceIds.size > 1)
      .map(([group]) => group),
  );
  return candidates.filter(
    (candidate) => candidate.conflictGroup && conflictGroups.has(candidate.conflictGroup),
  );
}

function toEvidence(candidate: RerankedKnowledgeCandidate): KnowledgeEvidence {
  return {
    chunkId: candidate.chunkId,
    sourceId: candidate.sourceId,
    title: candidate.title,
    version: candidate.revision,
    content: candidate.content,
    status: "active",
    score: candidate.rerankScore,
  };
}

function trace(
  plan: KnowledgeQueryPlan,
  reranked: readonly RerankedKnowledgeCandidate[],
  available: number,
  used: number,
  excluded: readonly KnowledgeCandidateExclusion[],
  result: KnowledgeRetrievalResult,
): GroundedKnowledgeRetrievalTrace {
  return { result, plan, reranked, tokenBudget: { available, used }, excluded };
}
