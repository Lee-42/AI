import assert from "node:assert/strict";
import test from "node:test";
import { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { ProductDocumentMetadata } from "../src/indexing/product-documents.js";
import { searchMemoryProducts } from "../src/retrieval/search-memory-products.js";
import { createProductMemoryStore } from "../src/vectorstores/product-memory-store.js";

function vectorFor(text: string): number[] {
  if (text.includes("出差") || text.includes("Aurora Air")) {
    return [1, 0, 0];
  }

  if (text.includes("Aurora Studio")) {
    return [0, 1, 0];
  }

  return [0, 0, 1];
}

const fakeEmbeddings: EmbeddingsInterface = {
  async embedDocuments(texts) {
    return texts.map(vectorFor);
  },
  async embedQuery(text) {
    return vectorFor(text);
  }
};

function productDocument(
  id: string,
  name: string,
  sku: string
): Document<ProductDocumentMetadata> {
  return new Document({
    id,
    pageContent: `商品名: ${name}`,
    metadata: {
      recordType: "product",
      sku,
      category: "test",
      brand: "test",
      price: 1,
      inStock: true,
      source: "test"
    }
  });
}

test("returns the most similar product with normalized score fields", async () => {
  const documents = [
    productDocument(
      "product:laptop-air-14:profile",
      "Aurora Air 14",
      "laptop-air-14"
    ),
    productDocument(
      "product:laptop-studio-16:profile",
      "Aurora Studio 16",
      "laptop-studio-16"
    ),
    productDocument(
      "product:notebook-paper-a5:profile",
      "A5 方格笔记本",
      "notebook-paper-a5"
    )
  ];
  const store = await createProductMemoryStore(
    fakeEmbeddings,
    documents
  );

  const hits = await searchMemoryProducts(
    store,
    "方便出差携带的电脑",
    3
  );

  assert.equal(hits.length, 3);
  assert.equal(hits[0]?.id, "product:laptop-air-14:profile");
  assert.equal(hits[0]?.relevanceScore, 1);
  assert.equal(hits[0]?.distance, 0);
  assert.equal(hits[0]?.metadata.sku, "laptop-air-14");
});

test("rejects an empty search query before embedding it", async () => {
  const store = await createProductMemoryStore(fakeEmbeddings, []);

  await assert.rejects(
    searchMemoryProducts(store, "  "),
    /query must not be empty/
  );
});
