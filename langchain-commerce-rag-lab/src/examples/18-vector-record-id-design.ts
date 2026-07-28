import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import {
  auditVectorRecordIds,
  buildImageRecordId,
  buildProductRecordId,
  parseVectorRecordId
} from "../domain/vector-record-id.js";
import { loadManualChunkDocuments } from "../indexing/manual-chunks.js";
import { loadProductDocuments } from "../indexing/product-documents.js";
import { createChromaClient } from "../vectorstores/chroma-client.js";
import { COLLECTION_NAMES } from "../vectorstores/collection-names.js";

function sameIdSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  return (
    leftSet.size === rightSet.size &&
    [...leftSet].every((id) => rightSet.has(id))
  );
}

async function main(): Promise<void> {
  const [productDocuments, manualDocuments] = await Promise.all([
    loadProductDocuments(),
    loadManualChunkDocuments("lesson-18-id-audit")
  ]);
  const expectedProductIds = productDocuments.map(
    (document) => document.id as string
  );
  const expectedManualIds = manualDocuments.map(
    (document) => document.id as string
  );
  const exampleManualId = expectedManualIds[0];

  if (!exampleManualId) {
    throw new Error("说明书切片为空，无法演示 manual ID。");
  }

  const client = createChromaClient();
  const [productCollection, manualCollection] = await Promise.all([
    client.getCollection({
      name: COLLECTION_NAMES.productText
    }),
    client.getCollection({
      name: COLLECTION_NAMES.manualChunks
    })
  ]);
  const [storedProducts, storedManuals] = await Promise.all([
    // 只读取 ID 和 metadata；本课不会计算向量或写入 Collection。
    productCollection.get({ include: ["metadatas"] }),
    manualCollection.get({ include: ["metadatas"] })
  ]);
  const productAudit = auditVectorRecordIds(storedProducts.ids);
  const manualAudit = auditVectorRecordIds(storedManuals.ids);

  const stableId = buildProductRecordId("laptop-air-14");
  const stableRecordCount = new Set([stableId, stableId]).size;
  const randomRecordCount = new Set([randomUUID(), randomUUID()]).size;
  const futureImageId = buildImageRecordId(
    "laptop-studio-16",
    "front"
  );

  console.log("18 向量存储的 ID 设计");
  console.log("");
  console.log("生产 ID 规则");
  console.log(`商品: ${stableId}`);
  console.log(`说明书: ${exampleManualId}`);
  console.log(`图片: ${futureImageId}`);
  console.log("");
  console.log("解析示例");
  [stableId, exampleManualId, futureImageId].forEach((id) => {
    const parsed = parseVectorRecordId(id);
    console.log(
      `${parsed.id} -> kind=${parsed.kind} sku=${parsed.sku} ` +
        `role=${parsed.role}`
    );
  });
  console.log("");
  console.log("为什么不用随机 UUID");
  console.log(`稳定 ID 重复两次后的唯一记录数: ${stableRecordCount}`);
  console.log(`随机 UUID 重复两次后的唯一记录数: ${randomRecordCount}`);
  console.log("");
  console.log("Chroma Cloud 只读审计");
  console.log(
    `${productCollection.name}: total=${productAudit.total} ` +
      `valid=${productAudit.valid} expectedMatch=` +
      `${sameIdSet(storedProducts.ids, expectedProductIds)}`
  );
  console.log(
    `${manualCollection.name}: total=${manualAudit.total} ` +
      `valid=${manualAudit.valid} expectedMatch=` +
      `${sameIdSet(storedManuals.ids, expectedManualIds)}`
  );
  console.log(
    `重复 ID: ${[
      ...productAudit.duplicateIds,
      ...manualAudit.duplicateIds
    ].length}`
  );
  console.log(
    `非法 ID: ${[
      ...productAudit.invalidIds,
      ...manualAudit.invalidIds
    ].length}`
  );
  console.log("");
  console.log(`连接模式: ${config.chroma.mode}`);
  console.log("豆包调用: 0");
  console.log("Chroma 写入: 0");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`第 18 课运行失败: ${message}`);
  process.exitCode = 1;
});
