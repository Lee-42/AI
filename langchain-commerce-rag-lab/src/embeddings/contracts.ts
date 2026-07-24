export type EmbeddingVector = number[];

// 上层只依赖向量能力，不感知供应商的 URL、鉴权和响应格式。
export interface TextEmbeddingProvider {
  embedDocuments(texts: string[]): Promise<EmbeddingVector[]>;
  embedQuery(text: string): Promise<EmbeddingVector>;
}

export interface MultimodalEmbeddingProvider {
  embedText(text: string): Promise<EmbeddingVector>;
  embedImage(imageUrl: string): Promise<EmbeddingVector>;
}
