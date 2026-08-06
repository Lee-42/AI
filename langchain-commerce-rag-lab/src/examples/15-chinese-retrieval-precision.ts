import { config } from "../config.js";
import { createTextEmbeddings } from "../embeddings/create-text-embeddings.js";
import {
  CHINESE_RETRIEVAL_QUERIES,
  calculateSpanCoverage,
  combineSpanCoverages,
  evaluateChineseRetrieval,
  extractChineseSentenceSpans,
  normalizeChineseForMatch,
  type ChineseRetrievalEvaluation
} from "../evaluation/chinese-retrieval-evaluation.js";
import {
  LESSON_15_CHUNK_OVERLAP,
  LESSON_15_CHUNK_SIZE,
  loadChineseManualChunkSets,
  type ManualSplitStrategy
} from "../indexing/chinese-manual-chunks.js";
import { indexChineseManualChunksInChroma } from "../indexing/index-chinese-manual-chunks-in-chroma.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import { getOrCreateLesson15Collection } from "../vectorstores/lesson15-chinese-retrieval-collection.js";

function metric(value: number): string {
  return value.toFixed(3);
}

function rankLabel(rank: number | undefined): string {
  return rank === undefined ? "未召回完整答案" : `第 ${rank} 名`;
}

function printEvaluation(
  evaluation: ChineseRetrievalEvaluation
): void {
  console.log(
    `${evaluation.strategy}: ` +
      `完整答案 Recall@1=${metric(evaluation.answerRecallAt1)} ` +
      `Recall@${evaluation.k}=${metric(evaluation.answerRecallAtK)} ` +
      `MRR=${metric(evaluation.mrr)}`
  );
}

function excerpt(content: string): string {
  return content.replace(/\s+/gu, " ").slice(0, 130);
}

const strategies: ManualSplitStrategy[] = [
  "default",
  "chinese-punctuation"
];

function printStructuralDiagnostics(
  chunkSets: Awaited<ReturnType<typeof loadChineseManualChunkSets>>
): void {
  const labeledAnswerSpans = CHINESE_RETRIEVAL_QUERIES.map(
    (query) => query.expectedAnswer
  );
  const defaultContents = chunkSets.byStrategy.default.map(
    (chunk) => chunk.pageContent
  );
  const chineseContents =
    chunkSets.byStrategy["chinese-punctuation"].map(
      (chunk) => chunk.pageContent
    );
  const corpusCoverage = (strategy: ManualSplitStrategy) => {
    return combineSpanCoverages(
      chunkSets.sources.map((source) => {
        const sourceChunks = chunkSets.byStrategy[strategy]
          .filter((chunk) => {
            return chunk.metadata.source === source.source;
          })
          .map((chunk) => chunk.pageContent);

        return calculateSpanCoverage(
          extractChineseSentenceSpans(source.content),
          sourceChunks
        );
      })
    );
  };
  const defaultCorpusCoverage = corpusCoverage("default");
  const chineseCorpusCoverage = corpusCoverage(
    "chinese-punctuation"
  );
  const defaultLabeledCoverage = calculateSpanCoverage(
    labeledAnswerSpans,
    defaultContents
  );
  const chineseLabeledCoverage = calculateSpanCoverage(
    labeledAnswerSpans,
    chineseContents
  );
  const boundaryKeywords = ["对色彩", "要求较高的项目"];
  const boundaryChunks = (
    strategy: ManualSplitStrategy
  ) => {
    return chunkSets.byStrategy[strategy].filter((chunk) => {
      return (
        chunk.metadata.sku === "laptop-studio-16" &&
        boundaryKeywords.some((keyword) => {
          return normalizeChineseForMatch(chunk.pageContent).includes(
            keyword
          );
        })
      );
    });
  };

  console.log("15 解决 ChromaDB 查询中文不精准问题");
  console.log("");
  console.log("受控切片策略 A/B");
  console.log(
    `chunkSize=${LESSON_15_CHUNK_SIZE}, ` +
      `chunkOverlap=${LESSON_15_CHUNK_OVERLAP}, ` +
      "Embedding/索引/查询完全相同"
  );
  console.log(
    `default chunks=${chunkSets.byStrategy.default.length}, ` +
      "chinese-punctuation chunks=" +
      `${chunkSets.byStrategy["chinese-punctuation"].length}`
  );
  console.log(
    "全语料句子/分句覆盖: " +
      `default=${defaultCorpusCoverage.covered}/` +
      `${defaultCorpusCoverage.total} ` +
      `(${metric(defaultCorpusCoverage.rate)}), ` +
      `chinese=${chineseCorpusCoverage.covered}/` +
      `${chineseCorpusCoverage.total} ` +
      `(${metric(chineseCorpusCoverage.rate)})`
  );
  console.log(
    "固定问题答案覆盖: " +
      `default=${defaultLabeledCoverage.covered}/` +
      `${defaultLabeledCoverage.total}, ` +
      `chinese=${chineseLabeledCoverage.covered}/` +
      `${chineseLabeledCoverage.total}`
  );
  console.log("");
  console.log("边界证据");

  for (const strategy of strategies) {
    console.log(`${strategy}:`);
    boundaryChunks(strategy).forEach((chunk) => {
      console.log(`  ${chunk.id}: ${excerpt(chunk.pageContent)}`);
    });
  }
}

