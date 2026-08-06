const DEFAULT_INTERRUPT_SPEECH_DURATION_MS = 300;
const MAX_INTERRUPT_KEYWORDS = 32;
const MAX_INTERRUPT_KEYWORD_LENGTH = 64;

/**
 * Provider-side barge-in stops generated audio; client guards then discard late output.
 */
export function applyVoiceInterruptionPolicy(
  config: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const asrConfig = optionalRecord(config.ASRConfig, "ASRConfig");
  const interruptConfig = optionalRecord(asrConfig.InterruptConfig, "ASRConfig.InterruptConfig");
  const duration = interruptDuration(interruptConfig.InterruptSpeechDuration);
  validateKeywords(interruptConfig.InterruptKeywords);

  return {
    ...config,
    // Mode 1 would ignore the user while the AI is speaking.
    InterruptMode: 0,
    ASRConfig: {
      ...asrConfig,
      InterruptConfig: {
        ...interruptConfig,
        InterruptSpeechDuration: duration,
      },
    },
  };
}

function interruptDuration(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_INTERRUPT_SPEECH_DURATION_MS;
  }
  if (
    typeof value === "number" &&
    (value === 0 || (Number.isSafeInteger(value) && value >= 200 && value <= 3_000))
  ) {
    return value;
  }
  throw new Error(
    "ASRConfig.InterruptConfig.InterruptSpeechDuration must be 0 or an integer from 200 to 3000 milliseconds.",
  );
}

function validateKeywords(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_INTERRUPT_KEYWORDS ||
    value.some(
      (keyword) =>
        typeof keyword !== "string" ||
        keyword.trim().length === 0 ||
        keyword.length > MAX_INTERRUPT_KEYWORD_LENGTH,
    )
  ) {
    throw new Error(
      "ASRConfig.InterruptConfig.InterruptKeywords must be a bounded array of non-empty strings.",
    );
  }
}

function optionalRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (value === undefined) {
    return {};
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }
  throw new Error(`${path} must be a JSON object.`);
}
