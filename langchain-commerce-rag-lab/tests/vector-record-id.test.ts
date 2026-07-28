import assert from "node:assert/strict";
import test from "node:test";
import {
  auditVectorRecordIds,
  buildImageRecordId,
  buildManualChunkRecordId,
  buildProductRecordId,
  parseVectorRecordId
} from "../src/domain/vector-record-id.js";

test("builds three types of IDs from stable domain fields", () => {
  assert.equal(
    buildProductRecordId("laptop-air-14"),
    "product:laptop-air-14:profile"
  );
  assert.equal(
    buildManualChunkRecordId("laptop-air-14", 1),
    "manual:laptop-air-14:chunk:0001"
  );
  assert.equal(
    buildManualChunkRecordId("laptop-air-14", 10_000),
    "manual:laptop-air-14:chunk:10000"
  );
  assert.equal(
    buildImageRecordId("laptop-air-14", "front"),
    "image:laptop-air-14:front"
  );
});

test("parses vector IDs back into domain identity", () => {
  assert.deepEqual(
    parseVectorRecordId("product:laptop-air-14:profile"),
    {
      id: "product:laptop-air-14:profile",
      kind: "product",
      sku: "laptop-air-14",
      role: "profile"
    }
  );
  assert.deepEqual(
    parseVectorRecordId("manual:laptop-air-14:chunk:0007"),
    {
      id: "manual:laptop-air-14:chunk:0007",
      kind: "manual",
      sku: "laptop-air-14",
      role: "chunk",
      chunkIndex: 7
    }
  );
  assert.deepEqual(
    parseVectorRecordId("image:laptop-air-14:gallery-2"),
    {
      id: "image:laptop-air-14:gallery-2",
      kind: "image",
      sku: "laptop-air-14",
      role: "gallery-2"
    }
  );
});

test("rejects non-canonical vector IDs", () => {
  const invalidIds = [
    "19d438bc-9175-4f4f-b478-0239b58ef123",
    "product:LAPTOP-AIR-14:profile",
    "manual:laptop-air-14:chunk:0000",
    "manual:laptop-air-14:chunk:00001",
    "image:laptop-air-14:front_view"
  ];

  invalidIds.forEach((id) => {
    assert.throws(() => parseVectorRecordId(id));
  });
});

test("rejects invalid domain fields while building IDs", () => {
  assert.throws(() => buildProductRecordId("Laptop Air 14"));
  assert.throws(() => buildManualChunkRecordId("laptop-air-14", 0));
  assert.throws(() =>
    buildImageRecordId("laptop-air-14", "front_view")
  );
});

test("audits invalid, duplicate, and typed vector IDs", () => {
  const manualId = buildManualChunkRecordId("laptop-air-14", 1);
  const audit = auditVectorRecordIds([
    buildProductRecordId("laptop-air-14"),
    manualId,
    manualId,
    "random-id"
  ]);

  assert.deepEqual(audit, {
    total: 4,
    valid: 3,
    byKind: {
      product: 1,
      manual: 2,
      image: 0
    },
    duplicateIds: [manualId],
    invalidIds: ["random-id"]
  });
});
