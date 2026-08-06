import { describe, expect, it, vi } from "vitest";

import { VolcengineVoiceChatClient } from "../src/agent/volcengine-voice-chat-client.js";
import { SecretValue } from "../src/core/secret-value.js";

describe("VolcengineVoiceChatClient", () => {
  it("signs StartVoiceChat and keeps the complete identity-bound body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ResponseMetadata: { RequestId: "request-start-001" },
        Result: "ok",
      }),
    );
    const client = createClient(fetcher);

    const result = await client.start({
      AppId: "123456781234567812345678",
      RoomId: "ses_000001",
      TaskId: "tsk_000001",
      Config: { ASRConfig: { Provider: "console-export" } },
      AgentConfig: {
        TargetUserId: ["usr_000001"],
        UserId: "bot_000001",
        IdleTimeout: 30,
      },
    });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    const sentBody = JSON.parse(String(init?.body));
    const headers = init?.headers as Record<string, string>;

    expect(url).toContain("Action=StartVoiceChat");
    expect(url).toContain("Version=2025-06-01");
    expect(headers.Authorization).toBe(
      "HMAC-SHA256 Credential=unit-test-access-key/20260729/cn-north-1/rtc/request, " +
        "SignedHeaders=host;x-content-sha256;x-date, " +
        "Signature=eccd6f36e0e3208b2f3a3ea7453f6874342627f16b4c69ce1526f71a601e5414",
    );
    expect(headers["X-Date"]).toBe("20260729T000000Z");
    expect(headers["X-Content-Sha256"]).toBe(
      "89d28108f125a7e3a346982bdddaf267d0f07859fb545d4ffa062df190471089",
    );
    expect(sentBody).toMatchObject({
      AppId: "123456781234567812345678",
      RoomId: "ses_000001",
      TaskId: "tsk_000001",
      AgentConfig: {
        TargetUserId: ["usr_000001"],
        UserId: "bot_000001",
        IdleTimeout: 30,
      },
    });
    expect(result.providerRequestId).toBe("request-start-001");
  });

  it("uses only AppId, RoomId and the original TaskId for StopVoiceChat", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ResponseMetadata: { RequestId: "request-stop-001" },
        Result: "ok",
      }),
    );
    const client = createClient(fetcher);

    await client.stop({
      AppId: "123456781234567812345678",
      RoomId: "ses_000001",
      TaskId: "tsk_000001",
    });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toContain("Action=StopVoiceChat");
    expect(JSON.parse(String(init?.body))).toEqual({
      AppId: "123456781234567812345678",
      RoomId: "ses_000001",
      TaskId: "tsk_000001",
    });
  });

  it("returns a Function Calling result through UpdateVoiceChat", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ResponseMetadata: { RequestId: "request-tool-001" } }));
    const client = createClient(fetcher);

    await client.submitToolResult({
      AppId: "123456781234567812345678",
      RoomId: "ses_000001",
      TaskId: "tsk_000001",
      Command: "function",
      Message: JSON.stringify({ ToolCallID: "call_order_001", Content: '{"ok":true}' }),
    });

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toContain("Action=UpdateVoiceChat");
    expect(JSON.parse(String(init?.body))).toEqual({
      AppId: "123456781234567812345678",
      RoomId: "ses_000001",
      TaskId: "tsk_000001",
      Command: "function",
      Message: '{"ToolCallID":"call_order_001","Content":"{\\"ok\\":true}"}',
    });
  });

  it("maps provider errors without exposing the provider message", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          ResponseMetadata: {
            RequestId: "request-error-001",
            Error: { Code: "InvalidParameter", Message: "sensitive upstream detail" },
          },
        },
        { status: 400 },
      ),
    );
    const client = createClient(fetcher);

    await expect(
      client.stop({
        AppId: "123456781234567812345678",
        RoomId: "ses_000001",
        TaskId: "tsk_000001",
      }),
    ).rejects.toMatchObject({
      code: "AGENT_PROVIDER_REJECTED",
      message: expect.not.stringContaining("sensitive upstream detail"),
    });
  });
});

function createClient(fetcher: typeof fetch) {
  return new VolcengineVoiceChatClient({
    accessKeyId: new SecretValue("unit-test-access-key"),
    secretAccessKey: new SecretValue("unit-test-secret-key"),
    apiVersion: "2025-06-01",
    fetcher,
    clock: () => new Date("2026-07-29T00:00:00.000Z"),
  });
}
