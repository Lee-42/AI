import { z } from "zod";
import type {
  EmbeddingVector,
  TextEmbeddingProvider
} from "./contracts.js";

const MAX_API_BATCH_SIZE = 256;
const MAX_TEXT_BYTES = 100_000;
// 多模态接口一次只接收一段文本，因此这里限制并发数，而不是请求内条数。
const DEFAULT_MULTIMODAL_CONCURRENCY = 4;

// 远端响应属于不可信输入，先校验结构和有限数值，再交给上层使用。
const UsageSchema = z
  .object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    total_tokens: z.number().int().nonnegative().optional()
  })
  .optional();

const TextEmbeddingResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().min(1),
  data: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number().finite()).min(1)
    })
  ),
  usage: UsageSchema
});

const MultimodalEmbeddingResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().min(1),
  data: z.object({
    embedding: z.array(z.number().finite()).min(1)
  }),
  usage: UsageSchema
});

const ErrorResponseSchema = z.object({
  error: z
    .object({
      code: z.union([z.string(), z.number()]).optional(),
      message: z.string().optional()
    })
    .optional()
});

export type EmbeddingRequestMetrics = {
  requestId?: string;
  model: string;
  inputCount: number;
  promptTokens?: number;
  totalTokens?: number;
};

export type TextEmbeddingApiMode = "text" | "multimodal";

export type DoubaoTextEmbeddingsOptions = {
  apiKey: string;
  baseURL: string;
  model: string;
  apiMode?: TextEmbeddingApiMode;
  batchSize?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetch?: typeof globalThis.fetch;
  onRequestComplete?: (metrics: EmbeddingRequestMetrics) => void;
};

export class DoubaoEmbeddingError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "DoubaoEmbeddingError";
  }
}

function requireNonEmpty(value: string, name: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error(`${name} must not be empty`);
  }

  return trimmed;
}

function parsePositiveInteger(
  value: number,
  name: string,
  maximum?: number
): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  if (maximum !== undefined && value > maximum) {
    throw new Error(`${name} must not exceed ${maximum}`);
  }

  return value;
}

function parseNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return value;
}

function isRetryableStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

async function summarizeErrorResponse(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const parsed = ErrorResponseSchema.safeParse(body);

    if (!parsed.success || !parsed.data.error) {
      return "remote service returned an error";
    }

    const { code, message } = parsed.data.error;
    const parts = [
      code === undefined ? undefined : `code=${String(code)}`,
      message?.slice(0, 300)
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0
      ? parts.join(", ")
      : "remote service returned an error";
  } catch {
    return "remote service returned a non-JSON error";
  }
}

function validateTexts(texts: string[]): void {
  texts.forEach((text, index) => {
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error(`Embedding input at index ${index} must not be empty`);
    }

    const byteLength = Buffer.byteLength(text, "utf8");

    if (byteLength > MAX_TEXT_BYTES) {
      throw new Error(
        `Embedding input at index ${index} is ${byteLength} bytes; ` +
          `the API limit is ${MAX_TEXT_BYTES} bytes`
      );
    }
  });
}

function normalizeVectors(
  response: z.infer<typeof TextEmbeddingResponseSchema>,
  expectedCount: number
): EmbeddingVector[] {
  if (response.data.length !== expectedCount) {
    throw new DoubaoEmbeddingError(
      `Embedding response contained ${response.data.length} vectors; ` +
        `expected ${expectedCount}`,
      false
    );
  }

  // 文本接口通过 index 表示原输入位置，不能依赖数组恰好有序。
  const ordered = [...response.data].sort((left, right) => {
    return left.index - right.index;
  });

  ordered.forEach((item, expectedIndex) => {
    if (item.index !== expectedIndex) {
      throw new DoubaoEmbeddingError(
        "Embedding response contains missing or duplicate indexes",
        false
      );
    }
  });

  const dimension = ordered[0]?.embedding.length;

  if (
    dimension === undefined ||
    ordered.some((item) => item.embedding.length !== dimension)
  ) {
    throw new DoubaoEmbeddingError(
      "Embedding response contains inconsistent vector dimensions",
      false
    );
  }

  return ordered.map((item) => item.embedding);
}

