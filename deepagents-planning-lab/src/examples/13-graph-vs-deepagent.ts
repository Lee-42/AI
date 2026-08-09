import { END, START, Annotation, StateGraph } from "@langchain/langgraph";
import { createDeepAgent } from "deepagents";
import { FakeToolCallingModel, tool } from "langchain";
import { z } from "zod";
import { getToolObservations } from "../offload.js";

type ArchitectureChoice =
  | "plain-code"
  | "langchain-agent"
  | "langgraph"
  | "deep-agents"
  | "hybrid";

type Scenario = {
  name: string;
  needsLlm: boolean;
  openEnded: boolean;
  needsPlanning: boolean;
  largeContext: boolean;
  needsSubagents: boolean;
  exactOrder: boolean;
  durableResume: boolean;
  explicitHumanGate: boolean;
  expected: ArchitectureChoice;
};

function chooseArchitecture(scenario: Scenario): {
  choice: ArchitectureChoice;
  reasons: string[];
} {
  if (!scenario.needsLlm) {
    return {
      choice: "plain-code",
      reasons: ["需求是确定性计算，不需要模型决策"]
    };
  }

  const deepSignals = [
    scenario.openEnded,
    scenario.needsPlanning,
    scenario.largeContext,
    scenario.needsSubagents
  ];
  const graphSignals = [
    scenario.exactOrder,
    scenario.durableResume,
    scenario.explicitHumanGate
  ];
  const needsDeepHarness = deepSignals.filter(Boolean).length >= 2;
  const needsGraphControl = graphSignals.some(Boolean);

  if (needsDeepHarness && needsGraphControl) {
    return {
      choice: "hybrid",
      reasons: [
        "开放式工作需要 Deep Agents 工作台",
        "关键路径同时需要 LangGraph 的确定性控制"
      ]
    };
  }
  if (needsDeepHarness) {
    return {
      choice: "deep-agents",
      reasons: ["任务开放且需要规划、上下文工程或子 Agent"]
    };
  }
  if (needsGraphControl) {
    return {
      choice: "langgraph",
      reasons: ["流程顺序、恢复或人工门禁需要显式建模"]
    };
  }

  return {
    choice: "langchain-agent",
    reasons: ["只需要轻量模型—工具循环，不需要完整 Harness 或自定义状态图"]
  };
}

const scenarios: Scenario[] = [
  {
    name: "汇率换算函数",
    needsLlm: false,
    openEnded: false,
    needsPlanning: false,
    largeContext: false,
    needsSubagents: false,
    exactOrder: false,
    durableResume: false,
    explicitHumanGate: false,
    expected: "plain-code"
  },
  {
    name: "订单状态问答",
    needsLlm: true,
    openEnded: false,
    needsPlanning: false,
    largeContext: false,
    needsSubagents: false,
    exactOrder: false,
    durableResume: false,
    explicitHumanGate: false,
    expected: "langchain-agent"
  },
  {
    name: "付款审批流程",
    needsLlm: true,
    openEnded: false,
    needsPlanning: false,
    largeContext: false,
    needsSubagents: false,
    exactOrder: true,
    durableResume: true,
    explicitHumanGate: true,
    expected: "langgraph"
  },
  {
    name: "十万字尽调研究",
    needsLlm: true,
    openEnded: true,
    needsPlanning: true,
    largeContext: true,
    needsSubagents: true,
    exactOrder: false,
    durableResume: false,
    explicitHumanGate: false,
    expected: "deep-agents"
  },
  {
    name: "企业发布审查",
    needsLlm: true,
    openEnded: true,
    needsPlanning: true,
    largeContext: true,
    needsSubagents: false,
    exactOrder: true,
    durableResume: true,
    explicitHumanGate: true,
    expected: "hybrid"
  }
];

const HybridState = Annotation.Root({
  releaseId: Annotation<string>(),
  validInput: Annotation<boolean>(),
  risk: Annotation<"NONE" | "P1">(),
  evidenceId: Annotation<string>(),
  decision: Annotation<"APPROVE" | "HOLD" | "REJECT">(),
  trace: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => []
  })
});

let evidenceToolCalls = 0;

const inspectReleaseEvidence = tool(
  async ({ releaseId }) => {
    evidenceToolCalls += 1;
    return JSON.stringify({
      releaseId,
      apiTests: { passed: 128, total: 128 },
      migrationRehearsal: { passed: 48, total: 50 },
      openP1: 1,
      evidenceId: "RELEASE-EVIDENCE-2026-11"
    });
  },
  {
    name: "inspect_release_evidence",
    description: "综合读取发布批次的测试、迁移演练和未关闭风险证据。",
    schema: z.object({ releaseId: z.string() })
  }
);

