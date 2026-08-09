import { ChatOpenAI } from "@langchain/openai";
import { ActiveModelConfig, getActiveModelConfig } from "./config.js";

export type ReadyModelConfig = ActiveModelConfig & {
  apiKey: string;
};

export function requireModelConfig(): ReadyModelConfig {
  const config = getActiveModelConfig();

  if (!config.apiKey) {
    throw new Error(
      `Missing ${config.apiKeyName}. Copy .env.example to .env and configure ${config.provider}.`
    );
  }

  return {
    ...config,
    apiKey: config.apiKey
  };
}

export function createChatModel(config: ReadyModelConfig = requireModelConfig()) {
  return new ChatOpenAI({
    model: config.model,
    apiKey: config.apiKey,
    temperature: 0,
    ...(config.baseURL
      ? { configuration: { baseURL: config.baseURL } }
      : {})
  });
}
