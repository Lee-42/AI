import {
  END,
  START,
  ReducedValue,
  Send,
  StateGraph,
  StateSchema
} from "@langchain/langgraph";
import { z } from "zod";

const TaskSchema = z.object({
  title: z.string(),
  instruction: z.string()
});
type Task = z.infer<typeof TaskSchema>;

const ResultSchema = z.object({
  title: z.string(),
  output: z.string()
});
type Result = z.infer<typeof ResultSchema>;

const OverallState = new StateSchema({
  tasks: z.array(TaskSchema).default([]),
  results: new ReducedValue(
    z.array(ResultSchema).default(() => []),
    {
      inputSchema: ResultSchema,
      reducer: (current, next) => [...current, next]
    }
  ),
  summary: z.string().default("")
});

const WorkerInputSchema = z.object({
  task: TaskSchema
});
type WorkerInput = z.infer<typeof WorkerInputSchema>;

const TASK_FIXTURE: Task[] = [
  {
    title: "解释核心概念",
    instruction: "解释 Orchestrator-worker 模式是什么。"
  },
  {
    title: "给出最小示例",
    instruction: "提供一个 TypeScript 最小示例。"
  },
  {
    title: "总结使用边界",
    instruction: "总结这种模式适合与不适合的场景。"
  }
];

type WorkerSend = Send<"worker", WorkerInput>;

function createGraph() {
  const loadTasks: typeof OverallState.Node = () => {
    console.log("[node] load_tasks");
    return { tasks: TASK_FIXTURE };
  };

  function dispatchWorkers(
    state: typeof OverallState.State
  ): WorkerSend[] {
    console.log(`[send] dispatching ${state.tasks.length} workers`);

    return state.tasks.map(
      (task) => new Send("worker", { task })
    );
  }

  const worker = (
    input: WorkerInput
  ): { results: Result } => {
    console.log(`[worker] ${input.task.title}`);

    return {
      results: {
        title: input.task.title,
        output: `已完成：${input.task.instruction}`
      }
    };
  };

  const summarize: typeof OverallState.Node = (state) => {
    console.log(`[node] summarize results=${state.results.length}`);

    return {
      summary: state.results
        .map((result) => `- ${result.title}：${result.output}`)
        .join("\n")
    };
  };

  return new StateGraph(OverallState)
    .addNode("load_tasks", loadTasks)
    .addNode("worker", worker, { input: WorkerInputSchema })
    .addNode("summarize", summarize)
    .addEdge(START, "load_tasks")
    .addConditionalEdges("load_tasks", dispatchWorkers, ["worker"])
    .addEdge("worker", "summarize")
    .addEdge("summarize", END)
    .compile();
}

async function main() {
  console.log(
    "Graph: load_tasks -> Send[N] -> worker[N] -> reducer -> summarize -> END\n"
  );

  const graph = createGraph();
  const result = await graph.invoke({});

  console.log(`\nReducer collected: ${result.results.length} results`);
  console.log("\nSummary:\n");
  console.log(result.summary);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
