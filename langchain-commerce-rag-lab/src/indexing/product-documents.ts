import { Document } from "@langchain/core/documents";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  ProductSchema,
  type Product
} from "../domain/product.js";
import { buildProductRecordId } from "../domain/vector-record-id.js";

export type ProductDocumentMetadata = {
  recordType: "product";
  sku: string;
  category: string;
  brand: string;
  price: number;
  inStock: boolean;
  source: string;
};

function formatSpecifications(
  specifications: Product["specifications"]
): string {
  return Object.entries(specifications)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("; ");
}

// 固定字段顺序可以避免同一商品因序列化顺序变化而产生无意义的新向量。
export function productToPageContent(product: Product): string {
  return [
    `商品名: ${product.name}`,
    `类别: ${product.category}; 品牌: ${product.brand}`,
    `描述: ${product.description}`,
    `适用场景: ${product.useCases.join("、")}`,
    `关键规格: ${formatSpecifications(product.specifications)}`
  ].join("\n");
}

export function productToDocument(
  product: Product
): Document<ProductDocumentMetadata> {
  return new Document({
    id: buildProductRecordId(product.sku),
    pageContent: productToPageContent(product),
    metadata: {
      recordType: "product",
      sku: product.sku,
      category: product.category,
      brand: product.brand,
      price: product.price,
      inStock: product.inStock,
      source: "data/products.json"
    }
  });
}

export async function loadProductDocuments(
  source = new URL("../../data/products.json", import.meta.url)
): Promise<Document<ProductDocumentMetadata>[]> {
  const raw = await readFile(source, "utf8");
  const products = z.array(ProductSchema).parse(JSON.parse(raw));

  return products.map(productToDocument);
}