export class DoubaoTextEmbeddings implements TextEmbeddingProvider {
  private readonly apiKey: string;
  private readonly endpoint: URL;
  private readonly model: string;
  private readonly apiMode: TextEmbeddingApiMode;
  private readonly batchSize: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly onRequestComplete?: (
    metrics: EmbeddingRequestMetrics
  ) => void;
  private vectorDimension?: number;

  constructor(options: DoubaoTextEmbeddingsOptions) {
    this.apiKey = requireNonEmpty(options.apiKey, "apiKey");
    this.model = requireNonEmpty(options.model, "model");
    this.apiMode = options.apiMode ?? "multimodal";
    this.batchSize = parsePositiveInteger(
      options.batchSize ??
        (this.apiMode === "text"
          ? MAX_API_BATCH_SIZE
          : DEFAULT_MULTIMODAL_CONCURRENCY),
      "batchSize",
      MAX_API_BATCH_SIZE
    );
    this.timeoutMs = parsePositiveInteger(
      options.timeoutMs ?? 15_000,
      "timeoutMs"
    );
    this.maxRetries = parseNonNegativeInteger(
      options.maxRetries ?? 2,
      "maxRetries"
    );
    this.retryDelayMs = parseNonNegativeInteger(
      options.retryDelayMs ?? 250,
      "retryDelayMs"
    );
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.onRequestComplete = options.onRequestComplete;

    const baseURL = new URL(requireNonEmpty(options.baseURL, "baseURL"));

    if (baseURL.protocol !== "https:" && baseURL.protocol !== "http:") {
      throw new Error("baseURL must use http or https");
    }

    const endpointPath =
      this.apiMode === "text"
        ? "embeddings"
        : "embeddings/multimodal";

    this.endpoint = new URL(
      endpointPath,
      `${baseURL.toString().replace(/\/+$/, "")}/`
    );
  }

  async embedDocuments(texts: string[]): Promise<EmbeddingVector[]> {
    if (texts.length === 0) {
      return [];
    }

    validateTexts(texts);

    const vectors: EmbeddingVector[] = [];

    for (let start = 0; start < texts.length; start += this.batchSize) {
      const batch = texts.slice(start, start + this.batchSize);

      // 旧文本接口支持在一个 HTTP 请求中提交多段文本。
      if (this.apiMode === "text") {
        const batchVectors = await this.requestBatch(batch);
        vectors.push(...batchVectors);
        continue;
      }

      // 当前多模态接口每个请求只提交一段文本，并以小批量并发控制压力。
      const batchVectors = await Promise.all(
        batch.map(async (text) => {
          const [vector] = await this.requestBatch([text]);

          if (!vector) {
            throw new DoubaoEmbeddingError(
              "Embedding API did not return a text vector",
              false
            );
          }

          return vector;
        })
      );
      vectors.push(...batchVectors);
    }

    return vectors;
  }

  async embedQuery(text: string): Promise<EmbeddingVector> {
    const [vector] = await this.embedDocuments([text]);

    if (!vector) {
      throw new DoubaoEmbeddingError(
        "Embedding API did not return a query vector",
        false
      );
    }

    return vector;
  }

