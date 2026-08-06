import assert from "node:assert/strict";
import test from "node:test";
import type {
  ChromaClient,
  Collection
} from "chromadb";
import {
  getOrCreateProductImageCollection,
  getProductImageIndexSummary,
  productImageIndexConfiguration
} from "../src/vectorstores/product-image-collection.js";

test("uses a cosine image collection without built-in embedding", async () => {
  let options: Record<string, unknown> | undefined;
  const client = {
    async getOrCreateCollection(value: Record<string, unknown>) {
      options = value;
      return {
        name: value.name,
        configuration: {
          hnsw: null,
          spann: { space: "cosine" }
        },
        metadata: value.metadata
      } as Collection;
    }
  } as unknown as ChromaClient;

  const collection = await getOrCreateProductImageCollection(
    client,
    "cloud",
    "multimodal-model-v1"
  );

  assert.equal(collection.name, "commerce_product_images_v1");
  assert.equal(options?.embeddingFunction, null);
  assert.deepEqual(options?.configuration, {
    spann: { space: "cosine" }
  });
  assert.deepEqual(options?.metadata, {
    recordType: "product-image",
    distanceStrategy: "cosine",
    embeddingModel: "multimodal-model-v1",
    contentVersion: 1
  });
});

test("selects the local and cloud image index types", () => {
  assert.deepEqual(productImageIndexConfiguration("local"), {
    hnsw: { space: "cosine" }
  });
  assert.deepEqual(productImageIndexConfiguration("cloud"), {
    spann: { space: "cosine" }
  });
});

test("rejects an image collection created by another model", () => {
  const collection = {
    name: "commerce_product_images_v1",
    configuration: {
      hnsw: null,
      spann: { space: "cosine" }
    },
    metadata: {
      embeddingModel: "old-model"
    }
  } as unknown as Collection;

  assert.throws(
    () =>
      getProductImageIndexSummary(
        collection,
        "cloud",
        "current-model"
      ),
    /多模态模型应为 current-model，实际为 old-model/
  );
});
