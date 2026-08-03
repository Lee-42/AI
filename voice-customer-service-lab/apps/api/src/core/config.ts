import { isIP } from "node:net";

import { z } from "zod";

import { SecretValue } from "./secret-value.js";

const corsOriginsSchema = z
  .string()
  .default('["http://localhost:5173","http://127.0.0.1:5173"]')
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

const disabledByDefaultBoolean = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const rawEnvironmentSchema = z
  .object({
    APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
    LOG_LEVEL: z.enum(["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"]).default("INFO"),
    API_HOST: z.string().default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(8000),
    CORS_ORIGINS: corsOriginsSchema,
    VOICE_PROVIDER: z.enum(["mock", "volcengine"]).default("mock"),
    RTC_TOKEN_PROVIDER: z.enum(["mock", "volcengine"]).default("mock"),
    SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(1200),
    MAX_SESSION_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    SESSION_SUMMARY_RETENTION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    AGENT_REAPER_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(60).default(15),
    OBSERVABILITY_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3_600),
    CUSTOMER_SERVICE_POLICY_PATH: z
      .string()
      .trim()
      .default("config/customer-service-policy.v1.json"),
    VOLCENGINE_VOICE_API_VERSION: z.literal("2025-06-01").default("2025-06-01"),
    VOLCENGINE_PAID_CALLS_ENABLED: disabledByDefaultBoolean,
    VOLCENGINE_FUNCTION_CALLING_ENABLED: disabledByDefaultBoolean,
    VOLCENGINE_FUNCTION_CALLBACK_URL: optionalValue,
    VOLCENGINE_VOICE_CONFIG_PATH: z.string().trim().default("config/voice-agent.local.json"),
    VOLCENGINE_AGENT_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(180).default(30),
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

    if (
      value.OTEL_EXPORTER_OTLP_ENDPOINT &&
      !isSafeOtlpEndpoint(value.OTEL_EXPORTER_OTLP_ENDPOINT, value.APP_ENV)
    ) {
      context.addIssue({
        code: "custom",
        path: ["OTEL_EXPORTER_OTLP_ENDPOINT"],
        message:
          "OTEL_EXPORTER_OTLP_ENDPOINT must be HTTP(S), contain no credentials/query, and use HTTPS in production",
      });
    }

    if (value.VOICE_PROVIDER === "volcengine") {
      if (!value.VOLCENGINE_PAID_CALLS_ENABLED) {
        context.addIssue({
          code: "custom",
          path: ["VOLCENGINE_PAID_CALLS_ENABLED"],
          message: "VOLCENGINE_PAID_CALLS_ENABLED must be true when VOICE_PROVIDER=volcengine",
        });
      }

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

    if (value.VOLCENGINE_FUNCTION_CALLING_ENABLED) {
      if (value.VOICE_PROVIDER !== "volcengine") {
        context.addIssue({
          code: "custom",
          path: ["VOLCENGINE_FUNCTION_CALLING_ENABLED"],
          message: "VOLCENGINE_FUNCTION_CALLING_ENABLED requires VOICE_PROVIDER=volcengine",
        });
      }
      if (!value.VOLCENGINE_CALLBACK_SIGNING_SECRET) {
        context.addIssue({
          code: "custom",
          path: ["VOLCENGINE_CALLBACK_SIGNING_SECRET"],
          message: "VOLCENGINE_CALLBACK_SIGNING_SECRET is required for Function Calling",
        });
      }
      if (!isPublicHttpsUrl(value.VOLCENGINE_FUNCTION_CALLBACK_URL)) {
        context.addIssue({
          code: "custom",
          path: ["VOLCENGINE_FUNCTION_CALLBACK_URL"],
          message: "VOLCENGINE_FUNCTION_CALLBACK_URL must be a public HTTPS URL",
        });
      }
    }

    if (value.RTC_TOKEN_PROVIDER === "volcengine") {
      for (const name of ["VOLCENGINE_RTC_APP_ID", "VOLCENGINE_RTC_APP_KEY"] as const) {
        if (!value[name]) {
          context.addIssue({
            code: "custom",
            path: [name],
            message: `${name} is required when RTC_TOKEN_PROVIDER=volcengine`,
          });
        }
      }
    }

    if (
      (value.VOICE_PROVIDER === "volcengine" || value.RTC_TOKEN_PROVIDER === "volcengine") &&
      value.VOLCENGINE_RTC_APP_ID &&
      !/^[A-Za-z0-9]{24}$/.test(value.VOLCENGINE_RTC_APP_ID)
    ) {
      context.addIssue({
        code: "custom",
        path: ["VOLCENGINE_RTC_APP_ID"],
        message: "VOLCENGINE_RTC_APP_ID must contain exactly 24 letters or digits",
      });
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
  readonly rtcTokenProvider: RawEnvironment["RTC_TOKEN_PROVIDER"];
  readonly sessionTtlSeconds: number;
  readonly maxSessionSeconds: number;
  readonly sessionSummaryRetentionDays: number;
  readonly agentReaperIntervalSeconds: number;
  readonly observabilityWindowSeconds: number;
  readonly customerServicePolicyPath: string;
  readonly volcengine: {
    readonly voiceApiVersion: RawEnvironment["VOLCENGINE_VOICE_API_VERSION"];
    readonly paidCallsEnabled: boolean;
    readonly functionCallingEnabled: boolean;
    readonly functionCallbackUrl: string | undefined;
    readonly voiceConfigPath: string;
    readonly agentIdleTimeoutSeconds: number;
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
  readonly rtcTokenProvider: ServerConfig["rtcTokenProvider"];
  readonly sessionTtlSeconds: number;
  readonly maxSessionSeconds: number;
  readonly sessionSummaryRetentionDays: number;
  readonly observabilityWindowSeconds: number;
  readonly otlpTraceExportConfigured: boolean;
  readonly volcengineVoiceApiVersion: ServerConfig["volcengine"]["voiceApiVersion"];
  readonly volcenginePaidCallsEnabled: boolean;
  readonly volcengineFunctionCallingEnabled: boolean;
  readonly rtcTokenConfigured: boolean;
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
    rtcTokenProvider: raw.RTC_TOKEN_PROVIDER,
    sessionTtlSeconds: raw.SESSION_TTL_SECONDS,
    maxSessionSeconds: raw.MAX_SESSION_SECONDS,
    sessionSummaryRetentionDays: raw.SESSION_SUMMARY_RETENTION_DAYS,
    agentReaperIntervalSeconds: raw.AGENT_REAPER_INTERVAL_SECONDS,
    observabilityWindowSeconds: raw.OBSERVABILITY_WINDOW_SECONDS,
    customerServicePolicyPath: raw.CUSTOMER_SERVICE_POLICY_PATH,
    volcengine: Object.freeze({
      voiceApiVersion: raw.VOLCENGINE_VOICE_API_VERSION,
      paidCallsEnabled: raw.VOLCENGINE_PAID_CALLS_ENABLED,
      functionCallingEnabled: raw.VOLCENGINE_FUNCTION_CALLING_ENABLED,
      functionCallbackUrl: raw.VOLCENGINE_FUNCTION_CALLBACK_URL,
      voiceConfigPath: raw.VOLCENGINE_VOICE_CONFIG_PATH,
      agentIdleTimeoutSeconds: raw.VOLCENGINE_AGENT_IDLE_TIMEOUT_SECONDS,
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
    rtcTokenProvider: config.rtcTokenProvider,
    sessionTtlSeconds: config.sessionTtlSeconds,
    maxSessionSeconds: config.maxSessionSeconds,
    sessionSummaryRetentionDays: config.sessionSummaryRetentionDays,
    observabilityWindowSeconds: config.observabilityWindowSeconds,
    otlpTraceExportConfigured: Boolean(config.telemetry.otlpEndpoint),
    volcengineVoiceApiVersion: config.volcengine.voiceApiVersion,
    volcenginePaidCallsEnabled: config.volcengine.paidCallsEnabled,
    volcengineFunctionCallingEnabled: config.volcengine.functionCallingEnabled,
    rtcTokenConfigured: Boolean(config.volcengine.rtcAppId && config.volcengine.rtcAppKey),
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

function isPublicHttpsUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return false;
    }
    if (isIP(hostname) === 4) {
      return isPublicIpv4(hostname);
    }
    if (isIP(hostname) === 6) {
      return !/^(::|::1|f[cd]|fe[89ab])/i.test(hostname);
    }
    return hostname.includes(".") && hostname !== "localhost" && !hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

function isPublicIpv4(hostname: string): boolean {
  const [first = 0, second = 0] = hostname.split(".").map(Number);
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function isSafeOtlpEndpoint(value: string, appEnv: RawEnvironment["APP_ENV"]): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      (appEnv !== "production" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}