  private async requestBatch(texts: string[]): Promise<EmbeddingVector[]> {
    let lastError: DoubaoEmbeddingError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.requestBatchOnce(texts);
      } catch (error) {
        const normalizedError =
          error instanceof DoubaoEmbeddingError
            ? error
            : new DoubaoEmbeddingError(
                "Unexpected embedding request failure",
                false,
                { cause: error }
              );

        lastError = normalizedError;

        if (!normalizedError.retryable || attempt === this.maxRetries) {
          throw normalizedError;
        }

        // 只重试限流、超时和服务端错误，并使用简单的指数退避。
        await new Promise((resolve) => {
          setTimeout(resolve, this.retryDelayMs * 2 ** attempt);
        });
      }
    }

    throw (
      lastError ??
      new DoubaoEmbeddingError("Embedding request failed", false)
    );
  }

  private async requestBatchOnce(
    texts: string[]
  ): Promise<EmbeddingVector[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;

    try {
      response = await this.fetchImplementation(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(this.createRequestBody(texts)),
        signal: controller.signal
      });
    } catch (error) {
      const message = controller.signal.aborted
        ? `Embedding request timed out after ${this.timeoutMs} ms`
        : "Embedding request could not reach the remote service";

      throw new DoubaoEmbeddingError(message, true, { cause: error });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const summary = await summarizeErrorResponse(response);

      throw new DoubaoEmbeddingError(
        `Embedding API returned HTTP ${response.status}: ${summary}`,
        isRetryableStatus(response.status)
      );
    }

    let body: unknown;

    try {
      body = await response.json();
    } catch (error) {
      throw new DoubaoEmbeddingError(
        "Embedding API returned invalid JSON",
        false,
        { cause: error }
      );
    }

    const result = this.parseResponse(body, texts.length);
    const vectors = result.vectors;
    const dimension = vectors[0]?.length;

    if (dimension === undefined) {
      throw new DoubaoEmbeddingError(
        "Embedding API returned no vectors",
        false
      );
    }

    if (
      this.vectorDimension !== undefined &&
      dimension !== this.vectorDimension
    ) {
      // 同一 Provider 实例必须始终处于同一个向量空间。
      throw new DoubaoEmbeddingError(
        `Embedding dimension changed from ${this.vectorDimension} to ${dimension}`,
        false
      );
    }

    this.vectorDimension = dimension;
    this.onRequestComplete?.({
      requestId: result.requestId,
      model: result.model,
      inputCount: texts.length,
      promptTokens: result.promptTokens,
      totalTokens: result.totalTokens
    });

    return vectors;
  }

  private createRequestBody(texts: string[]): Record<string, unknown> {
    if (this.apiMode === "text") {
      return {
        model: this.model,
        input: texts,
        encoding_format: "float"
      };
    }

    // Vision 模型也能处理纯文本，但请求必须使用多模态 input 结构。
    const [text] = texts;

    if (texts.length !== 1 || text === undefined) {
      throw new DoubaoEmbeddingError(
        "The multimodal embedding API accepts one text per request",
        false
      );
    }

    return {
      model: this.model,
      input: [
        {
          type: "text",
          text
        }
      ],
      encoding_format: "float"
    };
  }

  private parseResponse(
    body: unknown,
    expectedCount: number
  ): {
    vectors: EmbeddingVector[];
    requestId?: string;
    model: string;
    promptTokens?: number;
    totalTokens?: number;
  } {
    if (this.apiMode === "text") {
      const parsed = TextEmbeddingResponseSchema.safeParse(body);

      if (!parsed.success) {
        throw new DoubaoEmbeddingError(
          `Embedding API response validation failed: ${parsed.error.message}`,
          false
        );
      }

      return {
        vectors: normalizeVectors(parsed.data, expectedCount),
        requestId: parsed.data.id,
        model: parsed.data.model,
        promptTokens: parsed.data.usage?.prompt_tokens,
        totalTokens: parsed.data.usage?.total_tokens
      };
    }

    const parsed = MultimodalEmbeddingResponseSchema.safeParse(body);

    if (!parsed.success) {
      throw new DoubaoEmbeddingError(
        `Embedding API response validation failed: ${parsed.error.message}`,
        false
      );
    }

    return {
      vectors: [parsed.data.data.embedding],
      requestId: parsed.data.id,
      model: parsed.data.model,
      promptTokens: parsed.data.usage?.prompt_tokens,
      totalTokens: parsed.data.usage?.total_tokens
    };
  }
}
