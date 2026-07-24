import assert from "node:assert/strict";
import test from "node:test";
import type { ChromaClient, Collection } from "chromadb";
import {
  getManualChunkIndexSummary,
  getOrCreateManualChunkCollection,
  manualChunkIndexConfiguration
} from "../src/vectorstores/manual-chunk-collection.js";

test("uses cosine for local and cloud manual chunk indexes", () => {
  assert.deepEqual(
    manualChunkIndexConfiguration("local"),
    { hnsw: { space: "cosine" } }
  );
  assert.deepEqual(
    manualChunkIndexConfiguration("cloud"),
    { spann: { space: "cosine" } }
  );
});

test("creates the manual collection without a built-in embedding", async () => {
  let options: Record<string, unknown> | undefined;
  const collection = {
    name: "commerce_manual_chunks_v1",
    configuration: {
      spann: { space: "cosine" }
    }
  } as unknown as Collection;
  const client = {
    async getOrCreateCollection(value: Record<string, unknown>) {
      options = value;
      return collection;
    }
  } as unknown as ChromaClient;

  const result = await getOrCreateManualChunkCollection(client, "cloud");

  assert.equal(result, collection);
  assert.equal(options?.embeddingFunction, null);
  assert.deepEqual(options?.configuration, {
    spann: { space: "cosine" }
  });
});

test("rejects an incompatible manual collection distance", () => {
  const collection = {
    name: "commerce_manual_chunks_v1",
    configuration: {
      spann: { space: "l2" }
    }
  } as unknown as Collection;

  assert.throws(
    () => getManualChunkIndexSummary(collection, "cloud"),
    /应为 cosine/
  );
});
