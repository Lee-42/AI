import type {
  ChromaClient,
  Collection,
  CreateCollectionConfiguration
} from "chromadb";
import type { ChromaConnectionConfig } from "./chroma-client.js";
import { COLLECTION_NAMES } from "./collection-names.js";

export function manualChunkIndexConfiguration(
  mode: ChromaConnectionConfig["mode"]
): CreateCollectionConfiguration {
  return mode === "cloud"
    ? { spann: { space: "cosine" } }
    : { hnsw: { space: "cosine" } };
}

export function getManualChunkIndexSummary(
  collection: Collection,
  mode: ChromaConnectionConfig["mode"]
): { indexType: "hnsw" | "spann"; space: "cosine" } {
  const indexType = mode === "cloud" ? "spann" : "hnsw";
  const space = collection.configuration[indexType]?.space;

  if (space !== "cosine") {
    throw new Error(
      `Collection ${collection.name} 的 ${indexType} 距离策略应为 cosine，实际为 ${space ?? "未配置"}`
    );
  }

  return { indexType, space };
}

export async function getOrCreateManualChunkCollection(
  client: ChromaClient,
  mode: ChromaConnectionConfig["mode"]
): Promise<Collection> {
  const collection = await client.getOrCreateCollection({
    name: COLLECTION_NAMES.manualChunks,
    configuration: manualChunkIndexConfiguration(mode),
    embeddingFunction: null,
    metadata: {
      recordType: "manual-chunk",
      distanceStrategy: "cosine",
      contentVersion: 1,
      chunkSize: 600,
      chunkOverlap: 100
    }
  });

  getManualChunkIndexSummary(collection, mode);
  return collection;
}
