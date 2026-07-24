import type { Collection } from "chromadb";
import type { SearchHit } from "../domain/search-result.js";
import type { TextEmbeddingProvider } from "../embeddings/contracts.js";
import { requireSearchHitFields } from "../retrieval/normalize-search-metadata.js";

export type DiagnosticQuery = {
  id: string;
  text: string;
};

export type QueryDiagnostic = DiagnosticQuery & {
  queryVector: number[];
  hits: SearchHit[];
  topGap?: number;
};

export async function diagnoseProductQueries(
  collection: Collection,
  embeddings: TextEmbeddingProvider,
  queries: DiagnosticQuery[],
  k = 3
): Promise<QueryDiagnostic[]> {
  if (queries.length === 0) {
    throw new Error("Diagnostic queries must not be empty");
  }

  if (new Set(queries.map((query) => query.id)).size !== queries.length) {
    throw new Error("Diagnostic query IDs must be unique");
  }

  if (
    queries.some(
      (query) => query.id.trim().length === 0 || query.text.trim().length === 0
    )
  ) {
    throw new Error("Diagnostic query ID and text must not be empty");
  }

  if (!Number.isInteger(k) || k < 1) {
    throw new Error("Diagnostic result count must be a positive integer");
  }

  const vectors = await embeddings.embedDocuments(
    queries.map((query) => query.text)
  );

  if (vectors.length !== queries.length) {
    throw new Error(
      `Diagnostic embedding count ${vectors.length} does not match query count ${queries.length}`
    );
  }

  const dimension = vectors[0]?.length ?? 0;

  if (
    dimension === 0 ||
    vectors.some(
      (vector) =>
        vector.length !== dimension ||
        vector.some((value) => !Number.isFinite(value))
    )
  ) {
    throw new Error("Diagnostic query vectors are invalid");
  }

  const result = await collection.query({
    queryEmbeddings: vectors,
    nResults: k,
    include: ["documents", "metadatas", "distances"]
  });
  const rowGroups = result.rows();

  if (rowGroups.length !== queries.length) {
    throw new Error(
      `Chroma returned ${rowGroups.length} query groups; expected ${queries.length}`
    );
  }

  return queries.map((query, index) => {
    const queryVector = vectors[index] as number[];
    const hits = (rowGroups[index] ?? []).map(requireSearchHitFields);
    const first = hits[0];
    const second = hits[1];

    return {
      ...query,
      queryVector,
      hits,
      ...(first && second
        ? { topGap: second.distance - first.distance }
        : {})
    };
  });
}
