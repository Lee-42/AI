import { CloudClient } from "chromadb";

import type { ServerConfig } from "../core/config.js";
import { ChromaKnowledgeVectorCollection } from "./chroma-knowledge-vector-collection.js";
import {
  DeterministicTextEmbeddingProvider,
  type TextEmbeddingProvider,
} from "./text-embedding-provider.js";
import type { KnowledgeVectorCollection, VectorCollectionContract } from "./vector-collection.js";
import { InMemoryKnowledgeVectorCollection } from "./vector-collection.js";
import { VolcengineTextEmbeddingProvider } from "./volcengine-text-embedding-provider.js";

export function createVectorCollectionContract(config: ServerConfig): VectorCollectionContract {
  return {
    name: config.knowledgeIndex.collectionName,
    recordSchemaVersion: 1,
    indexVersion: config.knowledgeIndex.indexVersion,
    pipelineVersion: config.knowledgeIndex.pipelineVersion,
    embeddingModel: config.knowledgeIndex.embedding.model,
    embeddingDimension: config.knowledgeIndex.embedding.dimension,
    distanceSpace: "cosine",
    engine: config.knowledgeIndex.provider === "chroma" ? "spann" : "hnsw",
  };
}

export function createTextEmbeddingProvider(config: ServerConfig): TextEmbeddingProvider {
  const embedding = config.knowledgeIndex.embedding;
  if (embedding.provider === "mock") {
    return new DeterministicTextEmbeddingProvider({
      model: embedding.model,
      dimension: embedding.dimension,
    });
  }
  const apiKey = config.ai.volcengine.apiKey;
  if (!embedding.paidCallsEnabled || !apiKey) {
    throw new Error("Volcengine Embedding requires the paid-call switch and server API Key.");
  }
  return new VolcengineTextEmbeddingProvider({
    baseUrl: config.ai.volcengine.baseUrl,
    model: embedding.model,
    dimension: embedding.dimension,
    apiKey,
    timeoutMs: embedding.requestTimeoutMs,
  });
}

export function createKnowledgeVectorCollection(
  config: ServerConfig,
  contract: VectorCollectionContract,
): KnowledgeVectorCollection {
  if (config.knowledgeIndex.provider === "memory") {
    return new InMemoryKnowledgeVectorCollection();
  }
  const { apiKey, tenant, database } = config.knowledgeIndex.chroma;
  if (!config.knowledgeIndex.writeEnabled || !apiKey || !tenant || !database) {
    throw new Error("Chroma writes require explicit opt-in and complete server credentials.");
  }
  const client = new CloudClient({
    apiKey: apiKey.reveal(),
    tenant,
    database,
  });
  return new ChromaKnowledgeVectorCollection({ client, contract });
}
