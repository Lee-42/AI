import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { z } from "zod";
import { ProductSchema } from "../src/domain/product.js";
import {
  loadProductDocuments,
  productToDocument,
  productToPageContent
} from "../src/indexing/product-documents.js";

test("builds deterministic product content and stable IDs", async () => {
  const raw = await readFile(
    new URL("../data/products.json", import.meta.url),
    "utf8"
  );
  const [product] = z.array(ProductSchema).parse(JSON.parse(raw));

  assert.ok(product);

  const content = productToPageContent(product);
  const document = productToDocument(product);

  assert.equal(document.id, "product:laptop-air-14:profile");
  assert.equal(content, document.pageContent);
  assert.ok(content.indexOf("商品名:") < content.indexOf("类别:"));
  assert.ok(content.indexOf("类别:") < content.indexOf("描述:"));
  assert.ok(content.indexOf("描述:") < content.indexOf("适用场景:"));
  assert.ok(content.indexOf("适用场景:") < content.indexOf("关键规格:"));
  assert.equal(document.metadata.sku, "laptop-air-14");
  assert.equal(document.metadata.source, "data/products.json");
});

test("loads every sample product as a LangChain Document", async () => {
  const documents = await loadProductDocuments();

  assert.equal(documents.length, 3);
  assert.equal(new Set(documents.map((document) => document.id)).size, 3);
  assert.equal(
    documents.every((document) => document.metadata.recordType === "product"),
    true
  );
});
