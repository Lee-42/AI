import type {
  ChromaClient,
  Collection,
  CreateCollectionConfiguration
} from "chromadb";
import type { ChromaConnectionConfig } from "./chroma-client.js";
import { COLLECTION_NAMES } from "./collection-names.js";

export function productImageIndexConfiguration(
  mode: ChromaConnectionConfig["mode"]
): CreateCollectionConfiguration {
  return mode === "cloud"
    ? { spann: { space: "cosine" } }
    : { hnsw: { space: "cosine" } };
}

export function getProductImageIndexSummary(
  collection: Collection,
  mode: ChromaConnectionConfig["mode"],
  embeddingModel: string
): {
  indexType: "hnsw" | "spann";
  space: "cosine";
  embeddingModel: string;
} {
  const indexType = mode === "cloud" ? "spann" : "hnsw";
  const space = collection.configuration[indexType]?.space;
  const storedModel = collection.metadata?.embeddingModel;

  if (space !== "cosine") {
    throw new Error(
      `Collection ${collection.name} 的 ${indexType} 距离策略应为 cosine，实际为 ${space ?? "未配置"}`
    );
  }

  if (storedModel !== embeddingModel) {
    throw new Error(
      `Collection ${collection.name} 的多模态模型应为 ${embeddingModel}，实际为 ${String(storedModel ?? "未配置")}`
    );
  }

  return { indexType, space, embeddingModel };
}

export async function getOrCreateProductImageCollection(
  client: ChromaClient,
  mode: ChromaConnectionConfig["mode"],
  embeddingModel: string
): Promise<Collection> {
  const collection = await client.getOrCreateCollection({
    name: COLLECTION_NAMES.productImages,
    configuration: productImageIndexConfiguration(mode),
    embeddingFunction: null,
    metadata: {
      recordType: "product-image",
      distanceStrategy: "cosine",
      embeddingModel,
      contentVersion: 1
    }
  });

  getProductImageIndexSummary(collection, mode, embeddingModel);
  return collection;
}
