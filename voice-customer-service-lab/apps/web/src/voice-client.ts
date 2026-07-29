import type {
  AgentCommandResponse,
  ApiErrorResponse,
  CreateSessionResponse,
  SessionCommandResponse,
} from "@voice/contracts";

export interface VoiceClientAdapter {
  createSession(idempotencyKey: string): Promise<CreateSessionResponse>;
  startAgent(sessionId: string, idempotencyKey: string): Promise<AgentCommandResponse>;
  stopAgent(sessionId: string, idempotencyKey: string): Promise<AgentCommandResponse>;
  submitMockTurn(sessionId: string, text: string): Promise<SessionCommandResponse>;
  endSession(sessionId: string): Promise<SessionCommandResponse>;
}

export class VoiceApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = "VoiceApiError";
  }
}

export class HttpVoiceClientAdapter implements VoiceClientAdapter {
  constructor(private readonly apiBaseUrl: string) {}

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

  submitMockTurn(sessionId: string, text: string): Promise<SessionCommandResponse> {
    return this.#request<SessionCommandResponse>(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/mock-turns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  endSession(sessionId: string): Promise<SessionCommandResponse> {
    return this.#request<SessionCommandResponse>(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
      },
    );
  }

  async #request<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, init);
    const body: unknown = await response.json();

    if (!response.ok) {
      const error = body as Partial<ApiErrorResponse>;
      throw new VoiceApiError(
        error.error?.message ?? "语音服务请求失败。",
        error.error?.code ?? "UNKNOWN_ERROR",
        error.error?.correlation_id,
      );
    }

    return body as TResponse;
  }
}
