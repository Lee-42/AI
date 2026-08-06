import assert from "node:assert/strict";
import test from "node:test";
import type { Collection } from "chromadb";
import type { TextEmbeddingProvider } from "../src/embeddings/contracts.js";
import { diagnoseProductQueries } from "../src/evaluation/query-diagnostics.js";

const fakeEmbeddings: TextEmbeddingProvider = {
  async embedDocuments(texts) {
    return texts.map((_text, index) => [index + 1, 0]);
  },
  async embedQuery() {
    return [1, 0];
  }
};

test("batches diagnostic queries and calculates the top distance gap", async () => {
  let queryOptions: Record<string, unknown> | undefined;
  const collection = {
    async query(value: Record<string, unknown>) {
      queryOptions = value;
      return {
        rows() {
          return [
            [
              {
                id: "product:a",
                document: "商品名: A",
                distance: 0.2,
                metadata: { sku: "a" }
              },
              {
                id: "product:b",
                document: "商品名: B",
                distance: 0.5,
                metadata: { sku: "b" }
              }
            ],
            [
              {
                id: "product:b",
                document: "商品名: B",
                distance: 0.1,
                metadata: { sku: "b" }
              },
              {
                id: "product:a",
                document: "商品名: A",
                distance: 0.4,
                metadata: { sku: "a" }
              }
            ]
          ];
        }
      };
    }
  } as unknown as Collection;

  const diagnostics = await diagnoseProductQueries(
    collection,
    fakeEmbeddings,
    [
      { id: "q1", text: "first" },
      { id: "q2", text: "second" }
    ],
    2
  );

  assert.deepEqual(queryOptions, {
    queryEmbeddings: [[1, 0], [2, 0]],
    nResults: 2,
    include: ["documents", "metadatas", "distances"]
  });
  assert.equal(diagnostics[0]?.hits[0]?.metadata.sku, "a");
  assert.ok(Math.abs((diagnostics[0]?.topGap ?? 0) - 0.3) < 1e-12);
  assert.equal(diagnostics[1]?.queryVector[0], 2);
});

test("rejects invalid diagnostic query definitions", async () => {
  const collection = {} as Collection;

  await assert.rejects(
    diagnoseProductQueries(collection, fakeEmbeddings, []),
    /must not be empty/
  );
  await assert.rejects(
    diagnoseProductQueries(collection, fakeEmbeddings, [
      { id: "duplicate", text: "first" },
      { id: "duplicate", text: "second" }
    ]),
    /IDs must be unique/
  );
});
