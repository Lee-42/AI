import type { TextEmbeddingBatch, TextEmbeddingProvider } from "./text-embedding-provider.js";

const concepts: readonly RegExp[] = [
  /退货|换货|退换|签收|自然日|无理由/u,
  /质量|故障|坏了|售后|维修/u,
  /配送|快递|物流|出库|发货|送达|偏远/u,
  /发票|开票/u,
  /上门取件|取件费|取货/u,
  /环保|包装|填充物/u,
  /夜间|定时配送/u,
  /密码|验证码|安全/u,
];

/** Course-only semantic simulator. It is not a substitute for a real Embedding model. */
export class CommerceFixtureEmbeddingProvider implements TextEmbeddingProvider {
  readonly name = "commerce-fixture-embedding";
  readonly model = "fixture-commerce-concepts@1";
  readonly dimension = concepts.length;

  async embedDocuments(
    texts: readonly string[],
    signal?: AbortSignal,
  ): Promise<TextEmbeddingBatch> {
    if (signal?.aborted) {
      throw new Error("Embedding request was cancelled.");
    }
    if (texts.length === 0 || texts.some((text) => text.trim().length === 0)) {
      throw new Error("Embedding input must contain non-empty documents.");
    }
    return {
      model: this.model,
      dimension: this.dimension,
      vectors: texts.map(embedConcepts),
    };
  }
}

function embedConcepts(text: string): number[] {
  const values: number[] = concepts.map((pattern) => (pattern.test(text) ? 1 : 0));
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return magnitude === 0 ? values : values.map((value) => value / magnitude);
}
