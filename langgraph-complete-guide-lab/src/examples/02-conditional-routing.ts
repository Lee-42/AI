import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

const ExamState = new StateSchema({
  name: z.string(),
  score: z.number().min(0).max(100),
  passed: z.boolean().default(false),
  feedback: z.string().default("")
});

// Node：计算判断依据，并把结果作为局部更新写回 State。
const evaluateScore: typeof ExamState.Node = (state) => {
  const passed = state.score >= 60;

  console.log(
    `[node] evaluate_score: ${state.score} -> ${passed ? "通过" : "未通过"}`
  );

  return { passed };
};

type ExamRoute = "pass" | "retry";

// Router：只选择路径，不返回 State 更新。
function chooseBranch(state: typeof ExamState.State): ExamRoute {
  const route = state.passed ? "pass" : "retry";

  console.log(`[route] ${route}`);

  return route;
}

const celebrate: typeof ExamState.Node = (state) => {
  console.log("[node] celebrate");

  return {
    feedback: `${state.name}，恭喜通过！`
  };
};

const encourage: typeof ExamState.Node = (state) => {
  console.log("[node] encourage");

  return {
    feedback: `${state.name}，还差 ${60 - state.score} 分，继续加油！`
  };
};

const graph = new StateGraph(ExamState)
  .addNode("evaluate_score", evaluateScore)
  .addNode("celebrate", celebrate)
  .addNode("encourage", encourage)
  .addEdge(START, "evaluate_score")
  .addConditionalEdges("evaluate_score", chooseBranch, {
    pass: "celebrate",
    retry: "encourage"
  })
  .addEdge("celebrate", END)
  .addEdge("encourage", END)
  .compile();

async function runCase(name: string, score: number) {
  console.log(`\n=== ${name}：${score} 分 ===`);

  const result = await graph.invoke({ name, score });

  console.log("Result:", result);
}

async function main() {
  console.log("Graph:");
  console.log("                         pass -> celebrate -> END");
  console.log("START -> evaluate_score");
  console.log("                         retry -> encourage -> END");

  await runCase("小李", 85);
  await runCase("小王", 42);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
