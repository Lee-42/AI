import { describe, expect, it } from "vitest";

import { classifyMicrophoneLevel, reconcileMicrophoneSelection } from "./audio-device-policy";

describe("reconcileMicrophoneSelection", () => {
  const microphones = [
    { deviceId: "mic-a", label: "Mic A" },
    { deviceId: "mic-b", label: "Mic B" },
  ];

  it("keeps a selected microphone while it is still present", () => {
    expect(reconcileMicrophoneSelection("mic-b", microphones)).toEqual({
      deviceId: "mic-b",
      reason: "unchanged",
    });
  });

  it("selects the first microphone after the active device is removed", () => {
    expect(reconcileMicrophoneSelection("removed", microphones)).toEqual({
      deviceId: "mic-a",
      reason: "fallback",
    });
  });

  it("reports that no fallback microphone exists", () => {
    expect(reconcileMicrophoneSelection("removed", [])).toEqual({
      deviceId: "",
      reason: "unavailable",
    });
  });
});

describe("classifyMicrophoneLevel", () => {
  it.each([
    [null, "unavailable"],
    [25, "silent"],
    [75, "low"],
    [204, "healthy"],
    [255, "high"],
  ] as const)("maps %s to %s", (level, expected) => {
    expect(classifyMicrophoneLevel(level)).toBe(expected);
  });
});
