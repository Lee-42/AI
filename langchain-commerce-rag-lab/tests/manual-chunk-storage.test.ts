import assert from "node:assert/strict";
import test from "node:test";
import type { Collection } from "chromadb";
import type { TextEmbeddingProvider } from "../src/embeddings/contracts.js";
import { indexManualChunksInChroma } from "../src/indexing/index-manual-chunks-in-chroma.js";

const fakeEmbeddings: TextEmbeddingProvider = {
  async embedDocuments(texts) {
    return texts.map((_text, index) => [index + 1, 1]);
  },
  async embedQuery() {
    return [1, 1];
  }
};

test("upserts manual chunks with stable IDs on repeated indexing", async () => {
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

  const first = await indexManualChunksInChroma(
    collection,
    fakeEmbeddings,
    "test-model"
  );
  const second = await indexManualChunksInChroma(
    collection,
    fakeEmbeddings,
    "test-model"
  );

  assert.equal(first.sourceCount, 2);
  assert.equal(first.indexedChunks, 5);
  assert.equal(first.dimension, 2);
  assert.equal(first.recordsBefore, 0);
  assert.equal(first.recordsAfter, 5);
  assert.equal(second.recordsBefore, 5);
  assert.equal(second.recordsAfter, 5);
  assert.equal(records.size, 5);
});

test("rejects a manual embedding count mismatch", async () => {
  const invalidEmbeddings: TextEmbeddingProvider = {
    async embedDocuments() {
      return [];
    },
    async embedQuery() {
      return [];
    }
  };
  const collection = {
    async count() {
      return 0;
    }
  } as Collection;

  await assert.rejects(
    indexManualChunksInChroma(
      collection,
      invalidEmbeddings,
      "test-model"
    ),
    /counts must match/
  );
});
