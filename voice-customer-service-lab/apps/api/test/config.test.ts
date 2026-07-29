import { describe, expect, it } from "vitest";

import { loadServerConfig, safeConfigSummary } from "../src/core/config.js";

describe("server configuration", () => {
  it("requires server credentials for the Volcengine provider", () => {
    expect(() =>
      loadServerConfig({
        VOICE_PROVIDER: "volcengine",
        VOLCENGINE_PAID_CALLS_ENABLED: "true",
      }),
    ).toThrow(/VOLCENGINE_RTC_APP_KEY/);
  });

  it("requires an explicit paid-call opt-in even when credentials exist", () => {
    expect(() =>
      loadServerConfig({
        VOICE_PROVIDER: "volcengine",
        VOLCENGINE_RTC_APP_ID: "123456781234567812345678",
        VOLCENGINE_RTC_APP_KEY: "unit-test-app-key",
        VOLCENGINE_ACCESS_KEY_ID: "unit-test-access-key",
        VOLCENGINE_SECRET_ACCESS_KEY: "unit-test-secret-key",
      }),
    ).toThrow(/VOLCENGINE_PAID_CALLS_ENABLED/);
  });

  it("can enable local RTC signing without enabling paid voice calls", () => {
    const config = loadServerConfig({
      RTC_TOKEN_PROVIDER: "volcengine",
      VOLCENGINE_RTC_APP_ID: "123456781234567812345678",
      VOLCENGINE_RTC_APP_KEY: "unit-test-app-key",
    });

    expect(config.rtcTokenProvider).toBe("volcengine");
    expect(config.voiceProvider).toBe("mock");
    expect(config.volcengine.paidCallsEnabled).toBe(false);
  });

  it("requires AppId and AppKey for real RTC Token signing", () => {
    expect(() =>
      loadServerConfig({
        RTC_TOKEN_PROVIDER: "volcengine",
      }),
    ).toThrow(/VOLCENGINE_RTC_APP_ID/);
  });

  it("prevents a conversation from outliving its session token", () => {
    expect(() =>
      loadServerConfig({
        SESSION_TTL_SECONDS: "600",
        MAX_SESSION_SECONDS: "601",
      }),
    ).toThrow(/must not exceed/);
  });

  it("redacts secret values from serialization and startup summaries", () => {
    const config = loadServerConfig({
      VOLCENGINE_RTC_APP_KEY: "unit-test-app-key",
      VOLCENGINE_ACCESS_KEY_ID: "unit-test-access-key",
      VOLCENGINE_SECRET_ACCESS_KEY: "unit-test-secret-key",
    });

    expect(JSON.stringify(config)).not.toContain("unit-test");
    expect(JSON.stringify(safeConfigSummary(config))).not.toMatch(/app.key|access.key|secret.key/i);
  });

  it("pins the current voice API and keeps paid calls disabled by default", () => {
    const summary = safeConfigSummary(loadServerConfig({}));

    expect(summary.volcengineVoiceApiVersion).toBe("2025-06-01");
    expect(summary.volcenginePaidCallsEnabled).toBe(false);
    expect(summary.rtcTokenProvider).toBe("mock");
    expect(summary.rtcTokenConfigured).toBe(false);
    expect(() => loadServerConfig({ VOLCENGINE_VOICE_API_VERSION: "2024-06-01" })).toThrow(
      /2025-06-01/,
    );
  });
});
