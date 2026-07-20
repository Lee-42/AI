import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { getActiveModelConfig } from "../config.js";
import { createChatModel, requireActiveModelConfig } from "../provider.js";

const TaskSchema = z.object({
  title: z.string().describe("任务标题"),
  instruction: z.string().describe("Worker 要完成的具体工作")
});

const PlanSchema = z.object({
  tasks: z.array(TaskSchema).min(2).max(4)
});

type Plan = z.infer<typeof PlanSchema>;
type PlanGenerator = (topic: string) => Promise<Plan>;

const PlannerState = new StateSchema({
  topic: z.string().min(1),
  tasks: z.array(TaskSchema).default([])
});

function createLlmPlanGenerator(): PlanGenerator {
  const activeModel = requireActiveModelConfig();
  const model = createChatModel(activeModel, 0);
  const planner = model.withStructuredOutput(PlanSchema, {
    name: "plan_learning_tasks",
    method: "jsonMode"
  });

  return (topic) =>
    planner.invoke([
      new SystemMessage(
        [
          "你是一个任务规划器，只负责拆解任务，不执行任务。",
          "把主题拆成 2 到 4 个可以分别交给 Worker 的任务。",
          "每项任务只包含简短的 title 和明确的 instruction。",
          "如果任务涉及代码示例，指定使用 TypeScript。",
          "只返回符合约定 Schema 的 JSON 对象。"
        ].join("\n")
      ),
      new HumanMessage(`请规划这个主题：${topic}`)
    ]);
}

function createMockPlanGenerator(): PlanGenerator {
  return async (topic) => ({
    tasks: [
      {
        title: "解释核心概念",
        instruction: `用初学者能理解的语言解释“${topic}”是什么。`
      },
      {
        title: "给出最小示例",
        instruction: `为“${topic}”提供一个最小、可运行的例子。`
      },
      {
        title: "总结使用边界",
        instruction: `总结“${topic}”适合与不适合的场景。`
      }
    ]
  });
}

function createGraph(generatePlan: PlanGenerator) {
  const orchestrator: typeof PlannerState.Node = async (state) => {
    console.log("[node] orchestrator");
    const plan = await generatePlan(state.topic);
    return { tasks: plan.tasks };
  };

  return new StateGraph(PlannerState)
    .addNode("orchestrator", orchestrator)
    .addEdge(START, "orchestrator")
    .addEdge("orchestrator", END)
    .compile();
}

async function main() {
  const args = process.argv.slice(2);
  const useMock = args.includes("--mock");
  const topic =
    args
      .filter((argument) => argument !== "--mock" && argument !== "--")
      .join(" ")
      .trim() || "LangGraph 的 Orchestrator-worker 模式";
  const activeModel = getActiveModelConfig();

  if (!useMock && !activeModel.apiKey) {
    console.log(`Missing ${activeModel.apiKeyName}.`);
    console.log("Configure an LLM, or run: pnpm lesson:07b -- --mock");
    return;
  }

  const generatePlan = useMock
    ? createMockPlanGenerator()
    : createLlmPlanGenerator();
  const graph = createGraph(generatePlan);

  console.log(`Mode: ${useMock ? "mock planner" : `${activeModel.provider}/${activeModel.model}`}`);
  console.log("Graph: START -> orchestrator -> END");
  console.log(`Topic: ${topic}`);

  const result = await graph.invoke({ topic });

  console.log("\n# Orchestrator 生成的任务计划");
  result.tasks.forEach((task, index) => {
    console.log(`\n${index + 1}. ${task.title}`);
    console.log(`   ${task.instruction}`);
  });

  console.log("\nWorkers started: 0 (下一节再用 Send 分发这些任务)");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
