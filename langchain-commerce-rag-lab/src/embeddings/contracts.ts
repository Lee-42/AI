export type EmbeddingVector = number[];

export interface TextEmbeddingProvider {
  embedDocuments(texts: string[]): Promise<EmbeddingVector[]>;
  embedQuery(text: string): Promise<EmbeddingVector>;
}

export interface MultimodalEmbeddingProvider {
  embedText(text: string): Promise<EmbeddingVector>;
  embedImage(imageUrl: string): Promise<EmbeddingVector>;
}
