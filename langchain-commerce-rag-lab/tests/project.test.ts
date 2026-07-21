import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { z } from "zod";
import { config } from "../src/config.js";
import { ProductSchema } from "../src/domain/product.js";
import { COLLECTION_NAMES } from "../src/vectorstores/collection-names.js";

test("sample products satisfy the domain schema", async () => {
  const raw = await readFile(
    new URL("../data/products.json", import.meta.url),
    "utf8"
  );
  const products = z.array(ProductSchema).parse(JSON.parse(raw));

  assert.equal(products.length, 3);
  assert.equal(products.some((product) => product.category === "laptop"), true);
  assert.equal(
    products.some((product) => product.category === "stationery"),
    true
  );
});

test("collection names are unique and versioned", () => {
  const names = Object.values(COLLECTION_NAMES);

  assert.equal(new Set(names).size, names.length);
  assert.equal(names.every((name) => name.endsWith("_v1")), true);
});

test("default Chroma URL is valid", () => {
  assert.doesNotThrow(() => new URL(config.chroma.url));
});
