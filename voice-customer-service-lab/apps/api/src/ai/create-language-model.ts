import type { ServerConfig } from "../core/config.js";
import type { LanguageModel } from "./ai-ports.js";
import { MockLanguageModel } from "./mock-language-model.js";
import { VolcengineArkLanguageModel } from "./volcengine-ark-language-model.js";

export function createLanguageModel(config: ServerConfig): LanguageModel {
  if (config.ai.provider === "mock") {
    return new MockLanguageModel();
  }

  const { apiKey, baseUrl, model } = config.ai.volcengine;
  if (!config.ai.paidCallsEnabled || !apiKey || !model) {
    throw new Error("Volcengine LLM requires the paid-call switch, model and server-side API Key.");
  }
  return new VolcengineArkLanguageModel({
    baseUrl,
    model,
    apiKey,
    timeoutMs: config.ai.requestTimeoutMs,
  });
}
