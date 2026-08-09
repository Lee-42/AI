import { tool } from "@langchain/core/tools";
import { createDeepAgent } from "deepagents";
import { z } from "zod";
import { createChatModel, requireModelConfig } from "../model.js";
import {
  createLargeTeachingLog,
  findOffloadedPaths,
  getToolObservations,
  TARGET_INCIDENT_CODE,
  TARGET_ORDER_ID,
  TARGET_TRACE_ID,
  type VirtualFile
} from "../offload.js";
import {
  extractLastMessageText,
  readVirtualTextFile
} from "../planning.js";

const LARGE_LOG = createLargeTeachingLog();

const loadLargeLog = tool(async () => LARGE_LOG, {
  name: "load_large_log",
  description:
    "返回约 5000 行教学订单日志。必须先调用它获取事实，不要猜测日志内容。",
  schema: z.object({})
});

const SYSTEM_PROMPT = `你是一个专门演示 Deep Agent Offload 机制的中文助手。

必须严格按顺序执行：
1. 先调用 load_large_log，并从工具结果中识别 /large_tool_results/ 下的卸载文件路径。
2. 调用 grep，在 /large_tool_results/ 中搜索 ${TARGET_ORDER_ID}，不要猜测结果。
3. 即使 grep 已显示匹配行，也必须再调用 read_file，使用精确文件路径和较小的 offset、limit 读取目标行附近内容。
4. 最终用中文给出 order_id、region、incident_code、retryable、trace_id 和卸载文件路径。
5. 必须说明该路径位于默认 StateBackend 的虚拟文件中，不是宿主机磁盘路径。

不要调用 task、write_todos、write_file 或 edit_file。本例只观察大型工具结果自动卸载和按需取回。`;

type OffloadState = {
  messages?: unknown[];
  files?: Record<string, VirtualFile>;
};

function shorten(text: string, maxLength = 500): string {
  return text.length <= maxLength
    ? text
    : `${text.slice(0, maxLength)}\n...（输出已截短）`;
}

async function main() {
  const modelConfig = requireModelConfig();
  const model = createChatModel(modelConfig);
  const agent = createDeepAgent({
    name: "offload-demo",
    model,
    tools: [loadLargeLog],
    systemPrompt: SYSTEM_PROMPT
  });

  console.log(`模型：${modelConfig.provider}/${modelConfig.model}`);
  console.log(`原始日志：${LARGE_LOG.length.toLocaleString()} 字符`);
  console.log("默认卸载阈值：约 20,000 tokens / 80,000 字符");
  console.log(`目标记录：${TARGET_ORDER_ID}（不在开头预览中）\n`);

  let finalState: OffloadState | undefined;
  const printedObservationIds = new Set<string>();
  const stream = await agent.stream(
    {
      messages: [
        {
          role: "user",
          content: `定位 ${TARGET_ORDER_ID} 对应的故障详情，并说明大型日志被卸载到了哪里。`
        }
      ]
    },
    { streamMode: "values" }
  );

  for await (const state of stream) {
    finalState = state;

    for (const observation of getToolObservations(state.messages)) {
      if (printedObservationIds.has(observation.id)) {
        continue;
      }

      printedObservationIds.add(observation.id);
      console.log(`工具结果：${observation.name}`);
      console.log(`${shorten(observation.content)}\n`);
    }
  }

  if (!finalState) {
    throw new Error("Agent 没有返回最终状态。");
  }

  const offloadedPaths = findOffloadedPaths(finalState.files);
  if (offloadedPaths.length !== 1) {
    throw new Error(
      `预期得到 1 个卸载文件，实际得到 ${offloadedPaths.length} 个：${
        offloadedPaths.join(", ") || "无"
      }`
    );
  }

  const offloadedPath = offloadedPaths[0];
  if (!offloadedPath) {
    throw new Error("没有找到卸载文件路径。");
  }

  const originalContent = readVirtualTextFile(finalState.files, offloadedPath);
  if (!originalContent?.includes(TARGET_ORDER_ID)) {
    throw new Error("卸载文件中缺少目标订单，原始工具结果没有被完整保存。");
  }

  const observations = getToolObservations(finalState.messages);
  const toolNames = observations.map((observation) => observation.name);
  for (const requiredTool of ["load_large_log", "grep", "read_file"]) {
    if (!toolNames.includes(requiredTool)) {
      throw new Error(`模型没有按要求调用 ${requiredTool}。`);
    }
  }

  const loadResult = observations.find(
    (observation) => observation.name === "load_large_log"
  );
  if (
    !loadResult ||
    !loadResult.content.includes(offloadedPath) ||
    loadResult.content.length >= LARGE_LOG.length
  ) {
    throw new Error("load_large_log 的 ToolMessage 没有被文件引用正确替换。");
  }

  const finalReply = extractLastMessageText(finalState.messages ?? []);
  if (
    !finalReply.includes(TARGET_INCIDENT_CODE) ||
    !finalReply.includes(TARGET_TRACE_ID) ||
    !finalReply.includes("StateBackend")
  ) {
    throw new Error(
      "最终回复缺少精确故障信息，或没有正确说明 StateBackend。"
    );
  }

  console.log("Offload 验证通过");
  console.log(`- 完整原文：${offloadedPath}`);
  console.log(`- 原文大小：${originalContent.length.toLocaleString()} 字符`);
  console.log(`- 取回路径：${toolNames.join(" → ")}`);
  console.log("\n最终回复");
  console.log(finalReply);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
