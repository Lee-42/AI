import { config } from "../config.js";
import { createDeepSeekClient } from "../llm/providers/deepseek.js";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam
} from "openai/resources/chat/completions";

type DeepSeekDelta = ChatCompletionChunk["choices"][number]["delta"] & {
  reasoning_content?: string;
};

type DeepSeekThinkingRequest = Omit<
  ChatCompletionCreateParamsStreaming,
  "model" | "messages" | "reasoning_effort"
> & {
  model: string;
  messages: ChatCompletionMessageParam[];
  reasoning_effort?: "high" | "max";
  thinking?: {
    type: "enabled";
  };
};

const client = createDeepSeekClient();
const model = config.deepseek.reasoningModel;

const messages: ChatCompletionMessageParam[] = [
  {
    role: "user",
    content: [
      "请设计一个 TypeScript 版 LLM API 系统的核心模块。",
      "要求同时支持：供应商切换、历史会话、结构化输出、工具调用、流式输出。",
      "最终答案请简洁分点说明模块职责。"
    ].join("\n")
  }
];

function createThinkingRequest(): DeepSeekThinkingRequest {
  const isLegacyReasoner = model.includes("reasoner");

  return {
    model,
    messages,
    stream: true,
    max_tokens: 1800,
    // deepseek-reasoner 默认就是推理模型，新 thinking 模型需要显式开启思考模式。
    ...(isLegacyReasoner
      ? {}
      : {
          reasoning_effort: config.deepseek.reasoningEffort,
          thinking: { type: "enabled" }
        })
  };
}

function elapsedSeconds(startedAt: number): number {
  return Math.round((Date.now() - startedAt) / 1000);
}

const startedAt = Date.now();
let reasoningContent = "";
let finalContent = "";
let hasPrintedFinalTitle = false;

console.log(`[deepseek/${model}]`);
console.log("=== 已思考（流式输出，类似 DeepSeek App 灰色区域）===");

const stream = await client.chat.completions.create(
  createThinkingRequest() as ChatCompletionCreateParamsStreaming
);

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta as DeepSeekDelta | undefined;

  if (!delta) {
    continue;
  }

  const reasoningDelta = delta.reasoning_content ?? "";
  const contentDelta = typeof delta.content === "string" ? delta.content : "";

  if (reasoningDelta) {
    reasoningContent += reasoningDelta;
    process.stdout.write(reasoningDelta);
    continue;
  }

  if (contentDelta) {
    if (!hasPrintedFinalTitle) {
      console.log(`\n\n=== 最终回答（思考用时 ${elapsedSeconds(startedAt)} 秒）===`);
      hasPrintedFinalTitle = true;
    }

    finalContent += contentDelta;
    process.stdout.write(contentDelta);
  }
}

if (!reasoningContent) {
  console.log("\n\n[提示] 本次响应没有返回 reasoning_content，请确认模型支持 DeepSeek thinking mode。");
}

if (!finalContent) {
  console.log("\n\n[提示] 本次响应没有返回最终 content。");
}

console.log("\n");
