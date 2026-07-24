import { createTextEmbeddings } from "../embeddings/create-text-embeddings.js";
import { loadEvaluationQueries } from "../evaluation/evaluation-queries.js";
import {
  evaluateRankings,
  rankSkusByCosine
} from "../evaluation/retrieval-metrics.js";
import { loadProductDocuments } from "../indexing/product-documents.js";

function formatMetric(value: number): string {
  return value.toFixed(3);
}

async function main(): Promise<void> {
  let totalTokens = 0;
  const embeddings = createTextEmbeddings({
    onRequestComplete: (metrics) => {
      totalTokens += metrics.totalTokens ?? metrics.promptTokens ?? 0;
    }
  });
  const [documents, queries] = await Promise.all([
    loadProductDocuments(),
    loadEvaluationQueries()
  ]);
  const skus = documents.map((document) => document.metadata.sku);
  const nameOnlyContents = documents.map((document) => {
    return document.pageContent.split("\n")[0] as string;
  });
  const richContents = documents.map((document) => document.pageContent);

  // 两个版本共用同一批查询向量，保证 A/B 比较公平。
  const allVectors = await embeddings.embedDocuments([
    ...nameOnlyContents,
    ...richContents,
    ...queries.map((query) => query.query)
  ]);
  const documentCount = documents.length;
  const nameOnlyVectors = allVectors.slice(0, documentCount);
  const richVectors = allVectors.slice(documentCount, documentCount * 2);
  const queryVectors = allVectors.slice(documentCount * 2);

  const nameOnlyRankings = queries.map((query, index) => ({
    queryId: query.id,
    rankedSkus: rankSkusByCosine(
      skus,
      nameOnlyVectors,
      queryVectors[index] as number[]
    ).map((item) => item.sku)
  }));
  const richRankings = queries.map((query, index) => ({
    queryId: query.id,
    rankedSkus: rankSkusByCosine(
      skus,
      richVectors,
      queryVectors[index] as number[]
    ).map((item) => item.sku)
  }));
  const nameOnlyEvaluation = evaluateRankings(
    queries,
    nameOnlyRankings,
    3
  );
  const richEvaluation = evaluateRankings(queries, richRankings, 3);

  console.log("09 如何提升向量数据库的检索精度");
  console.log("");
  console.log("A/B 内容模板");
  console.log(
    `只索引商品名: Recall@1=${formatMetric(nameOnlyEvaluation.recallAt1)} ` +
      `Recall@3=${formatMetric(nameOnlyEvaluation.recallAtK)} ` +
      `MRR=${formatMetric(nameOnlyEvaluation.mrr)}`
  );
  console.log(
    `丰富商品内容: Recall@1=${formatMetric(richEvaluation.recallAt1)} ` +
      `Recall@3=${formatMetric(richEvaluation.recallAtK)} ` +
      `MRR=${formatMetric(richEvaluation.mrr)}`
  );
  console.log("");
  console.log("逐条结果");

  queries.forEach((query, index) => {
    const nameTop1 = nameOnlyRankings[index]?.rankedSkus[0];
    const richTop1 = richRankings[index]?.rankedSkus[0];
    const expected = query.expectedSkus.join("|");

    console.log(
      `${query.id}: expected=${expected} ` +
        `name-only=${nameTop1} rich=${richTop1}`
    );
  });

  const unresolved = richEvaluation.results
    .filter((result) => !result.passedAt1)
    .map((result) => result.queryId);

  console.log("");
  console.log(
    `丰富模板仍未解决: ${unresolved.length > 0 ? unresolved.join(", ") : "无"}`
  );
  console.log(`本次用量: ${totalTokens} tokens`);
  console.log("Chroma 读写: 0");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 09 课运行失败: ${message}`);
  process.exitCode = 1;
});
