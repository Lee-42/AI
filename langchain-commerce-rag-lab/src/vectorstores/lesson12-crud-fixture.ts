import type { ChromaClient, Collection } from "chromadb";
import { COLLECTION_NAMES } from "./collection-names.js";
import type { ChromaConnectionConfig } from "./chroma-client.js";

export const LESSON12_RECORDS = [
  {
    id: "lesson12:product:air",
    embedding: [1, 0],
    document: "轻薄笔记本，适合移动办公",
    metadata: {
      lesson: 12,
      sku: "lesson12-air",
      status: "active",
      price: 6999
    }
  },
  {
    id: "lesson12:product:studio",
    embedding: [0.8, 0.2],
    document: "高性能笔记本，适合视频剪辑",
    metadata: {
      lesson: 12,
      sku: "lesson12-studio",
      status: "active",
      price: 9999
    }
  },
  {
    id: "lesson12:product:temporary",
    embedding: [0, 1],
    document: "用于演示删除的临时记录",
    metadata: {
      lesson: 12,
      sku: "lesson12-temporary",
      status: "temporary",
      price: 1
    }
  }
] as const;

export const LESSON12_TEMPORARY_ID = "lesson12:product:temporary";

export async function getOrCreateLesson12CrudCollection(
  client: ChromaClient,
  mode: ChromaConnectionConfig["mode"]
): Promise<Collection> {
  return client.getOrCreateCollection({
    name: COLLECTION_NAMES.lesson12Crud,
    embeddingFunction: null,
    configuration:
      mode === "cloud"
        ? { spann: { space: "cosine" } }
        : { hnsw: { space: "cosine" } },
    metadata: {
      purpose: "lesson-12-safe-crud-example",
      dimension: 2
    }
  });
}

export async function seedLesson12Records(
  collection: Collection
): Promise<void> {
  await collection.upsert({
    ids: LESSON12_RECORDS.map((record) => record.id),
    embeddings: LESSON12_RECORDS.map((record) => [...record.embedding]),
    documents: LESSON12_RECORDS.map((record) => record.document),
    metadatas: LESSON12_RECORDS.map((record) => ({ ...record.metadata }))
  });
}

export async function restoreLesson12TemporaryRecord(
  collection: Collection
): Promise<void> {
  const record = LESSON12_RECORDS.find(
    (item) => item.id === LESSON12_TEMPORARY_ID
  );

  if (!record) {
    throw new Error("Lesson 12 temporary fixture is missing");
  }

  await collection.upsert({
    ids: [record.id],
    embeddings: [[...record.embedding]],
    documents: [record.document],
    metadatas: [{ ...record.metadata }]
  });
}
