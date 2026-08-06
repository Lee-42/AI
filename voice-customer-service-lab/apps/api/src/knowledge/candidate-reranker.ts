import type { HybridKnowledgeCandidate } from "./hybrid-knowledge-search.js";
import type { KnowledgeQueryPlan } from "./knowledge-query-planner.js";

export type RerankReason =
  | "query_term_coverage"
  | "title_match"
  | "branch_agreement"
  | "negated_intent"
  | "missing_required_signal";

export interface RerankedKnowledgeCandidate extends HybridKnowledgeCandidate {
  readonly rerankScore: number;
  readonly reasons: readonly RerankReason[];
}

export interface CandidateReranker {
  readonly name: string;
  rerank(input: {
    readonly plan: KnowledgeQueryPlan;
    readonly candidates: readonly HybridKnowledgeCandidate[];
  }): readonly RerankedKnowledgeCandidate[];
}

/** Offline course adapter; production can replace it with a semantic Cross-Encoder. */
export class DeterministicCandidateReranker implements CandidateReranker {
  readonly name = "deterministic-course-reranker";

  rerank(input: {
    readonly plan: KnowledgeQueryPlan;
    readonly candidates: readonly HybridKnowledgeCandidate[];
  }): readonly RerankedKnowledgeCandidate[] {
    const terms = input.plan.lexicalTerms.map(normalize);
    return input.candidates
      .map((candidate) => scoreCandidate(input.plan, terms, candidate))
      .sort(
        (left, right) =>
          right.score - left.score || left.candidate.chunkId.localeCompare(right.candidate.chunkId),
      )
      .map(({ candidate, score, reasons }) => ({
        ...candidate,
        rerankScore: Number(score.toFixed(6)),
        reasons,
      }));
  }
}

function scoreCandidate(
  plan: KnowledgeQueryPlan,
  terms: readonly string[],
  candidate: HybridKnowledgeCandidate,
): {
  readonly candidate: HybridKnowledgeCandidate;
  readonly score: number;
  readonly reasons: readonly RerankReason[];
} {
  const title = normalize(candidate.title);
  const searchable = normalize(`${candidate.title}\n${candidate.content}`);
  const termCoverage = coverage(terms, searchable);
  const titleCoverage = coverage(terms, title);
  const branchAgreement = candidate.denseRank !== null && candidate.lexicalRank !== null;
  const negatedIntent = plan.signals.includes("quality") && /非质量/u.test(searchable);
  const missingRequiredSignal =
    plan.signals.includes("night_delivery") && !/(?:夜间|定时配送)/u.test(searchable);
  const reasons: RerankReason[] = [];
  if (termCoverage > 0) reasons.push("query_term_coverage");
  if (titleCoverage > 0) reasons.push("title_match");
  if (branchAgreement) reasons.push("branch_agreement");
  if (negatedIntent) reasons.push("negated_intent");
  if (missingRequiredSignal) reasons.push("missing_required_signal");

  return {
    candidate,
    score:
      candidate.fusedScore * 10 +
      termCoverage * 0.5 +
      titleCoverage * 0.25 +
      (branchAgreement ? 0.15 : 0) -
      (negatedIntent ? 1 : 0) -
      (missingRequiredSignal ? 1 : 0),
    reasons,
  };
}

function coverage(terms: readonly string[], value: string): number {
  if (terms.length === 0) return 0;
  return terms.filter((term) => value.includes(term)).length / terms.length;
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN");
}
