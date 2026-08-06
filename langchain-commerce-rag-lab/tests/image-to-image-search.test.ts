import assert from "node:assert/strict";
import test from "node:test";
import type { Collection } from "chromadb";
import type { MultimodalEmbeddingProvider } from "../src/embeddings/contracts.js";
import { searchChromaImagesByImage } from "../src/retrieval/search-chroma-images-by-image.js";

function fakeCollection(
  row: {
    id: string;
    document: string;
    distance: number;
    metadata: Record<string, unknown>;
    uri?: string;
  },
  onQuery?: (value: Record<string, unknown>) => void
): Collection {
  return {
    async query(value: Record<string, unknown>) {
      onQuery?.(value);
      return {
        rows() {
          return [[row]];
        }
      };
    }
  } as unknown as Collection;
}

test("uses an image embedding to query Chroma image records", async () => {
  let embeddedUrl = "";
  let queryOptions: Record<string, unknown> | undefined;
  let textEmbeddingCalled = false;
  const embeddings: MultimodalEmbeddingProvider = {
    async embedImage(imageUrl) {
      embeddedUrl = imageUrl;
      return [0.2, 0.8, 0];
    },
    async embedText() {
      textEmbeddingCalled = true;
      return [1, 0, 0];
    }
  };
  const collection = fakeCollection(
    {
      id: "image:laptop-air-14:front",
      document: "银色轻薄窄边框笔记本电脑",
      distance: 0.01,
      metadata: {
        sku: "laptop-air-14",
        recordType: "product-image"
      },
      uri: "https://example.com/air.jpg"
    },
    (value) => {
      queryOptions = value;
    }
  );

  const hits = await searchChromaImagesByImage(
    collection,
    embeddings,
    "https://example.com/query.jpg",
    2
  );

  assert.equal(embeddedUrl, "https://example.com/query.jpg");
  assert.equal(textEmbeddingCalled, false);
  assert.deepEqual(queryOptions, {
    queryEmbeddings: [[0.2, 0.8, 0]],
    nResults: 2,
    include: ["documents", "metadatas", "distances", "uris"]
  });
  assert.equal(hits[0]?.id, "image:laptop-air-14:front");
  assert.equal(hits[0]?.distance, 0.01);
  assert.equal(hits[0]?.uri, "https://example.com/air.jpg");
});

test("rejects invalid query image URLs before embedding", async () => {
  let imageEmbeddingCalled = false;
  const embeddings: MultimodalEmbeddingProvider = {
    async embedImage() {
      imageEmbeddingCalled = true;
      return [1, 0];
    },
    async embedText() {
      return [1, 0];
    }
  };
  const collection = fakeCollection({
    id: "image:test:front",
    document: "test",
    distance: 0,
    metadata: {},
    uri: "https://example.com/test.jpg"
  });

  await assert.rejects(
    () =>
      searchChromaImagesByImage(
        collection,
        embeddings,
        "file:///tmp/query.jpg"
      ),
    /must use http or https/
  );
  assert.equal(imageEmbeddingCalled, false);
});

test("rejects invalid image query vectors and missing result URIs", async () => {
  const invalidEmbeddings: MultimodalEmbeddingProvider = {
    async embedImage() {
      return [Number.NaN];
    },
    async embedText() {
      return [1];
    }
  };
  const validEmbeddings: MultimodalEmbeddingProvider = {
    async embedImage() {
      return [1];
    },
    async embedText() {
      return [1];
    }
  };
  const collection = fakeCollection({
    id: "image:test:front",
    document: "test",
    distance: 0,
    metadata: {}
  });

  await assert.rejects(
    () =>
      searchChromaImagesByImage(
        collection,
        invalidEmbeddings,
        "https://example.com/query.jpg"
      ),
    /must contain finite values/
  );
  await assert.rejects(
    () =>
      searchChromaImagesByImage(
        collection,
        validEmbeddings,
        "https://example.com/query.jpg"
      ),
    /is missing its URI/
  );
});
