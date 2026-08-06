import assert from "node:assert/strict";
import test from "node:test";
import type { Collection } from "chromadb";
import { deleteByWhereAfterPreview } from "../src/maintenance/delete-records-safely.js";

function fakeCollection(ids: string[]) {
  const records = new Set(ids);
  let deleteCalls = 0;

  const collection = {
    async get(options: {
      ids?: string[];
      where?: Record<string, unknown>;
    }) {
      const selected = options.ids
        ? options.ids.filter((id) => records.has(id))
        : [...records].filter((id) => id.includes("temporary"));

      return { ids: selected };
    },
    async delete() {
      deleteCalls += 1;
      const temporaryIds = [...records].filter((id) => {
        return id.includes("temporary");
      });
      temporaryIds.forEach((id) => records.delete(id));
      return { deleted: temporaryIds.length };
    }
  } as unknown as Collection;

  return {
    collection,
    records,
    getDeleteCalls: () => deleteCalls
  };
}

test("deletes only after the preview exactly matches expected IDs", async () => {
  const fake = fakeCollection([
    "lesson12:product:active",
    "lesson12:product:temporary"
  ]);

  const summary = await deleteByWhereAfterPreview(
    fake.collection,
    { status: "temporary" },
    ["lesson12:product:temporary"]
  );

  assert.deepEqual(summary.previewIds, ["lesson12:product:temporary"]);
  assert.equal(summary.deletedCount, 1);
  assert.equal(fake.records.has("lesson12:product:temporary"), false);
  assert.equal(fake.getDeleteCalls(), 1);
});

test("aborts deletion when the preview contains an unexpected record", async () => {
  const fake = fakeCollection([
    "lesson12:product:temporary",
    "lesson12:product:temporary-old"
  ]);

  await assert.rejects(
    deleteByWhereAfterPreview(
      fake.collection,
      { status: "temporary" },
      ["lesson12:product:temporary"]
    ),
    /preview mismatch/
  );
  assert.equal(fake.getDeleteCalls(), 0);
});

test("rejects an empty delete filter or target list", async () => {
  const fake = fakeCollection([]);

  await assert.rejects(
    deleteByWhereAfterPreview(
      fake.collection,
      {} as never,
      ["lesson12:product:temporary"]
    ),
    /exactly one root expression/
  );
  await assert.rejects(
    deleteByWhereAfterPreview(
      fake.collection,
      { status: "temporary" },
      []
    ),
    /non-empty and unique/
  );
});
