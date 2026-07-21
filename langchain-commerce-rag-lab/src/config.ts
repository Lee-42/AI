import "dotenv/config";
import { z } from "zod";

function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional()
);

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().url().optional()
);

const urlWithDefault = (fallback: string) =>
  z.preprocess(emptyToUndefined, z.string().url().default(fallback));

const EnvSchema = z.object({
  CHROMA_URL: urlWithDefault("http://localhost:8000"),
  ARK_API_KEY: optionalString,
  ARK_BASE_URL: urlWithDefault(
    "https://ark.cn-beijing.volces.com/api/v3"
  ),
  ARK_TEXT_EMBEDDING_MODEL: optionalString,
  ARK_MULTIMODAL_EMBEDDING_MODEL: optionalString,
  CHAT_API_KEY: optionalString,
  CHAT_BASE_URL: optionalUrl,
  CHAT_MODEL: optionalString
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

const env = parsed.data;

export const config = {
  chroma: {
    url: env.CHROMA_URL
  },
  ark: {
    apiKey: env.ARK_API_KEY,
    baseURL: env.ARK_BASE_URL,
    textEmbeddingModel: env.ARK_TEXT_EMBEDDING_MODEL,
    multimodalEmbeddingModel: env.ARK_MULTIMODAL_EMBEDDING_MODEL
  },
  chat: {
    apiKey: env.CHAT_API_KEY,
    baseURL: env.CHAT_BASE_URL,
    model: env.CHAT_MODEL
  }
} as const;

export function getSetupStatus() {
  return {
    chromaUrl: config.chroma.url,
    arkApiKey: Boolean(config.ark.apiKey),
    textEmbeddingModel: Boolean(config.ark.textEmbeddingModel),
    multimodalEmbeddingModel: Boolean(
      config.ark.multimodalEmbeddingModel
    ),
    chatModel: Boolean(config.chat.apiKey && config.chat.model)
  };
}
