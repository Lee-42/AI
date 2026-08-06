import { config } from "../config.js";
import { buildManualChunkRecordId } from "../domain/vector-record-id.js";
import { createTextEmbeddings } from "../embeddings/create-text-embeddings.js";
import {
  buildBoundaryText,
  diagnoseManualOriginalText
} from "../evaluation/manual-original-text-diagnostics.js";
import {
  loadManualChunkDocuments,
  loadManualSources
} from "../indexing/manual-chunks.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import { getOrCreateManualChunkCollection } from "../vectorstores/manual-chunk-collection.js";

const TARGET_ID = buildManualChunkRecordId("laptop-studio-16", 1);
const EXACT_SENTENCE = "视频剪辑和三维渲染时建议使用创作模式。";

function printRanking(
  title: string,
  hits: Awaited<
    ReturnType<typeof diagnoseManualOriginalText>
  >["semanticResults"]["exactChunk"]
): void {
  console.log(title);
  hits.forEach((hit, index) => {
    console.log(
      `  ${index + 1}. ${hit.id} distance=${hit.distance.toFixed(6)}`
    );
  });
}

async function main(): Promise<void> {
  const embeddingModel = config.ark.textEmbeddingModel;

  if (!embeddingModel) {
    throw new Error("ARK_TEXT_EMBEDDING_MODEL is required");
  }

  const [sources, chunks] = await Promise.all([
    loadManualSources(),
    loadManualChunkDocuments(embeddingModel)
  ]);
  const source = sources.find(
    (item) => item.sku === "laptop-studio-16"
  );
  const studioChunks = chunks.filter(
    (chunk) => chunk.metadata.sku === "laptop-studio-16"
  );
  const [firstChunk, secondChunk] = studioChunks;

  if (!source || !firstChunk || !secondChunk) {
    throw new Error("Studio manual boundary fixtures are missing");
  }

  const boundaryText = buildBoundaryText(
    source,
    firstChunk,
    secondChunk,
    20
  );
  let totalTokens = 0;
  const embeddings = createTextEmbeddings({
    onRequestComplete: (metrics) => {
      totalTokens += metrics.totalTokens ?? metrics.promptTokens ?? 0;
    }
  });
  const collection = await getOrCreateManualChunkCollection(
    createChromaClient(),
    config.chroma.mode
  );
  const diagnostic = await diagnoseManualOriginalText(
    collection,
    embeddings,
    {
      targetId: TARGET_ID,
      sku: "laptop-studio-16",
      exactSentence: EXACT_SENTENCE,
      fullSource: source.content,
      boundaryText,
      embeddingModel
    }
  );

  console.log("14 为什么我用 ChromaDB 查询原文都查不到？");
  console.log("");
  console.log("精确读取与全文包含");
  console.log(`get(id) 找到目标: ${diagnostic.storedById}`);
  console.log(
    `原文句子命中: ${diagnostic.exactSentenceMatchIds.join(", ") || "0"}`
  );
  console.log(
    `完整说明书命中数: ${diagnostic.fullSourceMatchIds.length}`
  );
  if (diagnostic.fullSourceFilterError) {
    console.log(`完整说明书过滤: ${diagnostic.fullSourceFilterError}`);
  }
  console.log(`跨 chunk 原文命中数: ${diagnostic.boundaryMatchIds.length}`);
  console.log("");
  console.log("直接 queryTexts");
  console.log(
    diagnostic.directQueryTextsError ??
      "当前 Collection 已配置内置 Embedding"
  );
  console.log("");
  console.log("改用同一豆包模型生成 queryEmbeddings");
  printRanking("完整已存 chunk:", diagnostic.semanticResults.exactChunk);
  printRanking("chunk 内原文句子:", diagnostic.semanticResults.exactSentence);
  printRanking("跨 chunk 原文:", diagnostic.semanticResults.boundaryText);
  console.log("");
  console.log(`存储与查询模型一致: ${diagnostic.storedEmbeddingModel}`);
  console.log(`本次 Embedding 用量: ${totalTokens} tokens`);
  console.log("Chroma 写入: 0");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 14 课运行失败: ${message}`);
  process.exitCode = 1;
});
