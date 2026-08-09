import { createDeepAgent, StateBackend, type FileData } from "deepagents";
import { FakeToolCallingModel } from "langchain";
import { getToolObservations } from "../offload.js";
import { readVirtualTextFile, type VirtualTextFile } from "../planning.js";

const LOG_PATH = "/workspace/raw/customer-feedback.log";
const POLICY_PATH = "/workspace/policies/release-policy.md";
const REPORT_PATH = "/workspace/reports/risk-finding.md";
const TARGET_RISK = "RISK-CHECKOUT-TIMEOUT";
const TARGET_LINE = 777;
const LOG_LINE_COUNT = 1_200;

function createTextFile(content: string, mimeType = "text/plain"): FileData {
  const now = new Date().toISOString();

  return {
    content,
    mimeType,
    created_at: now,
    modified_at: now
  };
}

function createFeedbackLog(): string {
  return Array.from({ length: LOG_LINE_COUNT }, (_, index) => {
    const line = index + 1;

    if (line === TARGET_LINE) {
      return [
        `line=${line}`,
        "level=ERROR",
        `risk=${TARGET_RISK}`,
        "region=ap-southeast",
        "p95_ms=8420",
        "owner=checkout-platform"
      ].join(" | ");
    }

    return [
      `line=${line}`,
      "level=INFO",
      `feedback_id=FB-${line.toString().padStart(4, "0")}`,
      "status=processed",
      "message=normal customer feedback sample"
    ].join(" | ");
  }).join("\n");
}

function countTextCharacters(files: Record<string, VirtualTextFile>): number {
  return Object.values(files).reduce((total, file) => {
    if (typeof file.content === "string") {
      return total + file.content.length;
    }

    if (Array.isArray(file.content)) {
      return total + file.content.join("\n").length;
    }

    return total;
  }, 0);
}

async function main() {
  const feedbackLog = createFeedbackLog();
  const initialFiles: Record<string, FileData> = {
    [LOG_PATH]: createTextFile(feedbackLog),
    [POLICY_PATH]: createTextFile(
      [
        "# Release policy",
        "",
        "Any checkout latency risk above 5000ms blocks release.",
        "Every blocking risk must name an owner."
      ].join("\n"),
      "text/markdown"
    )
  };

  const report = [
    "# Risk finding",
    "",
    `- risk: ${TARGET_RISK}`,
    "- decision: BLOCK",
    "- observed_p95_ms: 8420",
    "- owner: checkout-platform",
    `- evidence: ${LOG_PATH}:${TARGET_LINE}`
  ].join("\n");

  const model = new FakeToolCallingModel({
    toolCalls: [
      [{ name: "ls", args: { path: "/workspace" }, id: "ls-workspace" }],
      [
        {
          name: "grep",
          args: { pattern: TARGET_RISK, path: "/workspace" },
          id: "grep-risk"
        }
      ],
      [
        {
          name: "read_file",
          args: { file_path: LOG_PATH, offset: TARGET_LINE - 3, limit: 5 },
          id: "read-evidence"
        }
      ],
      [
        {
          name: "write_file",
          args: { file_path: REPORT_PATH, content: report },
          id: "write-report"
        }
      ],
      []
    ]
  });

  const agent = createDeepAgent({
    model,
    backend: new StateBackend(),
    systemPrompt:
      "教学实验：只搜索并局部读取虚拟文件，不要把整个原始日志复制进消息。"
  });
  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content: `定位 ${TARGET_RISK}，读取附近证据并写一份风险结论。`
      }
    ],
    files: initialFiles
  });

  const observations = getToolObservations(result.messages);
  const toolNames = observations.map((observation) => observation.name);
  const expectedTrace = ["ls", "grep", "read_file", "write_file"];
  if (!expectedTrace.every((toolName) => toolNames.includes(toolName))) {
    throw new Error(`工具轨迹不完整：${toolNames.join(" → ")}`);
  }

  const finalFiles = result.files as Record<string, VirtualTextFile>;
  const finalReport = readVirtualTextFile(finalFiles, REPORT_PATH);
  if (
    !finalReport?.includes(TARGET_RISK) ||
    !finalReport.includes("decision: BLOCK") ||
    !finalReport.includes("8420")
  ) {
    throw new Error("风险报告缺少目标风险、决策或证据值。");
  }

  const serializedMessages = JSON.stringify(result.messages);
  if (
    serializedMessages.includes("feedback_id=FB-0001") ||
    serializedMessages.includes("feedback_id=FB-1200")
  ) {
    throw new Error("实验失败：完整日志意外进入了模型消息轨迹。");
  }

  const initialFileCharacters = countTextCharacters(
    initialFiles as Record<string, VirtualTextFile>
  );
  const finalFileCharacters = countTextCharacters(finalFiles);
  const activeTraceCharacters = serializedMessages.length;
  const workingSetRatio = activeTraceCharacters / initialFileCharacters;

  console.log("07 Virtual FS 问题对比实验");
  console.log(`原始文件：${LOG_LINE_COUNT.toLocaleString()} 行`);
  console.log(`初始文件字符量：${initialFileCharacters.toLocaleString()}`);
  console.log(`消息轨迹字符量：${activeTraceCharacters.toLocaleString()}`);
  console.log(`消息轨迹 / 初始文件：${(workingSetRatio * 100).toFixed(1)}%`);
  console.log(`最终 VFS 字符量：${finalFileCharacters.toLocaleString()}`);
  console.log(`工具轨迹：${toolNames.join(" → ")}`);
  console.log("\n消息只包含搜索结果和目标附近片段，完整日志仍保存在 Virtual FS。\n");
  console.log("最终文件树");
  for (const path of Object.keys(finalFiles).sort()) {
    console.log(`- ${path}`);
  }
  console.log("\n风险报告");
  console.log(finalReport);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
