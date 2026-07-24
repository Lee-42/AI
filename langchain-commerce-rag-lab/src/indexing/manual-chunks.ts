import { Document } from "@langchain/core/documents";
import { readFile } from "node:fs/promises";
import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { z } from "zod";
import { ProductSchema } from "../domain/product.js";

export const MANUAL_CHUNK_SIZE = 600;
export const MANUAL_CHUNK_OVERLAP = 100;
export const MANUAL_CONTENT_VERSION = 1;

export type ManualSource = {
  sku: string;
  source: string;
  content: string;
};

export type ManualChunkMetadata = {
  recordType: "manual-chunk";
  sku: string;
  source: string;
  chunkIndex: number;
  startIndex: number;
  embeddingModel: string;
  contentVersion: number;
};

function manualChunkId(sku: string, chunkIndex: number): string {
  return `manual:${sku}:chunk:${String(chunkIndex).padStart(4, "0")}`;
}

export async function loadManualSources(): Promise<ManualSource[]> {
  const projectRoot = new URL("../../", import.meta.url);
  const productsRaw = await readFile(
    new URL("data/products.json", projectRoot),
    "utf8"
  );
  const products = z.array(ProductSchema).parse(JSON.parse(productsRaw));

  return Promise.all(
    products
      .filter(
        (product): product is typeof product & { manualPath: string } => {
          return product.manualPath !== null;
        }
      )
      .map(async (product) => ({
        sku: product.sku,
        source: product.manualPath,
        content: await readFile(
          new URL(product.manualPath, projectRoot),
          "utf8"
        )
      }))
  );
}

export async function splitManualSource(
  source: ManualSource,
  embeddingModel: string
): Promise<Document<ManualChunkMetadata>[]> {
  if (embeddingModel.trim().length === 0) {
    throw new Error("Manual chunk embedding model must not be empty");
  }

  const splitter = new MarkdownTextSplitter({
    chunkSize: MANUAL_CHUNK_SIZE,
    chunkOverlap: MANUAL_CHUNK_OVERLAP,
    keepSeparator: true
  });
  const chunks = await splitter.splitText(source.content);
  let searchFrom = 0;

  return chunks.map((pageContent, index) => {
    const startIndex = source.content.indexOf(pageContent, searchFrom);

    if (startIndex === -1) {
      throw new Error(
        `Unable to locate chunk ${index + 1} in ${source.source}`
      );
    }

    // 从上一个起点之后搜索，兼容相邻 chunk 的重叠内容。
    searchFrom = startIndex + 1;
    const chunkIndex = index + 1;

    return new Document({
      id: manualChunkId(source.sku, chunkIndex),
      pageContent,
      metadata: {
        recordType: "manual-chunk",
        sku: source.sku,
        source: source.source,
        chunkIndex,
        startIndex,
        embeddingModel,
        contentVersion: MANUAL_CONTENT_VERSION
      }
    });
  });
}

export async function loadManualChunkDocuments(
  embeddingModel: string
): Promise<Document<ManualChunkMetadata>[]> {
  const sources = await loadManualSources();
  const chunksBySource = await Promise.all(
    sources.map((source) => splitManualSource(source, embeddingModel))
  );

  return chunksBySource.flat();
}
