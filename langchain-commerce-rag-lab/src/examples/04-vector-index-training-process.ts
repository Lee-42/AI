import { createTextEmbeddings } from "../embeddings/create-text-embeddings.js";
import { loadProductDocuments } from "../indexing/product-documents.js";
import { prepareProductIndexBatch } from "../indexing/prepare-product-index-batch.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import { getOrCreateProductTextCollection } from "../vectorstores/product-text-collection.js";
import { config } from "../config.js";

async function main(): Promise<void> {
  let embeddingRequests = 0;
  let totalTokens = 0;
  let actualModel = "";

  const embeddingModel = createTextEmbeddings({
    onRequestComplete: (metrics) => {
      embeddingRequests += 1;
      totalTokens += metrics.totalTokens ?? metrics.promptTokens ?? 0;
      actualModel = metrics.model;
    }
  });
  const client = createChromaClient();
  const collection = await getOrCreateProductTextCollection(
    client,
    config.chroma.mode
  );
  const recordsBefore = await collection.count();
  const documents = await loadProductDocuments();

  // API 调用是推理：文本变成向量，但不会更新模型权重。
  const vectors = await embeddingModel.embedDocuments(
    documents.map((document) => document.pageContent)
  );
  const batch = prepareProductIndexBatch(documents, vectors);
  const recordsAfter = await collection.count();

  if (recordsAfter !== recordsBefore) {
    throw new Error("第 04 课不应改变 Chroma 记录数");
  }

  console.log("04 向量数据库的“训练”过程");
  console.log("");
  console.log("阶段 1: 加载商品文档");
  console.log(`文档数量: ${documents.length}`);
  console.log("");
  console.log("阶段 2: Embedding 模型推理");
  console.log(`实际模型: ${actualModel}`);
  console.log(`API 请求数: ${embeddingRequests}`);
  console.log(`向量数量: ${batch.records.embeddings.length}`);
  console.log(`向量维度: ${batch.dimension}`);
  console.log(`本次用量: ${totalTokens} tokens`);
  console.log("模型权重更新: 否");
  console.log("");
  console.log("阶段 3: 准备索引记录");
  console.log(`待入库 ID: ${batch.records.ids.join(", ")}`);
  console.log("Chroma upsert: 未执行");
  console.log(`Collection 记录数: ${recordsBefore} -> ${recordsAfter}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 04 课运行失败: ${message}`);
  process.exitCode = 1;
});
