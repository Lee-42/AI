import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

const ScoreState = new StateSchema({
  score: z.number().min(0).max(100),
  passed: z.boolean().default(false),
  feedback: z.string().default("")
});

const evaluateScore: typeof ScoreState.Node = (state) => {
  return {
    passed: state.score >= 60
  };
};

const passFeedback: typeof ScoreState.Node = (state) => {
  return {
    feedback: `${state.score} 分，成绩及格。`
  };
};

const failFeedback: typeof ScoreState.Node = (state) => {
  return {
    feedback: `${state.score} 分，成绩未及格，请继续加油。`
  };
};

type ScoreRoute = "pass" | "fail";

function routeByResult(state: typeof ScoreState.State): ScoreRoute {
  return state.passed ? "pass" : "fail";
}

const graph = new StateGraph(ScoreState)
  .addNode("evaluate_score", evaluateScore)
  .addNode("pass_feedback", passFeedback)
  .addNode("fail_feedback", failFeedback)
  .addEdge(START, "evaluate_score")
  .addConditionalEdges("evaluate_score", routeByResult, {
    pass: "pass_feedback",
    fail: "fail_feedback"
  })
  .addEdge("pass_feedback", END)
  .addEdge("fail_feedback", END)
  .compile();

async function runCase(score: number) {
  const result = await graph.invoke({ score });

  console.log(`\nInput score: ${score}`);
  console.log(`Selected branch: ${result.passed ? "pass" : "fail"}`);
  console.log("Result:", result);
}

async function main() {
  console.log("Graph:");
  console.log("START -> evaluate_score -> pass_feedback -> END");
  console.log("                        \\-> fail_feedback -> END");

  await runCase(85);
  await runCase(45);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
