import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { getActiveModelConfig } from "../config.js";
import { createChatModel, requireActiveModelConfig } from "../provider.js";

const MAX_ATTEMPTS = 3;

const EvaluationSchema = z.object({
  approved: z.boolean().describe("是否满足全部评价标准"),
  feedback: z.string().describe("具体、可执行的评价或修改建议")
});
type Evaluation = z.infer<typeof EvaluationSchema>;

const OptimizerState = new StateSchema({
  topic: z.string().min(1),
  draft: z.string().default(""),
  feedback: z.string().default(""),
  approved: z.boolean().default(false),
  attempts: z.number().int().nonnegative().default(0)
});

type GeneratorInput = {
  topic: string;
  previousDraft: string;
  feedback: string;
  attempt: number;
};

type DraftGenerator = (input: GeneratorInput) => Promise<string>;
type DraftEvaluator = (draft: string) => Promise<Evaluation>;

function createLlmServices(): {
  generateDraft: DraftGenerator;
  evaluateDraft: DraftEvaluator;
} {
  const activeModel = requireActiveModelConfig();
  const generatorModel = createChatModel(activeModel, 0.5);
  const evaluatorModel = createChatModel(activeModel, 0);
  const structuredEvaluator = evaluatorModel.withStructuredOutput(
    EvaluationSchema,
    {
      name: "evaluate_langgraph_intro",
      method: "jsonMode"
    }
  );

  return {
    generateDraft: async (input) => {
      const task = input.feedback
        ? [
            `请修改这段介绍：${input.previousDraft}`,
            `评价反馈：${input.feedback}`
          ].join("\n")
        : `请为“${input.topic}”写一句简洁的中文介绍。`;
      const response = await generatorModel.invoke([
        new SystemMessage("只返回修改后的介绍正文，不要解释修改过程。"),
        new HumanMessage(task)
      ]);

      if (typeof response.content !== "string") {
        throw new Error("Generator did not return text content.");
      }

      return response.content.trim();
    },
    evaluateDraft: (draft) =>
      structuredEvaluator.invoke([
        new SystemMessage(
          [
            "你是严格的内容评价器。",
            "通过标准：介绍不超过 80 个字符，并且同时出现 State、Node、Edge。",
            "未通过时给出具体、可执行的修改建议。",
            "JSON 只能包含 approved（布尔值）和 feedback（字符串）两个字段。",
            "只返回符合约定 Schema 的 JSON 对象。"
          ].join("\n")
        ),
        new HumanMessage(`待评价内容：${draft}`)
      ])
  };
}

function createMockServices(): {
  generateDraft: DraftGenerator;
  evaluateDraft: DraftEvaluator;
} {
  return {
    generateDraft: async (input) =>
      input.feedback
        ? "LangGraph 用 State 保存数据，由 Node 执行任务，并通过 Edge 控制流程。"
        : "LangGraph 是一个用于构建可控大模型工作流的框架。",
    evaluateDraft: async (draft) => {
      const missing = ["State", "Node", "Edge"].filter(
        (keyword) => !draft.includes(keyword)
      );
      const problems = [
        ...(missing.length > 0
          ? [`缺少关键词：${missing.join("、")}`]
          : []),
        ...(draft.length > 80 ? ["内容超过 80 个字符"] : [])
      ];

      return {
        approved: problems.length === 0,
        feedback:
          problems.length === 0 ? "符合全部标准。" : problems.join("；")
      };
    }
  };
}

function createGraph(
  generateDraft: DraftGenerator,
  evaluateDraft: DraftEvaluator
) {
  const generate: typeof OptimizerState.Node = async (state) => {
    const attempt = state.attempts + 1;
    const draft = await generateDraft({
      topic: state.topic,
      previousDraft: state.draft,
      feedback: state.feedback,
      attempt
    });

    console.log(`[generate] attempt=${attempt}`);
    console.log(`draft: ${draft}`);

    return {
      draft,
      approved: false,
      attempts: attempt
    };
  };

  const evaluate: typeof OptimizerState.Node = async (state) => {
    const evaluation = await evaluateDraft(state.draft);

    console.log(`[evaluate] approved=${evaluation.approved}`);
    console.log(`feedback: ${evaluation.feedback}`);

    return evaluation;
  };

  type EvaluationRoute = "revise" | "finish";

  function routeAfterEvaluation(
    state: typeof OptimizerState.State
  ): EvaluationRoute {
    const route =
      state.approved || state.attempts >= MAX_ATTEMPTS
        ? "finish"
        : "revise";

    console.log(`[route] ${route}\n`);
    return route;
  }

  return new StateGraph(OptimizerState)
    .addNode("generate", generate)
    .addNode("evaluate", evaluate)
    .addEdge(START, "generate")
    .addEdge("generate", "evaluate")
    .addConditionalEdges("evaluate", routeAfterEvaluation, {
      revise: "generate",
      finish: END
    })
    .compile();
}

async function main() {
  const args = process.argv.slice(2);
  const useMock = args.includes("--mock");
  const topic =
    args
      .filter((argument) => argument !== "--mock" && argument !== "--")
      .join(" ")
      .trim() || "LangGraph";
  const activeModel = getActiveModelConfig();

  if (!useMock && !activeModel.apiKey) {
    console.log(`Missing ${activeModel.apiKeyName}.`);
    console.log("Configure an LLM, or run: pnpm lesson:07e -- --mock");
    return;
  }

  const services = useMock ? createMockServices() : createLlmServices();
  const graph = createGraph(
    services.generateDraft,
    services.evaluateDraft
  );

  console.log(`Mode: ${useMock ? "mock" : `${activeModel.provider}/${activeModel.model}`}`);
  console.log("Graph: generate -> evaluate -> revise or END\n");

  const result = await graph.invoke({ topic });

  console.log(`Final status: ${result.approved ? "approved" : "attempt limit reached"}`);
  console.log(`Attempts: ${result.attempts}`);
  console.log(`Final draft: ${result.draft}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
