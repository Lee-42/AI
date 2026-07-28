import { config } from "../config.js";
import {
  formatBinaryBytes,
  inspectImageVectorStorage
} from "../storage/image-vector-storage-size.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import { getOrCreateProductImageCollection } from "../vectorstores/product-image-collection.js";

async function main(): Promise<void> {
  const embeddingModel = config.ark.multimodalEmbeddingModel;

  if (!embeddingModel) {
    throw new Error("ARK_MULTIMODAL_EMBEDDING_MODEL is required");
  }

  const collection = await getOrCreateProductImageCollection(
    createChromaClient(),
    config.chroma.mode,
    embeddingModel
  );
  const summary = await inspectImageVectorStorage(collection);
  const indexType = config.chroma.mode === "cloud" ? "SPANN" : "HNSW";

  console.log("22 观察图片处理后实际存储到向量数据库中的大小");
  console.log("");
  console.log(`Collection: ${collection.name}`);
  console.log(`索引类型: ${indexType}`);
  console.log(`记录数: ${summary.recordCount}`);
  console.log(`每条向量维度: ${summary.dimension}`);
  console.log("Embedding API 请求数: 0");

  summary.records.forEach((record, index) => {
    console.log("");
    console.log(`${index + 1}. ${record.id}`);
    console.log(
      `   Float32 向量载荷下界: ${formatBinaryBytes(record.vectorFloat32Bytes)}`
    );
    console.log(
      `   向量 JSON 表示: ${formatBinaryBytes(record.vectorJsonBytes)}`
    );
    console.log(
      `   ID + 文档 + metadata + URI: ${formatBinaryBytes(
        record.logicalPayloadBytes - record.vectorFloat32Bytes
      )}`
    );
    console.log(
      `   逻辑载荷估算: ${formatBinaryBytes(record.logicalPayloadBytes)}`
    );
  });

  console.log("");
  console.log("合计");
  console.log(
    `Float32 向量载荷下界: ${formatBinaryBytes(
      summary.totalVectorFloat32Bytes
    )}`
  );
  console.log(
    `向量 JSON 表示: ${formatBinaryBytes(summary.totalVectorJsonBytes)}`
  );
  console.log(
    `逻辑载荷估算: ${formatBinaryBytes(summary.totalLogicalPayloadBytes)}`
  );
  console.log("");
  console.log(
    "注意: 以上不是 Chroma Cloud 账单或真实磁盘占用；索引、WAL、数据库页、冗余和压缩均未计入。"
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 22 课运行失败: ${message}`);
  process.exitCode = 1;
});