const analystModel = new FakeToolCallingModel({
  toolCalls: [
    [
      {
        name: "inspect_release_evidence",
        args: { releaseId: "REL-2026-11" },
        id: "inspect-release"
      }
    ],
    []
  ]
});

const deepAnalyst = createDeepAgent({
  name: "release-evidence-analyst",
  model: analystModel,
  tools: [inspectReleaseEvidence],
  systemPrompt:
    "分析发布证据并识别风险。只负责发现事实，不得自行批准或拒绝发布。"
});

const hybridWorkflow = new StateGraph(HybridState)
  .addNode("validate_input", (state) => ({
    validInput: /^REL-\d{4}-\d{2}$/.test(state.releaseId),
    trace: ["LangGraph:validate_input"]
  }))
  .addNode("deep_agent_analysis", async (state) => {
    const result = await deepAnalyst.invoke({
      messages: [
        {
          role: "user",
          content: `分析 ${state.releaseId} 的发布证据，只报告事实和风险。`
        }
      ]
    });
    const evidenceObservation = getToolObservations(result.messages).find(
      (observation) => observation.name === "inspect_release_evidence"
    );
    if (!evidenceObservation) throw new Error("Deep Agent 没有读取发布证据。 ");

    const evidence = JSON.parse(evidenceObservation.content) as {
      releaseId: string;
      migrationRehearsal: { passed: number; total: number };
      openP1: number;
      evidenceId: string;
    };
    const hasBlockingRisk =
      evidence.openP1 > 0 ||
      evidence.migrationRehearsal.passed < evidence.migrationRehearsal.total;

    return {
      risk: hasBlockingRisk ? ("P1" as const) : ("NONE" as const),
      evidenceId: evidence.evidenceId,
      trace: ["DeepAgents:analyze_evidence"]
    };
  })
  .addNode("policy_gate", (state) => ({
    decision: !state.validInput
      ? ("REJECT" as const)
      : state.risk === "P1"
        ? ("HOLD" as const)
        : ("APPROVE" as const),
    trace: ["LangGraph:policy_gate"]
  }))
  .addEdge(START, "validate_input")
  .addConditionalEdges("validate_input", (state) =>
    state.validInput ? "deep_agent_analysis" : "policy_gate"
  )
  .addEdge("deep_agent_analysis", "policy_gate")
  .addEdge("policy_gate", END)
  .compile();

async function main() {
  const decisions = scenarios.map((scenario) => ({
    scenario,
    result: chooseArchitecture(scenario)
  }));
  for (const { scenario, result } of decisions) {
    if (result.choice !== scenario.expected) {
      throw new Error(
        `${scenario.name} 选型错误：预期 ${scenario.expected}，实际 ${result.choice}`
      );
    }
  }

  const hybridResult = await hybridWorkflow.invoke({
    releaseId: "REL-2026-11",
    trace: []
  });
  if (
    hybridResult.decision !== "HOLD" ||
    hybridResult.risk !== "P1" ||
    hybridResult.evidenceId !== "RELEASE-EVIDENCE-2026-11" ||
    evidenceToolCalls !== 1
  ) {
    throw new Error("Hybrid 流程验收失败。 ");
  }
  if (
    hybridResult.trace.join(" → ") !==
    "LangGraph:validate_input → DeepAgents:analyze_evidence → LangGraph:policy_gate"
  ) {
    throw new Error(`Hybrid 路径异常：${hybridResult.trace.join(" → ")}`);
  }

  console.log("13 LangGraph 与 Deep Agents 应用场景实验");
  console.log("\n架构选型（教学启发式，不是通用评分标准）");
  for (const { scenario, result } of decisions) {
    console.log(`- ${scenario.name}：${result.choice}｜${result.reasons.join("；")}`);
  }
  console.log("\nHybrid 实际执行");
  console.log(`路径：${hybridResult.trace.join(" → ")}`);
  console.log(`Deep Agent 证据工具调用：${evidenceToolCalls}`);
  console.log(`风险：${hybridResult.risk}`);
  console.log(`证据：${hybridResult.evidenceId}`);
  console.log(`确定性门禁结论：${hybridResult.decision}`);
  console.log("模型 API 调用：0（Deep Agent 节点使用 FakeToolCallingModel）");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
