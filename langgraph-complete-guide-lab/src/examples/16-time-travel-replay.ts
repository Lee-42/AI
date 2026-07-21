import assert from "node:assert/strict";
import {
  END,
  MemorySaver,
  START,
  StateGraph,
  StateSchema
} from "@langchain/langgraph";
import { z } from "zod";

const TravelState = new StateSchema({
  base: z.number(),
  prepared: z.number().default(0),
  calculated: z.number().default(0),
  result: z.string().default("")
});

const runs = {
  prepare: 0,
  calculate: 0,
  format: 0
};

const prepare: typeof TravelState.Node = (state) => {
  runs.prepare += 1;
  console.log(`[prepare] 第 ${runs.prepare} 次执行`);
  return { prepared: state.base + 1 };
};

const calculate: typeof TravelState.Node = (state) => {
  runs.calculate += 1;
  console.log(`[calculate] 第 ${runs.calculate} 次执行`);
  return { calculated: state.prepared * 2 };
};

const format: typeof TravelState.Node = (state) => {
  runs.format += 1;
  console.log(`[format] 第 ${runs.format} 次执行`);
  return { result: `计算结果：${state.calculated}` };
};

const graph = new StateGraph(TravelState)
  .addNode("prepare", prepare)
  .addNode("calculate", calculate)
  .addNode("format", format)
  .addEdge(START, "prepare")
  .addEdge("prepare", "calculate")
  .addEdge("calculate", "format")
  .addEdge("format", END)
  .compile({ checkpointer: new MemorySaver() });

async function main() {
  const config = {
    configurable: { thread_id: "time-travel-001" }
  };

  console.log("## 首次运行完整 Graph");
  const firstResult = await graph.invoke({ base: 10 }, config);
  console.log("[result]", firstResult.result);

  const history = [];
  for await (const snapshot of graph.getStateHistory(config)) {
    history.push(snapshot);
  }

  const beforeCalculate = history.find((snapshot) =>
    snapshot.next.includes("calculate")
  );

  assert.ok(beforeCalculate, "没有找到 calculate 之前的 checkpoint");
  console.log(
    `\n[history] 选中 checkpoint，下一步：${beforeCalculate.next.join(", ")}`
  );

  console.log("\n## 从旧 checkpoint 重放");
  const replayResult = await graph.invoke(null, beforeCalculate.config);
  console.log("[result]", replayResult.result);

  assert.equal(firstResult.result, "计算结果：22");
  assert.equal(replayResult.result, "计算结果：22");
  assert.deepStrictEqual(runs, {
    prepare: 1,
    calculate: 2,
    format: 2
  });

  console.log("\n执行次数：", runs);
  console.log("prepare 没有重跑，checkpoint 之后的 Node 重新执行了。");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
