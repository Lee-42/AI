import type { Collection, Where } from "chromadb";

export type SafeDeleteSummary = {
  previewIds: string[];
  deletedCount?: number;
};

function sortedUniqueIds(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

export async function deleteByWhereAfterPreview(
  collection: Collection,
  where: Where,
  expectedIds: string[]
): Promise<SafeDeleteSummary> {
  if (Object.keys(where).length !== 1) {
    throw new Error("Delete filter must contain exactly one root expression");
  }

  const expected = sortedUniqueIds(expectedIds);

  if (expected.length === 0 || expected.length !== expectedIds.length) {
    throw new Error("Expected delete IDs must be non-empty and unique");
  }

  // 删除前先读取，并要求实际命中集合与预期完全一致。
  const preview = await collection.get({
    where,
    include: ["documents", "metadatas"]
  });
  const previewIds = sortedUniqueIds(preview.ids);

  if (JSON.stringify(previewIds) !== JSON.stringify(expected)) {
    throw new Error(
      `Delete preview mismatch: expected ${expected.join(", ")}, ` +
        `received ${previewIds.join(", ") || "none"}`
    );
  }

  const result = await collection.delete({ where });
  const remaining = await collection.get({ ids: expected });

  if (remaining.ids.length > 0) {
    throw new Error(
      `Delete verification failed for ${remaining.ids.join(", ")}`
    );
  }

  return {
    previewIds,
    ...(typeof result.deleted === "number"
      ? { deletedCount: result.deleted }
      : {})
  };
}
