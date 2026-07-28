import assert from "node:assert/strict";
import test from "node:test";
import type { Collection, Metadata } from "chromadb";
import {
  analyzeStoredImageVector,
  formatBinaryBytes,
  inspectImageVectorStorage,
  summarizeImageVectorStorage,
  type StoredImageVectorRecord
} from "../src/storage/image-vector-storage-size.js";

function imageRecord(
  id: string,
  embedding: number[]
): StoredImageVectorRecord {
  return {
    id,
    embedding,
    document: "银色笔记本",
    metadata: {
      sku: "laptop-air-14",
      recordType: "product-image"
    },
    uri: "https://example.com/air.jpg"
  };
}

test("calculates vector and visible record byte sizes", () => {
  const record = imageRecord("image:laptop-air-14:front", [0.1, 0.2, 0.3]);
  const report = analyzeStoredImageVector(record);
  const fieldBytes =
    Buffer.byteLength(record.id) +
    Buffer.byteLength(record.document) +
    Buffer.byteLength(JSON.stringify(record.metadata)) +
    Buffer.byteLength(record.uri);

  assert.equal(report.dimension, 3);
  assert.equal(report.vectorFloat32Bytes, 12);
  assert.equal(
    report.vectorJsonBytes,
    Buffer.byteLength(JSON.stringify(record.embedding))
  );
  assert.equal(report.logicalPayloadBytes, 12 + fieldBytes);
});

test("summarizes equal-dimension records", () => {
  const summary = summarizeImageVectorStorage([
    imageRecord("image:a:front", [1, 0]),
    imageRecord("image:b:front", [0, 1])
  ]);

  assert.equal(summary.recordCount, 2);
  assert.equal(summary.dimension, 2);
  assert.equal(summary.totalVectorFloat32Bytes, 16);
  assert.equal(summary.records.length, 2);
});

test("reads embeddings and visible fields from Chroma", async () => {
  let getOptions: Record<string, unknown> | undefined;
  const collection = {
    async get(value: Record<string, unknown>) {
      getOptions = value;
      return {
        rows() {
          return [
            {
              id: "image:a:front",
              embedding: [1, 0],
              document: "图片 A",
              metadata: {
                sku: "a",
                recordType: "product-image"
              } satisfies Metadata,
              uri: "https://example.com/a.jpg"
            }
          ];
        }
      };
    }
  } as unknown as Collection;

  const summary = await inspectImageVectorStorage(collection);

  assert.deepEqual(getOptions, {
    include: ["embeddings", "documents", "metadatas", "uris"]
  });
  assert.equal(summary.recordCount, 1);
  assert.equal(summary.totalVectorFloat32Bytes, 8);
});

test("rejects malformed or inconsistent stored vectors", () => {
  assert.throws(
    () => analyzeStoredImageVector(imageRecord("image:a:front", [])),
    /must contain finite values/
  );
  assert.throws(
    () =>
      summarizeImageVectorStorage([
        imageRecord("image:a:front", [1, 0]),
        imageRecord("image:b:front", [1, 0, 0])
      ]),
    /has dimension 3; expected 2/
  );
});

test("formats byte sizes without implying decimal units", () => {
  assert.equal(formatBinaryBytes(0), "0 B");
  assert.equal(formatBinaryBytes(1024), "1.00 KiB");
  assert.equal(formatBinaryBytes(1024 * 1024), "1.00 MiB");
  assert.throws(() => formatBinaryBytes(-1), /non-negative safe integer/);
});
