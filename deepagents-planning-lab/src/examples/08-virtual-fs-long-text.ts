import { createDeepAgent, StateBackend, type FileData } from "deepagents";
import { FakeToolCallingModel } from "langchain";
import { getToolObservations } from "../offload.js";
import { readVirtualTextFile, type VirtualTextFile } from "../planning.js";

const SERVICE_PATH = "/corpus/service.log";
const POLICY_PATH = "/corpus/policy.md";
const DECISION_PATH = "/corpus/decisions.md";
const INDEX_PATH = "/workspace/evidence/auth-timeout.md";

const INCIDENT_MARKER = "INCIDENT-AUTH-TIMEOUT";
const POLICY_MARKER = "POLICY-AUTH-SLO-5000";
const DECISION_MARKER = "DECISION-ROLLBACK-2026-08";

const INCIDENT_LINE = 1_375;
const POLICY_LINE = 842;
const DECISION_LINE = 701;

function createTextFile(content: string, mimeType = "text/plain"): FileData {
  const now = new Date().toISOString();

  return {
    content,
    mimeType,
    created_at: now,
    modified_at: now
  };
}

function createLongFile(
  lineCount: number,
  targetLine: number,
  filler: (line: number) => string,
  target: string
): string {
  return Array.from({ length: lineCount }, (_, index) => {
    const line = index + 1;
    return line === targetLine ? target : filler(line);
  }).join("\n");
}

function textLength(files: Record<string, VirtualTextFile>): number {
  return Object.values(files).reduce((total, file) => {
    if (typeof file.content === "string") return total + file.content.length;
    if (Array.isArray(file.content)) return total + file.content.join("\n").length;
    return total;
  }, 0);
}

async function main() {
  const initialFiles: Record<string, FileData> = {
    [SERVICE_PATH]: createTextFile(
      createLongFile(
        1_600,
        INCIDENT_LINE,
        (line) =>
          `line=${line} | level=INFO | request=req-${line} | latency_ms=120 | status=ok`,
        `line=${INCIDENT_LINE} | level=ERROR | marker=${INCIDENT_MARKER} | p95_ms=9100 | owner=identity-platform`
      )
    ),
    [POLICY_PATH]: createTextFile(
      createLongFile(
        1_100,
        POLICY_LINE,
        (line) => `Policy note ${line}: routine operational guidance.`,
        `${POLICY_MARKER}: authentication p95 above 5000ms blocks release and requires an owner.`
      ),
      "text/markdown"
    ),
    [DECISION_PATH]: createTextFile(
      createLongFile(
        900,
        DECISION_LINE,
        (line) => `Decision record ${line}: no change to the current release.`,
        `${DECISION_MARKER}: rollback the current release; owner=identity-platform; status=approved.`
      ),
      "text/markdown"
    )
  };

  const evidenceIndex = [
    "# Authentication timeout evidence",
    "",
    `- incident: ${INCIDENT_MARKER}; p95_ms=9100; source=${SERVICE_PATH}:${INCIDENT_LINE}`,
    `- policy: ${POLICY_MARKER}; threshold_ms=5000; source=${POLICY_PATH}:${POLICY_LINE}`,
    `- decision: ${DECISION_MARKER}; action=rollback; source=${DECISION_PATH}:${DECISION_LINE}`,
    "- conclusion: BLOCK_AND_ROLLBACK",
    "- owner: identity-platform"
  ].join("\n");

  const model = new FakeToolCallingModel({
    toolCalls: [
      [
        {
          name: "glob",
          args: { pattern: "**/*.*", path: "/corpus" },
          id: "discover-corpus"
        }
      ],
      [
        {
          name: "grep",
          args: { pattern: INCIDENT_MARKER, path: "/corpus" },
          id: "grep-incident"
        }
      ],
      [
        {
          name: "read_file",
          args: { file_path: SERVICE_PATH, offset: INCIDENT_LINE - 3, limit: 6 },
          id: "read-incident"
        }
      ],
      [
        {
          name: "grep",
          args: { pattern: POLICY_MARKER, path: "/corpus" },
          id: "grep-policy"
        }
      ],
      [
        {
          name: "read_file",
          args: { file_path: POLICY_PATH, offset: POLICY_LINE - 3, limit: 6 },
          id: "read-policy"
        }
      ],
      [
        {
          name: "grep",
          args: { pattern: DECISION_MARKER, path: "/corpus" },
          id: "grep-decision"
        }
      ],
      [
        {
          name: "read_file",
          args: { file_path: DECISION_PATH, offset: DECISION_LINE - 3, limit: 6 },
          id: "read-decision"
        }
      ],
      [
        {
          name: "write_file",
          args: { file_path: INDEX_PATH, content: evidenceIndex },
          id: "write-index"
        }
      ],
      [
        {
          name: "read_file",
          args: { file_path: INDEX_PATH, offset: 0, limit: 20 },
          id: "verify-index"
        }
      ],
      []
    ]
  });

  const agent = createDeepAgent({
    model,
    backend: new StateBackend(),
    systemPrompt:
      "长文本实验：先发现文件，再搜索锚点，按行局部读取，最后写入带来源位置的证据索引。"
  });
  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content: "核对认证超时事件、发布门禁和最终决策，建立证据索引。"
      }
    ],
    files: initialFiles
  });

  const observations = getToolObservations(result.messages);
  const toolNames = observations.map((observation) => observation.name);
  for (const requiredTool of ["glob", "grep", "read_file", "write_file"]) {
    if (!toolNames.includes(requiredTool)) {
      throw new Error(`长文本实验缺少工具：${requiredTool}`);
    }
  }

  const readObservations = observations.filter(
    (observation) => observation.name === "read_file"
  );
  if (readObservations.length !== 4) {
    throw new Error(`预期 4 次局部读取，实际 ${readObservations.length} 次。`);
  }

  const finalFiles = result.files as Record<string, VirtualTextFile>;
  const finalIndex = readVirtualTextFile(finalFiles, INDEX_PATH);
  for (const evidence of [
    INCIDENT_MARKER,
    POLICY_MARKER,
    DECISION_MARKER,
    "BLOCK_AND_ROLLBACK",
    "identity-platform"
  ]) {
    if (!finalIndex?.includes(evidence)) {
      throw new Error(`证据索引缺少：${evidence}`);
    }
  }

  const serializedMessages = JSON.stringify(result.messages);
  if (
    serializedMessages.includes("request=req-1 |") ||
    serializedMessages.includes("Decision record 900:")
  ) {
    throw new Error("完整长文件意外进入消息轨迹。");
  }

  const sourceCharacters = textLength(
    initialFiles as Record<string, VirtualTextFile>
  );
  const readCharacters = readObservations.reduce(
    (total, observation) => total + observation.content.length,
    0
  );

  console.log("08 Virtual FS 长文本处理实验");
  console.log(`源文件：${Object.keys(initialFiles).length} 份`);
  console.log("源文件行数：3,600 行");
  console.log(`源文件字符量：${sourceCharacters.toLocaleString()}`);
  console.log(`4 次局部读取字符量：${readCharacters.toLocaleString()}`);
  console.log(`局部读取 / 源文件：${((readCharacters / sourceCharacters) * 100).toFixed(2)}%`);
  console.log(`工具轨迹：${toolNames.join(" → ")}`);
  console.log("\n证据索引");
  console.log(finalIndex);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
