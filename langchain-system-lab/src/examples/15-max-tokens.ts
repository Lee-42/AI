import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ActiveModelConfig, getActiveModelConfig } from "../config.js";

const prompt = `
请分成 6 点解释“max tokens 在 LLM 应用中的作用”。
每一点写 2 到 3 句，并包含一个具体例子。
请直接回答，不要故意压缩内容。
`.trim();

function createModel(activeModel: ActiveModelConfig, maxTokens: number) {
  return new ChatOpenAI({
    model: activeModel.model,
    apiKey: activeModel.apiKey,
    temperature: 0,
    maxTokens,
    ...(activeModel.baseURL ? { configuration: { baseURL: activeModel.baseURL } } : {})
  });
}

function contentToText(message: BaseMessage) {
  return typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content, null, 2);
}

function readFinishReason(message: BaseMessage) {
  const metadata = message.response_metadata as Record<string, unknown>;
  const value =
    metadata.finish_reason ??
    metadata.stop_reason;

  return typeof value === "string" ? value : "unknown";
}

function printResult(label: string, maxTokens: number, response: BaseMessage) {
  const content = contentToText(response);

  console.log(`\n## ${label}`);
  console.log(`配置的 maxTokens: ${maxTokens}`);
  console.log(`finish_reason: ${readFinishReason(response)}`);
  console.log(`可见内容字符数: ${content.length}`);

  if (AIMessage.isInstance(response)) {
    console.log(`实际 input tokens: ${response.usage_metadata?.input_tokens ?? "unknown"}`);
    console.log(`实际 output tokens: ${response.usage_metadata?.output_tokens ?? "unknown"}`);
    console.log(
      `其中 reasoning tokens: ${response.usage_metadata?.output_token_details?.reasoning ?? 0}`
    );
  }

  console.log("输出内容:");
  console.log(content);
}

async function main() {
  const activeModel = getActiveModelConfig();

  if (!activeModel.apiKey) {
    console.log(`Missing ${activeModel.apiKeyName}.`);
    console.log(`Set ${activeModel.apiKeyName} before running this example.`);
    return;
  }

  console.log(`Provider: ${activeModel.provider}`);
  console.log(`Model: ${activeModel.model}`);
  console.log("同一个 prompt 将分别使用 80 和 600 的输出 token 上限。\n");

  const shortResponse = await createModel(activeModel, 80).invoke(prompt);
  const longResponse = await createModel(activeModel, 600).invoke(prompt);

  printResult("较小的输出预算", 80, shortResponse);
  printResult("较大的输出预算", 600, longResponse);

  console.log("\n## 观察重点");
  console.log("1. maxTokens 是上限，不代表模型一定会用满。");
  console.log("2. finish_reason=length 通常表示输出预算或上下文空间耗尽。");
  console.log("3. 推理模型的 reasoning tokens 也可能占用 completion 预算。");
  console.log("4. 字符数不等于 token 数，真实用量以 usage_metadata 为准。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
