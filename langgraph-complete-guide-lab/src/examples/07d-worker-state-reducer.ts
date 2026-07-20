import {
  END,
  START,
  ReducedValue,
  Send,
  StateGraph,
  StateSchema
} from "@langchain/langgraph";
import { z } from "zod";

const SectionTaskSchema = z.object({
  sectionId: z.string().regex(/^section-\d{2}$/),
  order: z.number().int().positive(),
  title: z.string().min(2).max(80),
  objective: z.string().min(10).max(300),
  keyPoints: z.array(z.string().min(2).max(120)).min(2).max(4),
  targetWords: z.number().int().min(100).max(1_200)
});
type SectionTask = z.infer<typeof SectionTaskSchema>;

const CompletedSectionSchema = z.object({
  sectionId: SectionTaskSchema.shape.sectionId,
  order: SectionTaskSchema.shape.order,
  title: SectionTaskSchema.shape.title,
  content: z.string().min(20),
  observedWorkerKeys: z.array(z.string()).min(1)
});
type CompletedSection = z.infer<typeof CompletedSectionSchema>;

const OverallState = new StateSchema({
  topic: z.string().min(1).max(1_000),
  requestedSections: z.number().int().min(2).max(5),
  approvedSections: z.array(SectionTaskSchema).default([]),
  completedSections: new ReducedValue(
    z.array(CompletedSectionSchema).default(() => []),
    {
      // State 中存数组，每个并行 Worker 只提交一个结果对象。
      inputSchema: CompletedSectionSchema,
      reducer: (current, next) => [...current, next]
    }
  ),
  aggregationSummary: z.string().default(""),
  finalReport: z.string().default("")
});

// Worker 只能读取完成自己任务所需的最小输入。
const WorkerInputSchema = z.object({
  topic: z.string().min(1).max(1_000),
  section: SectionTaskSchema
});
type WorkerInput = z.infer<typeof WorkerInputSchema>;

function createSection(
  order: number,
  title: string,
  objective: string,
  keyPoints: string[],
  targetWords: number
): SectionTask {
  return SectionTaskSchema.parse({
    sectionId: `section-${String(order).padStart(2, "0")}`,
    order,
    title,
    objective,
    keyPoints,
    targetWords
  });
}

const APPROVED_SECTION_FIXTURE: SectionTask[] = [
  createSection(
    1,
    "明确业务目标与边界",
    "定义工作流真正需要解决的问题，并明确输入、输出以及可衡量的成功标准。",
    ["目标用户与触发条件", "输入输出契约", "成功与失败指标"],
    280
  ),
  createSection(
    2,
    "选择最小可行工作流模式",
    "根据依赖、分支和动态程度选择模式，并说明为什么不采用更复杂的结构。",
    ["固定依赖链", "并行与路由", "动态 Orchestrator"],
    360
  ),
  createSection(
    3,
    "设计 State 与节点契约",
    "明确每个 Node 的读写字段，并为并发更新和失败路径设计可验证的 State。",
    ["字段所有权", "输入输出 Schema", "错误状态"],
    380
  ),
  createSection(
    4,
    "控制成本、规模与失败",
    "为模型调用、Worker 数量、超时以及降级方式建立明确的资源边界。",
    ["调用与 token 预算", "Worker 数量上限", "超时与降级"],
    320
  ),
  createSection(
    5,
    "验证与观测工作流",
    "使用测试、日志和追踪验证图的控制流、失败行为以及最终业务结果。",
    ["正常与异常路径测试", "Node 级日志", "端到端验收"],
    300
  )
];

type SectionWorkerSend = Send<"write_section", WorkerInput>;

