import { createTextEmbeddings } from "../embeddings/create-text-embeddings.js";
import { loadProductDocuments } from "../indexing/product-documents.js";
import { searchMemoryProducts } from "../retrieval/search-memory-products.js";
import { createProductMemoryStore } from "../vectorstores/product-memory-store.js";

function productName(content: string): string {
  return content.split("\n")[0]?.replace("商品名: ", "") ?? "unknown";
}

async function main(): Promise<void> {
  // pnpm 在部分写法中会把独立的 "--" 继续传给脚本。
  const queryArguments = process.argv
    .slice(2)
    .filter((argument) => argument !== "--");
  const query =
    queryArguments.join(" ").trim() ||
    "屏幕不错并且方便出差携带的笔记本";

  const documents = await loadProductDocuments();
  const embeddings = createTextEmbeddings();
  const store = await createProductMemoryStore(embeddings, documents);
  const hits = await searchMemoryProducts(store, query, 3);

  console.log("02 利用豆包进行 Store 向量化模糊搜索");
  console.log("");
  console.log(`入库文档: ${documents.length}`);
  console.log(`查询: ${query}`);

  hits.forEach((hit, index) => {
    console.log("");
    console.log(
      `${index + 1}. ${productName(hit.content)} (${String(hit.metadata.sku)})`
    );
    console.log(`   similarity: ${hit.relevanceScore?.toFixed(6)}`);
    console.log(`   distance: ${hit.distance.toFixed(6)}`);
    console.log(
      `   category: ${String(hit.metadata.category)}, ` +
        `brand: ${String(hit.metadata.brand)}`
    );
    console.log(`   id: ${hit.id}`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 02 课运行失败: ${message}`);
  process.exitCode = 1;
});
