import { config } from "../config.js";
import {
  cosineDistance,
  innerProductDistance,
  squaredL2Distance
} from "../vector-math/distances.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import { COLLECTION_NAMES } from "../vectorstores/collection-names.js";
import {
  MINIMAL_QUERY_VECTOR,
  MINIMAL_VECTOR_RECORDS
} from "../vectorstores/minimal-vector-fixture.js";

async function main(): Promise<void> {
  const client = createChromaClient();
  const collection = await client.getCollection({
    name: COLLECTION_NAMES.lesson06Minimal
  });
  const indexConfiguration =
    config.chroma.mode === "cloud"
      ? collection.configuration.spann
      : collection.configuration.hnsw;

  if (indexConfiguration?.space !== "cosine") {
    throw new Error("第 07 课需要使用 cosine Collection");
  }

  const result = await collection.query({
    queryEmbeddings: [[...MINIMAL_QUERY_VECTOR]],
    nResults: 3,
    include: ["distances"]
  });
  const cloudDistances = new Map(
    (result.rows()[0] ?? []).map((row) => [row.id, row.distance])
  );

  console.log("07 向量数据库中的距离表示");
  console.log("");
  console.log("查询向量: [1, 0]");
  console.log("ID         squared-l2  cosine     inner-prod  Chroma");

  for (const record of MINIMAL_VECTOR_RECORDS) {
    const l2 = squaredL2Distance(
      MINIMAL_QUERY_VECTOR,
      record.embedding
    );
    const cosine = cosineDistance(
      MINIMAL_QUERY_VECTOR,
      record.embedding
    );
    const innerProduct = innerProductDistance(
      MINIMAL_QUERY_VECTOR,
      record.embedding
    );
    const cloud = cloudDistances.get(record.id);

    if (
      typeof cloud !== "number" ||
      Math.abs(cloud - cosine) > 0.000_001
    ) {
      throw new Error(
        `${record.id} 的手算 cosine distance 与 Chroma 不一致`
      );
    }

    console.log(
      `${record.id.padEnd(10)} ` +
        `${l2.toFixed(6).padEnd(11)} ` +
        `${cosine.toFixed(6).padEnd(10)} ` +
        `${innerProduct.toFixed(6).padEnd(11)} ` +
        cloud.toFixed(6)
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 07 课运行失败: ${message}`);
  process.exitCode = 1;
});
