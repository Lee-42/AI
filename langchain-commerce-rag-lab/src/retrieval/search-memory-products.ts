import type { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import type {
  SearchHit,
  SearchMetadata
} from "../domain/search-result.js";

function normalizeMetadata(
  metadata: Record<string, unknown>
): SearchMetadata {
  const normalized: SearchMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error(`Search metadata "${key}" must be a scalar value`);
    }

    normalized[key] = value;
  }

  return normalized;
}

export async function searchMemoryProducts(
  store: MemoryVectorStore,
  query: string,
  k = 3
): Promise<SearchHit[]> {
  if (query.trim().length === 0) {
    throw new Error("Search query must not be empty");
  }

  if (!Number.isInteger(k) || k < 1) {
    throw new Error("Search result count must be a positive integer");
  }

  const results = await store.similaritySearchWithScore(query, k);

  return results.map(([document, similarity]) => {
    if (!document.id) {
      throw new Error("Search result is missing a stable document ID");
    }

    if (!Number.isFinite(similarity)) {
      throw new Error("Search result contains an invalid similarity score");
    }

    // MemoryVectorStore 返回 cosine similarity；转换后可与后续 distance 结构对齐。
    return {
      id: document.id,
      content: document.pageContent,
      distance: 1 - similarity,
      relevanceScore: similarity,
      metadata: normalizeMetadata(document.metadata)
    };
  });
}
