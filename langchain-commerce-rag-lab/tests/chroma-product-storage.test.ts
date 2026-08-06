import assert from "node:assert/strict";
import test from "node:test";
import type { Collection } from "chromadb";
import type { TextEmbeddingProvider } from "../src/embeddings/contracts.js";
import { indexProductsInChroma } from "../src/indexing/index-products-in-chroma.js";
import { searchChromaProducts } from "../src/retrieval/search-chroma-products.js";

const fakeEmbeddings: TextEmbeddingProvider = {
  async embedDocuments(texts) {
    return texts.map((_text, index) => [index + 1, 0, 0]);
  },
  async embedQuery() {
    return [1, 0, 0];
  }
};

test("upserts products with stable IDs so repeated indexing is idempotent", async () => {
  const records = new Map<string, unknown>();
  const collection = {
    async count() {
      return records.size;
    },
    async upsert(value: {
      ids: string[];
      embeddings: number[][];
      documents: string[];
      metadatas: Record<string, unknown>[];
    }) {
      value.ids.forEach((id, index) => {
        records.set(id, {
          embedding: value.embeddings[index],
          document: value.documents[index],
          metadata: value.metadatas[index]
        });
      });
    }
  } as unknown as Collection;

  const first = await indexProductsInChroma(collection, fakeEmbeddings);
  const second = await indexProductsInChroma(collection, fakeEmbeddings);

  assert.equal(first.recordsBefore, 0);
  assert.equal(first.recordsAfter, 3);
  assert.equal(second.recordsBefore, 3);
  assert.equal(second.recordsAfter, 3);
  assert.equal(records.size, 3);
});

test("queries Chroma with a precomputed vector and normalizes rows", async () => {
  let queryOptions: Record<string, unknown> | undefined;
  const collection = {
    async query(value: Record<string, unknown>) {
      queryOptions = value;
      return {
        rows() {
          return [[
            {
              id: "product:laptop-air-14:profile",
              document: "商品名: Aurora Air 14",
              distance: 0.1,
              metadata: {
                sku: "laptop-air-14",
                category: "laptop"
              }
            }
          ]];
        }
      };
    }
  } as unknown as Collection;

  const hits = await searchChromaProducts(
    collection,
    fakeEmbeddings,
    "方便出差携带的电脑",
    3
  );

  assert.deepEqual(queryOptions, {
    queryEmbeddings: [[1, 0, 0]],
    nResults: 3,
    include: ["documents", "metadatas", "distances"]
  });
  assert.equal(hits[0]?.id, "product:laptop-air-14:profile");
  assert.equal(hits[0]?.distance, 0.1);
  assert.equal(hits[0]?.relevanceScore, 0.9);
  assert.equal(hits[0]?.metadata.sku, "laptop-air-14");
});

test("rejects invalid Chroma search inputs before querying", async () => {
  const collection = {} as Collection;

  await assert.rejects(
    searchChromaProducts(collection, fakeEmbeddings, "  "),
    /query must not be empty/
  );
  await assert.rejects(
    searchChromaProducts(collection, fakeEmbeddings, "电脑", 0),
    /positive integer/
  );
});
