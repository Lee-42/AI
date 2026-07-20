import {
  END,
  ReducedValue,
  START,
  StateGraph,
  StateSchema
} from "@langchain/langgraph";
import { z } from "zod";

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const StreamState = new StateSchema({
  topic: z.string(),
  phase: z.string().default("received"),
  researchNotes: z.array(z.string()).default(() => []),
  outlineSections: z.array(z.string()).default(() => []),
  summary: z.string().default(""),
  trace: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      inputSchema: z.string(),
      reducer: (current, event) => [...current, event]
    }
  )
});

const prepare: typeof StreamState.Node = () => {
  return {
    phase: "prepared",
    trace: "prepare"
  };
};

const research: typeof StreamState.Node = async (state) => {
  await wait(50);

  return {
    researchNotes: [
      `${state.topic} 可以使用 updates 观察节点增量。`,
      `${state.topic} 可以使用 values 观察完整 State。`
    ],
    trace: "research"
  };
};

const buildOutline: typeof StreamState.Node = async () => {
  await wait(10);

  return {
    outlineSections: ["updates", "values", "执行边界"],
    trace: "build_outline"
  };
};

const summarize: typeof StreamState.Node = (state) => {
  return {
    phase: "completed",
    summary: `已汇合 ${state.researchNotes.length} 条资料和 ${state.outlineSections.length} 个章节。`,
    trace: "summarize"
  };
};

const graph = new StateGraph(StreamState)
  .addNode("prepare", prepare)
  .addNode("research", research)
  .addNode("build_outline", buildOutline)
  .addNode("summarize", summarize)
  .addEdge(START, "prepare")
  .addEdge("prepare", "research")
  .addEdge("prepare", "build_outline")
  .addEdge(["research", "build_outline"], "summarize")
  .addEdge("summarize", END)
  .compile();

async function main() {
  console.log("Graph:");
  console.log("                         /-> research -------\\");
  console.log("START -> prepare -------|                     |-> summarize -> END");
  console.log("                         \\-> build_outline --/");
  console.log("");
  console.log("updates: Node 返回的局部 State Update");
  console.log("values:  执行边界合并后的完整 State");

  const stream = await graph.stream(
    {
      topic: "LangGraph State stream"
    },
    {
      streamMode: ["updates", "values"]
    }
  );

  let index = 0;

  for await (const [mode, payload] of stream) {
    console.log(`\n--- chunk ${index}: ${mode} ---`);
    console.dir(payload, { depth: null });
    index += 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
