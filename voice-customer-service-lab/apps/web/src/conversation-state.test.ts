import type { ConversationEvent } from "@voice/contracts";
import { describe, expect, it } from "vitest";

import { conversationReducer, initialConversationState } from "./conversation-state";

describe("conversationReducer", () => {
  it("derives listening, thinking and speaking from domain events", () => {
    let state = initialConversationState;

    state = receive(state, readyEvent(1));
    state = receive(state, userFinalEvent(2));
    expect(state.uiState).toBe("thinking");
    expect(state.transcript[0]).toMatchObject({ role: "user", text: "订单到哪了？" });

    state = receive(state, aiDeltaEvent(3));
    state = receive(state, aiAudioStartedEvent(4));
    expect(state.uiState).toBe("speaking");
    expect(state.transcript[1]).toMatchObject({ role: "assistant", text: "正在配送。" });

    state = receive(state, aiCompletedEvent(5));
    expect(state.uiState).toBe("listening");
    expect(state.transcript[1]?.isFinal).toBe(true);
  });

  it("ignores a duplicate sequence from the same stream", () => {
    const first = receive(initialConversationState, readyEvent(1));
    const duplicate = receive(first, userFinalEvent(1));

    expect(duplicate).toBe(first);
    expect(duplicate.transcript).toEqual([]);
  });

  it("marks an interrupted assistant response and keeps its partial text", () => {
    let state = receive(initialConversationState, userFinalEvent(1));
    state = receive(state, aiDeltaEvent(2));
    state = conversationReducer(state, {
      type: "round.interrupted",
      roundId: "mock:rnd_000001",
    });

    expect(state.transcript[1]).toMatchObject({
      text: "正在配送。",
      isFinal: true,
      isInterrupted: true,
      roundId: "mock:rnd_000001",
    });
    expect(state.uiState).toBe("listening");
  });

  it("marks a superseded Response without terminating its Round", () => {
    let state = receive(initialConversationState, userFinalEvent(1));
    state = receive(state, aiDeltaEvent(2));
    state = conversationReducer(state, {
      type: "response.invalidated",
      responseId: "mock:rsp_000001",
    });

    expect(state.transcript[1]).toMatchObject({
      isFinal: true,
      isInterrupted: true,
    });
    expect(state.uiState).toBe("thinking");
  });
});

function receive(
  state: typeof initialConversationState,
  event: ConversationEvent,
): typeof initialConversationState {
  return conversationReducer(state, { type: "event.received", event });
}

function envelope(sequence: number) {
  return {
    schema_version: 1 as const,
    event_id: `evt_00000${sequence}`,
    session_id: "ses_000001",
    producer: "mock_voice_provider" as const,
    stream_id: "str_000001",
    sequence,
    occurred_at: "2026-07-29T00:00:00.000Z",
    correlation_id: "cor_000001",
  };
}

function readyEvent(sequence: number): ConversationEvent {
  return {
    ...envelope(sequence),
    event_type: "session.ready",
    round_id: null,
    response_id: null,
    payload: { ready_components: ["rtc", "agent"] },
  };
}

function userFinalEvent(sequence: number): ConversationEvent {
  return {
    ...envelope(sequence),
    event_type: "turn.user.transcript.final",
    round_id: "rnd_000001",
    response_id: null,
    payload: { text: "订单到哪了？", language: "zh-CN" },
  };
}

function aiDeltaEvent(sequence: number): ConversationEvent {
  return {
    ...envelope(sequence),
    event_type: "turn.ai.transcript.delta",
    round_id: "rnd_000001",
    response_id: "rsp_000001",
    payload: { text_delta: "正在配送。", index: 0 },
  };
}

function aiAudioStartedEvent(sequence: number): ConversationEvent {
  return {
    ...envelope(sequence),
    event_type: "turn.ai.audio.started",
    round_id: "rnd_000001",
    response_id: "rsp_000001",
    payload: {},
  };
}

function aiCompletedEvent(sequence: number): ConversationEvent {
  return {
    ...envelope(sequence),
    event_type: "turn.ai.response.completed",
    round_id: "rnd_000001",
    response_id: "rsp_000001",
    payload: { finish_reason: "stop" },
  };
}
