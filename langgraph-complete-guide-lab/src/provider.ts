import { ChatOpenAI } from "@langchain/openai";
import { ActiveModelConfig, getActiveModelConfig } from "./config.js";

export type ReadyModelConfig = ActiveModelConfig & {
  apiKey: string;
};

export function requireActiveModelConfig(): ReadyModelConfig {
  const activeModel = getActiveModelConfig();

  if (!activeModel.apiKey) {
    throw new Error(
      `Missing ${activeModel.apiKeyName}. Copy .env.example to .env and configure the selected provider.`
    );
  }

  return {
    ...activeModel,
    apiKey: activeModel.apiKey
  };
}

export function createChatModel(
  activeModel: ReadyModelConfig = requireActiveModelConfig(),
  temperature = 0
) {
  return new ChatOpenAI({
    model: activeModel.model,
    apiKey: activeModel.apiKey,
    temperature,
    ...(activeModel.baseURL
      ? { configuration: { baseURL: activeModel.baseURL } }
      : {})
  });
}
