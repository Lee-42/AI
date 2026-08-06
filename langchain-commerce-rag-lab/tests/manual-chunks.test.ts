import assert from "node:assert/strict";
import test from "node:test";
import {
  loadManualChunkDocuments,
  loadManualSources,
  MANUAL_CHUNK_SIZE,
  splitManualSource
} from "../src/indexing/manual-chunks.js";

test("splits manuals into traceable chunks with stable IDs", async () => {
  const [sources, chunks] = await Promise.all([
    loadManualSources(),
    loadManualChunkDocuments("test-embedding-model")
  ]);
  const sourceByPath = new Map(
    sources.map((source) => [source.source, source.content])
  );

  assert.equal(sources.length, 2);
  assert.equal(chunks.length, 5);
  assert.equal(new Set(chunks.map((chunk) => chunk.id)).size, chunks.length);
  assert.equal(
    chunks.every((chunk) => chunk.pageContent.length <= MANUAL_CHUNK_SIZE),
    true
  );

  for (const chunk of chunks) {
    const source = sourceByPath.get(chunk.metadata.source);

    assert.ok(source);
    assert.equal(
      source.slice(
        chunk.metadata.startIndex,
        chunk.metadata.startIndex + chunk.pageContent.length
      ),
      chunk.pageContent
    );
    assert.match(
      chunk.id ?? "",
      /^manual:[a-z0-9-]+:chunk:\d{4}$/
    );
  }

  assert.equal(
    chunks.some(
      (chunk) =>
        chunk.metadata.sku === "laptop-studio-16" &&
        chunk.pageContent.includes("创作模式")
    ),
    true
  );
});

test("repeated splitting produces the same chunk IDs and indexes", async () => {
  const [source] = await loadManualSources();

  assert.ok(source);
  const first = await splitManualSource(source, "test-model");
  const second = await splitManualSource(source, "test-model");

  assert.deepEqual(
    first.map((chunk) => ({
      id: chunk.id,
      chunkIndex: chunk.metadata.chunkIndex,
      startIndex: chunk.metadata.startIndex
    })),
    second.map((chunk) => ({
      id: chunk.id,
      chunkIndex: chunk.metadata.chunkIndex,
      startIndex: chunk.metadata.startIndex
    }))
  );
});

test("rejects an empty embedding model in chunk metadata", async () => {
  const [source] = await loadManualSources();

  assert.ok(source);
  await assert.rejects(
    splitManualSource(source, "  "),
    /must not be empty/
  );
});
