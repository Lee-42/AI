import { z } from "zod";

import type { SecretValue } from "../core/secret-value.js";
import type { TextEmbeddingBatch, TextEmbeddingProvider } from "./text-embedding-provider.js";
import { validateEmbeddingBatch } from "./text-embedding-provider.js";

const responseSchema = z
  .object({
    model: z.string().min(1),
    data: z.object({ embedding: z.array(z.number().finite()).min(1) }),
  })
  .passthrough();

export interface VolcengineTextEmbeddingProviderOptions {
  readonly baseUrl: string;
  readonly model: string;
  readonly dimension: number;
  readonly apiKey: SecretValue;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

/** Ark adapter for the configured Doubao multimodal Embedding endpoint. */
export class VolcengineTextEmbeddingProvider implements TextEmbeddingProvider {
  readonly name = "volcengine-ark-embedding";
  readonly model: string;
  readonly dimension: number;
  readonly #endpoint: string;
  readonly #apiKey: SecretValue;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: VolcengineTextEmbeddingProviderOptions) {
    this.model = options.model;
    this.dimension = options.dimension;
    this.#endpoint = `${options.baseUrl.replace(/\/$/u, "")}/embeddings/multimodal`;
    this.#apiKey = options.apiKey;
    this.#timeoutMs = options.timeoutMs;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async embedDocuments(
    texts: readonly string[],
    signal?: AbortSignal,
  ): Promise<TextEmbeddingBatch> {
    if (signal?.aborted) {
      throw new Error("Embedding request was cancelled.");
    }
    if (texts.length === 0 || texts.some((text) => text.trim().length === 0)) {
      throw new Error("Embedding input must contain at least one non-empty document.");
    }

    // One provider request per text keeps the adapter compatible with this endpoint's input shape.
    const vectors: number[][] = [];
    for (const text of texts) {
      vectors.push(await this.#embedOne(text, signal));
    }
    const batch = { model: this.model, dimension: this.dimension, vectors };
    validateEmbeddingBatch(batch, {
      count: texts.length,
      model: this.model,
      dimension: this.dimension,
    });
    return batch;
  }

  async #embedOne(text: string, parentSignal?: AbortSignal): Promise<number[]> {
    const timeoutSignal = AbortSignal.timeout(this.#timeoutMs);
    const signal = parentSignal ? AbortSignal.any([parentSignal, timeoutSignal]) : timeoutSignal;
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#apiKey.reveal()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          input: [{ type: "text", text }],
          encoding_format: "float",
        }),
        signal,
      });
    } catch {
      if (parentSignal?.aborted) {
        throw new Error("Embedding request was cancelled.");
      }
      throw new Error(
        timeoutSignal.aborted
          ? "Embedding provider timed out."
          : "Embedding provider could not be reached.",
      );
    }

    if (!response.ok) {
      // Do not include provider response bodies; they can contain sensitive details.
      throw new Error(`Embedding provider rejected the request with HTTP ${response.status}.`);
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new Error("Embedding provider returned invalid JSON.");
    }
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Embedding provider returned an invalid response.");
    }
    const vector = parsed.data.data.embedding;
    if (vector.length !== this.dimension) {
      throw new Error("Embedding provider returned an unexpected vector dimension.");
    }
    return vector;
  }
}
