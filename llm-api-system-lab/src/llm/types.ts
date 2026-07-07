import type { ProviderName } from "../config.js";

export type LlmProvider = ProviderName;
export type LlmRole = "system" | "user" | "assistant";

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface GenerateTextInput {
  provider?: LlmProvider;
  model?: string;
  messages: LlmMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateTextOutput {
  provider: LlmProvider;
  model: string;
  text: string;
}

export interface GenerateJsonTextInput extends GenerateTextInput {
  schemaName: string;
  jsonSchema: Record<string, unknown>;
}

export interface GenerateImageTextInput {
  provider?: LlmProvider;
  model?: string;
  prompt: string;
  imageUrl: string;
  detail?: "auto" | "low" | "high";
  maxOutputTokens?: number;
}

export interface LlmProviderAdapter {
  provider: LlmProvider;
  defaultModel(): string;
  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
  streamText(input: GenerateTextInput): AsyncIterable<string>;
  generateJsonText(input: GenerateJsonTextInput): Promise<GenerateTextOutput>;
  generateImageText(input: GenerateImageTextInput): Promise<GenerateTextOutput>;
}