async function main(): Promise<void> {
  const offlineOnly = process.argv.slice(2).includes("--offline");
  const embeddingModel = config.ark.textEmbeddingModel;

  if (!offlineOnly && !embeddingModel) {
    throw new Error("ARK_TEXT_EMBEDDING_MODEL is required");
  }

  const chunkSets = await loadChineseManualChunkSets(
    embeddingModel ?? "offline-structure-only"
  );

  printStructuralDiagnostics(chunkSets);

  if (offlineOnly) {
    console.log("");
    console.log("离线模式: Embedding 调用=0, Chroma 读写=0");
    return;
  }

  if (!embeddingModel) {
    throw new Error("ARK_TEXT_EMBEDDING_MODEL is required");
  }

  let totalTokens = 0;
  const embeddings = createTextEmbeddings({
    onRequestComplete: (metrics) => {
      totalTokens += metrics.totalTokens ?? metrics.promptTokens ?? 0;
    }
  });
  const collection = await getOrCreateLesson15Collection(
    createChromaClient(),
    config.chroma.mode
  );
  const indexing = await indexChineseManualChunksInChroma(
    collection,
    embeddings,
    chunkSets
  );
  const queryVectors = await embeddings.embedDocuments(
    CHINESE_RETRIEVAL_QUERIES.map((query) => query.question)
  );
  const [defaultEvaluation, chineseEvaluation] = await Promise.all(
    strategies.map((strategy) => {
      return evaluateChineseRetrieval(
        collection,
        strategy,
        CHINESE_RETRIEVAL_QUERIES,
        queryVectors,
        embeddingModel,
        3
      );
    })
  );

  console.log("");
  console.log("完整答案片段召回指标");
  printEvaluation(defaultEvaluation);
  printEvaluation(chineseEvaluation);
  console.log("");
  console.log("逐条结果");

  CHINESE_RETRIEVAL_QUERIES.forEach((query, index) => {
    const defaultResult = defaultEvaluation.results[index];
    const chineseResult = chineseEvaluation.results[index];
    const defaultTop = defaultResult?.hits[0];
    const chineseTop = chineseResult?.hits[0];

    console.log(`${query.id}: ${query.question}`);
    console.log(
      `  default=${rankLabel(defaultResult?.firstRelevantRank)}, ` +
        `chinese=${rankLabel(chineseResult?.firstRelevantRank)}`
    );

    if (defaultTop) {
      console.log(
        `  default top1=${defaultTop.id} ` +
          `distance=${defaultTop.distance.toFixed(6)}`
      );
      console.log(`    ${excerpt(defaultTop.content)}`);
    }

    if (chineseTop) {
      console.log(
        `  chinese top1=${chineseTop.id} ` +
          `distance=${chineseTop.distance.toFixed(6)}`
      );
      console.log(`    ${excerpt(chineseTop.content)}`);
    }
  });

  console.log("");
  console.log(`Collection: ${collection.name}`);
  console.log(`向量维度: ${indexing.dimension}`);
  console.log(
    `Collection 记录数: ${indexing.recordsBefore} -> ` +
      `${indexing.recordsAfter}`
  );
  console.log(`本次 Embedding 用量: ${totalTokens} tokens`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 15 课运行失败: ${message}`);
  process.exitCode = 1;
});
