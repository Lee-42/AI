import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { z } from "zod";
import { ActiveModelConfig, getActiveModelConfig } from "../config.js";

const getWeather = tool(
  async ({ city }) => {
    return `Weather tool result: ${city} is sunny, 24C, with light wind.`;
  },
  {
    name: "get_weather",
    description: "Get the current weather for a city.",
    schema: z.object({
      city: z.string().describe("The city to get weather for")
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

function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") {
          return block;
        }

        if (
          typeof block === "object" &&
          block !== null &&
          "type" in block &&
          block.type === "text" &&
          "text" in block &&
          typeof block.text === "string"
        ) {
          return block.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

async function streamFromModel(activeModel: ActiveModelConfig) {
  const model = createChatModel(activeModel);

  console.log("\n--- model.stream(): token stream ---");

  const stream = await model.stream([
    {
      role: "system",
      content: "你是一个简洁的中文技术讲师。"
    },
    {
      role: "user",
      content: "请用三句话解释 LLM 的 stream 流式输出是什么。"
    }
  ]);

  let fullText = "";
  for await (const chunk of stream) {
    const text = contentToText(chunk.content);
    fullText += text;
    process.stdout.write(text);
  }

  console.log("\n\n--- final assembled text ---");
  console.log(fullText);
}

async function streamFromAgent(activeModel: ActiveModelConfig) {
  const agent = createAgent({
    model: createChatModel(activeModel),
    tools: [getWeather],
    systemPrompt:
      "You are a concise assistant. Use tools when they help, then explain the final answer in Chinese."
  });

  console.log("\n--- agent.streamEvents(): message and tool streams ---");

  const run = await agent.streamEvents(
    {
      messages: [
        {
          role: "user",
          content: "请查询杭州今天的天气，并用一句话告诉我适不适合散步。"
        }
      ]
    },
    { version: "v3" }
  );

  await Promise.all([
    (async () => {
      for await (const message of run.messages) {
        process.stdout.write(`\n[message:${message.node}] `);
        for await (const token of message.text) {
          process.stdout.write(token);
        }
      }
    })(),
    (async () => {
      for await (const call of run.toolCalls) {
        console.log(`\n[tool call] ${call.name}(${JSON.stringify(call.input)})`);
        console.log("[tool result]");
        console.dir(await call.output, { depth: 3 });
      }
    })()
  ]);

  const finalState = await run.output;
  console.log("\n\n--- final agent message count ---");
  console.log(finalState.messages.length);
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

  await streamFromModel(activeModel);
  await streamFromAgent(activeModel);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
