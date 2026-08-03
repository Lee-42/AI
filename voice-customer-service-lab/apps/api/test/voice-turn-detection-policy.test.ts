import { describe, expect, it } from "vitest";

import { applyAutomaticTurnDetectionPolicy } from "../src/agent/voice-turn-detection-policy.js";

describe("applyAutomaticTurnDetectionPolicy", () => {
  it("adds the server-side automatic baseline without mutating the source", () => {
    const source = { ASRConfig: { Provider: "volcano" }, LLMConfig: { Mode: "ArkV3" } };

    const result = applyAutomaticTurnDetectionPolicy(source);

    expect(result).toMatchObject({
      ASRConfig: {
        Provider: "volcano",
        VADConfig: { SilenceTime: 600, AIVAD: false },
        TurnDetectionMode: 0,
      },
      LLMConfig: { Mode: "ArkV3" },
    });
    expect(source).toEqual({
      ASRConfig: { Provider: "volcano" },
      LLMConfig: { Mode: "ArkV3" },
    });
  });

  it("preserves explicit VAD tuning but keeps the supported automatic trigger mode", () => {
    const result = applyAutomaticTurnDetectionPolicy({
      ASRConfig: {
        VADConfig: { SilenceTime: 900, AIVAD: true, ExpireTime: 1_200 },
        TurnDetectionMode: 1,
      },
    });

    expect(result).toMatchObject({
      ASRConfig: {
        VADConfig: { SilenceTime: 900, AIVAD: true, ExpireTime: 1_200 },
        TurnDetectionMode: 0,
      },
    });
  });

  it("fails fast when the local policy has an invalid shape", () => {
    expect(() =>
      applyAutomaticTurnDetectionPolicy({
        ASRConfig: { VADConfig: { SilenceTime: "fast" } },
      }),
    ).toThrow("ASRConfig.VADConfig.SilenceTime");
  });
});
