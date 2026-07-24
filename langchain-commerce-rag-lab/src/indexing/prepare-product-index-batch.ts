import type { ProductDocumentMetadata } from "./product-documents.js";
import type { Document } from "@langchain/core/documents";

export type ProductIndexBatch = {
  ids: string[];
  embeddings: number[][];
  documents: string[];
  metadatas: ProductDocumentMetadata[];
};

export type PreparedProductIndexBatch = {
  records: ProductIndexBatch;
  dimension: number;
};

export function prepareProductIndexBatch(
  documents: Document<ProductDocumentMetadata>[],
  embeddings: number[][]
): PreparedProductIndexBatch {
  if (documents.length === 0) {
    throw new Error("Product index batch must contain at least one document");
  }

  if (documents.length !== embeddings.length) {
    throw new Error(
      `Document count ${documents.length} does not match embedding count ${embeddings.length}`
    );
  }

  const ids = documents.map((document, index) => {
    if (!document.id) {
      throw new Error(`Product document at index ${index} is missing an ID`);
    }

    return document.id;
  });

  if (new Set(ids).size !== ids.length) {
    throw new Error("Product index batch contains duplicate IDs");
  }

  const dimension = embeddings[0]?.length ?? 0;

  if (dimension === 0) {
    throw new Error("Embedding vectors must not be empty");
  }

  embeddings.forEach((vector, index) => {
    if (vector.length !== dimension) {
      throw new Error(
        `Embedding at index ${index} has dimension ${vector.length}; expected ${dimension}`
      );
    }

    if (vector.some((value) => !Number.isFinite(value))) {
      throw new Error(
        `Embedding at index ${index} contains a non-finite value`
      );
    }
  });

  // 这里只组装待写入数据；真正 upsert 留到下一课。
  return {
    records: {
      ids,
      embeddings,
      documents: documents.map((document) => document.pageContent),
      metadatas: documents.map((document) => document.metadata)
    },
    dimension
  };
}
