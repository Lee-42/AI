import { config } from "../config.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";

const COLLECTION_NAME = "course_lesson06_minimal_v1";

async function main(): Promise<void> {
  const client = createChromaClient();
  const collection = await client.getOrCreateCollection({
    name: COLLECTION_NAME,
    embeddingFunction: null,
    configuration:
      config.chroma.mode === "cloud"
        ? { spann: { space: "cosine" } }
        : { hnsw: { space: "cosine" } },
    metadata: {
      purpose: "lesson-06-minimal-example",
      dimension: 2
    }
  });
  const recordsBefore = await collection.count();

  // 三个二维向量分别表示东、东北和北。
  await collection.upsert({
    ids: ["east", "northeast", "north"],
    embeddings: [
      [1, 0],
      [1, 1],
      [0, 1]
    ],
    documents: ["正东方向", "东北方向", "正北方向"],
    metadatas: [
      { direction: "east" },
      { direction: "northeast" },
      { direction: "north" }
    ]
  });

  const recordsAfter = await collection.count();
  const result = await collection.query({
    queryEmbeddings: [[1, 0]],
    nResults: 3,
    include: ["documents", "distances"]
  });
  const rows = result.rows()[0] ?? [];

  console.log("06 ChromaDB 最简案例");
  console.log("");
  console.log(`Collection: ${collection.name}`);
  console.log(`记录数: ${recordsBefore} -> ${recordsAfter}`);
  console.log("查询向量: [1, 0]（正东）");

  rows.forEach((row, index) => {
    if (!row.document || typeof row.distance !== "number") {
      throw new Error(`查询结果 ${row.id} 缺少 document 或 distance`);
    }

    console.log(
      `${index + 1}. ${row.document} ` +
        `vector-id=${row.id} distance=${row.distance.toFixed(6)}`
    );
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 06 课运行失败: ${message}`);
  process.exitCode = 1;
});
