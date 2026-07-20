import {
  END,
  GraphRecursionError,
  START,
  StateGraph,
  StateSchema
} from "@langchain/langgraph";
import { z } from "zod";

const MAX_ROUNDS = 3;
const RECURSION_LIMIT = 8;

const LoopState = new StateSchema({
  draft: z.string().default(""),
  feedback: z.string().default(""),
  rounds: z.number().int().nonnegative().default(0),
  modelCalls: z.number().int().nonnegative().default(0),
  status: z
    .enum(["running", "approved", "max_rounds", "failed"])
    .default("running"),
  errorMessage: z.string().default(""),
  neverApprove: z.boolean().default(false),
  simulateFailure: z.boolean().default(false)
});

const generate: typeof LoopState.Node = async (state) => {
  const rounds = state.rounds + 1;
  const modelCalls = state.modelCalls + 1;

  try {
    if (state.simulateFailure) {
      throw new Error("模拟：Generator 调用失败");
    }

    const draft =
      rounds === 1 || state.neverApprove
        ? "LangGraph 是一个工作流框架。"
        : "LangGraph 用 State 保存数据，由 Node 执行任务，通过 Edge 控制流程。";

    console.log(`[generate] round=${rounds}, calls=${modelCalls}`);
    console.log(`draft: ${draft}`);

    return { draft, rounds, modelCalls };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    return {
      rounds,
      modelCalls,
      status: "failed",
      errorMessage
    };
  }
};

const evaluate: typeof LoopState.Node = async (state) => {
  const modelCalls = state.modelCalls + 1;
  const approved =
    !state.neverApprove &&
    ["State", "Node", "Edge"].every((word) => state.draft.includes(word));
  const status = approved
    ? "approved"
    : state.rounds >= MAX_ROUNDS
      ? "max_rounds"
      : "running";
  const feedback = approved
    ? "符合标准。"
    : "请同时说明 State、Node 和 Edge。";

  console.log(`[evaluate] approved=${approved}, calls=${modelCalls}`);
  console.log(`feedback: ${feedback}\n`);

  return { feedback, modelCalls, status };
};

function routeAfterGenerate(state: typeof LoopState.State) {
  return state.status === "failed" ? "finish" : "evaluate";
}

function routeAfterEvaluate(state: typeof LoopState.State) {
  return state.status === "running" ? "revise" : "finish";
}

const graph = new StateGraph(LoopState)
  .addNode("generate", generate)
  .addNode("evaluate", evaluate)
  .addEdge(START, "generate")
  .addConditionalEdges("generate", routeAfterGenerate, {
    evaluate: "evaluate",
    finish: END
  })
  .addConditionalEdges("evaluate", routeAfterEvaluate, {
    revise: "generate",
    finish: END
  })
  .compile();

async function main() {
  const args = process.argv.slice(2);

  try {
    const result = await graph.invoke(
      {
        neverApprove: args.includes("--never-approve"),
        simulateFailure: args.includes("--fail")
      },
      { recursionLimit: RECURSION_LIMIT }
    );

    console.log(`Final status: ${result.status}`);
    console.log(`Rounds: ${result.rounds}/${MAX_ROUNDS}`);
    console.log(`Logical model calls: ${result.modelCalls}`);
    if (result.errorMessage) console.log(`Error: ${result.errorMessage}`);
  } catch (error: unknown) {
    if (error instanceof GraphRecursionError) {
      console.error("recursionLimit stopped an unexpected infinite loop.");
      return;
    }
    throw error;
  }
}

main().catch(console.error);
