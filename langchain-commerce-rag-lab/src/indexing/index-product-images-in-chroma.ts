import type { Collection } from "chromadb";
import type { MultimodalEmbeddingProvider } from "../embeddings/contracts.js";
import { loadProductImageRecords } from "./product-images.js";
import { prepareProductImageIndexBatch } from "./prepare-product-image-index-batch.js";

export type ProductImageIndexSummary = {
  indexedRecords: number;
  dimension: number;
  recordsBefore: number;
  recordsAfter: number;
};

export async function indexProductImagesInChroma(
  collection: Collection,
  embeddings: MultimodalEmbeddingProvider,
  embeddingModel: string
): Promise<ProductImageIndexSummary> {
  const records = await loadProductImageRecords();
  const recordsBefore = await collection.count();
  const vectors = await Promise.all(
    records.map((record) => embeddings.embedImage(record.uri))
  );
  const batch = prepareProductImageIndexBatch(
    records,
    vectors,
    embeddingModel
  );

  // Chroma 保存向量、描述和 URI，不复制图片二进制。
  await collection.upsert(batch.records);

  const recordsAfter = await collection.count();

  if (recordsAfter < batch.records.ids.length) {
    throw new Error(
      `Chroma contains ${recordsAfter} image records; expected at least ${batch.records.ids.length}`
    );
  }

  return {
    indexedRecords: batch.records.ids.length,
    dimension: batch.dimension,
    recordsBefore,
    recordsAfter
  };
}
