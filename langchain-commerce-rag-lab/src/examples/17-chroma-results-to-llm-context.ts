import type { BaseMessage } from "@langchain/core/messages";
import type { SearchHit } from "../domain/search-result.js";
import { buildManualChunkRecordId } from "../domain/vector-record-id.js";
import { loadManualChunkDocuments } from "../indexing/manual-chunks.js";
import { buildGroundedRagMessages } from "../rag/grounded-messages.js";
import { buildRagContext } from "../rag/rag-context.js";

const QUESTION = "Aurora Studio 16 剪视频时应该选择哪个性能模式？";

const RECORDED_RESULTS = [
  {
    id: buildManualChunkRecordId("laptop-studio-16", 1),
    distance: 0.35025
  },
  {
    id: buildManualChunkRecordId("laptop-studio-16", 2),
    distance: 0.601221
  },
  {
    id: buildManualChunkRecordId("laptop-studio-16", 3),
    distance: 0.745098
  }
] as const;

function messageText(message: BaseMessage): string {
  if (typeof message.content !== "string") {
    throw new Error("Lesson 17 expects text-only chat messages");
  }

  return message.content;
}

async function replaySearchHits(): Promise<SearchHit[]> {
  const documents = await loadManualChunkDocuments(
    "lesson-17-offline-replay"
  );
  const documentsById = new Map(
    documents.map((document) => [document.id, document])
  );

  return RECORDED_RESULTS.map(({ id, distance }) => {
    const document = documentsById.get(id);

    if (!document) {
      throw new Error(`Recorded source ${id} no longer exists`);
    }

    return {
      id,
      content: document.pageContent,
      distance,
      relevanceScore: 1 - distance,
      metadata: {
        ...document.metadata,
        internalTrace: "must-not-reach-the-llm"
      }
    };
  });
}

function assertPrivateRetrievalFieldsWereExcluded(
  message: string
): void {
  const forbiddenFragments = [
    "distance",
    "relevanceScore",
    "embeddingModel",
    "contentVersion",
    "startIndex",
    "recordType",
    "internalTrace",
    ...RECORDED_RESULTS.map(({ distance }) => distance.toFixed(6))
  ];

  const leaked = forbiddenFragments.find((fragment) =>
    message.includes(fragment)
  );

  if (leaked) {
    throw new Error(`Private retrieval field leaked to LLM: ${leaked}`);
  }
}

async function main(): Promise<void> {
  const hits = await replaySearchHits();
  const context = buildRagContext(hits, {
    maxCharacters: 2_000,
    maxSources: 2
  });
  const messages = buildGroundedRagMessages(QUESTION, context);
  const humanMessage = messageText(messages[1]);

  assertPrivateRetrievalFieldsWereExcluded(humanMessage);

  console.log("17 ChromaDB 查询之后给到什么数据 LLM？");
  console.log("");
  console.log("本示例只回放第 13 课已记录的检索结果，不连接模型或 Chroma。");
  console.log("");
  console.log(
    "第一层：retrieval 内部的 SearchHit[]（由 Chroma QueryResult 标准化）"
  );
  hits.forEach((hit, index) => {
    console.log(
      `${index + 1}. id=${hit.id} distance=${hit.distance.toFixed(6)}`
    );
    console.log(
      `   document=${hit.content.replace(/\s+/gu, " ").slice(0, 72)}...`
    );
  });

  console.log("");
  console.log("第二层：应用构造的受控检索上下文");
  console.log(`输入命中数: ${context.inputHitCount}`);
  console.log(`进入上下文: ${context.sourceIds.join(", ")}`);
  console.log(`因预算/数量省略: ${context.omittedSourceIds.join(", ")}`);
  console.log(
    `上下文字符预算: ${context.usedCharacters}/${context.maxCharacters}`
  );
  console.log(context.text);

  console.log("");
  console.log("第三层：真正传给 Chat Model 的 messages");
  console.log("--- SystemMessage ---");
  console.log(messageText(messages[0]));
  console.log("--- HumanMessage ---");
  console.log(humanMessage);

  console.log("");
  console.log(
    "检查通过：distance、relevanceScore、向量配置和内部 metadata " +
      "均未进入用户消息。"
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 17 课运行失败: ${message}`);
  process.exitCode = 1;
});
