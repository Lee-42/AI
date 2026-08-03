import { describe, expect, it } from "vitest";

import { MockVoiceAgentProvider } from "../src/providers/mock-voice-agent-provider.js";

describe("MockVoiceAgentProvider", () => {
  it("replays create and end commands without duplicating resources", async () => {
    const provider = createProvider();
    const command = {
      body: { locale: "zh-CN" as const },
      idempotencyKey: "same-create-key",
      correlationId: "cor_000001",
    };

    const first = await provider.createSession(command);
    const replay = await provider.createSession(command);
    const ended = await provider.endSession({
      sessionId: first.session.session_id,
      idempotencyKey: "same-end-key",
      correlationId: "cor_000002",
    });
    const endedReplay = await provider.endSession({
      sessionId: first.session.session_id,
      idempotencyKey: "same-end-key",
      correlationId: "cor_000003",
    });

    expect(replay.session.session_id).toBe(first.session.session_id);
    expect(replay.command_replayed).toBe(true);
    expect(replay.events).toEqual(first.events);
    expect(ended.session.state).toBe("ended");
    expect(endedReplay.command_replayed).toBe(true);
    expect(endedReplay.events).toEqual(ended.events);
  });

  it("uses deterministic local rules instead of calling a model", async () => {
    const provider = createProvider();
    const created = await provider.createSession({
      body: { locale: "zh-CN" },
      idempotencyKey: "create-for-turn",
      correlationId: "cor_000001",
    });

    const result = await provider.submitMockTurn({
      sessionId: created.session.session_id,
      text: "我要转人工",
      idempotencyKey: "same-turn-key",
      correlationId: "cor_000002",
    });
    const transcript = result.events.find(
      (event) => event.event_type === "turn.ai.transcript.delta",
    );

    expect(transcript?.payload.text_delta).toContain("没有真人坐席接入");
    expect(result.events.at(-1)?.event_type).toBe("turn.ai.response.completed");
  });

  it("replays one Mock turn and rejects key reuse with another payload", async () => {
    const provider = createProvider();
    const created = await provider.createSession({
      body: { locale: "zh-CN" },
      idempotencyKey: "create-for-retry",
      correlationId: "cor_000001",
    });
    const command = {
      sessionId: created.session.session_id,
      text: "查询订单",
      idempotencyKey: "turn-retry-key",
      correlationId: "cor_000002",
    };

    const first = await provider.submitMockTurn(command);
    const replay = await provider.submitMockTurn(command);

    expect(replay.command_replayed).toBe(true);
    expect(replay.events).toEqual(first.events);
    expect(replay.session.revision).toBe(first.session.revision);
    await expect(provider.submitMockTurn({ ...command, text: "不同问题" })).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
    });
  });
});

function createProvider() {
  let value = 0;
  return new MockVoiceAgentProvider({
    sessionTtlSeconds: 1200,
    clock: () => new Date("2026-07-29T00:00:00.000Z"),
    idFactory: (prefix) => {
      value += 1;
      return `${prefix}_${String(value).padStart(6, "0")}`;
    },
  });
}
