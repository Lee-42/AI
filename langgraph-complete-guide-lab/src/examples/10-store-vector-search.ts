import assert from "node:assert/strict";
import { Embeddings } from "@langchain/core/embeddings";
import { InMemoryStore } from "@langchain/langgraph";

type SearchItem = Awaited<
  ReturnType<InMemoryStore["search"]>
>[number];

const TOPIC_WORDS = [
  ["吃", "饮食", "餐", "意大利面", "面食"],
  ["运动", "锻炼", "跑步", "散步", "健身"],
  ["学习", "编程", "typescript", "langgraph", "课程"]
] as const;

function toTopicVector(text: string): number[] {
  const normalized = text.toLowerCase();

  return TOPIC_WORDS.map((words) =>
    words.reduce(
      (count, word) => count + Number(normalized.includes(word)),
      0
    )
  );
}

// 仅用于零费用教学：真实项目应替换为真正的 Embedding 模型。
class LocalTopicEmbeddings extends Embeddings {
  constructor() {
    super({});
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    return documents.map(toTopicVector);
  }

  async embedQuery(query: string): Promise<number[]> {
    return toTopicVector(query);
  }
}

function printResults(query: string, results: SearchItem[]): void {
  console.log(`\nquery: ${query}`);
  results.forEach((item, index) => {
    const score = item.score?.toFixed(3) ?? "not indexed";
    console.log(
      `${index + 1}. ${item.key} score=${score} -> ${item.value.memory}`
    );
  });
}

async function main() {
  const namespace = ["users", "user-42", "memories"];
  const store = new InMemoryStore({
    index: {
      embeddings: new LocalTopicEmbeddings(),
      dims: TOPIC_WORDS.length,
      fields: ["memory"]
    }
  });

  await store.put(namespace, "food", {
    memory: "用户喜欢清淡的意大利面。",
    source: "dinner-chat"
  });
  await store.put(namespace, "exercise", {
    memory: "用户周末喜欢沿江跑步。",
    source: "weekend-plan"
  });
  await store.put(namespace, "learning", {
    memory: "用户正在学习 TypeScript 和 LangGraph。",
    source: "course-progress"
  });

  // 仍然保存 Item，但不为这条系统记录建立向量索引。
  await store.put(
    namespace,
    "internal",
    { memory: "内部同步版本 3", source: "system" },
    false
  );

  console.log("Store vector search (local 3D teaching embeddings)");
  console.log(`Indexed field: memory; namespace: ${namespace.join(" / ")}`);

  const exerciseResults = await store.search(namespace, {
    query: "用户平时喜欢什么运动？",
    limit: 2
  });
  const learningResults = await store.search(namespace, {
    query: "他最近在学习什么编程课程？",
    limit: 2
  });

  assert.equal(exerciseResults[0]?.key, "exercise");
  assert.equal(learningResults[0]?.key, "learning");
  assert.ok((exerciseResults[0]?.score ?? 0) > 0.99);
  assert.ok((learningResults[0]?.score ?? 0) > 0.99);

  printResults("用户平时喜欢什么运动？", exerciseResults);
  printResults("他最近在学习什么编程课程？", learningResults);

  const internalItem = await store.get(namespace, "internal");
  assert.equal(internalItem?.value.source, "system");

  console.log("\nExact get of unindexed Item:", internalItem?.value);
  console.log("\nSummary:");
  console.log("put -> save JSON Item + build vectors from selected fields");
  console.log("search(query) -> embed query + rank Items by similarity");
  console.log("result -> original Item + similarity score");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
