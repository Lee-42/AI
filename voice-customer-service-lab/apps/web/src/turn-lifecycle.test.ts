import type { ConversationEvent } from "@voice/contracts";
import { describe, expect, it } from "vitest";

import {
  domainEventToTurnSignal,
  endpointToFirstOutputMs,
  initialTurnLifecycleState,
  rtcStatusToTurnSignal,
  type TurnLifecycleState,
  type TurnSignal,
  turnLifecycleReducer,
} from "./turn-lifecycle";
import type { VolcengineConversationStatusMessage } from "./volcengine-rtc-message";

describe("turnLifecycleReducer", () => {
  it("tracks one Mock round from speech through the first output", () => {
    let state = receive(initialTurnLifecycleState, value("speech-started", 100));
    state = receive(state, value("speech-ended", 500));
    state = receive(state, value("transcript-final", 650));
    state = receive(state, value("response-started", 800));
    state = receive(state, {
      ...value("output-started", 1_400),
      outputEvidence: "audio_event",
    });

    expect(state.turn).toMatchObject({
      ordinal: 1,
      phase: "speaking",
      endpointEvidence: "speech_end",
      outputEvidence: "audio_event",
    });
    expect(endpointToFirstOutputMs(state.turn)).toBe(900);
  });

  it("does not regress after Provider thinking arrives before the final subtitle", () => {
    let state = receive(initialTurnLifecycleState, {
      ...value("response-started", 600),
      source: "rtc",
      roundId: "rtc:9",
    });
    state = receive(state, {
      ...value("transcript-final", 700),
      source: "rtc",
      roundId: "rtc:9",
    });

    expect(state.turn).toMatchObject({
      phase: "thinking",
      endpointEvidence: "provider_state",
      endpointedAtMs: 600,
    });
  });

  it("ignores a stale Provider status inside the current round", () => {
    let state = receive(initialTurnLifecycleState, {
      ...value("response-started", 600),
      source: "rtc",
      roundId: "rtc:9",
      providerEventTime: 200,
    });
    state = receive(state, {
      ...value("output-started", 700),
      source: "rtc",
      roundId: "rtc:9",
      providerEventTime: 300,
    });
    const stale = receive(state, {
      ...value("response-completed", 800),
      source: "rtc",
      roundId: "rtc:9",
      providerEventTime: 250,
    });

    expect(stale).toBe(state);
    expect(stale.turn?.phase).toBe("speaking");
  });

  it("ignores an overlapping or previously completed round", () => {
    const active = receive(initialTurnLifecycleState, value("speech-started", 100));
    const overlapping = receive(active, { ...value("speech-started", 200), roundId: "mock:rnd_2" });
    const completed = receive(active, value("response-completed", 900));
    const second = receive(completed, {
      ...value("speech-started", 1_000),
      roundId: "mock:rnd_2",
    });
    const stale = receive(second, value("response-started", 1_100));

    expect(overlapping).toBe(active);
    expect(second.turn).toMatchObject({ roundId: "mock:rnd_2", ordinal: 2 });
    expect(stale).toBe(second);
  });

  it("starts a new Round during AI output and tombstones the old Round", () => {
    let state = receive(initialTurnLifecycleState, value("response-started", 100));
    state = receive(state, value("output-started", 200));
    state = receive(state, {
      ...value("speech-started", 300),
      roundId: "mock:rnd_2",
    });

    expect(state.turn).toMatchObject({
      roundId: "mock:rnd_2",
      phase: "capturing",
      ordinal: 2,
    });
    expect(state.lastInterruption).toEqual({
      interruptedRoundId: "mock:rnd_1",
      nextRoundId: "mock:rnd_2",
      detectedAtMs: 300,
    });
    expect(state.interruptionCount).toBe(1);

    const lateOldRound = receive(state, value("output-delta", 400));
    expect(lateOldRound).toBe(state);
  });

  it("maps domain and RTC status events at the Provider boundary", () => {
    const mock = domainEventToTurnSignal(mockEvent("turn.user.speech.ended"), 120);
    const rtc = rtcStatusToTurnSignal(status("speaking"), 240);

    expect(mock).toMatchObject({ kind: "speech-ended", source: "mock" });
    expect(rtc).toMatchObject({
      kind: "output-started",
      source: "rtc",
      outputEvidence: "provider_state",
    });
  });
});

function receive(state: TurnLifecycleState, signal: TurnSignal): TurnLifecycleState {
  return turnLifecycleReducer(state, { type: "signal.received", signal });
}

function value(kind: TurnSignal["kind"], receivedAtMs: number): TurnSignal {
  return { kind, roundId: "mock:rnd_1", source: "mock", receivedAtMs };
}

function mockEvent(eventType: "turn.user.speech.ended"): ConversationEvent {
  return {
    schema_version: 1,
    event_id: "evt_000001",
    event_type: eventType,
    session_id: "ses_000001",
    round_id: "rnd_000001",
    response_id: null,
    producer: "mock_voice_provider",
    stream_id: "str_000001",
    sequence: 1,
    occurred_at: "2026-07-31T00:00:00.000Z",
    correlation_id: "cor_000001",
    payload: {},
  };
}

function status(
  stage: VolcengineConversationStatusMessage["stage"],
): VolcengineConversationStatusMessage {
  return {
    kind: "conversation-status",
    taskId: "tsk_000001",
    userId: "bot_000001",
    roundId: 9,
    eventTime: 100,
    stage,
    stageCode: 3,
    description: stage,
  };
}
