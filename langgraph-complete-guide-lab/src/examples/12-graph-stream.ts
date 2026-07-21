import assert from "node:assert/strict";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

const STEP_DELAY_MS = 1_000;

const StreamState = new StateSchema({
  topic: z.string(),
  refinedTopic: z.string().default(""),
  summary: z.string().default("")
});

async function waitForDemo(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, STEP_DELAY_MS));
}

const refineTopic: typeof StreamState.Node = async (state) => {
  await waitForDemo();
  return { refinedTopic: `${state.topic}（面向初学者）` };
};

const writeSummary: typeof StreamState.Node = async (state) => {
  await waitForDemo();
  return { summary: `用一个最小示例解释${state.refinedTopic}。` };
};

function elapsedSeconds(startedAt: number): string {
  return `+${((Date.now() - startedAt) / 1_000).toFixed(1)}s`;
}

const graph = new StateGraph(StreamState)
  .addNode("refine_topic", refineTopic)
  .addNode("write_summary", writeSummary)
  .addEdge(START, "refine_topic")
  .addEdge("refine_topic", "write_summary")
  .addEdge("write_summary", END)
  .compile();

async function main() {
  const input = { topic: "LangGraph stream" };
  const updateChunks: unknown[] = [];
  const valueChunks: Array<typeof StreamState.State> = [];

  console.log("## invoke: 等待完整结果");
  const invokeStartedAt = Date.now();
  const finalState = await graph.invoke(input);
  console.log(
    `[${elapsedSeconds(invokeStartedAt)}] ${JSON.stringify(finalState)}`
  );

  console.log("\n## streamMode: updates");
  const updatesStartedAt = Date.now();
  for await (const chunk of await graph.stream(input, {
    streamMode: "updates"
  })) {
    updateChunks.push(chunk);
    console.log(`[${elapsedSeconds(updatesStartedAt)}] ${JSON.stringify(chunk)}`);
  }

  console.log("\n## streamMode: values");
  const valuesStartedAt = Date.now();
  for await (const chunk of await graph.stream(input, {
    streamMode: "values"
  })) {
    valueChunks.push(chunk);
    console.log(`[${elapsedSeconds(valuesStartedAt)}] ${JSON.stringify(chunk)}`);
  }

  assert.deepStrictEqual(updateChunks, [
    {
      refine_topic: {
        refinedTopic: "LangGraph stream（面向初学者）"
      }
    },
    {
      write_summary: {
        summary: "用一个最小示例解释LangGraph stream（面向初学者）。"
      }
    }
  ]);
  assert.equal(finalState.summary, "用一个最小示例解释LangGraph stream（面向初学者）。");
  assert.equal(valueChunks.at(-1)?.summary, "用一个最小示例解释LangGraph stream（面向初学者）。");

  console.log("\ninvoke  -> 完成后一次返回最终 State");
  console.log("updates -> 每个 Node 的局部更新");
  console.log("values  -> 每个 step 后的完整 State");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
