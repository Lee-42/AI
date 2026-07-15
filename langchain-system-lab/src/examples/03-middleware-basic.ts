import { ChatOpenAI } from "@langchain/openai";
import { createAgent, createMiddleware } from "langchain";
import { getActiveModelConfig } from "../config.js";

function previewContent(content: unknown): string {
  if (typeof content === "string") {
    return content.length > 80 ? `${content.slice(0, 80)}...` : content;
  }

  if (Array.isArray(content)) {
    return `[content blocks: ${content.length}]`;
  }

  return String(content ?? "");
}

function logState(stage: string, state: { messages?: unknown[] }) {
  const messages = state.messages ?? [];
  const lastMessage = messages[messages.length - 1] as
    | {
      type?: string;
      content?: unknown;
    }
    | undefined;

  console.log(`\n[${stage}]`);
  console.log(`message count: ${messages.length}`);

  if (lastMessage) {
    console.log(`last message type: ${lastMessage.type ?? "unknown"}`);
    console.log(`last message content: ${previewContent(lastMessage.content)}`);
  }
}

const lifecycleLogger = createMiddleware({
  name: "LifecycleLogger",

  beforeAgent: (state) => {
    logState("beforeAgent", state);
  },

  beforeModel: (state) => {
    logState("beforeModel", state);
  },

  afterModel: (state) => {
    logState("afterModel", state);
  },

  afterAgent: (state) => {
    logState("afterAgent", state);
  }
});

function createBasicAgent() {
  const activeModel = getActiveModelConfig();
  const model = new ChatOpenAI({
    model: activeModel.model,
    apiKey: activeModel.apiKey,
    temperature: 0,
    ...(activeModel.baseURL ? { configuration: { baseURL: activeModel.baseURL } } : {})
  });

  return createAgent({
    model,
    middleware: [lifecycleLogger],
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
  console.log(`Model: ${activeModel.model}`);

  const agent = createBasicAgent();
  const response = await agent.invoke({
    messages: [
      {
        role: "user",
        content: "请用一句话解释 LangChain middleware 是什么。"
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
