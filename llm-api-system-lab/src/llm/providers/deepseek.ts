import OpenAI from "openai";
import { config, requireEnv } from "../../config.js";
import type {
  GenerateImageTextInput,
  GenerateJsonTextInput,
  GenerateTextInput,
  GenerateTextOutput,
  LlmMessage,
  LlmProviderAdapter
} from "../types.js";

export function createDeepSeekClient(): OpenAI {
  return new OpenAI({
    apiKey: requireEnv("DEEPSEEK_API_KEY"),
    baseURL: config.deepseek.baseURL
  });
}

function buildCommonOptions(input: GenerateTextInput) {
  return {
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.maxOutputTokens !== undefined ? { max_tokens: input.maxOutputTokens } : {})
  };
}

function withJsonInstruction(input: GenerateJsonTextInput): LlmMessage[] {
  return [
    {
      role: "system",
      content: [
        "You must output valid JSON only.",
        "Do not wrap the result in Markdown.",
        `Schema name: ${input.schemaName}`,
        `JSON Schema: ${JSON.stringify(input.jsonSchema)}`
      ].join("\n")
    },
    ...input.messages
  ];
}

export function createDeepSeekAdapter(): LlmProviderAdapter {
  const client = createDeepSeekClient();

  return {
    provider: "deepseek",

    defaultModel() {
      return config.deepseek.model;
    },

    async generateText(input): Promise<GenerateTextOutput> {
      const model = input.model ?? this.defaultModel();
      const response = await client.chat.completions.create({
        model,
        messages: input.messages,
        ...buildCommonOptions(input)
      });

      return {
        provider: this.provider,
        model,
        text: response.choices[0]?.message.content ?? ""
      };
    },

    async *streamText(input): AsyncIterable<string> {
      const model = input.model ?? this.defaultModel();
      const stream = await client.chat.completions.create({
        model,
        messages: input.messages,
        stream: true,
        ...buildCommonOptions(input)
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;

        if (delta) {
          yield delta;
        }
      }
    },

    async generateJsonText(input: GenerateJsonTextInput): Promise<GenerateTextOutput> {
      const model = input.model ?? this.defaultModel();
      const response = await client.chat.completions.create({
        model,
        messages: withJsonInstruction(input),
        response_format: { type: "json_object" },
        ...buildCommonOptions(input)
      });

      return {
        provider: this.provider,
        model,
        text: response.choices[0]?.message.content ?? ""
      };
    },

    async generateImageText(input: GenerateImageTextInput): Promise<GenerateTextOutput> {
      const model = input.model ?? config.deepseek.visionModel;
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: input.prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: input.imageUrl,
                  // DeepSeek 是否可用取决于当前账号和视觉模型是否开放。
                  detail: input.detail ?? "auto"
                }
              }
            ]
          }
        ],
        ...(input.maxOutputTokens !== undefined ? { max_tokens: input.maxOutputTokens } : {})
      });

      return {
        provider: this.provider,
        model,
        text: response.choices[0]?.message.content ?? ""
      };
    }
  };
}
