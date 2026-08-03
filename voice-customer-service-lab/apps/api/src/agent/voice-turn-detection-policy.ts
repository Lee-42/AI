const DEFAULT_SILENCE_TIME_MS = 600;

/**
 * The lab uses Provider-side automatic turn detection. Existing tuning is preserved,
 * while missing values receive a conservative, documented baseline.
 */
export function applyAutomaticTurnDetectionPolicy(
  config: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const asrConfig = optionalRecord(config.ASRConfig, "ASRConfig");
  const vadConfig = optionalRecord(asrConfig.VADConfig, "ASRConfig.VADConfig");

  const silenceTime = optionalPositiveInteger(
    vadConfig.SilenceTime,
    "ASRConfig.VADConfig.SilenceTime",
    DEFAULT_SILENCE_TIME_MS,
  );
  const aiVad = optionalBoolean(vadConfig.AIVAD, "ASRConfig.VADConfig.AIVAD", false);

  return {
    ...config,
    ASRConfig: {
      ...asrConfig,
      VADConfig: {
        ...vadConfig,
        SilenceTime: silenceTime,
        AIVAD: aiVad,
      },
      // Manual triggering needs an input-end command that this browser client does not send.
      TurnDetectionMode: 0,
    },
  };
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

function optionalPositiveInteger(value: unknown, path: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (Number.isSafeInteger(value) && (value as number) > 0) {
    return value as number;
  }
  throw new Error(`${path} must be a positive integer in milliseconds.`);
}

function optionalBoolean(value: unknown, path: string, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  throw new Error(`${path} must be a boolean.`);
}
