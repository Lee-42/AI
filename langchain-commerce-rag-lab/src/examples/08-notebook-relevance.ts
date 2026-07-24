import { createTextEmbeddings } from "../embeddings/create-text-embeddings.js";
import { diagnoseProductQueries } from "../evaluation/query-diagnostics.js";
import { cosineDistance } from "../vector-math/distances.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import { COLLECTION_NAMES } from "../vectorstores/collection-names.js";

const QUERIES = [
  { id: "ambiguous", text: "笔记本" },
  { id: "screen-short", text: "笔记本屏幕不错" },
  { id: "screen-good", text: "这台笔记本屏幕很好" },
  { id: "screen-bad", text: "这台笔记本屏幕很差" },
  { id: "paper", text: "A5纸质笔记本适合手写记录" }
] as const;

function requireDiagnostic<T>(
  value: T | undefined,
  id: string
): T {
  if (!value) {
    throw new Error(`缺少诊断结果 ${id}`);
  }

  return value;
}

async function main(): Promise<void> {
  let totalTokens = 0;
  const embeddings = createTextEmbeddings({
    onRequestComplete: (metrics) => {
      totalTokens += metrics.totalTokens ?? metrics.promptTokens ?? 0;
    }
  });
  const client = createChromaClient();
  const collection = await client.getCollection({
    name: COLLECTION_NAMES.productText
  });
  const diagnostics = await diagnoseProductQueries(
    collection,
    embeddings,
    [...QUERIES],
    3
  );
  const byId = new Map(
    diagnostics.map((diagnostic) => [diagnostic.id, diagnostic])
  );
  const ambiguous = requireDiagnostic(byId.get("ambiguous"), "ambiguous");
  const screenShort = requireDiagnostic(
    byId.get("screen-short"),
    "screen-short"
  );
  const screenGood = requireDiagnostic(
    byId.get("screen-good"),
    "screen-good"
  );
  const screenBad = requireDiagnostic(
    byId.get("screen-bad"),
    "screen-bad"
  );

  console.log("08 为什么“笔记本屏幕不错”和“笔记本”毫不相关？");
  console.log("");
  console.log("短语向量对照");
  console.log(
    `“笔记本” ↔ “笔记本屏幕不错”: ` +
      cosineDistance(
        ambiguous.queryVector,
        screenShort.queryVector
      ).toFixed(6)
  );
  console.log(
    `“屏幕很好” ↔ “屏幕很差”: ` +
      cosineDistance(
        screenGood.queryVector,
        screenBad.queryVector
      ).toFixed(6)
  );
  console.log("");
  console.log("商品检索对照");

  for (const diagnostic of diagnostics) {
    const first = diagnostic.hits[0];
    const second = diagnostic.hits[1];

    if (!first || !second) {
      throw new Error(`查询 ${diagnostic.id} 返回的商品不足 2 个`);
    }

    console.log(`查询: ${diagnostic.text}`);
    console.log(
      `  Top 1: ${String(first.metadata.sku)} ` +
        `distance=${first.distance.toFixed(6)}`
    );
    console.log(
      `  Top 2: ${String(second.metadata.sku)} ` +
        `distance=${second.distance.toFixed(6)}`
    );
    console.log(`  Top gap: ${diagnostic.topGap?.toFixed(6)}`);
  }

  console.log("");
  console.log(`本次用量: ${totalTokens} tokens`);
  console.log("Chroma 写入: 0");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 08 课运行失败: ${message}`);
  process.exitCode = 1;
});
