import assert from "node:assert/strict";
import { Document } from "@langchain/core/documents";
import test from "node:test";
import type { ProductDocumentMetadata } from "../src/indexing/product-documents.js";
import { prepareProductIndexBatch } from "../src/indexing/prepare-product-index-batch.js";

function productDocument(
  id: string | undefined,
  sku: string
): Document<ProductDocumentMetadata> {
  return new Document({
    id,
    pageContent: `商品名: ${sku}`,
    metadata: {
      recordType: "product",
      sku,
      category: "laptop",
      brand: "Northstar",
      price: 6999,
      inStock: true,
      source: "data/products.json"
    }
  });
}

test("prepares aligned Chroma records without writing them", () => {
  const documents = [
    productDocument("product:a:profile", "a"),
    productDocument("product:b:profile", "b")
  ];

  const batch = prepareProductIndexBatch(documents, [
    [0.1, 0.2, 0.3],
    [0.4, 0.5, 0.6]
  ]);

  assert.equal(batch.dimension, 3);
  assert.deepEqual(batch.records.ids, [
    "product:a:profile",
    "product:b:profile"
  ]);
  assert.deepEqual(batch.records.documents, [
    "商品名: a",
    "商品名: b"
  ]);
  assert.deepEqual(batch.records.metadatas, documents.map((item) => item.metadata));
});

test("rejects a document and embedding count mismatch", () => {
  assert.throws(
    () =>
      prepareProductIndexBatch(
        [productDocument("product:a:profile", "a")],
        []
      ),
    /does not match embedding count/
  );
});

test("rejects inconsistent or invalid vectors", () => {
  const documents = [
    productDocument("product:a:profile", "a"),
    productDocument("product:b:profile", "b")
  ];

  assert.throws(
    () =>
      prepareProductIndexBatch(documents, [
        [0.1, 0.2],
        [0.3]
      ]),
    /dimension 1; expected 2/
  );
  assert.throws(
    () =>
      prepareProductIndexBatch(documents, [
        [0.1, 0.2],
        [0.3, Number.NaN]
      ]),
    /non-finite value/
  );
});

test("requires stable unique document IDs", () => {
  assert.throws(
    () =>
      prepareProductIndexBatch(
        [productDocument(undefined, "a")],
        [[0.1]]
      ),
    /missing an ID/
  );
  assert.throws(
    () =>
      prepareProductIndexBatch(
        [
          productDocument("product:a:profile", "a"),
          productDocument("product:a:profile", "a-copy")
        ],
        [[0.1], [0.2]]
      ),
    /duplicate IDs/
  );
});
