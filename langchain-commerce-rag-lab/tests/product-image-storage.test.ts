import assert from "node:assert/strict";
import test from "node:test";
import type { Collection } from "chromadb";
import type { MultimodalEmbeddingProvider } from "../src/embeddings/contracts.js";
import { indexProductImagesInChroma } from "../src/indexing/index-product-images-in-chroma.js";
import { prepareProductImageIndexBatch } from "../src/indexing/prepare-product-image-index-batch.js";
import { loadProductImageRecords } from "../src/indexing/product-images.js";
import { searchChromaImagesByText } from "../src/retrieval/search-chroma-images-by-text.js";

const fakeEmbeddings: MultimodalEmbeddingProvider = {
  async embedImage(imageUrl) {
    return imageUrl.includes("Notebook") ? [0, 1, 0] : [1, 0, 0];
  },
  async embedText() {
    return [1, 0, 0];
  }
};

test("upserts image vectors and URIs with stable IDs", async () => {
  const stored = new Map<string, unknown>();
  const collection = {
    async count() {
      return stored.size;
    },
    async upsert(value: {
      ids: string[];
      embeddings: number[][];
      documents: string[];
      metadatas: Record<string, unknown>[];
      uris: string[];
    }) {
      value.ids.forEach((id, index) => {
        stored.set(id, {
          embedding: value.embeddings[index],
          document: value.documents[index],
          metadata: value.metadatas[index],
          uri: value.uris[index]
        });
      });
    }
  } as unknown as Collection;

  const first = await indexProductImagesInChroma(
    collection,
    fakeEmbeddings,
    "test-model"
  );
  const second = await indexProductImagesInChroma(
    collection,
    fakeEmbeddings,
    "test-model"
  );

  assert.equal(first.recordsBefore, 0);
  assert.equal(first.recordsAfter, 3);
  assert.equal(second.recordsBefore, 3);
  assert.equal(second.recordsAfter, 3);
  assert.equal(stored.size, 3);
  assert.match(
    JSON.stringify(stored.get("image:laptop-air-14:front")),
    /upload\.wikimedia\.org/
  );
});

test("queries image vectors with text and asks Chroma to return URIs", async () => {
  let queryOptions: Record<string, unknown> | undefined;
  const collection = {
    async query(value: Record<string, unknown>) {
      queryOptions = value;
      return {
        rows() {
          return [[
            {
              id: "image:laptop-air-14:front",
              document: "银色轻薄窄边框笔记本电脑",
              distance: 0.12,
              metadata: {
                sku: "laptop-air-14",
                recordType: "product-image"
              },
              uri: "https://example.com/air.jpg"
            }
          ]];
        }
      };
    }
  } as unknown as Collection;

  const hits = await searchChromaImagesByText(
    collection,
    fakeEmbeddings,
    "银色轻薄办公笔记本",
    3
  );

  assert.deepEqual(queryOptions, {
    queryEmbeddings: [[1, 0, 0]],
    nResults: 3,
    include: ["documents", "metadatas", "distances", "uris"]
  });
  assert.equal(hits[0]?.id, "image:laptop-air-14:front");
  assert.equal(hits[0]?.uri, "https://example.com/air.jpg");
  assert.equal(hits[0]?.distance, 0.12);
});

test("rejects inconsistent image index vectors", async () => {
  const records = await loadProductImageRecords();

  assert.throws(
    () =>
      prepareProductImageIndexBatch(
        records,
        [[1, 0], [1], [0, 1]],
        "test-model"
      ),
    /must contain 2 finite values/
  );
});
