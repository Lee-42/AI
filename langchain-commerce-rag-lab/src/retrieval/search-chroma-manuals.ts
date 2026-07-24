import type { Collection, Where } from "chromadb";
import type { SearchHit } from "../domain/search-result.js";
import type { TextEmbeddingProvider } from "../embeddings/contracts.js";
import { requireSearchHitFields } from "./normalize-search-metadata.js";

export type ManualSearchOptions = {
  k?: number;
  sku?: string;
};

export async function searchChromaManuals(
  collection: Collection,
  embeddings: TextEmbeddingProvider,
  query: string,
  options: ManualSearchOptions = {}
): Promise<SearchHit[]> {
  const k = options.k ?? 3;

  if (query.trim().length === 0) {
    throw new Error("Manual search query must not be empty");
  }

  if (!Number.isInteger(k) || k < 1) {
    throw new Error("Manual search result count must be a positive integer");
  }

  const conditions: Where[] = [{ recordType: "manual-chunk" }];

  if (options.sku) {
    conditions.push({ sku: options.sku });
  }

  const queryVector = await embeddings.embedQuery(query);
  const result = await collection.query({
    queryEmbeddings: [queryVector],
    nResults: k,
    where: conditions.length === 1
      ? conditions[0]
      : { $and: conditions },
    include: ["documents", "metadatas", "distances"]
  });

  return (result.rows()[0] ?? []).map(requireSearchHitFields);
}
