import { z } from "zod";
import type {
  EmbeddingVector,
  MultimodalEmbeddingProvider
} from "./contracts.js";
import { DoubaoEmbeddingError } from "./doubao-text-embeddings.js";

const MAX_TEXT_BYTES = 100_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const MultimodalResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string().min(1),
  data: z.object({
    embedding: z.array(z.number().finite()).min(1)
  }),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional()
    })
    .optional()
});

const ErrorResponseSchema = z.object({
  error: z
    .object({
      code: z.union([z.string(), z.number()]).optional(),
      message: z.string().optional()
    })
    .optional()
});

export type MultimodalInputType = "text" | "image";

export type MultimodalEmbeddingRequestMetrics = {
  requestId?: string;
  model: string;
  inputType: MultimodalInputType;
  promptTokens?: number;
  totalTokens?: number;
};

export type DoubaoMultimodalEmbeddingsOptions = {
  apiKey: string;
  baseURL: string;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetch?: typeof globalThis.fetch;
  imageFetch?: typeof globalThis.fetch;
  onRequestComplete?: (
    metrics: MultimodalEmbeddingRequestMetrics
  ) => void;
};

type MultimodalInput =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${name} must not be empty`);
  }

  return normalized;
}

function parsePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
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
    const safeMessage = message?.includes("data:image/")
      ? "remote service rejected the embedded image payload"
      : message?.slice(0, 300);
    const parts = [
      code === undefined ? undefined : `code=${String(code)}`,
      safeMessage
    ]
      .filter((part): part is string => Boolean(part));

    return parts.length > 0
      ? parts.join(", ")
      : "remote service returned an error";
  } catch {
    return "remote service returned a non-JSON error";
  }
}

function validateImageUrl(value: string): string {
  const normalized = requireNonEmpty(value, "imageUrl");
  const url = new URL(normalized);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("imageUrl must use http or https");
  }

  return url.toString();
}

export class DoubaoMultimodalEmbeddings
  implements MultimodalEmbeddingProvider
{
  private readonly apiKey: string;
  private readonly endpoint: URL;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly imageFetchImplementation: typeof globalThis.fetch;
  private readonly onRequestComplete?: (
    metrics: MultimodalEmbeddingRequestMetrics
  ) => void;
  private vectorDimension?: number;

  constructor(options: DoubaoMultimodalEmbeddingsOptions) {
    this.apiKey = requireNonEmpty(options.apiKey, "apiKey");
    this.model = requireNonEmpty(options.model, "model");
    this.timeoutMs = parsePositiveInteger(
      options.timeoutMs ?? 30_000,
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
    this.imageFetchImplementation =
      options.imageFetch ?? this.fetchImplementation;
    this.onRequestComplete = options.onRequestComplete;

    const baseURL = new URL(requireNonEmpty(options.baseURL, "baseURL"));

    if (baseURL.protocol !== "https:" && baseURL.protocol !== "http:") {
      throw new Error("baseURL must use http or https");
    }

    this.endpoint = new URL(
      "embeddings/multimodal",
      `${baseURL.toString().replace(/\/+$/, "")}/`
    );
  }

  async embedText(text: string): Promise<EmbeddingVector> {
    const normalized = requireNonEmpty(text, "text");

    if (Buffer.byteLength(normalized, "utf8") > MAX_TEXT_BYTES) {
      throw new Error(`text must not exceed ${MAX_TEXT_BYTES} bytes`);
    }

    return this.request(
      {
        type: "text",
        text: normalized
      },
      "text"
    );
  }

  async embedImage(imageUrl: string): Promise<EmbeddingVector> {
    const normalizedUrl = validateImageUrl(imageUrl);
    const dataUrl = await this.loadImageAsDataUrl(normalizedUrl);

    return this.request(
      {
        type: "image_url",
        image_url: {
          url: dataUrl
        }
      },
      "image"
    );
  }

  private async loadImageAsDataUrl(imageUrl: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;

    try {
      response = await this.imageFetchImplementation(imageUrl, {
        signal: controller.signal
      });
    } catch (error) {
      const message = controller.signal.aborted
        ? `Image download timed out after ${this.timeoutMs} ms`
        : "Image URL could not be downloaded";

      throw new DoubaoEmbeddingError(message, true, { cause: error });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new DoubaoEmbeddingError(
        `Image download returned HTTP ${response.status}`,
        isRetryableStatus(response.status)
      );
    }

    const contentType = response.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();

    if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
      throw new DoubaoEmbeddingError(
        `Image URL returned unsupported content type ${contentType ?? "unknown"}`,
        false
      );
    }

    const declaredLength = Number(
      response.headers.get("content-length") ?? "0"
    );

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_IMAGE_BYTES
    ) {
      throw new DoubaoEmbeddingError(
        `Image exceeds the ${MAX_IMAGE_BYTES} byte limit`,
        false
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
      throw new DoubaoEmbeddingError(
        `Image must contain 1 to ${MAX_IMAGE_BYTES} bytes`,
        false
      );
    }

    // Base64 只存在于本次 API 请求，不会写入 Chroma 或日志。
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  }

  private async request(
    input: MultimodalInput,
    inputType: MultimodalInputType
  ): Promise<EmbeddingVector> {
    let lastError: DoubaoEmbeddingError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.requestOnce(input, inputType);
      } catch (error) {
        const normalizedError =
          error instanceof DoubaoEmbeddingError
            ? error
            : new DoubaoEmbeddingError(
                "Unexpected multimodal embedding request failure",
                false,
                { cause: error }
              );
        lastError = normalizedError;

        if (!normalizedError.retryable || attempt === this.maxRetries) {
          throw normalizedError;
        }

        await new Promise((resolve) => {
          setTimeout(resolve, this.retryDelayMs * 2 ** attempt);
        });
      }
    }

    throw (
      lastError ??
      new DoubaoEmbeddingError(
        "Multimodal embedding request failed",
        false
      )
    );
  }

  private async requestOnce(
    input: MultimodalInput,
    inputType: MultimodalInputType
  ): Promise<EmbeddingVector> {
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
        body: JSON.stringify({
          model: this.model,
          input: [input],
          encoding_format: "float"
        }),
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

    const parsed = MultimodalResponseSchema.safeParse(body);

    if (!parsed.success) {
      throw new DoubaoEmbeddingError(
        `Embedding API response validation failed: ${parsed.error.message}`,
        false
      );
    }

    const vector = parsed.data.data.embedding;

    // 同一个实例的图像和文本必须始终落在同一维向量空间。
    if (
      this.vectorDimension !== undefined &&
      vector.length !== this.vectorDimension
    ) {
      throw new DoubaoEmbeddingError(
        `Embedding dimension changed from ${this.vectorDimension} to ${vector.length}`,
        false
      );
    }

    this.vectorDimension = vector.length;
    this.onRequestComplete?.({
      requestId: parsed.data.id,
      model: parsed.data.model,
      inputType,
      promptTokens: parsed.data.usage?.prompt_tokens,
      totalTokens: parsed.data.usage?.total_tokens
    });

    return vector;
  }
}
