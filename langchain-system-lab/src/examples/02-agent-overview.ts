import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { z } from "zod";
import { getActiveModelConfig } from "../config.js";

const getWeather = tool(
  ({ city }) => {
    return `Weather tool result: ${city} is sunny, 26C, with light wind.`;
  },
  {
    name: "get_weather",
    description: "Get the current weather for a city.",
    schema: z.object({
      city: z.string().describe("The city to get weather for")
    })
  }
);

function createWeatherAgent() {
  const activeModel = getActiveModelConfig();
  const model = new ChatOpenAI({
    model: activeModel.model,
    apiKey: activeModel.apiKey,
    temperature: 0,
    ...(activeModel.baseURL ? { configuration: { baseURL: activeModel.baseURL } } : {})
  });

  return createAgent({
    model,
    tools: [getWeather],
    systemPrompt:
      "You are a concise assistant. Use tools when they help, then explain the final answer in Chinese."
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

  const agent = createWeatherAgent();
  const response = await agent.invoke({
    messages: [
      {
        role: "user",
        content: "请查询上海今天的天气，并用一句话告诉我适合不适合出门散步。"
      }
    ]
  });

  console.dir(response, { depth: null });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
