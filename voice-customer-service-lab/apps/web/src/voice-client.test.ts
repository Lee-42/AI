import { describe, expect, it, vi } from "vitest";

import {
  createTraceparent,
  HttpVoiceClientAdapter,
  retryDelayMs,
  VoiceApiError,
} from "./voice-client";

describe("HttpVoiceClientAdapter", () => {
  it("retries a retryable response with the same Idempotency-Key", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(503, true))
      .mockResolvedValueOnce(jsonResponse({ session: { session_id: "ses_000001" } }));
    const sleep = vi.fn(async () => undefined);
    const client = new HttpVoiceClientAdapter("http://localhost:8000", {
      fetcher,
      sleep,
      random: () => 0.5,
    });

    await client.createSession("stable-create-key");

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(requestHeader(fetcher, 0, "Idempotency-Key")).toBe("stable-create-key");
    expect(requestHeader(fetcher, 1, "Idempotency-Key")).toBe("stable-create-key");
    expect(requestHeader(fetcher, 1, "Traceparent")).toBe(requestHeader(fetcher, 0, "Traceparent"));
    expect(sleep).toHaveBeenCalledWith(200);
  });

  it("does not retry a non-retryable contract error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(errorResponse(409, false));
    const sleep = vi.fn(async () => undefined);
    const client = new HttpVoiceClientAdapter("http://localhost:8000", { fetcher, sleep });

    await expect(client.startAgent("ses_000001", "stable-agent-key")).rejects.toMatchObject({
      code: "TEST_FAILURE",
      retryable: false,
      attempts: 1,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("bounds network retries and reports the final attempt", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    const client = new HttpVoiceClientAdapter("http://localhost:8000", {
      fetcher,
      sleep: async () => undefined,
      maxAttempts: 3,
    });

    const error = await client
      .endSession("ses_000001", "stable-end-key")
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(VoiceApiError);
    expect(error).toMatchObject({ code: "NETWORK_ERROR", retryable: true, attempts: 3 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("sends idempotency keys and content-only realtime observations", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse({ events: [] }));
    const client = new HttpVoiceClientAdapter("http://localhost:8000", { fetcher });

    await client.submitMockTurn("ses_000001", "查询订单", "stable-turn-key");
    await client.requestHandoff("ses_000001", "user_request", "stable-handoff-key");
    await client.endSession("ses_000001", "stable-end-key");
    await client.recordRealtimeObservation("ses_000001", {
      observation_id: "obs_000001",
      sli: "turn_first_output",
      source: "mock",
      outcome: "success",
      duration_ms: 850,
    });

    expect(requestHeader(fetcher, 0, "Idempotency-Key")).toBe("stable-turn-key");
    expect(requestHeader(fetcher, 1, "Idempotency-Key")).toBe("stable-handoff-key");
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe('{"reason":"user_request"}');
    expect(requestHeader(fetcher, 2, "Idempotency-Key")).toBe("stable-end-key");
    expect(fetcher.mock.calls[3]?.[1]?.body).toBe(
      '{"observation_id":"obs_000001","sli":"turn_first_output","source":"mock","outcome":"success","duration_ms":850}',
    );
  });
});

describe("createTraceparent", () => {
  it("creates a valid W3C header and repairs an all-zero random source", () => {
    const values = ["0".repeat(32), "0".repeat(16)];
    const traceparent = createTraceparent(() => values.shift() ?? "");

    expect(traceparent).toBe("00-00000000000000000000000000000001-0000000000000001-01");
  });
});

describe("retryDelayMs", () => {
  it("uses capped exponential backoff with bounded jitter", () => {
    expect(retryDelayMs(1, 0)).toBe(160);
    expect(retryDelayMs(2, 0.5)).toBe(400);
    expect(retryDelayMs(9, 1)).toBe(1_000);
  });
});

function errorResponse(status: number, retryable: boolean): Response {
  return jsonResponse(
    {
      error: {
        code: "TEST_FAILURE",
        message: "simulated failure",
        retryable,
        correlation_id: "cor_000001",
      },
    },
    status,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestHeader(
  fetcher: ReturnType<typeof vi.fn<typeof fetch>>,
  callIndex: number,
  name: string,
): string | null {
  return new Headers(fetcher.mock.calls[callIndex]?.[1]?.headers).get(name);
}
