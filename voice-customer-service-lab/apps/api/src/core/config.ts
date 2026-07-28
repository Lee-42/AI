import { z } from "zod";

import { SecretValue } from "./secret-value.js";

const corsOriginsSchema = z
  .string()
  .default('["http://localhost:5173"]')
  .transform((value, context): string[] => {
    try {
      return z.array(z.url()).parse(JSON.parse(value));
    } catch {
      context.addIssue({
        code: "custom",
        message: "CORS_ORIGINS must be a JSON array of valid URLs",
      });
      return z.NEVER;
    }
  });

const optionalValue = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const rawEnvironmentSchema = z
  .object({
    APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
    LOG_LEVEL: z.enum(["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"]).default("INFO"),
    API_HOST: z.string().default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(8000),
    CORS_ORIGINS: corsOriginsSchema,
    VOICE_PROVIDER: z.enum(["mock", "volcengine"]).default("mock"),
    SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(1200),
    MAX_SESSION_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    VOLCENGINE_RTC_APP_ID: optionalValue,
    VOLCENGINE_RTC_APP_KEY: optionalValue,
    VOLCENGINE_ACCESS_KEY_ID: optionalValue,
    VOLCENGINE_SECRET_ACCESS_KEY: optionalValue,
    VOLCENGINE_CALLBACK_SIGNING_SECRET: optionalValue,
    OTEL_EXPORTER_OTLP_ENDPOINT: optionalValue,
    OTEL_EXPORTER_OTLP_HEADERS: optionalValue,
  })
  .superRefine((value, context) => {
    if (value.MAX_SESSION_SECONDS > value.SESSION_TTL_SECONDS) {
      context.addIssue({
        code: "custom",
        path: ["MAX_SESSION_SECONDS"],
        message: "MAX_SESSION_SECONDS must not exceed SESSION_TTL_SECONDS",
      });
    }

    if (value.VOICE_PROVIDER === "volcengine") {
      for (const name of [
        "VOLCENGINE_RTC_APP_ID",
        "VOLCENGINE_RTC_APP_KEY",
        "VOLCENGINE_ACCESS_KEY_ID",
        "VOLCENGINE_SECRET_ACCESS_KEY",
      ] as const) {
        if (!value[name]) {
          context.addIssue({
            code: "custom",
            path: [name],
            message: `${name} is required when VOICE_PROVIDER=volcengine`,
          });
        }
      }
    }
  });

type RawEnvironment = z.infer<typeof rawEnvironmentSchema>;

export interface ServerConfig {
  readonly appEnv: RawEnvironment["APP_ENV"];
  readonly logLevel: RawEnvironment["LOG_LEVEL"];
  readonly apiHost: string;
  readonly apiPort: number;
  readonly corsOrigins: readonly string[];
  readonly voiceProvider: RawEnvironment["VOICE_PROVIDER"];
  readonly sessionTtlSeconds: number;
  readonly maxSessionSeconds: number;
  readonly volcengine: {
    readonly rtcAppId: string | undefined;
    readonly rtcAppKey: SecretValue | undefined;
    readonly accessKeyId: SecretValue | undefined;
    readonly secretAccessKey: SecretValue | undefined;
    readonly callbackSigningSecret: SecretValue | undefined;
  };
  readonly telemetry: {
    readonly otlpEndpoint: string | undefined;
    readonly otlpHeaders: SecretValue | undefined;
  };
}

export interface SafeConfigSummary {
  readonly appEnv: ServerConfig["appEnv"];
  readonly logLevel: ServerConfig["logLevel"];
  readonly apiHost: string;
  readonly apiPort: number;
  readonly corsOrigins: readonly string[];
  readonly voiceProvider: ServerConfig["voiceProvider"];
  readonly sessionTtlSeconds: number;
  readonly maxSessionSeconds: number;
  readonly volcengineConfigured: boolean;
}

export function loadServerConfig(
  environment: Record<string, string | undefined> = process.env,
): ServerConfig {
  const raw = rawEnvironmentSchema.parse(environment);
  return Object.freeze({
    appEnv: raw.APP_ENV,
    logLevel: raw.LOG_LEVEL,
    apiHost: raw.API_HOST,
    apiPort: raw.API_PORT,
    corsOrigins: Object.freeze(raw.CORS_ORIGINS),
    voiceProvider: raw.VOICE_PROVIDER,
    sessionTtlSeconds: raw.SESSION_TTL_SECONDS,
    maxSessionSeconds: raw.MAX_SESSION_SECONDS,
    volcengine: Object.freeze({
      rtcAppId: raw.VOLCENGINE_RTC_APP_ID,
      rtcAppKey: toSecret(raw.VOLCENGINE_RTC_APP_KEY),
      accessKeyId: toSecret(raw.VOLCENGINE_ACCESS_KEY_ID),
      secretAccessKey: toSecret(raw.VOLCENGINE_SECRET_ACCESS_KEY),
      callbackSigningSecret: toSecret(raw.VOLCENGINE_CALLBACK_SIGNING_SECRET),
    }),
    telemetry: Object.freeze({
      otlpEndpoint: raw.OTEL_EXPORTER_OTLP_ENDPOINT,
      otlpHeaders: toSecret(raw.OTEL_EXPORTER_OTLP_HEADERS),
    }),
  });
}

export function safeConfigSummary(config: ServerConfig): SafeConfigSummary {
  return {
    appEnv: config.appEnv,
    logLevel: config.logLevel,
    apiHost: config.apiHost,
    apiPort: config.apiPort,
    corsOrigins: config.corsOrigins,
    voiceProvider: config.voiceProvider,
    sessionTtlSeconds: config.sessionTtlSeconds,
    maxSessionSeconds: config.maxSessionSeconds,
    volcengineConfigured: Boolean(
      config.volcengine.rtcAppId &&
        config.volcengine.rtcAppKey &&
        config.volcengine.accessKeyId &&
        config.volcengine.secretAccessKey,
    ),
  };
}

function toSecret(value: string | undefined): SecretValue | undefined {
  return value ? new SecretValue(value) : undefined;
}
