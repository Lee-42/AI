import assert from "node:assert/strict";
import { InMemoryStore, type Item } from "@langchain/langgraph";

type ItemSnapshot = {
  namespace: string[];
  key: string;
  value: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function requireItem(item: Item | null, label: string): Item {
  if (item === null) {
    throw new Error(`${label}: expected an Item, received null`);
  }

  return item;
}

function snapshotItem(item: Item): ItemSnapshot {
  return {
    namespace: [...item.namespace],
    key: item.key,
    value: structuredClone(item.value),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

async function waitUntilAfter(timestampMs: number): Promise<void> {
  const waitMs = Math.max(2, timestampMs - Date.now() + 2);
  await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
}

async function main() {
  const store = new InMemoryStore();
  const namespace = ["users", "user-42", "preferences"];
  const styleKey = "assistant-style";

  console.log("Store Item basics (no Graph, no LLM)\n");
  console.log(`Address = ${JSON.stringify(namespace)} + ${styleKey}`);

  console.log("\n1. put + get: create one Item");
  await store.put(namespace, styleKey, {
    language: "zh-CN",
    tone: "concise",
    legacyFormat: true
  });

  const createdItem = requireItem(
    await store.get(namespace, styleKey),
    "created item"
  );

  // InMemoryStore may update an Item object in place. Capture scalar values and
  // a deep-cloned printable snapshot before updating the same address.
  const createdAtMs = createdItem.createdAt.getTime();
  const firstUpdatedAtMs = createdItem.updatedAt.getTime();
  const createdSnapshot = snapshotItem(createdItem);
  console.log(JSON.stringify(createdSnapshot, null, 2));

  console.log("\n2. same address + put: update instead of append");
  await waitUntilAfter(firstUpdatedAtMs);
  await store.put(namespace, styleKey, {
    language: "zh-CN",
    tone: "step-by-step"
  });

  const updatedItem = requireItem(
    await store.get(namespace, styleKey),
    "updated item"
  );
  const updatedSnapshot = snapshotItem(updatedItem);

  const updateFacts = {
    createdAtPreserved: updatedItem.createdAt.getTime() === createdAtMs,
    updatedAtAdvanced: updatedItem.updatedAt.getTime() > firstUpdatedAtMs,
    wholeValueWasReplaced: !("legacyFormat" in updatedItem.value)
  };

  assert.deepStrictEqual(updatedItem.namespace, namespace);
  assert.equal(updatedItem.key, styleKey);
  assert.deepStrictEqual(updatedItem.value, {
    language: "zh-CN",
    tone: "step-by-step"
  });
  assert.deepStrictEqual(updateFacts, {
    createdAtPreserved: true,
    updatedAtAdvanced: true,
    wholeValueWasReplaced: true
  });

  console.log(JSON.stringify(updatedSnapshot, null, 2));
  console.log("Update facts:", updateFacts);

  console.log("\n3. search without query: list Items under the namespace prefix");
  await store.put(namespace, "timezone", {
    timeZone: "Asia/Shanghai"
  });

  const items = await store.search(namespace, { limit: 10 });
  const sortedItems = [...items].sort((left, right) =>
    left.key.localeCompare(right.key)
  );

  assert.equal(sortedItems.length, 2);
  console.log(JSON.stringify(sortedItems.map(snapshotItem), null, 2));

  console.log("\n4. delete + get: missing addresses return null");
  await store.delete(namespace, styleKey);
  const deletedItem = await store.get(namespace, styleKey);
  const remainingItems = await store.search(namespace, { limit: 10 });

  assert.equal(deletedItem, null);
  assert.deepStrictEqual(
    remainingItems.map((item) => item.key),
    ["timezone"]
  );

  console.log("Deleted item:", deletedItem);
  console.log("Remaining keys:", remainingItems.map((item) => item.key));

  console.log("\nSummary:");
  console.log("namespace + key -> one address");
  console.log("put -> create or replace the value at that address");
  console.log("get/search/delete -> read, list, and remove Store Items");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
