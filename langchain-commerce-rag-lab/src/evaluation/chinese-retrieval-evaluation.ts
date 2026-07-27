import type { Collection } from "chromadb";
import type { SearchHit } from "../domain/search-result.js";
import {
  LESSON_15_CONTENT_VERSION,
  type ManualSplitStrategy
} from "../indexing/chinese-manual-chunks.js";
import { requireSearchHitFields } from "../retrieval/normalize-search-metadata.js";

export type ChineseRetrievalQuery = {
  id: string;
  question: string;
  expectedAnswer: string;
};

export const CHINESE_RETRIEVAL_QUERIES: ChineseRetrievalQuery[] = [
  {
    id: "creation-mode-control",
    question: "视频剪辑和三维渲染应该使用什么模式？",
    expectedAnswer:
      "视频剪辑和三维渲染时建议使用创作模式。"
  },
  {
    id: "stable-performance-control",
    question: "高负载任务要稳定运行，电源和通风需要怎么处理？",
    expectedAnswer:
      "为了获得稳定性能，应连接电源，并确保机身两侧和底部的通风口没有被遮挡。"
  },
  {
    id: "color-calibration-recovered",
    question: "对色彩要求高的项目应该如何设置和维护屏幕？",
    expectedAnswer:
      "对色彩要求较高的项目，应在固定光线环境下选择对应色域，并定期进行校准。"
  },
  {
    id: "project-recovery-recovered",
    question: "剪辑项目崩溃以后应该先做什么？",
    expectedAnswer:
      "项目崩溃后应先恢复自动保存版本，再检查插件和素材路径是否完整。"
  },
  {
    id: "hardware-danger-recovered",
    question: "电脑进液、出现焦味、异常响声或者电池鼓起时应该怎么办？",
    expectedAnswer:
      "若出现进液、焦味、异常响声或电池鼓起，应立即停止使用并断开电源，不要继续运行渲染任务或自行拆机。"
  }
];

export type ChineseRetrievalQueryResult = {
  queryId: string;
  firstRelevantRank?: number;
  passedAt1: boolean;
  passedAtK: boolean;
  hits: SearchHit[];
};

export type ChineseRetrievalEvaluation = {
  strategy: ManualSplitStrategy;
  queryCount: number;
  k: number;
  answerRecallAt1: number;
  answerRecallAtK: number;
  mrr: number;
  results: ChineseRetrievalQueryResult[];
};

export function normalizeChineseForMatch(text: string): string {
  return text.replace(/\s+/gu, "");
}

export type SpanCoverage = {
  covered: number;
  total: number;
  rate: number;
};

export function extractChineseSentenceSpans(text: string): string[] {
  const withoutHeadings = text.replace(/^#{1,6}\s.*$/gmu, "");

  return (withoutHeadings.match(/[^。！？；]+[。！？；]/gu) ?? [])
    .map((span) => span.trim())
    .filter((span) => span.length > 0);
}

export function calculateSpanCoverage(
  spans: string[],
  chunkContents: string[]
): SpanCoverage {
  if (spans.length === 0) {
    throw new Error("Chinese sentence spans must not be empty");
  }

  if (chunkContents.length === 0) {
    throw new Error("Chinese chunk contents must not be empty");
  }

  const normalizedChunks = chunkContents.map(normalizeChineseForMatch);
  const covered = spans.filter((span) => {
    const expected = normalizeChineseForMatch(span);

    return normalizedChunks.some((chunk) => chunk.includes(expected));
  }).length;

  return {
    covered,
    total: spans.length,
    rate: covered / spans.length
  };
}

export function combineSpanCoverages(
  coverages: SpanCoverage[]
): SpanCoverage {
  if (coverages.length === 0) {
    throw new Error("Span coverages must not be empty");
  }

  const covered = coverages.reduce(
    (sum, coverage) => sum + coverage.covered,
    0
  );
  const total = coverages.reduce(
    (sum, coverage) => sum + coverage.total,
    0
  );

  if (total === 0) {
    throw new Error("Combined span coverage total must be positive");
  }

  return {
    covered,
    total,
    rate: covered / total
  };
}

function validateQueryVectors(
  queries: ChineseRetrievalQuery[],
  queryVectors: number[][]
): void {
  if (queries.length === 0) {
    throw new Error("Chinese retrieval queries must not be empty");
  }

  if (new Set(queries.map((query) => query.id)).size !== queries.length) {
    throw new Error("Chinese retrieval query IDs must be unique");
  }

  if (
    queries.some(
      (query) =>
        query.id.trim().length === 0 ||
        query.question.trim().length === 0 ||
        query.expectedAnswer.trim().length === 0
    )
  ) {
    throw new Error("Chinese retrieval query fields must not be empty");
  }

  if (queryVectors.length !== queries.length) {
    throw new Error(
      "Chinese retrieval query and embedding counts must match"
    );
  }

  const dimension = queryVectors[0]?.length ?? 0;

  if (
    dimension === 0 ||
    queryVectors.some(
      (vector) =>
        vector.length !== dimension ||
        vector.some((value) => !Number.isFinite(value))
    )
  ) {
    throw new Error("Chinese retrieval query vectors must be valid");
  }
}

export async function evaluateChineseRetrieval(
  collection: Collection,
  strategy: ManualSplitStrategy,
  queries: ChineseRetrievalQuery[],
  queryVectors: number[][],
  embeddingModel: string,
  k = 3
): Promise<ChineseRetrievalEvaluation> {
  if (!Number.isInteger(k) || k < 1) {
    throw new Error("Chinese retrieval K must be a positive integer");
  }

  validateQueryVectors(queries, queryVectors);

  if (embeddingModel.trim().length === 0) {
    throw new Error("Chinese retrieval embedding model must not be empty");
  }

  const response = await collection.query({
    queryEmbeddings: queryVectors,
    nResults: k,
    where: {
      $and: [
        { recordType: "lesson15-manual-chunk" },
        { contentVersion: LESSON_15_CONTENT_VERSION },
        { embeddingModel },
        { splitStrategy: strategy }
      ]
    },
    include: ["documents", "metadatas", "distances"]
  });
  const rowGroups = response.rows();

  if (rowGroups.length !== queries.length) {
    throw new Error(
      `Chroma returned ${rowGroups.length} query groups; ` +
        `expected ${queries.length}`
    );
  }

  const results = queries.map((query, index) => {
    const expected = normalizeChineseForMatch(query.expectedAnswer);
    const hits = (rowGroups[index] ?? []).map(requireSearchHitFields);
    const relevantIndex = hits.findIndex((hit) => {
      return normalizeChineseForMatch(hit.content).includes(expected);
    });
    const firstRelevantRank =
      relevantIndex === -1 ? undefined : relevantIndex + 1;

    return {
      queryId: query.id,
      ...(firstRelevantRank ? { firstRelevantRank } : {}),
      passedAt1: firstRelevantRank === 1,
      passedAtK:
        firstRelevantRank !== undefined && firstRelevantRank <= k,
      hits
    };
  });
  const queryCount = results.length;

  return {
    strategy,
    queryCount,
    k,
    answerRecallAt1:
      results.filter((result) => result.passedAt1).length / queryCount,
    answerRecallAtK:
      results.filter((result) => result.passedAtK).length / queryCount,
    mrr:
      results.reduce((sum, result) => {
        return (
          sum +
          (result.firstRelevantRank ? 1 / result.firstRelevantRank : 0)
        );
      }, 0) / queryCount,
    results
  };
}
