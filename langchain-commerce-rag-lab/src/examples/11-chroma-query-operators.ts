import type { Where, WhereDocument } from "chromadb";
import { config } from "../config.js";
import { createTextEmbeddings } from "../embeddings/create-text-embeddings.js";
import {
  getChromaProducts,
  type ChromaProductRecord
} from "../retrieval/get-chroma-products.js";
import { searchChromaProducts } from "../retrieval/search-chroma-products.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import { getOrCreateProductTextCollection } from "../vectorstores/product-text-collection.js";

function skus(records: ChromaProductRecord[]): string {
  return records
    .map((record) => String(record.metadata.sku))
    .sort()
    .join(", ");
}

async function main(): Promise<void> {
  let totalTokens = 0;
  const client = createChromaClient();
  const collection = await getOrCreateProductTextCollection(
    client,
    config.chroma.mode
  );

  if (await collection.count() === 0) {
    throw new Error("商品 Collection 为空，请先运行 pnpm lesson:05");
  }

  const laptops = await getChromaProducts(collection, {
    // 直接写值等价于 { $eq: "laptop" }。
    where: { category: "laptop" }
  });
  const priceConditions: Where[] = [
    { price: { $gte: 6000 } },
    { price: { $lte: 8000 } },
    { inStock: true }
  ];
  const priceRange: Where = { $and: priceConditions };
  const affordableInStock = await getChromaProducts(collection, {
    where: priceRange
  });
  const selectedBrands = await getChromaProducts(collection, {
    where: {
      brand: { $in: ["Northstar", "Paperwork"] }
    }
  });
  const eitherEnd = await getChromaProducts(collection, {
    where: {
      $or: [
        { price: { $lt: 100 } },
        { price: { $gt: 9000 } }
      ]
    }
  });
  const mobileOfficeDocument = {
    $contains: "移动办公"
  } satisfies WhereDocument;
  const fullTextMatches = await getChromaProducts(collection, {
    whereDocument: mobileOfficeDocument
  });

  const embeddings = createTextEmbeddings({
    onRequestComplete: (metrics) => {
      totalTokens += metrics.totalTokens ?? metrics.promptTokens ?? 0;
    }
  });
  const exactPriceHits = await searchChromaProducts(
    collection,
    embeddings,
    "售价 6999 元的笔记本电脑",
    3,
    { where: { price: { $eq: 6999 } } }
  );

  console.log("11 ChromaDB 中的查询操作符");
  console.log("");
  console.log(`category = laptop: ${skus(laptops)}`);
  console.log(`6000 <= price <= 8000 且有货: ${skus(affordableInStock)}`);
  console.log(`brand in [Northstar, Paperwork]: ${skus(selectedBrands)}`);
  console.log(`price < 100 或 price > 9000: ${skus(eitherEnd)}`);
  console.log(`document contains 移动办公: ${skus(fullTextMatches)}`);
  console.log("");
  console.log("向量查询 + 精确价格过滤");
  exactPriceHits.forEach((hit, index) => {
    console.log(
      `${index + 1}. ${String(hit.metadata.sku)} ` +
        `price=${String(hit.metadata.price)} ` +
        `distance=${hit.distance.toFixed(6)}`
    );
  });
  console.log("");
  console.log(`本次 Embedding 用量: ${totalTokens} tokens`);
  console.log("Chroma 写入: 0");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 11 课运行失败: ${message}`);
  process.exitCode = 1;
});
