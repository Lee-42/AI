import type { Collection } from "chromadb";
import type { TextEmbeddingProvider } from "../embeddings/contracts.js";
import {
  loadProductDocuments,
  type ProductDocumentMetadata
} from "./product-documents.js";
import { prepareProductIndexBatch } from "./prepare-product-index-batch.js";

export type ProductIndexSummary = {
  indexedRecords: number;
  dimension: number;
  recordsBefore: number;
  recordsAfter: number;
};

export async function indexProductsInChroma(
  collection: Collection,
  embeddings: TextEmbeddingProvider
): Promise<ProductIndexSummary> {
  const documents = await loadProductDocuments();
  const recordsBefore = await collection.count();
  const vectors = await embeddings.embedDocuments(
    documents.map((document) => document.pageContent)
  );
  const batch = prepareProductIndexBatch(documents, vectors);

  // 稳定 ID 配合 upsert，使重复运行只更新原记录。
  await collection.upsert({
    ...batch.records,
    metadatas: batch.records.metadatas.map(
      (metadata): Record<string, string | number | boolean> => ({
        ...metadata
      })
    )
  });

  const recordsAfter = await collection.count();

  if (recordsAfter < batch.records.ids.length) {
    throw new Error(
      `Chroma contains ${recordsAfter} records after indexing; expected at least ${batch.records.ids.length}`
    );
  }

  return {
    indexedRecords: batch.records.ids.length,
    dimension: batch.dimension,
    recordsBefore,
    recordsAfter
  };
}
