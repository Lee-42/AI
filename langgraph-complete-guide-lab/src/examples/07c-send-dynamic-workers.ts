import { END, START, Send, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

const TaskSchema = z.object({
  title: z.string(),
  instruction: z.string()
});
type Task = z.infer<typeof TaskSchema>;

const DispatchState = new StateSchema({
  tasks: z.array(TaskSchema).default([])
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
  const loadTasks: typeof DispatchState.Node = () => {
    console.log("[node] load_tasks");
    return { tasks: TASK_FIXTURE };
  };

  function dispatchWorkers(
    state: typeof DispatchState.State
  ): WorkerSend[] {
    console.log(`[send] dispatching ${state.tasks.length} workers`);

    return state.tasks.map(
      (task) => new Send("worker", { task })
    );
  }

  const worker = async (
    input: WorkerInput
  ): Promise<Record<string, never>> => {
    console.log(`[worker:start] ${input.task.title}`);

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    console.log(`[worker:end] ${input.task.title}`);
    return {};
  };

  return new StateGraph(DispatchState)
    .addNode("load_tasks", loadTasks)
    .addNode("worker", worker, { input: WorkerInputSchema })
    .addEdge(START, "load_tasks")
    .addConditionalEdges("load_tasks", dispatchWorkers, ["worker"])
    .addEdge("worker", END)
    .compile();
}

async function main() {
  console.log("Graph: load_tasks -> Send[N] -> worker[N] -> END\n");

  const graph = createGraph();
  const result = await graph.invoke({});

  console.log(`\nTasks dispatched: ${result.tasks.length}`);
  console.log("Worker state updates: 0 (下一节再汇总结果)");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
