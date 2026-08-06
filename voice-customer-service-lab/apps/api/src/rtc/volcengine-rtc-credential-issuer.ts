import { randomInt } from "node:crypto";

import type { SecretValue } from "../core/secret-value.js";
import type { RtcCredentialIssuer } from "./rtc-credential-issuer.js";
import { createVolcengineRtcToken } from "./volcengine-rtc-token.js";

export interface VolcengineRtcCredentialIssuerOptions {
  readonly appId: string;
  readonly appKey: SecretValue;
  readonly clock?: () => Date;
  readonly nonceFactory?: () => number;
}

export class VolcengineRtcCredentialIssuer implements RtcCredentialIssuer {
  readonly #appId: string;
  readonly #appKey: SecretValue;
  readonly #clock: () => Date;
  readonly #nonceFactory: () => number;

  constructor(options: VolcengineRtcCredentialIssuerOptions) {
    this.#appId = options.appId;
    this.#appKey = options.appKey;
    this.#clock = options.clock ?? (() => new Date());
    this.#nonceFactory = options.nonceFactory ?? (() => randomInt(0, 0x1_0000_0000));
  }

  issue({ session }: Parameters<RtcCredentialIssuer["issue"]>[0]) {
    const issuedAt = Math.floor(this.#clock().getTime() / 1000);
    const expiresAt = Math.floor(new Date(session.expires_at).getTime() / 1000);
    const token = createVolcengineRtcToken({
      appId: this.#appId,
      // The long-lived AppKey is revealed only inside this server adapter.
      appKey: this.#appKey.reveal(),
      roomId: session.room_id,
      userId: session.rtc_user_id,
      issuedAt,
      expiresAt,
      nonce: this.#nonceFactory(),
    });

    return {
      kind: "volcengine" as const,
      app_id: this.#appId,
      room_id: session.room_id,
      user_id: session.rtc_user_id,
      token,
      expires_at: session.expires_at,
    };
  }
}
