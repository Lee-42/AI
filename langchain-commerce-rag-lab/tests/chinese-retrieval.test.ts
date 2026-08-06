import assert from "node:assert/strict";
import test from "node:test";
import type { ChromaClient, Collection } from "chromadb";
import type { TextEmbeddingProvider } from "../src/embeddings/contracts.js";
import {
  CHINESE_RETRIEVAL_QUERIES,
  calculateSpanCoverage,
  combineSpanCoverages,
  evaluateChineseRetrieval,
  extractChineseSentenceSpans,
  normalizeChineseForMatch,
  type ChineseRetrievalQuery
} from "../src/evaluation/chinese-retrieval-evaluation.js";
import {
  LESSON_15_CONTENT_VERSION,
  LESSON_15_CHUNK_SIZE,
  loadChineseManualChunkSets,
  splitChineseManualSource
} from "../src/indexing/chinese-manual-chunks.js";
import { indexChineseManualChunksInChroma } from "../src/indexing/index-chinese-manual-chunks-in-chroma.js";
import { getOrCreateLesson15Collection } from "../src/vectorstores/lesson15-chinese-retrieval-collection.js";

test("Chinese punctuation keeps the labeled answer sentences intact", async () => {
  const chunkSets = await loadChineseManualChunkSets("test-model");
  const defaultChunks = chunkSets.byStrategy.default;
  const chineseChunks =
    chunkSets.byStrategy["chinese-punctuation"];

  assert.equal(defaultChunks.length, 40);
  assert.equal(chineseChunks.length, 40);
  assert.equal(
    chunkSets.documents.every(
      (chunk) => chunk.pageContent.length <= LESSON_15_CHUNK_SIZE
    ),
    true
  );

  const sourceByPath = new Map(
    chunkSets.sources.map((source) => [source.source, source.content])
  );

  for (const chunk of chunkSets.documents) {
    const source = sourceByPath.get(chunk.metadata.source);

    assert.ok(source);
    assert.equal(
      source.slice(
        chunk.metadata.startIndex,
        chunk.metadata.startIndex + chunk.pageContent.length
      ),
      chunk.pageContent
    );
  }

  const preservedAnswers = (
    chunks: typeof defaultChunks
  ): string[] => {
    return CHINESE_RETRIEVAL_QUERIES
      .filter((query) => {
        const answer = normalizeChineseForMatch(query.expectedAnswer);

        return chunks.some((chunk) => {
          return normalizeChineseForMatch(
            chunk.pageContent
          ).includes(answer);
        });
      })
      .map((query) => query.id);
  };

  assert.deepEqual(preservedAnswers(defaultChunks), [
    "creation-mode-control",
    "stable-performance-control"
  ]);
  assert.deepEqual(
    preservedAnswers(chineseChunks),
    CHINESE_RETRIEVAL_QUERIES.map((query) => query.id)
  );

  const sourceAwareCoverage = (
    chunks: typeof defaultChunks
  ) => {
    return combineSpanCoverages(
      chunkSets.sources.map((source) => {
        return calculateSpanCoverage(
          extractChineseSentenceSpans(source.content),
          chunks
            .filter((chunk) => {
              return chunk.metadata.source === source.source;
            })
            .map((chunk) => chunk.pageContent)
        );
      })
    );
  };

  assert.deepEqual(
    sourceAwareCoverage(defaultChunks),
    {
      covered: 60,
      total: 69,
      rate: 60 / 69
    }
  );
  assert.deepEqual(
    sourceAwareCoverage(chineseChunks),
    {
      covered: 69,
      total: 69,
      rate: 1
    }
  );
  assert.equal(
    chineseChunks.some((chunk) => /^[。！？；，、]/u.test(
      chunk.pageContent
    )),
    false
  );
  assert.equal(
    chineseChunks.some((chunk) => chunk.pageContent.includes("3.2K")),
    true
  );

  const source = chunkSets.sources[0];

  assert.ok(source);
  const repeated = await splitChineseManualSource(
    source,
    "test-model",
    "chinese-punctuation"
  );
  const sourceChineseChunks = chineseChunks.filter(
    (chunk) => chunk.metadata.source === source.source
  );

  assert.deepEqual(
    repeated.map((chunk) => ({
      id: chunk.id,
      startIndex: chunk.metadata.startIndex
    })),
    sourceChineseChunks.map((chunk) => ({
      id: chunk.id,
      startIndex: chunk.metadata.startIndex
    }))
  );
});

