import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import type { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { ProductDocumentMetadata } from "../indexing/product-documents.js";

// 内存 Store 只用于课程观察；进程退出后，向量不会持久化。
export async function createProductMemoryStore(
  embeddings: EmbeddingsInterface,
  documents: Document<ProductDocumentMetadata>[]
): Promise<MemoryVectorStore> {
  const store = new MemoryVectorStore(embeddings);
  await store.addDocuments(documents);
  return store;
}
