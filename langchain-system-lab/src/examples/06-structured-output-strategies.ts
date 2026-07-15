import { ChatOpenAI } from "@langchain/openai";
import { createAgent, providerStrategy, toolStrategy } from "langchain";
import { z } from "zod";
import { ActiveModelConfig, getActiveModelConfig } from "../config.js";

const LessonSummarySchema = z.object({
  topic: z.string().describe("The topic being summarized"),
  summary: z.string().describe("A short Chinese summary"),
  keyPoints: z.array(z.string()).describe("Three key points in Chinese"),
  confidence: z.number().min(0).max(1).describe("Confidence score from 0 to 1")
});

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

  return JSON.stringify(content);
}

function extractJson(text: string): string {
  const fencedJson = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  return (fencedJson?.[1] ?? text).trim();
}

async function promptOnlyStructuredOutput(activeModel: ActiveModelConfig) {
  const model = createChatModel(activeModel);
  const response = await model.invoke([
    {
      role: "system",
      content: [
        "你必须只输出 JSON，不要输出 Markdown。",
        "JSON 字段必须是：topic、summary、keyPoints、confidence。",
        "keyPoints 必须是字符串数组，confidence 必须是 0 到 1 之间的数字。"
      ].join("\n")
    },
    {
      role: "user",
      content: "请总结：LangChain middleware 可以在 agent 执行过程中拦截模型调用和工具调用。"
    }
  ]);

  const rawText = contentToText(response.content);

  console.log("\n--- prompt-only raw output ---");
  console.log(rawText);

  try {
    const parsed = JSON.parse(extractJson(rawText));
    const validated = LessonSummarySchema.parse(parsed);

    console.log("\n--- prompt-only parsed output ---");
    console.dir(validated, { depth: null });
  } catch (error) {
    console.log("\n--- prompt-only parse failed ---");
    console.log(error);
  }
}

async function toolStrategyStructuredOutput(activeModel: ActiveModelConfig) {
  const agent = createAgent({
    model: createChatModel(activeModel),
    tools: [],
    responseFormat: toolStrategy(LessonSummarySchema, {
      toolMessageContent: "Structured lesson summary captured."
    }),
    systemPrompt: "You are a concise assistant. Return the requested structured summary in Chinese."
  });

  const response = await agent.invoke({
    messages: [
      {
        role: "user",
        content: "请总结：LangChain middleware 可以在 agent 执行过程中拦截模型调用和工具调用。"
      }
    ]
  });

  console.log("\n--- toolStrategy structuredResponse ---");
  console.dir(response.structuredResponse, { depth: null });

  console.log("\n--- toolStrategy final message count ---");
  console.log(response.messages.length);
}

async function providerStrategyStructuredOutput(activeModel: ActiveModelConfig) {
  if (activeModel.provider !== "openai") {
    console.log("\n--- providerStrategy skipped ---");
    console.log("providerStrategy needs native structured output support. This lab runs it for OpenAI by default.");
    return;
  }

  const agent = createAgent({
    model: createChatModel(activeModel),
    tools: [],
    responseFormat: providerStrategy({
      schema: LessonSummarySchema,
      strict: true
    }),
    systemPrompt: "You are a concise assistant. Return the requested structured summary in Chinese."
  });

  const response = await agent.invoke({
    messages: [
      {
        role: "user",
        content: "请总结：LangChain middleware 可以在 agent 执行过程中拦截模型调用和工具调用。"
      }
    ]
  });

  console.log("\n--- providerStrategy structuredResponse ---");
  console.dir(response.structuredResponse, { depth: null });

  console.log("\n--- providerStrategy final message count ---");
  console.log(response.messages.length);
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

  await promptOnlyStructuredOutput(activeModel);
  await toolStrategyStructuredOutput(activeModel);
  await providerStrategyStructuredOutput(activeModel);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
