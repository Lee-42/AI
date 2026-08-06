import { describe, expect, it } from "vitest";

import { SecretValue } from "../src/core/secret-value.js";
import { VolcengineRtcCredentialIssuer } from "../src/rtc/volcengine-rtc-credential-issuer.js";
import { createVolcengineRtcToken } from "../src/rtc/volcengine-rtc-token.js";

const APP_ID = "123456781234567812345678";

describe("Volcengine RTC Token", () => {
  it("matches the official Token 001 implementation", () => {
    const token = createVolcengineRtcToken({
      appId: APP_ID,
      appKey: "test-app-key",
      roomId: "ses_000001",
      userId: "usr_000001",
      issuedAt: 1767225600,
      expiresAt: 1767226800,
      nonce: 0x12345678,
    });

    expect(token).toBe(
      "001123456781234567812345678RAB4VjQSALlVabC9VWkKAHNlc18wMDAwMDEKAHVzcl8wMDAwMDEFAAAAsL1VaQEAsL1VaQIAsL1VaQMAsL1VaQQAsL1VaSAAc6rmZCLFAiEotqwNHTsdhg3CcSp8yG8vCIybtxr8Aik=",
    );
  });

  it("binds credentials to the server-generated room, user and expiry", () => {
    const issuer = new VolcengineRtcCredentialIssuer({
      appId: APP_ID,
      appKey: new SecretValue("test-app-key"),
      clock: () => new Date("2026-01-01T00:00:00.000Z"),
      nonceFactory: () => 0x12345678,
    });

    const credentials = issuer.issue({
      session: {
        session_id: "ses_000001",
        room_id: "ses_000001",
        rtc_user_id: "usr_000001",
        provider: "mock",
        state: "active",
        revision: 1,
        created_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-01-01T00:20:00.000Z",
      },
    });

    expect(credentials).toMatchObject({
      kind: "volcengine",
      app_id: APP_ID,
      room_id: "ses_000001",
      user_id: "usr_000001",
      expires_at: "2026-01-01T00:20:00.000Z",
    });
    expect(credentials.token.startsWith(`001${APP_ID}`)).toBe(true);
    expect(JSON.stringify(credentials)).not.toContain("test-app-key");
  });

  it("rejects wildcard identities and already-expired credentials", () => {
    expect(() =>
      createVolcengineRtcToken({
        appId: APP_ID,
        appKey: "test-app-key",
        roomId: "*",
        userId: "usr_000001",
        issuedAt: 100,
        expiresAt: 200,
        nonce: 1,
      }),
    ).toThrow(/roomId/);

    expect(() =>
      createVolcengineRtcToken({
        appId: APP_ID,
        appKey: "test-app-key",
        roomId: "ses_000001",
        userId: "usr_000001",
        issuedAt: 200,
        expiresAt: 200,
        nonce: 1,
      }),
    ).toThrow(/expire/);
  });
});
