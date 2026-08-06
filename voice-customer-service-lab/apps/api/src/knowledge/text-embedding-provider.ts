import { createHash } from "node:crypto";

export interface TextEmbeddingBatch {
  readonly model: string;
  readonly dimension: number;
  readonly vectors: readonly (readonly number[])[];
}

export interface TextEmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimension: number;
  embedDocuments(texts: readonly string[], signal?: AbortSignal): Promise<TextEmbeddingBatch>;
}

/** Zero-cost test double. Its vectors are deterministic, but intentionally not semantic. */
export class DeterministicTextEmbeddingProvider implements TextEmbeddingProvider {
  readonly name = "deterministic-test-embedding";
  readonly model: string;
  readonly dimension: number;

  constructor(options: { readonly model?: string; readonly dimension?: number } = {}) {
    this.model = options.model ?? "mock-hash-embedding@1";
    this.dimension = positiveInteger(options.dimension ?? 16, "dimension");
  }

  async embedDocuments(
    texts: readonly string[],
    signal?: AbortSignal,
  ): Promise<TextEmbeddingBatch> {
    assertEmbeddingInput(texts, signal);
    return {
      model: this.model,
      dimension: this.dimension,
      vectors: texts.map((text) => normalizedHashVector(text, this.dimension)),
    };
  }
}

export function validateEmbeddingBatch(
  batch: TextEmbeddingBatch,
  expected: {
    readonly count: number;
    readonly model: string;
    readonly dimension: number;
  },
): void {
  if (batch.model !== expected.model) {
    throw new Error("Embedding provider returned an unexpected model.");
  }
  if (batch.dimension !== expected.dimension || batch.vectors.length !== expected.count) {
    throw new Error("Embedding provider returned an unexpected vector shape.");
  }
  for (const vector of batch.vectors) {
    if (vector.length !== expected.dimension || vector.some((value) => !Number.isFinite(value))) {
      throw new Error("Embedding provider returned an invalid vector.");
    }
  }
}

function assertEmbeddingInput(texts: readonly string[], signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Embedding request was cancelled.");
  }
  if (texts.length === 0 || texts.some((text) => text.trim().length === 0)) {
    throw new Error("Embedding input must contain at least one non-empty document.");
  }
}

function normalizedHashVector(text: string, dimension: number): number[] {
  const values: number[] = [];
  for (let block = 0; values.length < dimension; block += 1) {
    const digest = createHash("sha256").update(`${block}\0${text}`, "utf8").digest();
    for (const byte of digest) {
      values.push(byte / 127.5 - 1);
      if (values.length === dimension) {
        break;
      }
    }
  }
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return values.map((value) => value / magnitude);
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
