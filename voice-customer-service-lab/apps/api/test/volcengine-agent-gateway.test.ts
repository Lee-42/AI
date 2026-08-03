import { describe, expect, it, vi } from "vitest";

import { loadCustomerServicePromptPolicy } from "../src/agent/customer-service-prompt-policy.js";
import { VolcengineAgentGateway } from "../src/agent/volcengine-agent-gateway.js";
import type { VolcengineVoiceChatClient } from "../src/agent/volcengine-voice-chat-client.js";
import { SecretValue } from "../src/core/secret-value.js";

describe("VolcengineAgentGateway", () => {
  it("enables browser subtitles and conversation status callbacks", async () => {
    const start = vi.fn().mockResolvedValue({ providerRequestId: "request-001" });
    const gateway = new VolcengineAgentGateway({
      appId: "123456781234567812345678",
      config: {
        ASRConfig: { Provider: "console" },
        LLMConfig: {
          Mode: "ArkV3",
          SystemMessages: ["unreviewed console prompt"],
        },
        SubtitleConfig: { SubtitleMode: 0, DisableRTSSubtitle: true },
      },
      promptPolicy: loadCustomerServicePromptPolicy("config/customer-service-policy.v1.json"),
      idleTimeoutSeconds: 30,
      client: { start, stop: vi.fn() } as unknown as VolcengineVoiceChatClient,
    });

    await gateway.start({
      roomId: "ses_000001",
      taskId: "tsk_000001",
      botUserId: "bot_000001",
      targetUserId: "usr_000001",
      correlationId: "cor_000001",
    });

    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        Config: expect.objectContaining({
          InterruptMode: 0,
          ASRConfig: {
            Provider: "console",
            InterruptConfig: { InterruptSpeechDuration: 300 },
            VADConfig: { SilenceTime: 600, AIVAD: false },
            TurnDetectionMode: 0,
          },
          LLMConfig: expect.objectContaining({
            Mode: "ArkV3",
            SystemMessages: expect.arrayContaining([expect.stringContaining("[TRUST BOUNDARY]")]),
          }),
          SubtitleConfig: { SubtitleMode: 0, DisableRTSSubtitle: false },
        }),
        AgentConfig: expect.objectContaining({
          EnableConversationStateCallback: true,
          WelcomeMessage: expect.stringContaining("AI 客服"),
        }),
      }),
    );
    expect(JSON.stringify(start.mock.calls[0])).not.toContain("unreviewed console prompt");
  });

  it("replaces console tools with the reviewed catalog and configures the server callback", async () => {
    const start = vi.fn().mockResolvedValue({ providerRequestId: "request-001" });
    const submitToolResult = vi.fn().mockResolvedValue({ providerRequestId: "request-tool-001" });
    const gateway = new VolcengineAgentGateway({
      appId: "123456781234567812345678",
      config: {
        ASRConfig: {},
        LLMConfig: {
          Mode: "ArkV3",
          Tools: [{ type: "function", function: { name: "refund_without_review" } }],
          MCP: { ServerUrl: "https://unreviewed.example.com" },
        },
        FunctionCallingConfig: { ServerMessageUrl: "https://old.example.com" },
        WebSearchAgentConfig: { Enable: true },
      },
      promptPolicy: loadCustomerServicePromptPolicy("config/customer-service-policy.v1.json"),
      functionCalling: {
        callbackUrl:
          "https://voice.example.com/internal/provider-callbacks/volcengine/function-calls",
        callbackSignature: new SecretValue("unit-test-callback-secret"),
      },
      idleTimeoutSeconds: 30,
      client: {
        start,
        stop: vi.fn(),
        submitToolResult,
      } as unknown as VolcengineVoiceChatClient,
    });

    await gateway.start({
      roomId: "ses_000001",
      taskId: "tsk_000001",
      botUserId: "bot_000001",
      targetUserId: "usr_000001",
      correlationId: "cor_000001",
    });
    await gateway.submitToolResult({
      roomId: "ses_000001",
      taskId: "tsk_000001",
      toolCallId: "call_order_001",
      content: '{"ok":true}',
      correlationId: "cor_000002",
    });

    const providerConfig = start.mock.calls[0]?.[0].Config;
    expect(providerConfig).toMatchObject({
      LLMConfig: {
        Tools: [
          {
            type: "function",
            function: {
              name: "get_order_status",
              parameters: expect.objectContaining({ additionalProperties: false }),
            },
          },
        ],
      },
      FunctionCallingConfig: {
        ServerMessageUrl:
          "https://voice.example.com/internal/provider-callbacks/volcengine/function-calls",
        ServerMessageSignature: "unit-test-callback-secret",
      },
    });
    expect(JSON.stringify(providerConfig)).not.toMatch(
      /refund_without_review|unreviewed\.example|WebSearchAgentConfig|MCP/,
    );
    expect(submitToolResult).toHaveBeenCalledWith({
      AppId: "123456781234567812345678",
      RoomId: "ses_000001",
      TaskId: "tsk_000001",
      Command: "function",
      Message: '{"ToolCallID":"call_order_001","Content":"{\\"ok\\":true}"}',
    });
  });
});
