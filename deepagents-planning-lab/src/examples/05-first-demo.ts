import { tool } from "@langchain/core/tools";
import { createDeepAgent } from "deepagents";
import { todoListMiddleware, type Todo } from "langchain";
import { z } from "zod";
import { createChatModel, requireModelConfig } from "../model.js";
import { getToolObservations } from "../offload.js";
import {
  extractLastMessageText,
  readVirtualTextFile,
  TodoProgressReporter,
  type VirtualTextFile
} from "../planning.js";

const REPORT_PATH = "/reports/release-readiness.md";
const RELEASE_ID = "REL-2026-08";

const PROJECT_BRIEF = {
  releaseId: RELEASE_ID,
  product: "CloudNote 2.0",
  testResult: "128/128 API integration tests passed",
  migrationRehearsal: {
    passed: 48,
    total: 50,
    failedReason: "two legacy tenants are missing tenant_id"
  },
  openIncidents: {
    P0: 0,
    P1: 1,
    P1Owner: "Lin",
    mitigation: "backfill tenant_id, then rerun the migration rehearsal"
  },
  rollbackHandbook: {
    exists: true,
    approver: null
  }
} as const;

const RELEASE_POLICY = [
  "P0 incidents must be 0.",
  "Every open P1 incident must have an owner and a mitigation.",
  "Migration rehearsal pass rate must be 100%.",
  "A rollback handbook and an explicit approver are both required.",
  "If any required gate fails, the exact decision must be 暂缓发布."
] as const;

const loadProjectBrief = tool(
  async ({ releaseId }: { releaseId: string }) => {
    if (releaseId !== RELEASE_ID) {
      return JSON.stringify({ error: `unknown release: ${releaseId}` });
    }

    return JSON.stringify(PROJECT_BRIEF, null, 2);
  },
  {
    name: "load_project_brief",
    description: "按 releaseId 读取发布状态、测试结果、事故和回滚准备情况。",
    schema: z.object({
      releaseId: z.string().describe("发布批次编号，例如 REL-2026-08")
    })
  }
);

const loadReleasePolicy = tool(
  async () => RELEASE_POLICY.join("\n"),
  {
    name: "load_release_policy",
    description: "读取发布门禁规则。做发布结论前必须调用，不能自己猜测规则。",
    schema: z.object({})
  }
);

const SYSTEM_PROMPT = `你是发布准备度审查 Agent。本示例用于展示一个完整但规模较小的 Deep Agent 执行过程。

必须遵守：
1. 在读取业务数据前，先调用 write_todos 创建 3 到 5 项计划，并把第一项标记为 in_progress。
2. 必须调用 load_project_brief，releaseId 使用 ${RELEASE_ID}。
3. 必须调用 load_release_policy，并逐条比较事实和规则。
4. 把 Markdown 报告写入 ${REPORT_PATH}。报告必须包含事实摘要、逐项门禁、失败项、最终结论和下一步动作。
5. 写入报告后必须调用 read_file 复核该文件，再把所有 Todo 标记为 completed。
6. 最终回复必须给出结论“暂缓发布”、两个阻塞原因和报告路径。

不要调用 task 或委派子 Agent。本节只演示主 Agent 的最小端到端闭环。`;

type DemoState = {
  messages?: unknown[];
  todos?: Todo[];
  files?: Record<string, VirtualTextFile>;
};

async function main() {
  const modelConfig = requireModelConfig();
  const model = createChatModel(modelConfig);
  const agent = createDeepAgent({
    name: "first-deep-agent-demo",
    model,
    tools: [loadProjectBrief, loadReleasePolicy],
    middleware: [todoListMiddleware()],
    systemPrompt: SYSTEM_PROMPT
  });

  console.log(`模型：${modelConfig.provider}/${modelConfig.model}`);
  console.log(`任务：评估 ${RELEASE_ID} 是否满足发布门禁`);
  console.log(`预期产物：${REPORT_PATH}\n`);

  const todoReporter = new TodoProgressReporter();
  const printedObservationIds = new Set<string>();
  let finalState: DemoState | undefined;

  const stream = await agent.stream(
    {
      messages: [
        {
          role: "user",
          content: `评估 ${RELEASE_ID} 的发布准备度，生成审查报告并给出明确结论。`
        }
      ]
    },
    { streamMode: "values" }
  );

  for await (const state of stream) {
    finalState = state;

    const todoUpdate = todoReporter.render(state.todos);
    if (todoUpdate) {
      console.log(`${todoUpdate}\n`);
    }

    for (const observation of getToolObservations(state.messages)) {
      if (printedObservationIds.has(observation.id)) {
        continue;
      }

      printedObservationIds.add(observation.id);
      console.log(`工具完成：${observation.name}`);
    }
  }

  if (!finalState) {
    throw new Error("Agent 没有返回最终状态。");
  }

  const toolNames = getToolObservations(finalState.messages).map(
    (observation) => observation.name
  );
  for (const requiredTool of [
    "write_todos",
    "load_project_brief",
    "load_release_policy",
    "write_file",
    "read_file"
  ]) {
    if (!toolNames.includes(requiredTool)) {
      throw new Error(`Demo 验收失败：模型没有调用 ${requiredTool}。`);
    }
  }

  const unfinishedTodos = (finalState.todos ?? []).filter(
    (todo) => todo.status !== "completed"
  );
  if (!finalState.todos?.length || unfinishedTodos.length > 0) {
    throw new Error("Demo 验收失败：Todo 不存在或仍有未完成项。");
  }

  const report = readVirtualTextFile(finalState.files, REPORT_PATH);
  if (
    !report?.includes(RELEASE_ID) ||
    !report.includes("tenant_id") ||
    !report.includes("暂缓发布")
  ) {
    throw new Error("Demo 验收失败：虚拟报告缺少批次、阻塞原因或明确结论。");
  }

  const finalReply = extractLastMessageText(finalState.messages ?? []);
  if (!finalReply.includes("暂缓发布") || !finalReply.includes(REPORT_PATH)) {
    throw new Error("Demo 验收失败：最终回复缺少结论或报告路径。");
  }

  console.log("\nDemo 验收通过");
  console.log(`工具轨迹：${toolNames.join(" → ")}`);
  console.log("\n最终回复");
  console.log(finalReply);
  console.log("\n虚拟文件中的报告");
  console.log(report);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
