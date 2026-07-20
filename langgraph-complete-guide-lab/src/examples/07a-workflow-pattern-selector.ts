import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

const WorkflowPatternSchema = z.enum([
  "prompt_chaining",
  "parallelization",
  "routing",
  "orchestrator_worker",
  "evaluator_optimizer"
]);
type WorkflowPattern = z.infer<typeof WorkflowPatternSchema>;

const WorkflowRequirementsSchema = z.object({
  name: z.string().min(1),
  // 固定且存在前后依赖的阶段数量。
  fixedOrderedSteps: z.number().int().min(0).default(0),
  // 已知、相互独立且最终全部需要完成的任务数量。
  independentTasksRequired: z.number().int().min(0).default(0),
  // 已知的互斥分支数量；一次只选择其中一个。
  mutuallyExclusiveRoutes: z.number().int().min(0).default(0),
  // 子任务内容或数量只能在运行时确定。
  dynamicSubtasksAtRuntime: z.boolean().default(false),
  // 结果需要接受评价，并携带反馈重新生成。
  iterativeQualityGate: z.boolean().default(false),
  // 仅在开启质量循环时有业务意义。
  maxIterations: z.number().int().min(1).default(1)
});
type WorkflowRequirements = z.infer<typeof WorkflowRequirementsSchema>;

const AdvisorState = new StateSchema({
  ...WorkflowRequirementsSchema.shape,
  primaryPattern: WorkflowPatternSchema.default("prompt_chaining"),
  reason: z.string().default(""),
  supportingPatterns: z.array(WorkflowPatternSchema).default([]),
  recommendation: z.string().default("")
});

type ExplanationNode =
  | "explain_prompt_chaining"
  | "explain_parallelization"
  | "explain_routing"
  | "explain_orchestrator_worker"
  | "explain_evaluator_optimizer";

const PATTERN_TO_NODE = {
  prompt_chaining: "explain_prompt_chaining",
  parallelization: "explain_parallelization",
  routing: "explain_routing",
  orchestrator_worker: "explain_orchestrator_worker",
  evaluator_optimizer: "explain_evaluator_optimizer"
} as const satisfies Record<WorkflowPattern, ExplanationNode>;

type PatternCard = {
  displayName: string;
  keyQuestion: string;
  graphShape: string;
  costShape: string;
  mainRisk: string;
};

const PATTERN_CARDS = {
  prompt_chaining: {
    displayName: "Prompt Chaining",
    keyQuestion: "后一步是否必须依赖前一步的结果？",
    graphShape: "step_1 -> step_2 -> ... -> step_k",
    costShape: "约 K 个顺序阶段；等待时间通常累加",
    mainRisk: "链条过长会累积延迟，前序错误也会向后传播"
  },
  parallelization: {
    displayName: "Parallelization",
    keyQuestion: "多个已知独立任务是否全部都要完成？",
    graphShape: "fan-out -> known parallel tasks -> fan-in",
    costShape: "约 K 个任务调用；理想等待时间接近最慢分支",
    mainRisk: "并发写同一 State 字段需要 reducer，外部调用不能自动回滚"
  },
  routing: {
    displayName: "Routing",
    keyQuestion: "是否只需要从多个已知专用流程中选择一个？",
    graphShape: "classify -> one selected branch -> END",
    costShape: "路由成本 + 被选分支成本；未选分支不执行",
    mainRisk: "错误分类会把请求送入错误分支，模糊输入需要回退策略"
  },
  orchestrator_worker: {
    displayName: "Orchestrator-worker",
    keyQuestion: "子任务的内容或数量是否只能在运行时确定？",
    graphShape: "plan -> dynamic workers -> synthesize",
    costShape: "规划 + N 个动态 Worker + 汇总；N 在运行时确定",
    mainRisk: "需要限制动态任务规模，并处理部分失败与结果聚合"
  },
  evaluator_optimizer: {
    displayName: "Evaluator-optimizer",
    keyQuestion: "是否有明确质量标准，并允许根据反馈反复改进？",
    graphShape: "generate -> evaluate -> accept / feedback loop",
    costShape: "每轮通常包含生成和评价，成本随迭代次数增长",
    mainRisk: "必须设置终止条件和最大轮数，避免无限循环"
  }
} as const satisfies Record<WorkflowPattern, PatternCard>;

type PatternRule = {
  pattern: WorkflowPattern;
  matches: (requirements: WorkflowRequirements) => boolean;
  reason: (requirements: WorkflowRequirements) => string;
};

// 先识别基础拓扑；Evaluator-optimizer 可以作为独立模式，也常作为质量层叠加。
// 这个顺序只服务于教学输出，不代表所有系统都存在统一的架构优先级。
const SELECTION_RULES: readonly PatternRule[] = [
  {
    pattern: "orchestrator_worker",
    matches: (requirements) => requirements.dynamicSubtasksAtRuntime,
    reason: () => "子任务的内容或数量只能在运行时确定"
  },
  {
    pattern: "routing",
    matches: (requirements) => requirements.mutuallyExclusiveRoutes >= 2,
    reason: (requirements) =>
      `需要从 ${requirements.mutuallyExclusiveRoutes} 个互斥分支中选择一个`
  },
  {
    pattern: "parallelization",
    matches: (requirements) => requirements.independentTasksRequired >= 2,
    reason: (requirements) =>
      `${requirements.independentTasksRequired} 个已知独立任务都必须完成`
  },
  {
    pattern: "prompt_chaining",
    matches: (requirements) => requirements.fixedOrderedSteps >= 2,
    reason: (requirements) =>
      `${requirements.fixedOrderedSteps} 个固定阶段存在前后依赖`
  },
  {
    pattern: "evaluator_optimizer",
    matches: (requirements) => requirements.iterativeQualityGate,
    reason: (requirements) =>
      `结果需要接受评价并携带反馈重做，最多 ${requirements.maxIterations} 轮`
  }
];

