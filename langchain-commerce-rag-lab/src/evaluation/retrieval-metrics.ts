import type { EvaluationQuery } from "./evaluation-queries.js";
import { cosineDistance } from "../vector-math/distances.js";

export type RankedSku = {
  sku: string;
  distance: number;
};

export type QueryRanking = {
  queryId: string;
  rankedSkus: string[];
};

export type RetrievalEvaluation = {
  queryCount: number;
  recallAt1: number;
  recallAtK: number;
  mrr: number;
  results: Array<{
    queryId: string;
    firstRelevantRank?: number;
    passedAt1: boolean;
    passedAtK: boolean;
  }>;
};

export function rankSkusByCosine(
  skus: string[],
  documentVectors: number[][],
  queryVector: number[]
): RankedSku[] {
  if (skus.length === 0 || skus.length !== documentVectors.length) {
    throw new Error("SKU and document vector counts must match and be non-empty");
  }

  if (new Set(skus).size !== skus.length) {
    throw new Error("Ranked SKUs must be unique");
  }

  return skus
    .map((sku, index) => ({
      sku,
      distance: cosineDistance(
        queryVector,
        documentVectors[index] as number[]
      )
    }))
    .sort((left, right) => left.distance - right.distance);
}

export function evaluateRankings(
  queries: EvaluationQuery[],
  rankings: QueryRanking[],
  k: number
): RetrievalEvaluation {
  if (!Number.isInteger(k) || k < 1) {
    throw new Error("Evaluation K must be a positive integer");
  }

  const rankingByQuery = new Map(
    rankings.map((ranking) => [ranking.queryId, ranking.rankedSkus])
  );

  if (rankingByQuery.size !== rankings.length) {
    throw new Error("Ranking query IDs must be unique");
  }

  const results = queries.map((query) => {
    const rankedSkus = rankingByQuery.get(query.id);

    if (!rankedSkus) {
      throw new Error(`Missing ranking for evaluation query ${query.id}`);
    }

    const firstRelevantIndex = rankedSkus.findIndex((sku) => {
      return query.expectedSkus.includes(sku);
    });
    const firstRelevantRank =
      firstRelevantIndex === -1 ? undefined : firstRelevantIndex + 1;

    return {
      queryId: query.id,
      ...(firstRelevantRank ? { firstRelevantRank } : {}),
      passedAt1: firstRelevantRank === 1,
      passedAtK:
        firstRelevantRank !== undefined && firstRelevantRank <= k
    };
  });
  const queryCount = results.length;

  if (queryCount === 0) {
    throw new Error("Evaluation queries must not be empty");
  }

  return {
    queryCount,
    recallAt1:
      results.filter((result) => result.passedAt1).length / queryCount,
    recallAtK:
      results.filter((result) => result.passedAtK).length / queryCount,
    mrr:
      results.reduce((sum, result) => {
        return sum + (result.firstRelevantRank ? 1 / result.firstRelevantRank : 0);
      }, 0) / queryCount,
    results
  };
}
