import assert from "node:assert/strict";
import test from "node:test";
import { ProductImageSchema } from "../src/domain/product-image.js";
import { loadProductImageRecords } from "../src/indexing/product-images.js";

test("loads licensed product image fixtures with stable IDs", async () => {
  const records = await loadProductImageRecords();

  assert.equal(records.length, 3);
  assert.deepEqual(
    records.map((record) => record.id),
    [
      "image:laptop-air-14:front",
      "image:laptop-studio-16:front",
      "image:notebook-paper-a5:front"
    ]
  );
  assert.equal(
    records.every(
      (record) =>
        record.uri.startsWith("https://") &&
        record.metadata.sourcePage.startsWith("https://") &&
        record.metadata.license.length > 0
    ),
    true
  );
});

test("rejects image data without an HTTP URL or stable role", () => {
  const invalid = ProductImageSchema.safeParse({
    sku: "laptop-air-14",
    imageRole: "front_view",
    imageUrl: "file:///tmp/laptop.jpg",
    visualDescription: "银色笔记本",
    sourcePage: "https://example.com/source",
    author: "Example",
    license: "CC0"
  });

  assert.equal(invalid.success, false);
});
