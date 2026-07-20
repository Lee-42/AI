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

const ParallelState = new StateSchema({
  topic: z.string(),
  preparedTopic: z.string().default(""),
  researchNotes: z.array(z.string()).default(() => []),
  outline: z.array(z.string()).default(() => []),
  summary: z.string().default(""),
  trace: new ReducedValue(
    z.array(z.string()).default(() => []),
    {
      inputSchema: z.string(),
      reducer: (current, event) => [...current, event]
    }
  )
});

const prepare: typeof ParallelState.Node = (state) => {
  console.log("[prepare] sees trace:", state.trace);

  return {
    preparedTopic: state.topic.trim(),
    trace: "prepare"
  };
};

const research: typeof ParallelState.Node = async (state) => {
  console.log("[research:start] sees trace:", state.trace);
  await wait(80);
  console.log("[research:end]");

  return {
    researchNotes: [
      `${state.preparedTopic} 使用离散的 super-step 执行图。`,
      "同一步中的节点读取同一份已提交 State。"
    ],
    trace: "research"
  };
};

const buildOutline: typeof ParallelState.Node = async (state) => {
  console.log("[build_outline:start] sees trace:", state.trace);
  await wait(30);
  console.log("[build_outline:end]");

  return {
    outline: ["定义", "并行执行", "更新边界"],
    trace: "build_outline"
  };
};

const summarize: typeof ParallelState.Node = (state) => {
  console.log("[summarize] sees trace:", state.trace);
  console.log("[summarize] sees researchNotes:", state.researchNotes);
  console.log("[summarize] sees outline:", state.outline);

  return {
    summary: `已汇合 ${state.researchNotes.length} 条资料和 ${state.outline.length} 个提纲。`,
    trace: "summarize"
  };
};

const parallelGraph = new StateGraph(ParallelState)
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

const ConflictState = new StateSchema({
  sharedStatus: z.string()
});

const leftBranch: typeof ConflictState.Node = () => {
  return {
    sharedStatus: "left finished"
  };
};

const rightBranch: typeof ConflictState.Node = () => {
  return {
    sharedStatus: "right finished"
  };
};

const conflictGraph = new StateGraph(ConflictState)
  .addNode("left_branch", leftBranch)
  .addNode("right_branch", rightBranch)
  .addEdge(START, "left_branch")
  .addEdge(START, "right_branch")
  .addEdge("left_branch", END)
  .addEdge("right_branch", END)
  .compile();

async function runParallelDemo() {
  console.log("=== Demo 1: fan-out / fan-in super-step ===");
  console.log("                         /-> research -------\\");
  console.log("START -> prepare -------|                     |-> summarize -> END");
  console.log("                         \\-> build_outline --/");

  const result = await parallelGraph.invoke({
    topic: "LangGraph super-step"
  });

  console.log("Final state:", result);
  console.log(
    "research 和 build_outline 都只看见 prepare，summarize 才看见两者合并后的更新。"
  );
}

async function runConflictDemo() {
  console.log("\n=== Demo 2: 同一步写普通字段会冲突 ===");

  try {
    await conflictGraph.invoke({
      sharedStatus: "started"
    });
    console.log("Unexpected: conflict graph completed.");
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.log("Caught expected error:", errorName);
    console.log(errorMessage.split("\n")[0]);
  }
}

async function main() {
  await runParallelDemo();
  await runConflictDemo();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
