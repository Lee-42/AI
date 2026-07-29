import type { ServerConfig } from "../core/config.js";
import { MockRtcCredentialIssuer } from "./mock-rtc-credential-issuer.js";
import type { RtcCredentialIssuer } from "./rtc-credential-issuer.js";
import { VolcengineRtcCredentialIssuer } from "./volcengine-rtc-credential-issuer.js";

export function createRtcCredentialIssuer(config: ServerConfig): RtcCredentialIssuer {
  if (config.rtcTokenProvider === "mock") {
    return new MockRtcCredentialIssuer();
  }

  if (!config.volcengine.rtcAppId || !config.volcengine.rtcAppKey) {
    // Config validation should make this unreachable.
    throw new Error("Volcengine RTC Token credentials are incomplete.");
  }

  return new VolcengineRtcCredentialIssuer({
    appId: config.volcengine.rtcAppId,
    appKey: config.volcengine.rtcAppKey,
  });
}
