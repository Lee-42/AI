import type { Collection } from "chromadb";
import type { TextEmbeddingProvider } from "../embeddings/contracts.js";
import { loadManualChunkDocuments } from "./manual-chunks.js";

export type ManualChunkIndexSummary = {
  sourceCount: number;
  indexedChunks: number;
  dimension: number;
  recordsBefore: number;
  recordsAfter: number;
  chunkIds: string[];
  chunkLengths: number[];
};

function requireVectorDimension(
  vectors: number[][],
  expectedCount: number
): number {
  if (vectors.length !== expectedCount || vectors.length === 0) {
    throw new Error("Manual chunk and embedding counts must match");
  }

  const dimension = vectors[0]?.length ?? 0;

  if (
    dimension === 0 ||
    vectors.some(
      (vector) =>
        vector.length !== dimension ||
        vector.some((value) => !Number.isFinite(value))
    )
  ) {
    throw new Error("Manual chunk embeddings must be finite and aligned");
  }

  return dimension;
}

export async function indexManualChunksInChroma(
  collection: Collection,
  embeddings: TextEmbeddingProvider,
  embeddingModel: string
): Promise<ManualChunkIndexSummary> {
  const documents = await loadManualChunkDocuments(embeddingModel);
  const recordsBefore = await collection.count();
  const vectors = await embeddings.embedDocuments(
    documents.map((document) => document.pageContent)
  );
  const dimension = requireVectorDimension(vectors, documents.length);

  // 稳定 chunk ID 配合 upsert，重复运行只更新原记录。
  await collection.upsert({
    ids: documents.map((document) => document.id as string),
    embeddings: vectors,
    documents: documents.map((document) => document.pageContent),
    metadatas: documents.map((document) => ({ ...document.metadata }))
  });

  const recordsAfter = await collection.count();

  if (recordsAfter < documents.length) {
    throw new Error(
      `Chroma contains ${recordsAfter} manual chunks; ` +
        `expected at least ${documents.length}`
    );
  }

  return {
    sourceCount: new Set(
      documents.map((document) => document.metadata.source)
    ).size,
    indexedChunks: documents.length,
    dimension,
    recordsBefore,
    recordsAfter,
    chunkIds: documents.map((document) => document.id as string),
    chunkLengths: documents.map((document) => document.pageContent.length)
  };
}
