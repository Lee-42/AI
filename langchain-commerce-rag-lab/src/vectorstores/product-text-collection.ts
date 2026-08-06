import type {
  ChromaClient,
  Collection,
  CreateCollectionConfiguration
} from "chromadb";
import type { ChromaConnectionConfig } from "./chroma-client.js";
import { COLLECTION_NAMES } from "./collection-names.js";

export function productTextIndexConfiguration(
  mode: ChromaConnectionConfig["mode"]
): CreateCollectionConfiguration {
  // Cloud 使用 SPANN，本地单节点使用 HNSW；两者都固定为 cosine。
  return mode === "cloud"
    ? { spann: { space: "cosine" } }
    : { hnsw: { space: "cosine" } };
}

export function getProductTextIndexSummary(
  collection: Collection,
  mode: ChromaConnectionConfig["mode"]
): { indexType: "hnsw" | "spann"; space: "cosine" } {
  const indexType = mode === "cloud" ? "spann" : "hnsw";
  const space = collection.configuration[indexType]?.space;

  // 防止复用到同名但距离策略不同的旧 Collection。
  if (space !== "cosine") {
    throw new Error(
      `Collection ${collection.name} 的 ${indexType} 距离策略应为 cosine，实际为 ${space ?? "未配置"}`
    );
  }

  return { indexType, space };
}

export async function getOrCreateProductTextCollection(
  client: ChromaClient,
  mode: ChromaConnectionConfig["mode"]
): Promise<Collection> {
  const collection = await client.getOrCreateCollection({
    name: COLLECTION_NAMES.productText,
    configuration: productTextIndexConfiguration(mode),
    // 向量由豆包生成，Chroma 不应再调用自己的默认 Embedding。
    embeddingFunction: null,
    metadata: {
      recordType: "product",
      distanceStrategy: "cosine",
      contentVersion: 1
    }
  });

  getProductTextIndexSummary(collection, mode);
  return collection;
}
