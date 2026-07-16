import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { z } from "zod";
import { ActiveModelConfig, getActiveModelConfig } from "../config.js";

type AgentInvokeResponse = {
  messages?: BaseMessage[];
};

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

function messageText(message: BaseMessage) {
  if (typeof message.content === "string") {
    return message.content;
  }

  return JSON.stringify(message.content);
}

function printMessage(title: string, message: BaseMessage) {
  console.log(`\n## ${title}`);
  console.log(`class: ${message.constructor.name}`);
  console.log(`type: ${message.type}`);
  console.log(`content: ${messageText(message)}`);

  if (AIMessage.isInstance(message)) {
    console.log(`tool_calls: ${JSON.stringify(message.tool_calls ?? [], null, 2)}`);
  }
}

function printAgentResponse(response: AgentInvokeResponse) {
  console.log("\n## agent.invoke 返回的是一个 state 对象");
  console.log(`messages count: ${response.messages?.length ?? 0}`);

  response.messages?.forEach((message, index) => {
    console.log(`\n${index + 1}. ${message.constructor.name} (${message.type})`);
    console.log(messageText(message));

    if (AIMessage.isInstance(message) && message.tool_calls?.length) {
      console.log(`tool_calls: ${JSON.stringify(message.tool_calls, null, 2)}`);
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

  console.log(`Provider: ${activeModel.provider}`);
  console.log(`Model: ${activeModel.model}`);

  const model = createChatModel(activeModel);

  const llmResponse = await model.invoke([
    {
      role: "system",
      content: "你是一个简洁的中文助手。"
    },
    {
      role: "user",
      content: "请用一句话解释 llm.invoke 是什么。"
    }
  ]);

  printMessage("llm.invoke：只调用模型一次，直接返回 AIMessage", llmResponse);

  const toolEnabledModel = model.bindTools([getWeather]);
  const llmToolResponse = await toolEnabledModel.invoke([
    {
      role: "system",
      content: "你是一个天气助手。需要天气时，优先调用 get_weather 工具。"
    },
    {
      role: "user",
      content: "请查询杭州今天的天气。"
    }
  ]);

  printMessage("llm.invoke + bindTools：模型可能只产出 tool_calls，不会自动执行工具", llmToolResponse);

  const agent = createAgent({
    model,
    tools: [getWeather],
    systemPrompt: "你是一个天气助手。需要天气时必须调用 get_weather 工具，然后用中文给出最终回答。"
  });

  const agentResponse = await agent.invoke({
    messages: [
      {
        role: "user",
        content: "请查询杭州今天的天气，并告诉我适不适合散步。"
      }
    ]
  });

  printAgentResponse(agentResponse as AgentInvokeResponse);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
