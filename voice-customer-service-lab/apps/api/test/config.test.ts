import { describe, expect, it } from "vitest";

import { loadServerConfig, safeConfigSummary } from "../src/core/config.js";

describe("server configuration", () => {
  it("requires server credentials for the Volcengine provider", () => {
    expect(() => loadServerConfig({ VOICE_PROVIDER: "volcengine" })).toThrow(
      /VOLCENGINE_RTC_APP_KEY/,
    );
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
});
