import { config } from "../config.js";
import { createTextEmbeddings } from "../embeddings/create-text-embeddings.js";
import { indexManualChunksInChroma } from "../indexing/index-manual-chunks-in-chroma.js";
import {
  MANUAL_CHUNK_OVERLAP,
  MANUAL_CHUNK_SIZE
} from "../indexing/manual-chunks.js";
import { searchChromaManuals } from "../retrieval/search-chroma-manuals.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import {
  getManualChunkIndexSummary,
  getOrCreateManualChunkCollection
} from "../vectorstores/manual-chunk-collection.js";

function excerpt(content: string): string {
  return content.replace(/\s+/g, " ").slice(0, 280);
}

async function main(): Promise<void> {
  const embeddingModel = config.ark.textEmbeddingModel;

  if (!embeddingModel) {
    throw new Error("ARK_TEXT_EMBEDDING_MODEL is required");
  }

  let totalTokens = 0;
  const embeddings = createTextEmbeddings({
    onRequestComplete: (metrics) => {
      totalTokens += metrics.totalTokens ?? metrics.promptTokens ?? 0;
    }
  });
  const client = createChromaClient();
  const collection = await getOrCreateManualChunkCollection(
    client,
    config.chroma.mode
  );
  const index = getManualChunkIndexSummary(
    collection,
    config.chroma.mode
  );
  const indexing = await indexManualChunksInChroma(
    collection,
    embeddings,
    embeddingModel
  );

  const question = "Aurora Studio 16 剪视频时应该选择哪个性能模式？";
  const hits = await searchChromaManuals(
    collection,
    embeddings,
    question,
    {
      k: 3,
      sku: "laptop-studio-16"
    }
  );

  console.log("13 长文本切片存储与向量查询");
  console.log("");
  console.log(`Collection: ${collection.name}`);
  console.log(`索引: ${index.indexType}/${index.space}`);
  console.log(
    `切片参数: chunkSize=${MANUAL_CHUNK_SIZE}, ` +
      `chunkOverlap=${MANUAL_CHUNK_OVERLAP}`
  );
  console.log(`说明书数量: ${indexing.sourceCount}`);
  console.log(`chunk 数量: ${indexing.indexedChunks}`);
  console.log(`chunk 长度: ${indexing.chunkLengths.join(", ")}`);
  console.log(`向量维度: ${indexing.dimension}`);
  console.log(
    `Collection 记录数: ${indexing.recordsBefore} -> ` +
      `${indexing.recordsAfter}`
  );
  console.log("");
  console.log(`问题: ${question}`);

  hits.forEach((hit, indexPosition) => {
    console.log(
      `${indexPosition + 1}. ${hit.id} ` +
        `distance=${hit.distance.toFixed(6)}`
    );
    console.log(
      `   source=${String(hit.metadata.source)} ` +
        `chunkIndex=${String(hit.metadata.chunkIndex)} ` +
        `startIndex=${String(hit.metadata.startIndex)}`
    );
    console.log(`   ${excerpt(hit.content)}`);
  });

  console.log("");
  console.log(`本次 Embedding 用量: ${totalTokens} tokens`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 13 课运行失败: ${message}`);
  process.exitCode = 1;
});
