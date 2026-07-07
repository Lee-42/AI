import { getDefaultProvider } from "../config.js";
import { createDeepSeekAdapter } from "./providers/deepseek.js";
import { createOpenAIAdapter } from "./providers/openai.js";
import type {
  GenerateImageTextInput,
  GenerateJsonTextInput,
  GenerateTextInput,
  GenerateTextOutput,
  LlmProvider,
  LlmProviderAdapter
} from "./types.js";

export function getActiveProviderName(provider?: LlmProvider): LlmProvider {
  return provider ?? getDefaultProvider();
}

function createAdapter(provider?: LlmProvider): LlmProviderAdapter {
  const activeProvider = getActiveProviderName(provider);

  if (activeProvider === "deepseek") {
    return createDeepSeekAdapter();
  }

  return createOpenAIAdapter();
}

// 业务示例只调用统一门面，避免直接绑定某个供应商 SDK。
export async function generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
  return createAdapter(input.provider).generateText(input);
}

export async function* streamText(input: GenerateTextInput): AsyncIterable<string> {
  yield* createAdapter(input.provider).streamText(input);
}

export async function generateJsonText(
  input: GenerateJsonTextInput
): Promise<GenerateTextOutput> {
  return createAdapter(input.provider).generateJsonText(input);
}

export async function generateImageText(
  input: GenerateImageTextInput
): Promise<GenerateTextOutput> {
  return createAdapter(input.provider).generateImageText(input);
}
