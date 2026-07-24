import { config } from "../config.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import {
  getOrCreateProductTextCollection,
  getProductTextIndexSummary
} from "../vectorstores/product-text-collection.js";

async function main(): Promise<void> {
  const client = createChromaClient();
  const [heartbeat, version, collectionsBefore] = await Promise.all([
    client.heartbeat(),
    client.version(),
    client.countCollections()
  ]);
  const collection = await getOrCreateProductTextCollection(
    client,
    config.chroma.mode
  );
  const recordCount = await collection.count();
  const collectionsAfter = await client.countCollections();
  const index = getProductTextIndexSummary(collection, config.chroma.mode);

  console.log("03 ChromaDB 向量数据库");
  console.log("");
  console.log(`连接模式: ${config.chroma.mode}`);
  console.log(`服务版本: ${version}`);
  console.log(`Heartbeat: ${typeof heartbeat === "number" ? "ok" : "invalid"}`);
  console.log(`Collection: ${collection.name}`);
  console.log(`索引类型: ${index.indexType}`);
  console.log(`距离策略: ${index.space}`);
  console.log(`当前记录数: ${recordCount}`);
  console.log(
    `Collection 数量: ${collectionsBefore} -> ${collectionsAfter}`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 03 课运行失败: ${message}`);
  process.exitCode = 1;
});
