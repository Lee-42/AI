import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { fileURLToPath } from "node:url";
import { ActiveModelConfig, getActiveModelConfig } from "../config.js";

const serverFile = fileURLToPath(new URL("./03-weather-server.ts", import.meta.url));
const weatherHttpUrl = process.env.MCP_WEATHER_URL ?? "http://127.0.0.1:3001/mcp";

function createChatModel(activeModel: ActiveModelConfig) {
  return new ChatOpenAI({
    model: activeModel.model,
    apiKey: activeModel.apiKey,
    temperature: 0,
    ...(activeModel.baseURL ? { configuration: { baseURL: activeModel.baseURL } } : {})
  });
}

function messageText(message: BaseMessage): string {
  return typeof message.content === "string" ? message.content : JSON.stringify(message.content);
}

function printAgentMessages(messages: BaseMessage[]) {
  console.log("\n## Agent messages");

  messages.forEach((message, index) => {
    console.log(`\n${index + 1}. ${message.constructor.name} (${message.type})`);
    console.log(messageText(message));

    if (AIMessage.isInstance(message) && message.tool_calls?.length) {
      console.log(`tool_calls: ${JSON.stringify(message.tool_calls, null, 2)}`);
    }
  });
}

async function main() {
  const useHttp = process.argv.includes("--http");
  const client = useHttp
    ? new MultiServerMCPClient({
        weather: {
          transport: "http",
          url: weatherHttpUrl
        }
      })
    : new MultiServerMCPClient({
        weather: {
          transport: "stdio",
          command: process.execPath,
          args: ["--import", "tsx", serverFile]
        }
      });

  try {
    console.log(`## MCP transport: ${useHttp ? `Streamable HTTP (${weatherHttpUrl})` : "stdio"}`);
    const tools = await client.getTools();

    console.log("## LangChain 从 MCP Server 加载到的工具");
    tools.forEach((tool) => {
      console.log(`- ${tool.name}: ${tool.description}`);
    });

    if (process.argv.includes("--tool-only")) {
      const weatherTool = tools.find((tool) => tool.name === "get_weather");

      if (!weatherTool) {
        throw new Error("MCP Server 没有暴露 get_weather 工具。");
      }

      const result = await weatherTool.invoke({ city: "上海" });
      console.log("\n## 不经过 LLM，直接调用适配后的 LangChain Tool");
      console.log(result);
      return;
    }

    const activeModel = getActiveModelConfig();

    if (!activeModel.apiKey) {
      console.log(`\nMissing ${activeModel.apiKeyName}.`);
      console.log(`Set ${activeModel.apiKeyName}, or run with --tool-only to verify the MCP connection.`);
      return;
    }

    console.log(`\nProvider: ${activeModel.provider}`);
    console.log(`Model: ${activeModel.model}`);

    const agent = createAgent({
      model: createChatModel(activeModel),
      tools,
      systemPrompt: [
        "你是一个简洁的中文天气助手。",
        "查询天气时必须使用 get_weather 工具，不要自行编造天气。",
        "工具返回的是课程演示数据，最终回答必须明确说明它不是实时天气。"
      ].join("\n")
    });

    const response = await agent.invoke({
      messages: [
        {
          role: "user",
          content: "请查询上海的天气，并告诉我是否适合散步。"
        }
      ]
    });

    printAgentMessages(response.messages);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("LangChain MCP weather example failed:", error);
  process.exitCode = 1;
});
