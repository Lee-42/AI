import type {
  SearchHit,
  SearchMetadata
} from "../domain/search-result.js";

export function normalizeSearchMetadata(
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

export function cosineDistanceToRelevance(distance: number): number {
  return 1 - distance;
}

export function requireSearchHitFields(
  row: {
    id: string;
    document?: string | null;
    distance?: number | null;
    metadata?: Record<string, unknown> | null;
    uri?: string | null;
  }
): SearchHit {
  if (!row.document) {
    throw new Error(`Search result ${row.id} is missing its document`);
  }

  if (
    typeof row.distance !== "number" ||
    !Number.isFinite(row.distance)
  ) {
    throw new Error(`Search result ${row.id} contains an invalid distance`);
  }

  return {
    id: row.id,
    content: row.document,
    distance: row.distance,
    relevanceScore: cosineDistanceToRelevance(row.distance),
    metadata: normalizeSearchMetadata(row.metadata ?? {}),
    ...(row.uri ? { uri: row.uri } : {})
  };
}
