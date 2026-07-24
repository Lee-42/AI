import type { Collection } from "chromadb";
import type { SearchHit } from "../domain/search-result.js";
import type { TextEmbeddingProvider } from "../embeddings/contracts.js";
import { requireSearchHitFields } from "./normalize-search-metadata.js";

export async function searchChromaProducts(
  collection: Collection,
  embeddings: TextEmbeddingProvider,
  query: string,
  k = 3
): Promise<SearchHit[]> {
  if (query.trim().length === 0) {
    throw new Error("Search query must not be empty");
  }

  if (!Number.isInteger(k) || k < 1) {
    throw new Error("Search result count must be a positive integer");
  }

  const queryVector = await embeddings.embedQuery(query);

  if (
    queryVector.length === 0 ||
    queryVector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error("Query embedding must contain finite values");
  }

  const result = await collection.query({
    queryEmbeddings: [queryVector],
    nResults: k,
    include: ["documents", "metadatas", "distances"]
  });

  return (result.rows()[0] ?? []).map(requireSearchHitFields);
}
