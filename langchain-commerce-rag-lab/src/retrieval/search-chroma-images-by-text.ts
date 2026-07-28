import type { Collection } from "chromadb";
import type { SearchHit } from "../domain/search-result.js";
import type { MultimodalEmbeddingProvider } from "../embeddings/contracts.js";
import { requireSearchHitFields } from "./normalize-search-metadata.js";

export async function searchChromaImagesByText(
  collection: Collection,
  embeddings: MultimodalEmbeddingProvider,
  query: string,
  k = 3
): Promise<SearchHit[]> {
  if (query.trim().length === 0) {
    throw new Error("Image search query must not be empty");
  }

  if (!Number.isInteger(k) || k < 1) {
    throw new Error("Image search result count must be a positive integer");
  }

  const queryVector = await embeddings.embedText(query);

  if (
    queryVector.length === 0 ||
    queryVector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error("Image search query embedding must contain finite values");
  }

  const result = await collection.query({
    queryEmbeddings: [queryVector],
    nResults: k,
    include: ["documents", "metadatas", "distances", "uris"]
  });

  return (result.rows()[0] ?? []).map((row) => {
    const hit = requireSearchHitFields(row);

    if (!hit.uri) {
      throw new Error(`Image search result ${hit.id} is missing its URI`);
    }

    return hit;
  });
}
