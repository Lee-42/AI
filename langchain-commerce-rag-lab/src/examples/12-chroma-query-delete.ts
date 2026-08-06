import { config } from "../config.js";
import { deleteByWhereAfterPreview } from "../maintenance/delete-records-safely.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import {
  getOrCreateLesson12CrudCollection,
  LESSON12_TEMPORARY_ID,
  restoreLesson12TemporaryRecord,
  seedLesson12Records
} from "../vectorstores/lesson12-crud-fixture.js";

async function main(): Promise<void> {
  const client = createChromaClient();
  const collection = await getOrCreateLesson12CrudCollection(
    client,
    config.chroma.mode
  );
  const recordsBefore = await collection.count();
  await seedLesson12Records(collection);
  const recordsAfterSeed = await collection.count();

  const byId = await collection.get({
    ids: ["lesson12:product:air"],
    include: ["documents", "metadatas"]
  });
  const queryResult = await collection.query({
    queryEmbeddings: [[1, 0]],
    nResults: 2,
    include: ["documents", "distances"]
  });

  let deletedCount: number | undefined;
  let recordsAfterDelete = recordsAfterSeed;

  try {
    const deletion = await deleteByWhereAfterPreview(
      collection,
      {
        $and: [
          { lesson: { $eq: 12 } },
          { status: { $eq: "temporary" } }
        ]
      },
      [LESSON12_TEMPORARY_ID]
    );
    deletedCount = deletion.deletedCount;
    recordsAfterDelete = await collection.count();
  } finally {
    // 课程命令结束前恢复临时记录，保证下次运行结果一致。
    await restoreLesson12TemporaryRecord(collection);
  }

  const restored = await collection.get({
    ids: [LESSON12_TEMPORARY_ID]
  });
  const recordsAfterRestore = await collection.count();

  console.log("12 ChromaDB 查询、删除操作");
  console.log("");
  console.log(`Collection: ${collection.name}`);
  console.log(`初始化记录数: ${recordsBefore} -> ${recordsAfterSeed}`);
  console.log(`get(ids): ${byId.ids.join(", ")}`);
  console.log("query([1, 0]) 排名:");
  (queryResult.rows()[0] ?? []).forEach((row, index) => {
    if (typeof row.distance !== "number") {
      throw new Error(`Query result ${row.id} is missing distance`);
    }

    console.log(
      `${index + 1}. ${row.id} distance=${row.distance.toFixed(6)}`
    );
  });
  console.log("");
  console.log(`删除目标: ${LESSON12_TEMPORARY_ID}`);
  console.log(`服务端报告删除数: ${deletedCount ?? "未返回"}`);
  console.log(`删除后记录数: ${recordsAfterDelete}`);
  console.log(`恢复后记录数: ${recordsAfterRestore}`);
  console.log(`恢复验证: ${restored.ids.includes(LESSON12_TEMPORARY_ID)}`);
  console.log("豆包调用: 0");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 12 课运行失败: ${message}`);
  process.exitCode = 1;
});