test("evaluates answer-bearing chunks with a strategy filter", async () => {
  const queries: ChineseRetrievalQuery[] = [
    {
      id: "q1",
      question: "first",
      expectedAnswer: "需要连接电源。"
    },
    {
      id: "q2",
      question: "second",
      expectedAnswer: "立即停止使用。"
    }
  ];
  let queryOptions: Record<string, unknown> | undefined;
  const collection = {
    async query(options: Record<string, unknown>) {
      queryOptions = options;

      return {
        rows() {
          return [
            [
              {
                id: "first-relevant",
                document: "需要连接\n电源。",
                distance: 0.1,
                metadata: { splitStrategy: "chinese-punctuation" }
              },
              {
                id: "first-other",
                document: "其他内容",
                distance: 0.2,
                metadata: { splitStrategy: "chinese-punctuation" }
              }
            ],
            [
              {
                id: "second-other",
                document: "其他内容",
                distance: 0.1,
                metadata: { splitStrategy: "chinese-punctuation" }
              },
              {
                id: "second-relevant",
                document: "立即停止使用。",
                distance: 0.2,
                metadata: { splitStrategy: "chinese-punctuation" }
              }
            ]
          ];
        }
      };
    }
  } as unknown as Collection;
  const evaluation = await evaluateChineseRetrieval(
    collection,
    "chinese-punctuation",
    queries,
    [[1, 0], [0, 1]],
    "test-model",
    2
  );

  assert.equal(evaluation.answerRecallAt1, 0.5);
  assert.equal(evaluation.answerRecallAtK, 1);
  assert.equal(evaluation.mrr, 0.75);
  assert.deepEqual(
    evaluation.results.map((result) => result.firstRelevantRank),
    [1, 2]
  );
  assert.deepEqual(queryOptions, {
    queryEmbeddings: [[1, 0], [0, 1]],
    nResults: 2,
    where: {
      $and: [
        { recordType: "lesson15-manual-chunk" },
        { contentVersion: LESSON_15_CONTENT_VERSION },
        { embeddingModel: "test-model" },
        { splitStrategy: "chinese-punctuation" }
      ]
    },
    include: ["documents", "metadatas", "distances"]
  });
});

test("upserts both lesson 15 strategies with stable IDs", async () => {
  const chunkSets = await loadChineseManualChunkSets("test-model");
  const records = new Map<string, unknown>();
  const collection = {
    async count() {
      return records.size;
    },
    async get() {
      return {
        ids: [...records.keys()]
      };
    },
    async upsert(value: {
      ids: string[];
      embeddings: number[][];
      documents: string[];
      metadatas: Record<string, unknown>[];
    }) {
      value.ids.forEach((id, index) => {
        records.set(id, {
          embedding: value.embeddings[index],
          document: value.documents[index],
          metadata: value.metadatas[index]
        });
      });
    },
    async delete(value: { ids: string[] }) {
      value.ids.forEach((id) => records.delete(id));
    }
  } as unknown as Collection;
  const embeddings: TextEmbeddingProvider = {
    async embedDocuments(texts) {
      return texts.map((_text, index) => [index + 1, 1]);
    },
    async embedQuery() {
      return [1, 1];
    }
  };
  const first = await indexChineseManualChunksInChroma(
    collection,
    embeddings,
    chunkSets
  );
  records.set("lesson15:stale:chunk:9999", {
    metadata: {
      recordType: "lesson15-manual-chunk"
    }
  });
  const second = await indexChineseManualChunksInChroma(
    collection,
    embeddings,
    chunkSets
  );

  assert.equal(first.indexedRecords, chunkSets.documents.length);
  assert.equal(first.dimension, 2);
  assert.equal(first.recordsBefore, 0);
  assert.equal(first.recordsAfter, chunkSets.documents.length);
  assert.equal(first.staleRecordsRemoved, 0);
  assert.equal(
    second.recordsBefore,
    chunkSets.documents.length + 1
  );
  assert.equal(second.recordsAfter, chunkSets.documents.length);
  assert.equal(second.staleRecordsRemoved, 1);
  assert.equal(records.size, chunkSets.documents.length);
});

test("creates an isolated cosine collection for lesson 15", async () => {
  let options: Record<string, unknown> | undefined;
  const collection = {
    name: "course_lesson15_chinese_retrieval_v1",
    configuration: {
      spann: { space: "cosine" }
    }
  } as unknown as Collection;
  const client = {
    async getOrCreateCollection(value: Record<string, unknown>) {
      options = value;
      return collection;
    }
  } as unknown as ChromaClient;

  const result = await getOrCreateLesson15Collection(client, "cloud");

  assert.equal(result, collection);
  assert.equal(options?.embeddingFunction, null);
  assert.deepEqual(options?.configuration, {
    spann: { space: "cosine" }
  });
  assert.deepEqual(options?.metadata, {
    recordType: "lesson15-manual-chunk",
    distanceStrategy: "cosine",
    contentVersion: LESSON_15_CONTENT_VERSION,
    chunkSize: 100,
    chunkOverlap: 16
  });
});
