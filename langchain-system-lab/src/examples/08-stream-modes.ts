import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { z } from "zod";
import { ActiveModelConfig, getActiveModelConfig } from "../config.js";

const getWeather = tool(
  async ({ city }) => {
    return `Weather tool result: ${city} is sunny, 25C, with light wind.`;
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

function createWeatherAgent(activeModel: ActiveModelConfig) {
  return createAgent({
    model: createChatModel(activeModel),
    tools: [getWeather],
    systemPrompt:
      "You are a concise assistant. Use tools when they help, then explain the final answer in Chinese."
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

function summarizeMessages(messages: unknown) {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return messages.map((message) => {
    const candidate = message as {
      _getType?: () => string;
      role?: string;
      content?: unknown;
      tool_calls?: unknown;
    };

    return {
      type: candidate._getType?.() ?? candidate.role ?? "unknown",
      content: contentToText(candidate.content).slice(0, 80),
      toolCalls: candidate.tool_calls
    };
  });
}

function summarizeMessageChunk(messageOutput: unknown) {
  const [messageChunk, metadata] = messageOutput as [any, any];

  return {
    text: contentToText(messageChunk.content),
    metadata: {
      node: metadata?.langgraph_node,
      tags: metadata?.tags
    }
  };
}

function summarizeValuesChunk(state: unknown) {
  return {
    messages: summarizeMessages((state as { messages?: unknown })?.messages)
  };
}

function summarizeUpdatesChunk(update: unknown) {
  return Object.fromEntries(
    Object.entries(update ?? {}).map(([node, value]) => [
      node,
      {
        ...(typeof value === "object" && value !== null ? value : { value }),
        messages: summarizeMessages((value as { messages?: unknown })?.messages)
      }
    ])
  );
}

function summarizeSingleModeChunk(
  streamMode: "updates" | "values" | "messages" | "tools",
  chunk: unknown
): unknown {
  if (streamMode === "updates") {
    return {
      mode: streamMode,
      update: summarizeUpdatesChunk(chunk)
    };
  }

  if (streamMode === "values") {
    return {
      mode: streamMode,
      ...summarizeValuesChunk(chunk)
    };
  }

  if (streamMode === "messages") {
    return {
      mode: streamMode,
      ...summarizeMessageChunk(chunk)
    };
  }

  return {
    mode: streamMode,
    event: chunk
  };
}

function summarizeMultiModeChunk(chunk: unknown): unknown {
  if (!Array.isArray(chunk)) {
    return chunk;
  }

  const [mode, payload] = chunk as [string, unknown];

  if (mode === "messages") {
    return {
      mode,
      ...summarizeMessageChunk(payload)
    };
  }

  if (mode === "values") {
    return {
      mode,
      ...summarizeValuesChunk(payload)
    };
  }

  if (mode === "updates") {
    return {
      mode,
      update: summarizeUpdatesChunk(payload)
    };
  }

  if (mode === "tools") {
    return {
      mode,
      event: payload
    };
  }

  return chunk;
}

async function printStreamMode(
  activeModel: ActiveModelConfig,
  streamMode: "updates" | "values" | "messages" | "tools"
) {
  const agent = createWeatherAgent(activeModel);

  console.log(`\n--- agent.stream(): streamMode="${streamMode}" ---`);

  const stream = await agent.stream(
    {
      messages: [
        {
          role: "user",
          content: "请查询苏州今天的天气，并用一句话告诉我适不适合散步。"
        }
      ]
    },
    { streamMode }
  );

  for await (const chunk of stream) {
    console.dir(summarizeSingleModeChunk(streamMode, chunk), { depth: 5 });
  }
}

async function printMultipleStreamModes(activeModel: ActiveModelConfig) {
  const agent = createWeatherAgent(activeModel);

  console.log('\n--- agent.stream(): streamMode=["updates", "messages", "tools"] ---');

  const stream = await agent.stream(
    {
      messages: [
        {
          role: "user",
          content: "请查询成都今天的天气，并用一句话告诉我适不适合散步。"
        }
      ]
    },
    { streamMode: ["updates", "messages", "tools"] }
  );

  for await (const chunk of stream) {
    console.dir(summarizeMultiModeChunk(chunk), { depth: 5 });
  }
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

  await printStreamMode(activeModel, "updates");
  await printStreamMode(activeModel, "values");
  await printStreamMode(activeModel, "messages");
  await printStreamMode(activeModel, "tools");
  await printMultipleStreamModes(activeModel);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
