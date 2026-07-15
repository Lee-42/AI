import { ChatOpenAI } from "@langchain/openai";
import type { BaseMessage } from "@langchain/core/messages";
import { createAgent, createMiddleware } from "langchain";
import { ActiveModelConfig, getActiveModelConfig } from "../config.js";

function createChatModel(activeModel: ActiveModelConfig, modelName: string) {
  return new ChatOpenAI({
    model: modelName,
    apiKey: activeModel.apiKey,
    temperature: 0,
    ...(activeModel.baseURL ? { configuration: { baseURL: activeModel.baseURL } } : {})
  });
}

function contentToText(content: BaseMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") {
          return block;
        }

        if (typeof block === "object" && block !== null && "text" in block) {
          return String(block.text);
        }

        return "";
      })
      .join("");
  }

  return "";
}

function getLastHumanText(messages: BaseMessage[]): string {
  const lastHumanMessage = [...messages].reverse().find((message) => message.getType() === "human");

  return lastHumanMessage ? contentToText(lastHumanMessage.content) : "";
}

function shouldUseAdvancedModel(text: string, messageCount: number): boolean {
  const complexityKeywords = [
    "架构",
    "设计",
    "复杂",
    "详细",
    "对比",
    "推理",
    "源码",
    "优化",
    "生产",
    "方案"
  ];

  return text.length > 80 || messageCount > 4 || complexityKeywords.some((keyword) => text.includes(keyword));
}

function createDynamicModelMiddleware(activeModel: ActiveModelConfig) {
  const defaultModel = createChatModel(activeModel, activeModel.model);
  const advancedModel = createChatModel(activeModel, activeModel.advancedModel);

  return createMiddleware({
    name: "DynamicModelSelector",

    wrapModelCall: async (request, handler) => {
      const lastHumanText = getLastHumanText(request.messages);
      const useAdvanced = shouldUseAdvancedModel(lastHumanText, request.messages.length);
      const selectedModelName = useAdvanced ? activeModel.advancedModel : activeModel.model;

      console.log("\n[DynamicModelSelector]");
      console.log(`message count: ${request.messages.length}`);
      console.log(`last user text: ${lastHumanText}`);
      console.log(`selected model: ${selectedModelName}`);

      return handler({
        ...request,
        model: useAdvanced ? advancedModel : defaultModel
      });
    }
  });
}

function createDynamicAgent() {
  const activeModel = getActiveModelConfig();

  return createAgent({
    model: createChatModel(activeModel, activeModel.model),
    middleware: [createDynamicModelMiddleware(activeModel)],
    systemPrompt: "You are a concise assistant. Answer in Chinese."
  });
}

async function main() {
  const activeModel = getActiveModelConfig();

  if (!activeModel.apiKey) {
    console.log(`Missing ${activeModel.apiKeyName}.`);
    console.log(`Copy .env.example to .env and set ${activeModel.apiKeyName} before running this example.`);
    return;
  }

  console.log(`Provider: ${activeModel.provider}`);
  console.log(`Default model: ${activeModel.model}`);
  console.log(`Advanced model: ${activeModel.advancedModel}`);

  const agent = createDynamicAgent();

  const simpleResponse = await agent.invoke({
    messages: [
      {
        role: "user",
        content: "用一句话解释 LangChain。"
      }
    ]
  });

  console.log("\n--- simple final answer ---");
  console.log(simpleResponse.messages.at(-1)?.content);

  const complexResponse = await agent.invoke({
    messages: [
      {
        role: "user",
        content:
          "请详细对比直接调用 LLM API 和使用 LangChain Agent 架构的差异，并给出适合生产项目的选择方案。"
      }
    ]
  });

  console.log("\n--- complex final answer ---");
  console.log(complexResponse.messages.at(-1)?.content);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
