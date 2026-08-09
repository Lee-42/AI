import {
  createDeepAgent,
  StateBackend,
  type FileData
} from "deepagents";
import { createChatModel, requireModelConfig } from "../model.js";
import { getToolObservations } from "../offload.js";
import {
  extractLastMessageText,
  readVirtualTextFile,
  type VirtualTextFile
} from "../planning.js";

const BRIEF_PATH = "/workspace/input/project-brief.md";
const CHECKLIST_PATH = "/workspace/input/release-checklist.md";
const REPORT_PATH = "/workspace/output/virtual-fs-review.md";
const RISK_ID = "RISK-MOBILE-OFFLINE";

function createTextFile(content: string): FileData {
  const now = new Date().toISOString();

  return {
    content,
    mimeType: "text/markdown",
    created_at: now,
    modified_at: now
  };
}

const initialFiles: Record<string, FileData> = {
  [BRIEF_PATH]: createTextFile(`# Project brief

- Product: Pocket Tasks 1.4
- Release train: 2026.08
- Goal: verify the release checklist and produce a short review
`),
  [CHECKLIST_PATH]: createTextFile(`# Release checklist

- [x] API contract frozen
- [x] Rollback playbook reviewed
- [ ] ${RISK_ID}: offline synchronization conflict test is still failing
- [x] Support team notified
`)
};

const SYSTEM_PROMPT = `你是一个专门演示 Deep Agents Virtual FS 的中文助手。

严格按下面顺序使用文件系统工具：
1. 调用 ls 查看 /workspace，再调用 ls 查看 /workspace/input。
2. 分别调用 read_file 读取 ${BRIEF_PATH} 和 ${CHECKLIST_PATH}。
3. 调用 write_file 创建 ${REPORT_PATH}，内容必须包含下面这个连续区块：
version: DRAFT-V1
owner: TBD
并同时写入 ${RISK_ID}、HOLD 和两份输入文件路径。
4. 调用 read_file 读取刚写入的报告。
5. 调用 edit_file 做一次精确替换，把连续区块
version: DRAFT-V1
owner: TBD
替换为
version: FINAL-V1
owner: mobile-team
6. 调用 glob，在 /workspace 下使用 **/*.md 查找 Markdown 文件。
7. 调用 grep，在 /workspace 中按字面量搜索 ${RISK_ID}。
8. 最后再次调用 read_file 读取 ${REPORT_PATH}，确认修改成功。
9. 最终用中文回复文件数量、风险编号、HOLD 决策、最终版本和报告路径。

不要调用 task、write_todos 或任何业务工具。本节只观察 ls、read_file、write_file、edit_file、glob、grep。`;

type VirtualFsState = {
  messages?: unknown[];
  files?: Record<string, VirtualTextFile>;
};

function shorten(text: string, maxLength = 500): string {
  return text.length <= maxLength
    ? text
    : `${text.slice(0, maxLength)}\n...（工具结果已截短）`;
}

async function main() {
  const modelConfig = requireModelConfig();
  const model = createChatModel(modelConfig);
  const agent = createDeepAgent({
    name: "virtual-fs-demo",
    model,
    backend: new StateBackend(),
    systemPrompt: SYSTEM_PROMPT
  });

  console.log(`模型：${modelConfig.provider}/${modelConfig.model}`);
  console.log("Backend：StateBackend（虚拟文件保存在 Agent State）");
  console.log(`预置文件：${Object.keys(initialFiles).join("、")}\n`);

  const printedObservationIds = new Set<string>();
  let finalState: VirtualFsState | undefined;
  const stream = await agent.stream(
    {
      messages: [
        {
          role: "user",
          content: "检查虚拟工作区中的发布材料，生成并修订审核报告。"
        }
      ],
      files: initialFiles
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
      console.log(`工具完成：${observation.name}`);
      if (["ls", "glob", "grep"].includes(observation.name)) {
        console.log(`${shorten(observation.content)}\n`);
      }
    }
  }

  if (!finalState) {
    throw new Error("Agent 没有返回最终状态。");
  }

  const observations = getToolObservations(finalState.messages);
  const toolNames = observations.map((observation) => observation.name);
  for (const requiredTool of [
    "ls",
    "read_file",
    "write_file",
    "edit_file",
    "glob",
    "grep"
  ]) {
    if (!toolNames.includes(requiredTool)) {
      throw new Error(`Virtual FS 验收失败：模型没有调用 ${requiredTool}。`);
    }
  }

  const virtualPaths = Object.keys(finalState.files ?? {}).sort();
  if (
    !virtualPaths.includes(BRIEF_PATH) ||
    !virtualPaths.includes(CHECKLIST_PATH) ||
    !virtualPaths.includes(REPORT_PATH)
  ) {
    throw new Error("Virtual FS 验收失败：输入文件或输出报告缺失。");
  }

  const report = readVirtualTextFile(finalState.files, REPORT_PATH);
  if (
    !report?.includes("version: FINAL-V1") ||
    !report.includes("owner: mobile-team") ||
    !report.includes(RISK_ID) ||
    !report.includes("HOLD") ||
    report.includes("DRAFT-V1")
  ) {
    throw new Error("Virtual FS 验收失败：报告没有完成预期的精确修改。");
  }

  const sourceChecklist = readVirtualTextFile(finalState.files, CHECKLIST_PATH);
  if (!sourceChecklist?.includes(RISK_ID)) {
    throw new Error("Virtual FS 验收失败：预置输入文件没有保留在最终状态中。");
  }

  const finalReply = extractLastMessageText(finalState.messages ?? []);
  if (
    !finalReply.includes(RISK_ID) ||
    !finalReply.includes("FINAL-V1") ||
    !finalReply.includes(REPORT_PATH)
  ) {
    throw new Error("Virtual FS 验收失败：最终回复缺少风险、版本或报告路径。");
  }

  console.log("Virtual FS 验收通过");
  console.log(`工具轨迹：${toolNames.join(" → ")}`);
  console.log("\n最终虚拟文件树");
  for (const path of virtualPaths) {
    console.log(`- ${path}`);
  }
  console.log("\n最终报告");
  console.log(report);
  console.log("\n最终回复");
  console.log(finalReply);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
