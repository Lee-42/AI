import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { stepState, TurnLifecyclePanel } from "./TurnLifecyclePanel";
import type { TurnLifecycleState, TurnSnapshot } from "./turn-lifecycle";

describe("TurnLifecyclePanel", () => {
  it("exposes a polite status and ordered progress without claiming an exact RTC metric", () => {
    const state: TurnLifecycleState = {
      turn: turn({ source: "rtc", phase: "speaking", firstOutputAtMs: 1_400 }),
      observedTurns: 1,
      knownRoundIds: { "rtc:9": true },
      lastInterruption: {
        interruptedRoundId: "rtc:8",
        nextRoundId: "rtc:9",
        detectedAtMs: 1_000,
      },
      interruptionCount: 1,
    };

    const markup = renderToStaticMarkup(createElement(TurnLifecyclePanel, { state }));

    expect(markup).toContain('role="status"');
    expect(markup).toContain("<ol");
    expect(markup).toContain("900 ms");
    expect(markup).toContain("近似观察值");
    expect(markup).toContain("不等同于真实音频首帧");
    expect(markup).toContain("旧回复的迟到字幕");
    expect(markup).toContain("累计 1 次");
  });

  it("marks completed steps and the current endpoint step", () => {
    const snapshot = turn({ phase: "endpointed" });

    expect(stepState(snapshot, 0)).toBe("complete");
    expect(stepState(snapshot, 1)).toBe("current");
    expect(stepState(snapshot, 2)).toBe("pending");
  });
});

function turn(overrides: Partial<TurnSnapshot>): TurnSnapshot {
  return {
    roundId: "rtc:9",
    responseId: null,
    ordinal: 1,
    source: "rtc",
    phase: "endpointed",
    endpointEvidence: "final_transcript",
    outputEvidence: "provider_state",
    startedAtMs: 100,
    endpointedAtMs: 500,
    firstOutputAtMs: null,
    completedAtMs: null,
    lastProviderEventTime: 200,
    ...overrides,
  };
}
