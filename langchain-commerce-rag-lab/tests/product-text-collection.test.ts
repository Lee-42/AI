import assert from "node:assert/strict";
import test from "node:test";
import type {
  ChromaClient,
  Collection
} from "chromadb";
import {
  getOrCreateProductTextCollection,
  getProductTextIndexSummary,
  productTextIndexConfiguration
} from "../src/vectorstores/product-text-collection.js";

test("selects cosine index configuration for local and cloud modes", () => {
  assert.deepEqual(productTextIndexConfiguration("local"), {
    hnsw: { space: "cosine" }
  });
  assert.deepEqual(productTextIndexConfiguration("cloud"), {
    spann: { space: "cosine" }
  });
});

test("gets or creates the product collection without a built-in embedding", async () => {
  let options: Record<string, unknown> | undefined;
  const client = {
    async getOrCreateCollection(value: Record<string, unknown>) {
      options = value;
      return {
        name: value.name,
        configuration: {
          hnsw: null,
          spann: { space: "cosine" }
        }
      } as Collection;
    }
  } as unknown as ChromaClient;

  const collection = await getOrCreateProductTextCollection(
    client,
    "cloud"
  );

  assert.equal(collection.name, "commerce_products_text_v1");
  assert.equal(options?.embeddingFunction, null);
  assert.deepEqual(options?.configuration, {
    spann: { space: "cosine" }
  });
  assert.deepEqual(options?.metadata, {
    recordType: "product",
    distanceStrategy: "cosine",
    contentVersion: 1
  });
});

test("rejects a collection with an incompatible distance strategy", () => {
  const collection = {
    name: "commerce_products_text_v1",
    configuration: {
      hnsw: null,
      spann: { space: "l2" }
    }
  } as Collection;

  assert.throws(
    () => getProductTextIndexSummary(collection, "cloud"),
    /距离策略应为 cosine，实际为 l2/
  );
});