function createGraph() {
  const loadApprovedPlan: typeof OverallState.Node = (state) => {
    console.log("[node] load_approved_plan");
    return {
      approvedSections: APPROVED_SECTION_FIXTURE.slice(
        0,
        state.requestedSections
      )
    };
  };

  function assignWorkers(
    state: typeof OverallState.State
  ): SectionWorkerSend[] {
    if (state.approvedSections.length === 0) {
      throw new Error("Cannot dispatch workers without approved sections.");
    }

    console.log(
      `[send] creating ${state.approvedSections.length} write_section tasks`
    );

    return state.approvedSections.map((section) => {
      const workerInput = WorkerInputSchema.parse({
        topic: state.topic,
        section
      });

      return new Send("write_section", workerInput);
    });
  }

  const writeSection = async (
    input: WorkerInput
  ): Promise<{ completedSections: CompletedSection }> => {
    const { section } = input;
    const observedWorkerKeys = Object.keys(input).sort();

    console.log(
      `[worker:start] ${section.sectionId} keys=${observedWorkerKeys.join(",")}`
    );

    // 用确定性短延迟模拟真实写作，让结束顺序与计划顺序不同。
    const simulatedLatencyMs = Math.max(20, 180 - section.order * 30);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, simulatedLatencyMs);
    });

    const completedSection = CompletedSectionSchema.parse({
      sectionId: section.sectionId,
      order: section.order,
      title: section.title,
      content: [
        `## ${section.order}. ${section.title}`,
        section.objective,
        `关键点：${section.keyPoints.join("、")}。`,
        `建议篇幅：约 ${section.targetWords} 字。`
      ].join("\n"),
      observedWorkerKeys
    });

    console.log(`[worker:end] ${section.sectionId}`);
    // 多个 Worker 并发写同一个 key；ReducedValue 负责合并。
    return { completedSections: completedSection };
  };

  const synthesizeResults: typeof OverallState.Node = (state) => {
    console.log(
      `[node] synthesize_results completed=${state.completedSections.length}`
    );

    if (state.completedSections.length !== state.approvedSections.length) {
      throw new Error(
        `Expected ${state.approvedSections.length} results, received ${state.completedSections.length}.`
      );
    }

    const expectedById = new Map(
      state.approvedSections.map((section) => [section.sectionId, section])
    );
    const actualIds = state.completedSections.map(
      (section) => section.sectionId
    );

    if (new Set(actualIds).size !== actualIds.length) {
      throw new Error("Reducer collected duplicate section results.");
    }

    const unexpectedIds = actualIds.filter((id) => !expectedById.has(id));

    if (unexpectedIds.length > 0) {
      throw new Error(
        `Reducer collected unexpected section ids: ${unexpectedIds.join(", ")}.`
      );
    }

    for (const completed of state.completedSections) {
      const expected = expectedById.get(completed.sectionId);

      if (!expected) {
        continue;
      }

      if (
        completed.order !== expected.order ||
        completed.title !== expected.title
      ) {
        throw new Error(
          `Result ${completed.sectionId} does not match its approved plan metadata.`
        );
      }
    }

    const sortedSections = [...state.completedSections].sort(
      (left, right) =>
        left.order - right.order ||
        left.sectionId.localeCompare(right.sectionId)
    );
    const rawOrder = actualIds.join(" -> ");
    const businessOrder = sortedSections
      .map((section) => section.sectionId)
      .join(" -> ");

    return {
      aggregationSummary: [
        `Reducer collected ${state.completedSections.length} results.`,
        `Raw reducer order: ${rawOrder}.`,
        `Business order after sort: ${businessOrder}.`
      ].join(" "),
      finalReport: [
        `# ${state.topic}`,
        "",
        sortedSections
          .map((section) => section.content)
          .join("\n\n---\n\n")
      ].join("\n")
    };
  };

  return new StateGraph(OverallState)
    .addNode("load_approved_plan", loadApprovedPlan)
    .addNode("write_section", writeSection, { input: WorkerInputSchema })
    .addNode("synthesize_results", synthesizeResults)
    .addEdge(START, "load_approved_plan")
    .addConditionalEdges("load_approved_plan", assignWorkers, [
      "write_section"
    ])
    .addEdge("write_section", "synthesize_results")
    .addEdge("synthesize_results", END)
    .compile();
}

async function main() {
  const rawRequestedSections = process.argv[2] ?? "4";
  const requestedSections = Number(rawRequestedSections);

  console.log("Worker isolation + ReducedValue aggregation (no LLM)\n");
  console.log(
    "Graph: approved plan -> Send[N] -> write_section[N] -> reducer -> synthesize -> END"
  );

  const graph = createGraph();
  const result = await graph.invoke({
    topic: "如何为企业内部 AI 助手选择 LangGraph 工作流",
    requestedSections
  });

  console.log(`\n${result.aggregationSummary}`);
  console.log(
    `Worker-visible keys: ${result.completedSections[0]?.observedWorkerKeys.join(",")}`
  );
  console.log("\nFinal report:\n");
  console.log(result.finalReport);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
