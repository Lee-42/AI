import { describe, expect, it } from "vitest";
import type { TurnSignal } from "./turn-lifecycle";
import { TurnRaceGuard } from "./turn-race-guard";

describe("TurnRaceGuard", () => {
  it("invalidates the speaking Round when a new user Round begins", () => {
    const guard = new TurnRaceGuard();
    expect(guard.accept(value("response-started", "rtc:1", 100, "rtc:rsp-1")).accepted).toBe(true);
    expect(guard.accept(value("output-started", "rtc:1", 200, "rtc:rsp-1")).accepted).toBe(true);
    const token = guard.capture();

    const bargeIn = guard.accept(value("transcript-partial", "rtc:2", 300));
    const lateOldOutput = guard.accept(value("output-delta", "rtc:1", 400, "rtc:rsp-1"));

    expect(bargeIn).toMatchObject({
      accepted: true,
      interruption: {
        interruptedRoundId: "rtc:1",
        interruptedResponseId: "rtc:rsp-1",
        nextRoundId: "rtc:2",
      },
    });
    expect(lateOldOutput).toMatchObject({ accepted: false, reason: "invalidated_round" });
    expect(token && guard.isCurrent(token)).toBe(false);
  });

  it("rejects a late Response after a retry supersedes it", () => {
    const guard = new TurnRaceGuard();
    guard.accept(value("response-started", "mock:rnd-1", 100, "mock:rsp-1"));
    const firstToken = guard.capture();
    const retry = guard.accept(value("response-started", "mock:rnd-1", 200, "mock:rsp-2"));
    const late = guard.accept(value("output-started", "mock:rnd-1", 300, "mock:rsp-1"));

    expect(retry).toMatchObject({ accepted: true, supersededResponseId: "mock:rsp-1" });
    expect(late).toMatchObject({ accepted: false, reason: "invalidated_response" });
    expect(firstToken && guard.isCurrent(firstToken)).toBe(false);
  });

  it("rejects stale status and overlapping capturing Rounds", () => {
    const guard = new TurnRaceGuard();
    guard.accept({ ...value("speech-started", "rtc:1", 100), providerEventTime: 200 });

    expect(
      guard.accept({
        ...value("transcript-partial", "rtc:1", 200),
        providerEventTime: 100,
      }),
    ).toMatchObject({ accepted: false, reason: "stale_provider_event" });
    expect(guard.accept(value("speech-started", "rtc:2", 300))).toMatchObject({
      accepted: false,
      reason: "overlapping_round",
    });
  });

  it("resets all cancellation generations for a new Session", () => {
    const guard = new TurnRaceGuard();
    guard.accept(value("response-started", "rtc:1", 100));
    const token = guard.capture();

    guard.reset();

    expect(token && guard.isCurrent(token)).toBe(false);
    expect(guard.capture()).toBeNull();
  });
});

function value(
  kind: TurnSignal["kind"],
  roundId: string,
  receivedAtMs: number,
  responseId?: string,
): TurnSignal {
  return {
    kind,
    roundId,
    source: roundId.startsWith("rtc:") ? "rtc" : "mock",
    receivedAtMs,
    ...(responseId ? { responseId } : {}),
  };
}
