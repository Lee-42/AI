import type {
  ProductImageMetadata,
  ProductImageRecord
} from "../domain/product-image.js";

export type ProductImageIndexBatch = {
  ids: string[];
  embeddings: number[][];
  documents: string[];
  metadatas: ProductImageMetadata[];
  uris: string[];
};

export function prepareProductImageIndexBatch(
  records: ProductImageRecord[],
  embeddings: number[][],
  embeddingModel: string
): {
  records: ProductImageIndexBatch;
  dimension: number;
} {
  if (records.length === 0) {
    throw new Error("Product image index batch must not be empty");
  }

  if (records.length !== embeddings.length) {
    throw new Error(
      `Image count ${records.length} does not match embedding count ${embeddings.length}`
    );
  }

  const ids = records.map((record) => record.id);

  if (new Set(ids).size !== ids.length) {
    throw new Error("Product image index batch contains duplicate IDs");
  }

  const dimension = embeddings[0]?.length ?? 0;

  if (dimension === 0) {
    throw new Error("Image embedding vectors must not be empty");
  }

  embeddings.forEach((vector, index) => {
    if (
      vector.length !== dimension ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Image embedding at index ${index} must contain ${dimension} finite values`
      );
    }
  });

  return {
    records: {
      ids,
      embeddings,
      documents: records.map((record) => record.document),
      metadatas: records.map((record) => ({
        ...record.metadata,
        embeddingModel,
        vectorDimension: dimension
      })),
      uris: records.map((record) => record.uri)
    },
    dimension
  };
}
