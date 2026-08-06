import { config } from "../config.js";
import { createTextEmbeddings } from "../embeddings/create-text-embeddings.js";
import { indexProductsInChroma } from "../indexing/index-products-in-chroma.js";
import { searchChromaProducts } from "../retrieval/search-chroma-products.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import { getOrCreateProductTextCollection } from "../vectorstores/product-text-collection.js";

function productName(content: string): string {
  return content.split("\n")[0]?.replace("商品名: ", "") ?? "unknown";
}

async function main(): Promise<void> {
  const query =
    process.argv
      .slice(2)
      .filter((argument) => argument !== "--")
      .join(" ")
      .trim() ||
    "屏幕不错并且方便出差携带的笔记本";
  let requestCount = 0;
  let totalTokens = 0;

  const embeddings = createTextEmbeddings({
    onRequestComplete: (metrics) => {
      requestCount += 1;
      totalTokens += metrics.totalTokens ?? metrics.promptTokens ?? 0;
    }
  });
  const client = createChromaClient();
  const collection = await getOrCreateProductTextCollection(
    client,
    config.chroma.mode
  );
  const indexing = await indexProductsInChroma(collection, embeddings);
  const hits = await searchChromaProducts(
    collection,
    embeddings,
    query,
    3
  );

  console.log("05 向量数据库的存储和查询过程");
  console.log("");
  console.log(`Collection: ${collection.name}`);
  console.log(`upsert 记录: ${indexing.indexedRecords}`);
  console.log(`向量维度: ${indexing.dimension}`);
  console.log(
    `Collection 记录数: ${indexing.recordsBefore} -> ${indexing.recordsAfter}`
  );
  console.log(`查询: ${query}`);
  console.log(`Embedding API 请求数: ${requestCount}`);
  console.log(`本次用量: ${totalTokens} tokens`);

  hits.forEach((hit, index) => {
    console.log("");
    console.log(
      `${index + 1}. ${productName(hit.content)} (${String(hit.metadata.sku)})`
    );
    console.log(`   distance: ${hit.distance.toFixed(6)}`);
    console.log(`   relevance: ${hit.relevanceScore?.toFixed(6)}`);
    console.log(`   id: ${hit.id}`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 05 课运行失败: ${message}`);
  process.exitCode = 1;
});
