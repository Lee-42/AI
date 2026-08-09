import { tool } from "@langchain/core/tools";
import { createDeepAgent } from "deepagents";
import { todoListMiddleware } from "langchain";
import { z } from "zod";
import { createChatModel, requireModelConfig } from "../model.js";
import {
  extractLastMessageText,
  readVirtualTextFile,
  TodoProgressReporter,
  type VirtualTextFile
} from "../planning.js";

const REPORT_PATH = "/reports/planning-todo-sales.md";

const SALES_DATA = [
  {
    orderId: "A-1001",
    region: "华东",
    category: "笔记本电脑",
    revenue: 6800,
    refunded: false
  },
  {
    orderId: "A-1002",
    region: "华南",
    category: "显示器",
    revenue: 2200,
    refunded: false
  },
  {
    orderId: "A-1003",
    region: "华东",
    category: "笔记本电脑",
    revenue: 7200,
    refunded: true
  },
  {
    orderId: "A-1004",
    region: "华北",
    category: "键盘",
    revenue: 600,
    refunded: false
  },
  {
    orderId: "A-1005",
    region: "华南",
    category: "笔记本电脑",
    revenue: 5900,
    refunded: false
  },
  {
    orderId: "A-1006",
    region: "华北",
    category: "显示器",
    revenue: 2600,
    refunded: false
  }
] as const;

const loadSalesData = tool(
  async () => JSON.stringify(SALES_DATA, null, 2),
  {
    name: "load_sales_data",
    description:
      "读取教学用销售订单。返回 JSON；计算指标前必须调用一次，不要猜测数据。",
    schema: z.object({})
  }
);

const loadAnalysisRequirements = tool(
  async () =>
    [
      "销售额口径：只统计 refunded=false 的订单。",
      "必须给出有效销售额、有效订单数、退款订单数。",
      "按地区汇总有效销售额，并指出最高地区。",
      "最终报告必须包含口径、计算结果、观察和一条行动建议。"
    ].join("\n"),
  {
    name: "load_analysis_requirements",
    description:
      "读取销售分析的验收规则。写报告前必须调用一次，并按规则自检。",
    schema: z.object({})
  }
);

const SYSTEM_PROMPT = `你是一个中文数据分析助手，这次运行专门演示 Planning / Todo 机制。

必须遵守：
1. 在调用任何业务工具前，先调用 write_todos，创建 4 到 6 个可验收任务，并把第一项设为 in_progress。
2. 完成一个任务后立即调用 write_todos 更新完整列表，不要最后批量更新。
3. 必须调用 load_sales_data 和 load_analysis_requirements，不能凭空编造数据或规则。
4. 不要调用 task 或委派子 Agent；本例只观察主 Agent 的规划状态。
5. 使用虚拟文件工具把最终 Markdown 报告写到 ${REPORT_PATH}。
6. 写完后检查报告，再把所有 Todo 标记为 completed；最后用中文简要回复用户。

write_todos 只记录计划，不会替你完成清单中的任务。`;

async function main() {
  const modelConfig = requireModelConfig();
  const model = createChatModel(modelConfig);

  const agent = createDeepAgent({
    name: "planning-todo-demo",
    model,
    tools: [loadSalesData, loadAnalysisRequirements],
    middleware: [todoListMiddleware()],
    systemPrompt: SYSTEM_PROMPT
  });

  console.log(`模型：${modelConfig.provider}/${modelConfig.model}`);
  console.log("Todo 中间件：已显式启用");
  console.log(`目标报告：${REPORT_PATH}\n`);

  const reporter = new TodoProgressReporter();
  let finalState:
    | {
        todos?: Array<{
          content: string;
          status: "pending" | "in_progress" | "completed";
        }>;
        messages: unknown[];
        files?: Record<string, VirtualTextFile>;
      }
    | undefined;

  const stream = await agent.stream(
    {
      messages: [
        {
          role: "user",
          content:
            "分析教学销售数据，生成一份包含指标、地区对比、观察和建议的 Markdown 报告。"
        }
      ]
    },
    { streamMode: "values" }
  );

  for await (const state of stream) {
    finalState = state;
    const todoUpdate = reporter.render(state.todos);

    if (todoUpdate) {
      console.log(`${todoUpdate}\n`);
    }
  }

  if (!finalState || !finalState.todos || finalState.todos.length === 0) {
    throw new Error(
      "模型没有调用 write_todos。请确认所选模型支持工具调用，并重新运行示例。"
    );
  }

  const unfinished = finalState.todos.filter(
    (todo) => todo.status !== "completed"
  );
  if (unfinished.length > 0) {
    throw new Error(
      `Agent 结束时仍有 ${unfinished.length} 个 Todo 未完成：${unfinished
        .map((todo) => todo.content)
        .join("、")}`
    );
  }

  const report = readVirtualTextFile(finalState.files, REPORT_PATH);
  if (!report) {
    const availablePaths = Object.keys(finalState.files ?? {});
    throw new Error(
      `没有在 ${REPORT_PATH} 找到报告。当前虚拟文件：${
        availablePaths.join(", ") || "无"
      }`
    );
  }

  console.log("最终回复");
  console.log(extractLastMessageText(finalState.messages));
  console.log("\n虚拟文件中的报告");
  console.log(report);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
