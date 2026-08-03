import { describe, expect, it } from "vitest";

import { applyVoiceInterruptionPolicy } from "../src/agent/voice-interruption-policy.js";

describe("applyVoiceInterruptionPolicy", () => {
  it("enables speech barge-in with a latency-budgeted baseline", () => {
    const source = { ASRConfig: { Provider: "volcano" }, InterruptMode: 1 };

    const result = applyVoiceInterruptionPolicy(source);

    expect(result).toMatchObject({
      InterruptMode: 0,
      ASRConfig: {
        Provider: "volcano",
        InterruptConfig: { InterruptSpeechDuration: 300 },
      },
    });
    expect(source).toEqual({ ASRConfig: { Provider: "volcano" }, InterruptMode: 1 });
  });

  it("preserves an explicit duration and keyword-only policy", () => {
    const result = applyVoiceInterruptionPolicy({
      ASRConfig: {
        InterruptConfig: {
          InterruptSpeechDuration: 500,
          InterruptKeywords: ["停止", "换一个问题"],
        },
      },
    });

    expect(result).toMatchObject({
      ASRConfig: {
        InterruptConfig: {
          InterruptSpeechDuration: 500,
          InterruptKeywords: ["停止", "换一个问题"],
        },
      },
    });
  });

  it("rejects unsupported durations and malformed keywords before Start", () => {
    expect(() =>
      applyVoiceInterruptionPolicy({
        ASRConfig: { InterruptConfig: { InterruptSpeechDuration: 100 } },
      }),
    ).toThrow("InterruptSpeechDuration");
    expect(() =>
      applyVoiceInterruptionPolicy({
        ASRConfig: { InterruptConfig: { InterruptKeywords: [""] } },
      }),
    ).toThrow("InterruptKeywords");
  });
});
