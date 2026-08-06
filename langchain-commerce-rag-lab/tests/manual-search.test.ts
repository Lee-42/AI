import assert from "node:assert/strict";
import test from "node:test";
import type { Collection } from "chromadb";
import type { TextEmbeddingProvider } from "../src/embeddings/contracts.js";
import { searchChromaManuals } from "../src/retrieval/search-chroma-manuals.js";

const fakeEmbeddings: TextEmbeddingProvider = {
  async embedDocuments() {
    return [];
  },
  async embedQuery() {
    return [1, 0];
  }
};

test("queries manual chunks with an optional SKU filter", async () => {
  let queryOptions: Record<string, unknown> | undefined;
  const collection = {
    async query(options: Record<string, unknown>) {
      queryOptions = options;
      return {
        rows() {
          return [[
            {
              id: "manual:laptop-studio-16:chunk:0001",
              document: "视频剪辑时建议使用创作模式。",
              distance: 0.1,
              metadata: {
                recordType: "manual-chunk",
                sku: "laptop-studio-16",
                source: "data/manuals/laptop-studio-16.md",
                chunkIndex: 1,
                startIndex: 0
              }
            }
          ]];
        }
      };
    }
  } as unknown as Collection;

  const hits = await searchChromaManuals(
    collection,
    fakeEmbeddings,
    "剪视频时用什么模式？",
    { k: 3, sku: "laptop-studio-16" }
  );

  assert.deepEqual(queryOptions, {
    queryEmbeddings: [[1, 0]],
    nResults: 3,
    where: {
      $and: [
        { recordType: "manual-chunk" },
        { sku: "laptop-studio-16" }
      ]
    },
    include: ["documents", "metadatas", "distances"]
  });
  assert.equal(hits[0]?.id, "manual:laptop-studio-16:chunk:0001");
  assert.equal(hits[0]?.metadata.chunkIndex, 1);
});

test("rejects invalid manual search inputs before querying", async () => {
  const collection = {} as Collection;

  await assert.rejects(
    searchChromaManuals(collection, fakeEmbeddings, "  "),
    /query must not be empty/
  );
  await assert.rejects(
    searchChromaManuals(collection, fakeEmbeddings, "创作模式", { k: 0 }),
    /positive integer/
  );
});
