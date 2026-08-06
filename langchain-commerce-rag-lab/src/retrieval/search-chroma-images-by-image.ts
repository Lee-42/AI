import type { Collection } from "chromadb";
import type { SearchHit } from "../domain/search-result.js";
import type { MultimodalEmbeddingProvider } from "../embeddings/contracts.js";
import { requireSearchHitFields } from "./normalize-search-metadata.js";

function requireHttpImageUrl(value: string): string {
  const normalized = value.trim();
  let url: URL;

  if (normalized.length === 0) {
    throw new Error("Image search URL must not be empty");
  }

  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Image search URL must be a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Image search URL must use http or https");
  }

  return url.toString();
}

export async function searchChromaImagesByImage(
  collection: Collection,
  embeddings: MultimodalEmbeddingProvider,
  imageUrl: string,
  k = 3
): Promise<SearchHit[]> {
  if (!Number.isInteger(k) || k < 1) {
    throw new Error("Image search result count must be a positive integer");
  }

  const normalizedUrl = requireHttpImageUrl(imageUrl);
  const queryVector = await embeddings.embedImage(normalizedUrl);

  if (
    queryVector.length === 0 ||
    queryVector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error("Image search query embedding must contain finite values");
  }

  // 查询图和入库图片使用同一个模型，向量才位于同一语义空间。
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
