import { createDeepAgent, type SubAgent } from "deepagents";
import { FakeToolCallingModel, tool } from "langchain";
import { z } from "zod";
import { getToolObservations } from "../offload.js";
import { extractLastMessageText } from "../planning.js";

const RELEASE_ID = "REL-2026-09";

const reviewSchema = z
  .object({
    area: z.enum(["api", "data"]),
    decision: z.enum(["PASS", "BLOCK"]),
    summary: z.string(),
    evidenceIds: z.array(z.string()).min(1)
  })
  .meta({
    title: "release_review",
    description: "发布领域的结构化审查结果"
  });

type ReviewResult = z.infer<typeof reviewSchema>;

const API_REVIEW: ReviewResult = {
  area: "api",
  decision: "PASS",
  summary: "128/128 契约测试通过，API 兼容性门禁满足。",
  evidenceIds: ["API-CONTRACT-128"]
};

const DATA_REVIEW: ReviewResult = {
  area: "data",
  decision: "BLOCK",
  summary: "两个旧租户缺少 tenant_id，迁移演练未达到 100%。",
  evidenceIds: ["MIGRATION-48-OF-50", "TENANT-ID-MISSING"]
};

const internalToolCalls = {
  api: 0,
  data: 0
};

const readApiEvidence = tool(
  async ({ releaseId }) => {
    internalToolCalls.api += 1;
    return JSON.stringify({
      releaseId,
      contractTests: { passed: 128, total: 128 },
      backwardCompatibility: "passed",
      evidenceId: "API-CONTRACT-128"
    });
  },
  {
    name: "read_api_release_evidence",
    description: "读取指定发布批次的 API 契约测试和向后兼容性证据。",
    schema: z.object({
      releaseId: z.string().describe("发布批次编号")
    })
  }
);

const readDataEvidence = tool(
  async ({ releaseId }) => {
    internalToolCalls.data += 1;
    return JSON.stringify({
      releaseId,
      migrationRehearsal: { passed: 48, total: 50 },
      failedReason: "two legacy tenants are missing tenant_id",
      evidenceIds: ["MIGRATION-48-OF-50", "TENANT-ID-MISSING"]
    });
  },
  {
    name: "read_data_migration_evidence",
    description: "读取指定发布批次的数据迁移演练和失败租户证据。",
    schema: z.object({
      releaseId: z.string().describe("发布批次编号")
    })
  }
);

function createReviewerModel(
  toolName: string,
  toolCallId: string,
  structuredResponse: ReviewResult
) {
  return new FakeToolCallingModel({
    toolCalls: [
      [
        {
          name: toolName,
          args: { releaseId: RELEASE_ID },
          id: toolCallId
        }
      ],
      [
        {
          name: "release_review",
          args: structuredResponse,
          id: `${toolCallId}-structured-output`
        }
      ]
    ]
  });
}

const apiReviewer: SubAgent = {
  name: "api-reviewer",
  description:
    "审查 API 契约测试与兼容性，适用于发布 API 门禁；不要用它审查数据库迁移。",
  systemPrompt:
    "你是 API 发布审查员。必须读取 API 证据，只返回有证据编号的简短结论，不处理数据迁移。",
  tools: [readApiEvidence],
  model: createReviewerModel(
    "read_api_release_evidence",
    "subagent-api-read",
    API_REVIEW
  ),
  responseFormat: reviewSchema
};

const dataReviewer: SubAgent = {
  name: "data-reviewer",
  description:
    "审查数据库迁移演练与数据完整性，适用于发布数据门禁；不要用它审查 API。",
  systemPrompt:
    "你是数据迁移审查员。必须读取迁移证据；只要演练未达到 100%，就返回 BLOCK，并附证据编号。",
  tools: [readDataEvidence],
  model: createReviewerModel(
    "read_data_migration_evidence",
    "subagent-data-read",
    DATA_REVIEW
  ),
  responseFormat: reviewSchema
};

