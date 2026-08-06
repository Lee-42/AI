import { type KnowledgeQueryPlan, KnowledgeQueryPlanner } from "./knowledge-query-planner.js";
import type { KnowledgeSourceRegistry } from "./knowledge-source-registry.js";
import type { TextEmbeddingProvider } from "./text-embedding-provider.js";
import { validateEmbeddingBatch } from "./text-embedding-provider.js";
import type {
  KnowledgeSearchHit,
  KnowledgeSearchScope,
  KnowledgeVectorCollection,
  VectorCollectionContract,
} from "./vector-collection.js";

export interface HybridKnowledgeSearchRequest {
  /** Must come from the server-side Session, not a browser-supplied filter. */
  readonly tenantId: string;
  readonly query: string;
  readonly limit: number;
  readonly signal?: AbortSignal;
}

export interface HybridKnowledgeCandidate {
  readonly chunkId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly revision: string;
  readonly conflictGroup: string | null;
  readonly content: string;
  readonly fusedScore: number;
  readonly denseRank: number | null;
  readonly lexicalRank: number | null;
}

export interface HybridKnowledgeSearchResult {
  readonly plan: KnowledgeQueryPlan;
  readonly candidates: readonly HybridKnowledgeCandidate[];
  readonly branchCounts: {
    readonly dense: number;
    readonly lexical: number;
  };
}

export interface HybridKnowledgeSearchOptions {
  readonly registry: KnowledgeSourceRegistry;
  readonly collection: KnowledgeVectorCollection;
  readonly embeddingProvider: TextEmbeddingProvider;
  readonly contract: VectorCollectionContract;
  readonly planner?: KnowledgeQueryPlanner;
  readonly now?: () => Date;
  readonly candidateMultiplier?: number;
}

/** Candidate retrieval only. Reranking and evidence sufficiency belong to the next stage. */
export class HybridKnowledgeSearch {
  readonly #registry: KnowledgeSourceRegistry;
  readonly #collection: KnowledgeVectorCollection;
  readonly #embeddingProvider: TextEmbeddingProvider;
  readonly #contract: VectorCollectionContract;
  readonly #planner: KnowledgeQueryPlanner;
  readonly #now: () => Date;
  readonly #candidateMultiplier: number;

  constructor(options: HybridKnowledgeSearchOptions) {
    this.#registry = options.registry;
    this.#collection = options.collection;
    this.#embeddingProvider = options.embeddingProvider;
    this.#contract = options.contract;
    this.#planner = options.planner ?? new KnowledgeQueryPlanner();
    this.#now = options.now ?? (() => new Date());
    this.#candidateMultiplier = options.candidateMultiplier ?? 3;
    if (
      !Number.isInteger(this.#candidateMultiplier) ||
      this.#candidateMultiplier < 1 ||
      this.#candidateMultiplier > 10
    ) {
      throw new Error("candidateMultiplier must be an integer from 1 to 10.");
    }
    if (
      this.#embeddingProvider.model !== this.#contract.embeddingModel ||
      this.#embeddingProvider.dimension !== this.#contract.embeddingDimension
    ) {
      throw new Error("Query Embedding provider does not match the collection contract.");
    }
  }

  async search(request: HybridKnowledgeSearchRequest): Promise<HybridKnowledgeSearchResult> {
    if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 20) {
      throw new Error("Hybrid search limit must be an integer from 1 to 20.");
    }
    assertNotAborted(request.signal);
    const plan = this.#planner.plan(request.query);
    const allowedSourceIds = this.#registry
      .listRetrievable(request.tenantId, this.#now())
      .map((source) => source.source_id);
    if (allowedSourceIds.length === 0) {
      return { plan, candidates: [], branchCounts: { dense: 0, lexical: 0 } };
    }

    const embedding = await this.#embeddingProvider.embedDocuments(
      [plan.semanticQuery],
      request.signal,
    );
    validateEmbeddingBatch(embedding, {
      count: 1,
      model: this.#contract.embeddingModel,
      dimension: this.#contract.embeddingDimension,
    });
    assertNotAborted(request.signal);

    const scope: KnowledgeSearchScope = {
      tenantId: request.tenantId,
      allowedSourceIds,
      indexVersion: this.#contract.indexVersion,
      pipelineVersion: this.#contract.pipelineVersion,
    };
    const candidateLimit = Math.min(100, request.limit * this.#candidateMultiplier);
    const [dense, lexical] = await Promise.all([
      this.#collection.searchDense(embedding.vectors[0] ?? [], scope, candidateLimit),
      this.#collection.searchLexical(plan.lexicalTerms, scope, candidateLimit),
    ]);
    assertNotAborted(request.signal);
    return {
      plan,
      candidates: reciprocalRankFusion(dense, lexical).slice(0, request.limit),
      branchCounts: { dense: dense.length, lexical: lexical.length },
    };
  }
}

export function reciprocalRankFusion(
  dense: readonly KnowledgeSearchHit[],
  lexical: readonly KnowledgeSearchHit[],
  rankConstant = 60,
): HybridKnowledgeCandidate[] {
  if (!Number.isFinite(rankConstant) || rankConstant < 1) {
    throw new Error("rankConstant must be at least 1.");
  }
  const candidates = new Map<
    string,
    {
      hit: KnowledgeSearchHit;
      fusedScore: number;
      denseRank: number | null;
      lexicalRank: number | null;
    }
  >();
  addBranch(candidates, dense, "denseRank", 1, rankConstant);
  // Exact business terms are deliberately boosted; raw branch scores remain incomparable.
  addBranch(candidates, lexical, "lexicalRank", 2, rankConstant);
  return [...candidates.values()]
    .sort(
      (left, right) =>
        right.fusedScore - left.fusedScore || left.hit.id.localeCompare(right.hit.id),
    )
    .flatMap(({ hit, fusedScore, denseRank, lexicalRank }) => {
      if (!hit.document || !hit.metadata) {
        return [];
      }
      return [
        {
          chunkId: hit.id,
          sourceId: hit.metadata.source_id,
          title: hit.metadata.title,
          revision: hit.metadata.revision,
          conflictGroup: hit.metadata.conflict_group,
          content: hit.document,
          fusedScore,
          denseRank,
          lexicalRank,
        },
      ];
    });
}

function addBranch(
  candidates: Map<
    string,
    {
      hit: KnowledgeSearchHit;
      fusedScore: number;
      denseRank: number | null;
      lexicalRank: number | null;
    }
  >,
  hits: readonly KnowledgeSearchHit[],
  rankKey: "denseRank" | "lexicalRank",
  weight: number,
  rankConstant: number,
): void {
  hits.forEach((hit, index) => {
    const rank = index + 1;
    const current = candidates.get(hit.id) ?? {
      hit,
      fusedScore: 0,
      denseRank: null,
      lexicalRank: null,
    };
    current.fusedScore += weight / (rankConstant + rank);
    current[rankKey] = rank;
    candidates.set(hit.id, current);
  });
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("Knowledge search was cancelled.");
  }
}
