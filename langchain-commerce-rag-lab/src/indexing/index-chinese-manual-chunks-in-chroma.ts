import type { Collection } from "chromadb";
import type { TextEmbeddingProvider } from "../embeddings/contracts.js";
import type { ChineseManualChunkSets } from "./chinese-manual-chunks.js";

export type ChineseManualIndexSummary = {
  indexedRecords: number;
  defaultChunks: number;
  chineseChunks: number;
  staleRecordsRemoved: number;
  dimension: number;
  recordsBefore: number;
  recordsAfter: number;
};

function validateDocumentVectors(
  expectedCount: number,
  vectors: number[][]
): number {
  if (expectedCount === 0 || vectors.length !== expectedCount) {
    throw new Error(
      "Chinese manual document and embedding counts must match"
    );
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
    throw new Error("Chinese manual embeddings must be finite and aligned");
  }

  return dimension;
}

export async function indexChineseManualChunksInChroma(
  collection: Collection,
  embeddings: TextEmbeddingProvider,
  chunkSets: ChineseManualChunkSets
): Promise<ChineseManualIndexSummary> {
  const recordsBefore = await collection.count();
  const vectors = await embeddings.embedDocuments(
    chunkSets.documents.map((document) => document.pageContent)
  );
  const dimension = validateDocumentVectors(
    chunkSets.documents.length,
    vectors
  );
  const ids = chunkSets.documents.map((document, index) => {
    if (!document.id) {
      throw new Error(
        `Chinese manual document at index ${index} is missing an ID`
      );
    }

    return document.id;
  });
  const expectedIds = new Set(ids);

  if (expectedIds.size !== ids.length) {
    throw new Error("Chinese manual chunk IDs must be unique");
  }

  const existing = await collection.get({
    where: {
      recordType: "lesson15-manual-chunk"
    },
    limit: 10_000,
    include: ["metadatas"]
  });

  await collection.upsert({
    ids,
    embeddings: vectors,
    documents: chunkSets.documents.map(
      (document) => document.pageContent
    ),
    metadatas: chunkSets.documents.map(
      (document): Record<string, string | number | boolean> => ({
        ...document.metadata
      })
    )
  });

  const staleIds = existing.ids.filter((id) => !expectedIds.has(id));

  if (staleIds.length > 0) {
    await collection.delete({
      ids: staleIds
    });
  }

  const verified = await collection.get({
    where: {
      recordType: "lesson15-manual-chunk"
    },
    limit: 10_000,
    include: ["metadatas"]
  });
  const actualIds = new Set(verified.ids);

  if (
    actualIds.size !== expectedIds.size ||
    ids.some((id) => !actualIds.has(id))
  ) {
    throw new Error(
      "Chroma lesson 15 IDs do not exactly match the current chunk set"
    );
  }

  const recordsAfter = await collection.count();

  return {
    indexedRecords: chunkSets.documents.length,
    defaultChunks: chunkSets.byStrategy.default.length,
    chineseChunks:
      chunkSets.byStrategy["chinese-punctuation"].length,
    staleRecordsRemoved: staleIds.length,
    dimension,
    recordsBefore,
    recordsAfter
  };
}
