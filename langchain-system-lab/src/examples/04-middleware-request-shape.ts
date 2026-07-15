import { ChatOpenAI } from "@langchain/openai";
import { createAgent, createMiddleware, tool } from "langchain";
import { z } from "zod";
import { getActiveModelConfig } from "../config.js";

function className(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return typeof value;
  }

  return Object.getPrototypeOf(value)?.constructor?.name ?? "Object";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function summarizeContent(content: unknown): unknown {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return {
      kind: "content_blocks",
      count: content.length
    };
  }

  return content ?? null;
}

function summarizeMessage(message: unknown) {
  const record = asRecord(message);

  return {
    class: className(message),
    type: record.type ?? null,
    name: record.name ?? null,
    id: record.id ?? null,
    content: summarizeContent(record.content),
    tool_calls: record.tool_calls ?? null
  };
}

function summarizeTool(toolValue: unknown) {
  const toolRecord = asRecord(toolValue);

  if (!Object.keys(toolRecord).length) {
    return null;
  }

  return {
    class: className(toolValue),
    name: toolRecord.name ?? null,
    description: toolRecord.description ?? null
  };
}

function summarizeState(stateValue: unknown) {
  const state = asRecord(stateValue);
  const messages = Array.isArray(state.messages) ? state.messages : [];

  return {
    keys: Object.keys(state),
    message_count: messages.length,
    messages: messages.map(summarizeMessage),
    structuredResponse: state.structuredResponse ?? null
  };
}

function summarizeRuntime(runtimeValue: unknown) {
  const runtime = asRecord(runtimeValue);

  return {
    keys: Object.keys(runtime),
    context: runtime.context ?? null,
    configurable: runtime.configurable ?? null,
    has_signal: Boolean(runtime.signal),
    has_store: Boolean(runtime.store),
    has_writer: Boolean(runtime.writer),
    has_interrupt: Boolean(runtime.interrupt)
  };
}

const requestShapeLogger = createMiddleware({
  name: "RequestShapeLogger",

  wrapModelCall: async (request, handler) => {
    console.log("\n--- wrapModelCall request ---");
    console.dir(
      {
        model: className(request.model),
        messages: request.messages.map(summarizeMessage),
        systemPrompt: request.systemPrompt,
        systemMessage: summarizeMessage(request.systemMessage),
        toolChoice: request.toolChoice ?? null,
        tools: request.tools.map(summarizeTool),
        state: summarizeState(request.state),
        responseFormat: request.responseFormat ?? null,
        runtime: summarizeRuntime(request.runtime),
        modelSettings: request.modelSettings ?? null
      },
      { depth: null }
    );

    const response = await handler(request);

    console.log("\n--- wrapModelCall response ---");
    console.dir(summarizeMessage(response), { depth: null });

    return response;
  },

  wrapToolCall: async (request, handler) => {
    console.log("\n--- wrapToolCall request ---");
    console.dir(
      {
        toolCall: request.toolCall,
        tool: summarizeTool(request.tool),
        state: summarizeState(request.state),
        runtime: summarizeRuntime(request.runtime)
      },
      { depth: null }
    );

    const result = await handler(request);

    console.log("\n--- wrapToolCall result ---");
    console.dir(summarizeMessage(result), { depth: null });

    return result;
  }
});

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
    middleware: [requestShapeLogger],
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

  const finalMessage = response.messages[response.messages.length - 1];

  console.log("\n--- final answer ---");
  console.log(finalMessage.content);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
