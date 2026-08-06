import assert from "node:assert/strict";
import test from "node:test";
import type { Collection } from "chromadb";
import type { TextEmbeddingProvider } from "../src/embeddings/contracts.js";
import {
  buildBoundaryText,
  diagnoseManualOriginalText
} from "../src/evaluation/manual-original-text-diagnostics.js";
import type {
  ManualChunkMetadata,
  ManualSource
} from "../src/indexing/manual-chunks.js";

const metadata = (
  startIndex: number,
  chunkIndex: number
): ManualChunkMetadata => ({
  recordType: "manual-chunk",
  sku: "studio",
  source: "manual.md",
  chunkIndex,
  startIndex,
  embeddingModel: "test-model",
  contentVersion: 1
});

test("builds text that crosses two adjacent chunk boundaries", () => {
  const source: ManualSource = {
    sku: "studio",
    source: "manual.md",
    content: "AAAABBBB"
  };
  const boundary = buildBoundaryText(
    source,
    { pageContent: "AAAA", metadata: metadata(0, 1) },
    { pageContent: "BBBB", metadata: metadata(4, 2) },
    2
  );

  assert.equal(boundary, "AABB");
  assert.equal("AAAA".includes(boundary), false);
  assert.equal("BBBB".includes(boundary), false);
});

test("compares exact retrieval with three semantic query forms", async () => {
  const exactSentence = "视频剪辑时使用创作模式。";
  const fullSource = "完整说明书，包含很多章节。";
  const boundaryText = "第一片段结尾第二片段开头";
  const queryCalls: Record<string, unknown>[] = [];
  let embeddedTexts: string[] = [];
  const collection = {
    async get(options: {
      ids?: string[];
      whereDocument?: { $contains: string };
    }) {
      if (options.ids) {
        return {
          ids: ["manual:studio:chunk:0001"],
          rows() {
            return [
              {
                id: "manual:studio:chunk:0001",
                document: `完整 chunk：${exactSentence}`,
                metadata: {
                  sku: "studio",
                  embeddingModel: "test-model"
                }
              }
            ];
          }
        };
      }

      if (options.whereDocument?.$contains === fullSource) {
        throw new Error(
          "quota exceeded https://example.test/?tenant=private"
        );
      }

      return {
        ids:
          options.whereDocument?.$contains === exactSentence
            ? ["manual:studio:chunk:0001"]
            : [],
        rows() {
          return [];
        }
      };
    },
    async query(options: Record<string, unknown>) {
      queryCalls.push(options);

      if ("queryTexts" in options) {
        throw new Error("No embedding function found");
      }

      return {
        rows() {
          return [
            [
              {
                id: "manual:studio:chunk:0001",
                document: "完整 chunk",
                distance: 0,
                metadata: { sku: "studio" }
              }
            ],
            [
              {
                id: "manual:studio:chunk:0001",
                document: exactSentence,
                distance: 0.2,
                metadata: { sku: "studio" }
              }
            ],
            [
              {
                id: "manual:studio:chunk:0002",
                document: "第二片段",
                distance: 0.3,
                metadata: { sku: "studio" }
              },
              {
                id: "manual:studio:chunk:0001",
                document: "第一片段",
                distance: 0.4,
                metadata: { sku: "studio" }
              }
            ]
          ];
        }
      };
    }
  } as unknown as Collection;
  const embeddings: TextEmbeddingProvider = {
    async embedDocuments(texts) {
      embeddedTexts = texts;
      return [[1, 0], [0.9, 0.1], [0, 1]];
    },
    async embedQuery() {
      return [];
    }
  };

  const result = await diagnoseManualOriginalText(
    collection,
    embeddings,
    {
      targetId: "manual:studio:chunk:0001",
      sku: "studio",
      exactSentence,
      fullSource,
      boundaryText,
      embeddingModel: "test-model"
    }
  );

  assert.equal(result.storedById, true);
  assert.deepEqual(result.exactSentenceMatchIds, [
    "manual:studio:chunk:0001"
  ]);
  assert.deepEqual(result.fullSourceMatchIds, []);
  assert.match(
    result.fullSourceFilterError ?? "",
    /逐个 chunk 精确检查/
  );
  assert.doesNotMatch(result.fullSourceFilterError ?? "", /tenant/);
  assert.deepEqual(result.boundaryMatchIds, []);
  assert.match(result.directQueryTextsError ?? "", /No embedding function/);
  assert.equal(
    result.semanticResults.exactSentence[0]?.id,
    "manual:studio:chunk:0001"
  );
  assert.deepEqual(
    result.semanticResults.boundaryText.map((hit) => hit.id),
    ["manual:studio:chunk:0002", "manual:studio:chunk:0001"]
  );
  assert.deepEqual(embeddedTexts, [
    `完整 chunk：${exactSentence}`,
    exactSentence,
    boundaryText
  ]);
  assert.deepEqual(queryCalls[1], {
    queryEmbeddings: [[1, 0], [0.9, 0.1], [0, 1]],
    nResults: 3,
    where: { sku: "studio" },
    include: ["documents", "metadatas", "distances"]
  });
});

test("stops before semantic search when embedding models differ", async () => {
  let embeddingCalled = false;
  const collection = {
    async get() {
      return {
        ids: ["manual:studio:chunk:0001"],
        rows() {
          return [
            {
              id: "manual:studio:chunk:0001",
              document: "stored chunk",
              metadata: { embeddingModel: "old-model" }
            }
          ];
        }
      };
    }
  } as unknown as Collection;
  const embeddings: TextEmbeddingProvider = {
    async embedDocuments() {
      embeddingCalled = true;
      return [];
    },
    async embedQuery() {
      return [];
    }
  };

  await assert.rejects(
    diagnoseManualOriginalText(collection, embeddings, {
      targetId: "manual:studio:chunk:0001",
      sku: "studio",
      exactSentence: "sentence",
      fullSource: "source",
      boundaryText: "boundary",
      embeddingModel: "new-model"
    }),
    /Embedding model mismatch/
  );
  assert.equal(embeddingCalled, false);
});
