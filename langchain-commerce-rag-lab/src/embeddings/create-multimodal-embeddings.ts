import { config } from "../config.js";
import {
  DoubaoMultimodalEmbeddings,
  type MultimodalEmbeddingRequestMetrics
} from "./doubao-multimodal-embeddings.js";

type CreateMultimodalEmbeddingsOptions = {
  onRequestComplete?: (
    metrics: MultimodalEmbeddingRequestMetrics
  ) => void;
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

export function createMultimodalEmbeddings(
  options: CreateMultimodalEmbeddingsOptions = {}
): DoubaoMultimodalEmbeddings {
  return new DoubaoMultimodalEmbeddings({
    apiKey: requireConfig(config.ark.apiKey, "ARK_API_KEY"),
    baseURL: config.ark.baseURL,
    model: requireConfig(
      config.ark.multimodalEmbeddingModel,
      "ARK_MULTIMODAL_EMBEDDING_MODEL"
    ),
    onRequestComplete: options.onRequestComplete
  });
}
