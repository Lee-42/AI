import type {
  Collection,
  Where,
  WhereDocument
} from "chromadb";
import type { SearchMetadata } from "../domain/search-result.js";
import { normalizeSearchMetadata } from "./normalize-search-metadata.js";

export type ChromaProductRecord = {
  id: string;
  content: string;
  metadata: SearchMetadata;
};

export type ChromaProductGetOptions = {
  ids?: string[];
  where?: Where;
  whereDocument?: WhereDocument;
  limit?: number;
  offset?: number;
};

export async function getChromaProducts(
  collection: Collection,
  options: ChromaProductGetOptions
): Promise<ChromaProductRecord[]> {
  const result = await collection.get({
    ...options,
    include: ["documents", "metadatas"]
  });

  return result.rows().map((row) => {
    if (!row.document) {
      throw new Error(`Chroma record ${row.id} is missing its document`);
    }

    return {
      id: row.id,
      content: row.document,
      metadata: normalizeSearchMetadata(row.metadata ?? {})
    };
  });
}