function selectPatterns(requirements: WorkflowRequirements) {
  const matches = SELECTION_RULES.filter((rule) =>
    rule.matches(requirements)
  );

  if (matches.length === 0) {
    throw new Error(
      `“${requirements.name}”没有匹配复杂工作流；单个 Node 可能已经足够。`
    );
  }

  const [primary, ...supporting] = matches;

  return {
    primaryPattern: primary.pattern,
    reason: primary.reason(requirements),
    supportingPatterns: supporting.map((rule) => rule.pattern)
  };
}

function createGraph() {
  // 这个 Node 只执行确定性规则，不调用 LLM。
  const analyzeRequirements: typeof AdvisorState.Node = (state) => {
    console.log("[node] analyze_requirements");
    const requirements = WorkflowRequirementsSchema.parse(state);
    return selectPatterns(requirements);
  };

  // Router 只读取选型结果，并跳转到对应说明 Node。
  function routeToExplanation(
    state: typeof AdvisorState.State
  ): WorkflowPattern {
    console.log(`[route] ${state.primaryPattern}`);
    return state.primaryPattern;
  }

  function buildRecommendation(
    state: typeof AdvisorState.State,
    pattern: WorkflowPattern
  ) {
    const card = PATTERN_CARDS[pattern];
    const supporting = state.supportingPatterns.map(
      (item) => PATTERN_CARDS[item].displayName
    );

    return {
      recommendation: [
        `主要模式：${card.displayName}`,
        `判断依据：${state.reason}`,
        `关键问题：${card.keyQuestion}`,
        `图形结构：${card.graphShape}`,
        `调用形态：${card.costShape}`,
        `主要风险：${card.mainRisk}`,
        `可组合模式：${supporting.length > 0 ? supporting.join("、") : "无"}`
      ].join("\n")
    };
  }

  const explainPromptChaining: typeof AdvisorState.Node = (state) => {
    console.log("[node] explain_prompt_chaining");
    return buildRecommendation(state, "prompt_chaining");
  };

  const explainParallelization: typeof AdvisorState.Node = (state) => {
    console.log("[node] explain_parallelization");
    return buildRecommendation(state, "parallelization");
  };

  const explainRouting: typeof AdvisorState.Node = (state) => {
    console.log("[node] explain_routing");
    return buildRecommendation(state, "routing");
  };

  const explainOrchestratorWorker: typeof AdvisorState.Node = (state) => {
    console.log("[node] explain_orchestrator_worker");
    return buildRecommendation(state, "orchestrator_worker");
  };

  const explainEvaluatorOptimizer: typeof AdvisorState.Node = (state) => {
    console.log("[node] explain_evaluator_optimizer");
    return buildRecommendation(state, "evaluator_optimizer");
  };

  return new StateGraph(AdvisorState)
    .addNode("analyze_requirements", analyzeRequirements)
    .addNode("explain_prompt_chaining", explainPromptChaining)
    .addNode("explain_parallelization", explainParallelization)
    .addNode("explain_routing", explainRouting)
    .addNode("explain_orchestrator_worker", explainOrchestratorWorker)
    .addNode("explain_evaluator_optimizer", explainEvaluatorOptimizer)
    .addEdge(START, "analyze_requirements")
    .addConditionalEdges(
      "analyze_requirements",
      routeToExplanation,
      PATTERN_TO_NODE
    )
    .addEdge("explain_prompt_chaining", END)
    .addEdge("explain_parallelization", END)
    .addEdge("explain_routing", END)
    .addEdge("explain_orchestrator_worker", END)
    .addEdge("explain_evaluator_optimizer", END)
    .compile();
}

const SCENARIOS: z.input<typeof WorkflowRequirementsSchema>[] = [
  {
    name: "清洗、翻译、审校邮件",
    fixedOrderedSteps: 3
  },
  {
    name: "同时检查文档的事实、格式和敏感信息",
    independentTasksRequired: 3
  },
  {
    name: "按问题类型选择产品、退款或技术支持",
    mutuallyExclusiveRoutes: 3
  },
  {
    name: "根据主题动态规划并生成调研报告章节",
    dynamicSubtasksAtRuntime: true
  },
  {
    name: "反复评价并优化广告文案",
    iterativeQualityGate: true,
    maxIterations: 3
  },
  {
    name: "动态规划报告章节，并对结果反复质检",
    dynamicSubtasksAtRuntime: true,
    iterativeQualityGate: true,
    maxIterations: 2
  }
];

async function main() {
  console.log("Workflow pattern advisor (deterministic; no LLM)\n");
  console.log("Graph: analyze_requirements -> one explanation node -> END");

  const graph = createGraph();

  for (const [index, input] of SCENARIOS.entries()) {
    const requirements = WorkflowRequirementsSchema.parse(input);
    console.log(`\n=== ${index + 1}. ${requirements.name} ===`);
    const result = await graph.invoke(requirements);
    console.log(result.recommendation);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
