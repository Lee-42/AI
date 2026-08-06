import { randomUUID } from "node:crypto";

import type { RtcCredentialIssuer } from "./rtc-credential-issuer.js";

export class MockRtcCredentialIssuer implements RtcCredentialIssuer {
  issue({ session }: Parameters<RtcCredentialIssuer["issue"]>[0]) {
    return {
      kind: "mock" as const,
      app_id: "mock",
      room_id: session.room_id,
      user_id: session.rtc_user_id,
      // This marker cannot be accepted by a real RTC service.
      token: `mock.${randomUUID()}`,
      expires_at: session.expires_at,
    };
  }
}