function parseTaskResult(content: string): ReviewResult {
  const parsed: unknown = JSON.parse(content);
  return reviewSchema.parse(parsed);
}

async function main() {
  const supervisorModel = new FakeToolCallingModel({
    toolCalls: [
      [
        {
          name: "task",
          args: {
            subagent_type: "api-reviewer",
            description: `审查 ${RELEASE_ID} 的 API 发布门禁，返回结构化结论和证据编号。`
          },
          id: "delegate-api"
        }
      ],
      [
        {
          name: "task",
          args: {
            subagent_type: "data-reviewer",
            description: `审查 ${RELEASE_ID} 的数据迁移门禁，返回结构化结论和证据编号。`
          },
          id: "delegate-data"
        }
      ],
      []
    ]
  });

  const supervisor = createDeepAgent({
    name: "release-supervisor",
    model: supervisorModel,
    subagents: [apiReviewer, dataReviewer],
    systemPrompt: `你是发布审查协调者。把 API 与数据迁移审查分别委派给对应专家；
只根据子 Agent 返回的结构化证据汇总。任一领域为 BLOCK，整体结论就是 BLOCK。`
  });

  const result = await supervisor.invoke({
    messages: [
      {
        role: "user",
        content: `审查 ${RELEASE_ID} 的 API 和数据迁移门禁，给出整体发布结论。`
      }
    ]
  });

  const parentObservations = getToolObservations(result.messages);
  const taskObservations = parentObservations.filter(
    (observation) => observation.name === "task"
  );
  if (taskObservations.length !== 2) {
    throw new Error(`预期两次委派，实际 ${taskObservations.length} 次。`);
  }

  const reviews = taskObservations.map((observation) =>
    parseTaskResult(observation.content)
  );
  const apiResult = reviews.find((review) => review.area === "api");
  const dataResult = reviews.find((review) => review.area === "data");
  if (apiResult?.decision !== "PASS" || dataResult?.decision !== "BLOCK") {
    throw new Error("子 Agent 的结构化审查结论不符合证据。 ");
  }
  if (internalToolCalls.api !== 1 || internalToolCalls.data !== 1) {
    throw new Error(
      `子 Agent 内部工具调用异常：api=${internalToolCalls.api}, data=${internalToolCalls.data}`
    );
  }

  const serializedParentMessages = JSON.stringify(result.messages);
  const parentSawInternalTools = [
    "read_api_release_evidence",
    "read_data_migration_evidence"
  ].some((toolName) => serializedParentMessages.includes(toolName));
  if (parentSawInternalTools) {
    throw new Error("上下文隔离失败：子 Agent 内部工具轨迹进入了主 Agent 消息。 ");
  }

  const overallDecision = reviews.some((review) => review.decision === "BLOCK")
    ? "BLOCK"
    : "PASS";
  const finalReply = extractLastMessageText(result.messages);
  if (!finalReply.includes("API-CONTRACT-128") || !finalReply.includes("BLOCK")) {
    throw new Error("主 Agent 没有使用两份子 Agent 结果完成汇总。 ");
  }

  console.log("11 Subagent 设计与使用离线实验");
  console.log("专业子 Agent：api-reviewer、data-reviewer");
  console.log(
    `子 Agent 内部工具调用：api=${internalToolCalls.api}, data=${internalToolCalls.data}`
  );
  console.log(
    `主 Agent 可见工具轨迹：${parentObservations.map((item) => item.name).join(" → ")}`
  );
  console.log(`主上下文包含内部工具名：${parentSawInternalTools ? "是" : "否"}`);
  for (const review of reviews) {
    console.log(
      `${review.area}：${review.decision} | ${review.evidenceIds.join(", ")}`
    );
  }
  console.log(`整体发布结论：${overallDecision}`);
  console.log("模型 API 调用：0（主 Agent 与子 Agent 均使用 FakeToolCallingModel）");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
