import type {
  AgentCommandResponse,
  ApiErrorResponse,
  CreateSessionResponse,
  EndSessionResponse,
  HandoffReason,
  HandoffResponse,
  RealtimeSliObservationAck,
  RealtimeSliObservationRequest,
  SessionCommandResponse,
} from "@voice/contracts";

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;

export interface VoiceClientAdapter {
  createSession(idempotencyKey: string): Promise<CreateSessionResponse>;
  startAgent(sessionId: string, idempotencyKey: string): Promise<AgentCommandResponse>;
  stopAgent(sessionId: string, idempotencyKey: string): Promise<AgentCommandResponse>;
  submitMockTurn(
    sessionId: string,
    text: string,
    idempotencyKey: string,
  ): Promise<SessionCommandResponse>;
  endSession(sessionId: string, idempotencyKey: string): Promise<EndSessionResponse>;
  requestHandoff(
    sessionId: string,
    reason: HandoffReason,
    idempotencyKey: string,
  ): Promise<HandoffResponse>;
  recordRealtimeObservation(
    sessionId: string,
    observation: RealtimeSliObservationRequest,
  ): Promise<RealtimeSliObservationAck>;
}

export interface HttpVoiceClientOptions {
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly fetcher?: typeof fetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly random?: () => number;
}

export class VoiceApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly correlationId?: string,
    readonly retryable = false,
    readonly attempts = 1,
  ) {
    super(message);
    this.name = "VoiceApiError";
  }
}

export class HttpVoiceClientAdapter implements VoiceClientAdapter {
  readonly #timeoutMs: number;
  readonly #maxAttempts: number;
  readonly #fetcher: typeof fetch;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #random: () => number;

  constructor(
    private readonly apiBaseUrl: string,
    options: HttpVoiceClientOptions = {},
  ) {
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.#fetcher = options.fetcher ?? fetch;
    this.#sleep = options.sleep ?? wait;
    this.#random = options.random ?? Math.random;
    if (this.#timeoutMs <= 0 || !Number.isSafeInteger(this.#maxAttempts) || this.#maxAttempts < 1) {
      throw new Error("HTTP retry options must use a positive timeout and attempt count.");
    }
  }

  createSession(idempotencyKey: string): Promise<CreateSessionResponse> {
    return this.#request<CreateSessionResponse>("/api/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ locale: "zh-CN" }),
    });
  }

  submitMockTurn(
    sessionId: string,
    text: string,
    idempotencyKey: string,
  ): Promise<SessionCommandResponse> {
    return this.#request<SessionCommandResponse>(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/mock-turns`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ text }),
      },
    );
  }

  startAgent(sessionId: string, idempotencyKey: string): Promise<AgentCommandResponse> {
    return this.#request<AgentCommandResponse>(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/agent`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    );
  }

  stopAgent(sessionId: string, idempotencyKey: string): Promise<AgentCommandResponse> {
    return this.#request<AgentCommandResponse>(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/agent`,
      {
        method: "DELETE",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    );
  }

  endSession(sessionId: string, idempotencyKey: string): Promise<EndSessionResponse> {
    return this.#request<EndSessionResponse>(`/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": idempotencyKey },
    });
  }

  requestHandoff(
    sessionId: string,
    reason: HandoffReason,
    idempotencyKey: string,
  ): Promise<HandoffResponse> {
    return this.#request<HandoffResponse>(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/handoff`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ reason }),
      },
    );
  }

  recordRealtimeObservation(
    sessionId: string,
    observation: RealtimeSliObservationRequest,
  ): Promise<RealtimeSliObservationAck> {
    return this.#request<RealtimeSliObservationAck>(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/realtime-observations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(observation),
      },
    );
  }

  async #request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    let lastError: VoiceApiError | null = null;
    const tracedInit = withTraceparent(init, createTraceparent());
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      try {
        return await this.#attempt<TResponse>(path, tracedInit, attempt);
      } catch (error) {
        lastError = normalizeClientError(error, attempt);
        if (!lastError.retryable || attempt === this.#maxAttempts) {
          throw lastError;
        }
        await this.#sleep(retryDelayMs(attempt, this.#random()));
      }
    }
    throw lastError ?? new VoiceApiError("语音服务请求失败。", "UNKNOWN_ERROR");
  }

  async #attempt<TResponse>(path: string, init: RequestInit, attempt: number): Promise<TResponse> {
    let response: Response;
    try {
      response = await this.#fetcher(`${this.apiBaseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
      throw new VoiceApiError(
        timedOut ? "语音服务请求超时。" : "暂时无法连接语音服务。",
        timedOut ? "HTTP_TIMEOUT" : "NETWORK_ERROR",
        undefined,
        true,
        attempt,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new VoiceApiError(
        "语音服务返回了无法解析的响应。",
        "INVALID_API_RESPONSE",
        undefined,
        response.status >= 500,
        attempt,
      );
    }

    if (!response.ok) {
      const error = body as Partial<ApiErrorResponse>;
      throw new VoiceApiError(
        error.error?.message ?? "语音服务请求失败。",
        error.error?.code ?? "UNKNOWN_ERROR",
        error.error?.correlation_id,
        error.error?.retryable ?? isRetryableStatus(response.status),
        attempt,
      );
    }

    return body as TResponse;
  }
}

export function retryDelayMs(failedAttempt: number, randomValue: number): number {
  const exponential = Math.min(1_000, 200 * 2 ** Math.max(0, failedAttempt - 1));
  const boundedRandom = Math.min(1, Math.max(0, randomValue));
  return Math.min(1_000, Math.round(exponential * (0.8 + boundedRandom * 0.4)));
}

export function createTraceparent(randomHex: (bytes: number) => string = secureRandomHex): string {
  const traceId = nonZeroHex(randomHex(16), 32);
  const parentId = nonZeroHex(randomHex(8), 16);
  return `00-${traceId}-${parentId}-01`;
}

function withTraceparent(init: RequestInit, traceparent: string): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Traceparent", traceparent);
  return { ...init, headers };
}

function secureRandomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function nonZeroHex(value: string, expectedLength: number): string {
  if (!new RegExp(`^[0-9a-f]{${expectedLength}}$`, "u").test(value)) {
    throw new Error("Trace ID source returned invalid hexadecimal data.");
  }
  return value === "0".repeat(expectedLength) ? `${"0".repeat(expectedLength - 1)}1` : value;
}

function isRetryableStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

function normalizeClientError(error: unknown, attempt: number): VoiceApiError {
  if (error instanceof VoiceApiError) {
    return error;
  }
  return new VoiceApiError("语音服务请求失败。", "UNKNOWN_ERROR", undefined, false, attempt);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
