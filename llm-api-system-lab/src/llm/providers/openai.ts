import OpenAI from "openai";
import { config, requireEnv } from "../../config.js";
import type {
  GenerateImageTextInput,
  GenerateJsonTextInput,
  GenerateTextInput,
  GenerateTextOutput,
  LlmProviderAdapter
} from "../types.js";

export function createOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: requireEnv("OPENAI_API_KEY")
  });
}

export function getOpenAIDefaultModel(): string {
  return config.openai.model;
}

export function getOpenAIDefaultVisionModel(): string {
  return config.openai.visionModel;
}

function buildCommonOptions(input: GenerateTextInput) {
  return {
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.maxOutputTokens !== undefined ? { max_output_tokens: input.maxOutputTokens } : {})
  };
}

export function createOpenAIAdapter(): LlmProviderAdapter {
  const client = createOpenAIClient();

  return {
    provider: "openai",

    defaultModel() {
      return getOpenAIDefaultModel();
    },

    async generateText(input): Promise<GenerateTextOutput> {
      const model = input.model ?? this.defaultModel();
      const response = await client.responses.create({
        model,
        input: input.messages,
        ...buildCommonOptions(input)
      });

      return {
        provider: this.provider,
        model,
        text: response.output_text
      };
    },

    async *streamText(input): AsyncIterable<string> {
      const model = input.model ?? this.defaultModel();
      const stream = await client.responses.create({
        model,
        input: input.messages,
        stream: true,
        ...buildCommonOptions(input)
      });

      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          yield event.delta;
        }
      }
    },

    async generateJsonText(input: GenerateJsonTextInput): Promise<GenerateTextOutput> {
      const model = input.model ?? this.defaultModel();
      const response = await client.responses.create({
        model,
        input: input.messages,
        text: {
          format: {
            type: "json_schema",
            name: input.schemaName,
            schema: input.jsonSchema,
            strict: true
          }
        },
        ...buildCommonOptions(input)
      });

      return {
        provider: this.provider,
        model,
        text: response.output_text
      };
    },

    async generateImageText(input: GenerateImageTextInput): Promise<GenerateTextOutput> {
      const model = input.model ?? getOpenAIDefaultVisionModel();
      const response = await client.responses.create({
        model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: input.prompt
              },
              {
                type: "input_image",
                image_url: input.imageUrl,
                // 图片 detail 会影响识别精度和 token 成本。
                detail: input.detail ?? "auto"
              }
            ]
          }
        ],
        ...(input.maxOutputTokens !== undefined ? { max_output_tokens: input.maxOutputTokens } : {})
      });

      return {
        provider: this.provider,
        model,
        text: response.output_text
      };
    }
  };
}
