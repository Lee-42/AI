import { config } from "../config.js";
import {
  DoubaoTextEmbeddings,
  type EmbeddingRequestMetrics
} from "./doubao-text-embeddings.js";

type CreateTextEmbeddingsOptions = {
  onRequestComplete?: (metrics: EmbeddingRequestMetrics) => void;
};

function requireConfig(
  value: string | undefined,
  environmentVariable: string
): string {
  if (!value) {
    throw new Error(
      `${environmentVariable} is required before calling the embedding API`
    );
  }

  return value;
}

// 示例只需要调用工厂，不重复拼装供应商配置。
export function createTextEmbeddings(
  options: CreateTextEmbeddingsOptions = {}
): DoubaoTextEmbeddings {
  return new DoubaoTextEmbeddings({
    apiKey: requireConfig(config.ark.apiKey, "ARK_API_KEY"),
    baseURL: config.ark.baseURL,
    model: requireConfig(
      config.ark.textEmbeddingModel,
      "ARK_TEXT_EMBEDDING_MODEL"
    ),
    apiMode: config.ark.textEmbeddingApiMode,
    onRequestComplete: options.onRequestComplete
  });
}
