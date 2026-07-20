import { END, START, Send, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

const PlannedSectionSchema = z.object({
  sectionId: z.string().regex(/^section-\d{2}$/),
  order: z.number().int().positive(),
  title: z.string().min(2).max(80),
  objective: z.string().min(10).max(300),
  deliverable: z.string().min(5).max(200),
  keyPoints: z.array(z.string().min(2).max(120)).min(2).max(4),
  acceptanceCriteria: z.array(z.string().min(3).max(160)).min(1).max(3),
  targetWords: z.number().int().min(100).max(1_200)
});
type PlannedSection = z.infer<typeof PlannedSectionSchema>;

const DispatchState = new StateSchema({
  topic: z.string().min(1).max(1_000),
  requestedSections: z.number().int().min(2).max(5),
  approvedSections: z.array(PlannedSectionSchema).default([]),
  dispatchSummary: z.string().default("")
});

// Send 可以为目标 Node 提供与主图不同的输入 State。
const WorkerInputSchema = z.object({
  topic: z.string().min(1).max(1_000),
  section: PlannedSectionSchema
});
type WorkerInput = z.infer<typeof WorkerInputSchema>;

function createSection(
  order: number,
  title: string,
  objective: string,
  deliverable: string,
  keyPoints: string[],
  acceptanceCriteria: string[],
  targetWords: number
): PlannedSection {
  return PlannedSectionSchema.parse({
    sectionId: `section-${String(order).padStart(2, "0")}`,
    order,
    title,
    objective,
    deliverable,
    keyPoints,
    acceptanceCriteria,
    targetWords
  });
}

// 这组数据模拟 07B 已校验通过的 approvedPlan.sections。
const APPROVED_SECTION_FIXTURE: PlannedSection[] = [
  createSection(
    1,
    "明确业务目标与边界",
    "从用户、输入、输出和成功标准四个角度定义工作流真正需要解决的问题。",
    "一份业务目标、非目标和成功指标清单",
    ["目标用户与触发条件", "输入输出契约", "成功与失败指标"],
    ["至少包含两个可衡量成功指标"],
    280
  ),
  createSection(
    2,
    "选择最小可行工作流模式",
    "根据步骤依赖、分支选择和任务动态程度，选择满足需求的最小控制流结构。",
    "一张带选择依据的模式决策表",
    ["Prompt Chaining", "并行与路由", "动态 Orchestrator"],
    ["说明采用模式及至少一个被排除模式的理由"],
    360
  ),
  createSection(
    3,
    "设计 State 与节点契约",
    "明确每个 Node 读取和写入的数据，并为并发字段和错误路径设计状态契约。",
    "State 字段表与 Node 读写矩阵",
    ["字段所有权", "输入输出 Schema", "错误状态"],
    ["每个 State 字段都有明确写入者"],
    380
  ),
  createSection(
    4,
    "控制成本、规模与失败",
    "为模型调用、动态 Worker 数量、超时和失败降级建立可执行的资源边界。",
    "一份预算和失败处理检查表",
    ["调用与 token 预算", "Worker 数量上限", "超时与降级"],
    ["包含最大 Worker 数和总调用预算"],
    320
  ),
  createSection(
    5,
    "验证与观测工作流",
    "设计可重复的测试、日志和追踪方式，验证控制流和最终业务结果。",
    "测试场景与可观测性方案",
    ["正常与异常路径测试", "Node 级日志", "端到端验收"],
    ["同时覆盖成功、部分失败和超限场景"],
    300
  )
];

type PreviewWorkerSend = Send<"preview_worker", WorkerInput>;

function createGraph() {
  const loadApprovedPlan: typeof DispatchState.Node = (state) => {
    console.log("[node] load_approved_plan");

    const approvedSections = APPROVED_SECTION_FIXTURE.slice(
      0,
      state.requestedSections
    );

    return {
      approvedSections,
      dispatchSummary: `计划包含 ${approvedSections.length} 个已批准章节。`
    };
  };

  // 条件 Edge 返回多个 Send，而不是返回一个普通 Node 名称。
  function assignWorkers(
    state: typeof DispatchState.State
  ): PreviewWorkerSend[] {
    if (state.approvedSections.length === 0) {
      throw new Error("Cannot dispatch workers without approved sections.");
    }

    console.log(
      `[send] creating ${state.approvedSections.length} preview_worker tasks`
    );

    return state.approvedSections.map(
      (section) => {
        const workerInput = WorkerInputSchema.parse({
          topic: state.topic,
          section
        });

        return new Send("preview_worker", workerInput);
      }
    );
  }

  // 每个 Send 实例只看到自己的 topic + section，而不是整份主图 State。
  // 本节故意返回空更新；共享结果及 reducer 会在 07D 加入。
  const previewWorker = async (
    state: WorkerInput
  ): Promise<Record<string, never>> => {
    const { section } = state;
    console.log(
      `[worker:start] ${section.sectionId} order=${section.order} title=${section.title}`
    );
    console.log(
      `[worker:input] ${section.sectionId} deliverable=${section.deliverable} targetWords=${section.targetWords}`
    );

    // 用短暂且不同的耗时模拟真实 Worker，便于观察并发完成顺序。
    const simulatedLatencyMs = Math.max(20, 180 - section.order * 30);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, simulatedLatencyMs);
    });

    console.log(`[worker:end] ${section.sectionId}`);
    return {};
  };

  return new StateGraph(DispatchState)
    .addNode("load_approved_plan", loadApprovedPlan)
    .addNode("preview_worker", previewWorker, { input: WorkerInputSchema })
    .addEdge(START, "load_approved_plan")
    .addConditionalEdges("load_approved_plan", assignWorkers, [
      "preview_worker"
    ])
    .addEdge("preview_worker", END)
    .compile();
}

async function main() {
  const rawRequestedSections = process.argv[2] ?? "4";
  const requestedSections = Number(rawRequestedSections);
  const input = {
    topic: "如何为企业内部 AI 助手选择 LangGraph 工作流",
    requestedSections
  };

  console.log("Dynamic Send worker dispatcher (no LLM)\n");
  console.log(
    "Graph: load_approved_plan -> Send[N] -> preview_worker[N] -> END"
  );

  const graph = createGraph();
  const result = await graph.invoke(input);

  console.log(`\n${result.dispatchSummary}`);
  console.log(`Approved sections retained: ${result.approvedSections.length}`);
  console.log("Persisted worker outputs: 0 (aggregation starts in lesson 07D)");
  console.log("graph.invoke resolved after every Send branch reached END");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
