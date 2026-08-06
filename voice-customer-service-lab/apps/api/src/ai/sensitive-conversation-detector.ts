export type SensitiveConversationCategory =
  | "password"
  | "verification_code"
  | "phone_number"
  | "payment_card"
  | "security_code";

export interface SensitiveConversationDetector {
  detect(text: string): readonly SensitiveConversationCategory[];
}

const categoryPatterns: ReadonlyArray<readonly [SensitiveConversationCategory, RegExp]> = [
  ["password", /(?:\b(?:password|passcode)\b|(?:登录|支付)?密码)\s*[:：=]\s*\S{4,}/iu],
  ["verification_code", /(?:验证码|verification\s*code|otp)\s*[:：=]?\s*\d{4,8}\b/iu],
  ["phone_number", /(?<!\d)1[3-9]\d{9}(?!\d)/u],
  ["payment_card", /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/u],
  ["security_code", /(?:cvv|cvc|安全码)\s*[:：=]?\s*\d{3,4}\b/iu],
];

/** Course adapter only: production deployments should replace it with reviewed DLP rules. */
export class BasicSensitiveConversationDetector implements SensitiveConversationDetector {
  detect(text: string): readonly SensitiveConversationCategory[] {
    const normalized = text.normalize("NFKC");
    return categoryPatterns
      .filter(([, pattern]) => pattern.test(normalized))
      .map(([category]) => category);
  }
}
