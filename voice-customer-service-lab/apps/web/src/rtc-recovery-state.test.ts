import { describe, expect, it } from "vitest";

import {
  initialRtcRecoveryState,
  rtcRecoveryReducer,
  rtcRecoveryRemainingMs,
} from "./rtc-recovery-state";

describe("rtcRecoveryReducer", () => {
  it("uses one fixed recovery deadline across duplicate SDK callbacks", () => {
    const recovering = rtcRecoveryReducer(initialRtcRecoveryState, {
      type: "phase.observed",
      phase: "reconnecting",
      observedAtMs: 1_000,
      windowMs: 5_000,
    });
    const duplicate = rtcRecoveryReducer(recovering, {
      type: "phase.observed",
      phase: "disconnected",
      observedAtMs: 2_000,
      windowMs: 5_000,
    });

    expect(duplicate).toBe(recovering);
    expect(rtcRecoveryRemainingMs(duplicate, 3_000)).toBe(3_000);
  });

  it("records recovery without creating another attempt window", () => {
    const recovering = rtcRecoveryReducer(initialRtcRecoveryState, {
      type: "phase.observed",
      phase: "reconnecting",
      observedAtMs: 1_000,
    });
    const restored = rtcRecoveryReducer(recovering, {
      type: "phase.observed",
      phase: "connected",
      observedAtMs: 2_000,
    });

    expect(restored).toEqual({
      status: "stable",
      startedAtMs: null,
      deadlineAtMs: null,
      recoveryCount: 1,
      lastRestoredAtMs: 2_000,
    });
  });

  it("exhausts only after the fixed window", () => {
    const recovering = rtcRecoveryReducer(initialRtcRecoveryState, {
      type: "phase.observed",
      phase: "disconnected",
      observedAtMs: 1_000,
      windowMs: 5_000,
    });
    const early = rtcRecoveryReducer(recovering, {
      type: "window.elapsed",
      observedAtMs: 5_999,
    });
    const exhausted = rtcRecoveryReducer(recovering, {
      type: "window.elapsed",
      observedAtMs: 6_000,
    });

    expect(early).toBe(recovering);
    expect(exhausted.status).toBe("exhausted");
  });
});
