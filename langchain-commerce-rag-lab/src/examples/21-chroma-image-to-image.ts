import { config } from "../config.js";
import { createMultimodalEmbeddings } from "../embeddings/create-multimodal-embeddings.js";
import { loadProductImageRecords } from "../indexing/product-images.js";
import { searchChromaImagesByImage } from "../retrieval/search-chroma-images-by-image.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import { getOrCreateProductImageCollection } from "../vectorstores/product-image-collection.js";

function commandImageUrl(defaultUrl: string): string {
  return (
    process.argv
      .slice(2)
      .find((argument) => argument !== "--")
      ?.trim() || defaultUrl
  );
}

async function main(): Promise<void> {
  const embeddingModel = config.ark.multimodalEmbeddingModel;

  if (!embeddingModel) {
    throw new Error("ARK_MULTIMODAL_EMBEDDING_MODEL is required");
  }

  const imageRecords = await loadProductImageRecords();
  const defaultImageUrl = imageRecords[0]?.uri;

  if (!defaultImageUrl) {
    throw new Error("No product image is available as the default query");
  }

  const queryImageUrl = commandImageUrl(defaultImageUrl);
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
  const recordCount = await collection.count();

  if (recordCount === 0) {
    throw new Error(
      "Image collection is empty; run pnpm lesson:19 once to build the image index"
    );
  }

  const hits = await searchChromaImagesByImage(
    collection,
    embeddings,
    queryImageUrl,
    3
  );

  console.log("21 ChromaDB 实现图搜图");
  console.log("");
  console.log(`Collection: ${collection.name}`);
  console.log(`Collection 图片记录: ${recordCount}`);
  console.log(`查询图片: ${queryImageUrl}`);
  console.log(`Embedding API 请求数: ${requestCount}`);
  console.log(`本次用量: ${totalTokens} tokens`);
  console.log(`实际模型: ${[...actualModels].join(", ")}`);

  hits.forEach((hit, index) => {
    const isSameImage = hit.uri === queryImageUrl;

    console.log("");
    console.log(
      `${index + 1}. ${String(hit.metadata.visualDescription)}`
    );
    console.log(`   sku: ${String(hit.metadata.sku)}`);
    console.log(`   distance: ${hit.distance.toFixed(6)}`);
    console.log(`   id: ${hit.id}`);
    console.log(`   uri: ${hit.uri}`);

    if (isSameImage) {
      console.log("   说明: 查询图就是这条记录，因此它是合理的第一名");
    }
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 21 课运行失败: ${message}`);
  process.exitCode = 1;
});
