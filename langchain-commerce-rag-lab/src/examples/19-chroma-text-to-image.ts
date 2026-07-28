import { config } from "../config.js";
import { createMultimodalEmbeddings } from "../embeddings/create-multimodal-embeddings.js";
import { indexProductImagesInChroma } from "../indexing/index-product-images-in-chroma.js";
import { searchChromaImagesByText } from "../retrieval/search-chroma-images-by-text.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import { getOrCreateProductImageCollection } from "../vectorstores/product-image-collection.js";

function commandQuery(): string {
  return (
    process.argv
      .slice(2)
      .filter((argument) => argument !== "--")
      .join(" ")
      .trim() ||
    "银白色超薄笔记本电脑，打开摆在木桌上，黑色键盘和大触控板"
  );
}

async function main(): Promise<void> {
  const embeddingModel = config.ark.multimodalEmbeddingModel;

  if (!embeddingModel) {
    throw new Error("ARK_MULTIMODAL_EMBEDDING_MODEL is required");
  }

  const query = commandQuery();
  let requestCount = 0;
  let totalTokens = 0;
  const actualModels = new Set<string>();
  const embeddings = createMultimodalEmbeddings({
    onRequestComplete: (metrics) => {
      requestCount += 1;
      totalTokens += metrics.totalTokens ?? metrics.promptTokens ?? 0;
      actualModels.add(metrics.model);
    }
  });
  const collection = await getOrCreateProductImageCollection(
    createChromaClient(),
    config.chroma.mode,
    embeddingModel
  );
  const indexing = await indexProductImagesInChroma(
    collection,
    embeddings,
    embeddingModel
  );
  const hits = await searchChromaImagesByText(
    collection,
    embeddings,
    query,
    3
  );

  console.log("19 ChromaDB 实现文搜图");
  console.log("");
  console.log(`Collection: ${collection.name}`);
  console.log(
    `图片记录: ${indexing.recordsBefore} -> ${indexing.recordsAfter}`
  );
  console.log(`本次 upsert: ${indexing.indexedRecords}`);
  console.log(`向量维度: ${indexing.dimension}`);
  console.log(`查询文字: ${query}`);
  console.log(`Embedding API 请求数: ${requestCount}`);
  console.log(`本次用量: ${totalTokens} tokens`);
  console.log(`实际模型: ${[...actualModels].join(", ")}`);

  hits.forEach((hit, index) => {
    console.log("");
    console.log(
      `${index + 1}. ${String(hit.metadata.visualDescription)}`
    );
    console.log(`   sku: ${String(hit.metadata.sku)}`);
    console.log(`   distance: ${hit.distance.toFixed(6)}`);
    console.log(`   id: ${hit.id}`);
    console.log(`   uri: ${hit.uri}`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 19 课运行失败: ${message}`);
  process.exitCode = 1;
});
