import type {
  ChromaClient,
  Collection
} from "chromadb";
import type { ChromaConnectionConfig } from "./chroma-client.js";
import { COLLECTION_NAMES } from "./collection-names.js";
import {
  LESSON_15_CHUNK_OVERLAP,
  LESSON_15_CHUNK_SIZE,
  LESSON_15_CONTENT_VERSION
} from "../indexing/chinese-manual-chunks.js";
import {
  getManualChunkIndexSummary,
  manualChunkIndexConfiguration
} from "./manual-chunk-collection.js";

export async function getOrCreateLesson15Collection(
  client: ChromaClient,
  mode: ChromaConnectionConfig["mode"]
): Promise<Collection> {
  const collection = await client.getOrCreateCollection({
    name: COLLECTION_NAMES.lesson15ChineseRetrieval,
    configuration: manualChunkIndexConfiguration(mode),
    embeddingFunction: null,
    metadata: {
      recordType: "lesson15-manual-chunk",
      distanceStrategy: "cosine",
      contentVersion: LESSON_15_CONTENT_VERSION,
      chunkSize: LESSON_15_CHUNK_SIZE,
      chunkOverlap: LESSON_15_CHUNK_OVERLAP
    }
  });

  getManualChunkIndexSummary(collection, mode);
  return collection;
}
