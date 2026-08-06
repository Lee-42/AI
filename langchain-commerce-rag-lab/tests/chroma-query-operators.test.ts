import assert from "node:assert/strict";
import test from "node:test";
import type { Collection, Where } from "chromadb";
import type { TextEmbeddingProvider } from "../src/embeddings/contracts.js";
import { getChromaProducts } from "../src/retrieval/get-chroma-products.js";
import { searchChromaProducts } from "../src/retrieval/search-chroma-products.js";

const fakeEmbeddings: TextEmbeddingProvider = {
  async embedDocuments() {
    return [];
  },
  async embedQuery() {
    return [1, 0];
  }
};

test("passes metadata and document operators to Chroma get", async () => {
  let getOptions: Record<string, unknown> | undefined;
  const where: Where = {
    $and: [
      { price: { $gte: 6000 } },
      { price: { $lte: 8000 } }
    ]
  };
  const collection = {
    async get(options: Record<string, unknown>) {
      getOptions = options;
      return {
        rows() {
          return [
            {
              id: "product:laptop-air-14:profile",
              document: "商品名: Aurora Air 14",
              metadata: {
                sku: "laptop-air-14",
                price: 6999
              }
            }
          ];
        }
      };
    }
  } as unknown as Collection;

  const records = await getChromaProducts(collection, {
    where,
    whereDocument: { $contains: "移动办公" }
  });

  assert.deepEqual(getOptions, {
    where,
    whereDocument: { $contains: "移动办公" },
    include: ["documents", "metadatas"]
  });
  assert.equal(records[0]?.metadata.sku, "laptop-air-14");
});

test("combines vector ranking with an exact metadata filter", async () => {
  let queryOptions: Record<string, unknown> | undefined;
  const collection = {
    async query(options: Record<string, unknown>) {
      queryOptions = options;
      return {
        rows() {
          return [[
            {
              id: "product:laptop-air-14:profile",
              document: "商品名: Aurora Air 14",
              distance: 0.2,
              metadata: {
                sku: "laptop-air-14",
                price: 6999
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
    "售价 6999 元的笔记本电脑",
    3,
    { where: { price: { $eq: 6999 } } }
  );

  assert.deepEqual(queryOptions, {
    queryEmbeddings: [[1, 0]],
    nResults: 3,
    where: { price: { $eq: 6999 } },
    include: ["documents", "metadatas", "distances"]
  });
  assert.equal(hits[0]?.metadata.price, 6999);
});
