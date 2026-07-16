import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { z } from "zod";
import { ActiveModelConfig, getActiveModelConfig } from "../config.js";

const getWeather = tool(
  async ({ city }) => {
    return `${city} 今天晴天，气温 25C，微风。`;
  },
  {
    name: "get_weather",
    description: "查询某个城市的天气。",
    schema: z.object({
      city: z.string().describe("城市名")
    })
  }
);

function createChatModel(activeModel: ActiveModelConfig) {
  return new ChatOpenAI({
    model: activeModel.model,
    apiKey: activeModel.apiKey,
    temperature: 0,
    ...(activeModel.baseURL ? { configuration: { baseURL: activeModel.baseURL } } : {})
  });
}

function messageType(message: unknown) {
  const candidate = message as { _getType?: () => string; role?: string };
  return candidate._getType?.() ?? candidate.role ?? "unknown";
}

function messageText(message: unknown) {
  const content = (message as { content?: unknown }).content;

  if (typeof content === "string") {
    return content;
  }

  return "";
}

function printUpdateMessages(messages: unknown[] | undefined) {
  if (!messages?.length) {
    return;
  }

  messages.forEach((message, index) => {
    const toolCalls = (message as { tool_calls?: unknown[] }).tool_calls;
    const text = messageText(message);

    console.log(`  ${index + 1}. ${messageType(message)} ${text ? `- ${text}` : ""}`);

    if (toolCalls?.length) {
      console.log(`     tool_calls: ${JSON.stringify(toolCalls)}`);
    }
  });
}

async function main() {
  const activeModel = getActiveModelConfig();

  if (!activeModel.apiKey) {
    console.log(`Missing ${activeModel.apiKeyName}.`);
    console.log(`Copy .env.example to .env and set ${activeModel.apiKeyName} before running this example.`);
    return;
  }

  const agent = createAgent({
    model: createChatModel(activeModel),
    tools: [getWeather],
    systemPrompt: "你是一个简洁的中文助手。需要天气时必须调用 get_weather 工具。"
  });

  const stream = await agent.stream(
    {
      messages: [
        {
          role: "user",
          content: "请查询杭州今天的天气，并告诉我适不适合散步。"
        }
      ]
    },
    { streamMode: "updates" }
  );

  for await (const update of stream) {
    console.log("\n--- updates chunk: 这一步的增量更新 ---");

    for (const [nodeName, nodeUpdate] of Object.entries(update)) {
      console.log(`节点: ${nodeName}`);
      printUpdateMessages((nodeUpdate as { messages?: unknown[] }).messages);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
