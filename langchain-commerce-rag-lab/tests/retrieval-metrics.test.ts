import assert from "node:assert/strict";
import test from "node:test";
import type { EvaluationQuery } from "../src/evaluation/evaluation-queries.js";
import {
  evaluateRankings,
  rankSkusByCosine
} from "../src/evaluation/retrieval-metrics.js";

const queries: EvaluationQuery[] = [
  {
    id: "q1",
    query: "first",
    expectedSkus: ["a"],
    tags: ["test"]
  },
  {
    id: "q2",
    query: "second",
    expectedSkus: ["c"],
    tags: ["test"]
  }
];

test("calculates Recall@K and MRR from expected SKUs", () => {
  const evaluation = evaluateRankings(
    queries,
    [
      { queryId: "q1", rankedSkus: ["a", "b", "c"] },
      { queryId: "q2", rankedSkus: ["b", "c", "a"] }
    ],
    2
  );

  assert.equal(evaluation.recallAt1, 0.5);
  assert.equal(evaluation.recallAtK, 1);
  assert.equal(evaluation.mrr, 0.75);
  assert.equal(evaluation.results[1]?.firstRelevantRank, 2);
});

test("ranks SKUs by ascending cosine distance", () => {
  const ranking = rankSkusByCosine(
    ["east", "north", "northeast"],
    [[1, 0], [0, 1], [1, 1]],
    [1, 0]
  );

  assert.deepEqual(
    ranking.map((item) => item.sku),
    ["east", "northeast", "north"]
  );
  assert.equal(ranking[0]?.distance, 0);
});

test("rejects incomplete or inconsistent evaluation inputs", () => {
  assert.throws(
    () => evaluateRankings(queries, [], 1),
    /Missing ranking/
  );
  assert.throws(
    () => rankSkusByCosine(["a"], [], [1]),
    /counts must match/
  );
});
