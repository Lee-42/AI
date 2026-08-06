import { describe, expect, it } from "vitest";

import { loadServerConfig, safeConfigSummary } from "../src/core/config.js";

describe("server configuration", () => {
  it("requires server credentials for the Volcengine provider", () => {
    expect(() =>
      loadServerConfig({
        VOICE_PROVIDER: "volcengine",
        VOLCENGINE_PAID_CALLS_ENABLED: "true",
      }),
    ).toThrow(/VOLCENGINE_RTC_APP_KEY/);
  });

  it("requires an explicit paid-call opt-in even when credentials exist", () => {
    expect(() =>
      loadServerConfig({
        VOICE_PROVIDER: "volcengine",
        VOLCENGINE_RTC_APP_ID: "123456781234567812345678",
        VOLCENGINE_RTC_APP_KEY: "unit-test-app-key",
        VOLCENGINE_ACCESS_KEY_ID: "unit-test-access-key",
        VOLCENGINE_SECRET_ACCESS_KEY: "unit-test-secret-key",
      }),
    ).toThrow(/VOLCENGINE_PAID_CALLS_ENABLED/);
  });

  it("can enable local RTC signing without enabling paid voice calls", () => {
    const config = loadServerConfig({
      RTC_TOKEN_PROVIDER: "volcengine",
      VOLCENGINE_RTC_APP_ID: "123456781234567812345678",
      VOLCENGINE_RTC_APP_KEY: "unit-test-app-key",
    });

    expect(config.rtcTokenProvider).toBe("volcengine");
    expect(config.voiceProvider).toBe("mock");
    expect(config.volcengine.paidCallsEnabled).toBe(false);
  });

  it("requires AppId and AppKey for real RTC Token signing", () => {
    expect(() =>
      loadServerConfig({
        RTC_TOKEN_PROVIDER: "volcengine",
      }),
    ).toThrow(/VOLCENGINE_RTC_APP_ID/);
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
      VOLCENGINE_ARK_API_KEY: "unit-test-ark-key",
      VOLCENGINE_RTC_APP_KEY: "unit-test-app-key",
      VOLCENGINE_ACCESS_KEY_ID: "unit-test-access-key",
      VOLCENGINE_SECRET_ACCESS_KEY: "unit-test-secret-key",
      OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer%20unit-test-otel-secret",
    });

    expect(JSON.stringify(config)).not.toContain("unit-test");
    expect(JSON.stringify(safeConfigSummary(config))).not.toMatch(/app.key|access.key|secret.key/i);
    expect(JSON.stringify(config)).not.toContain("unit-test-otel-secret");
    expect(JSON.stringify(config)).not.toContain("unit-test-ark-key");
  });

  it("pins the current voice API and keeps paid calls disabled by default", () => {
    const summary = safeConfigSummary(loadServerConfig({}));

    expect(summary.volcengineVoiceApiVersion).toBe("2025-06-01");
    expect(summary.llmProvider).toBe("mock");
    expect(summary.llmDebugApiEnabled).toBe(false);
    expect(summary.llmPaidCallsEnabled).toBe(false);
    expect(summary.llmModelConfigured).toBe(false);
    expect(summary.knowledgeIndexProvider).toBe("memory");
    expect(summary.knowledgeIndexWriteEnabled).toBe(false);
    expect(summary.knowledgeCollectionName).toBe("voice_knowledge_dense_v1");
    expect(summary.embeddingProvider).toBe("mock");
    expect(summary.embeddingPaidCallsEnabled).toBe(false);
    expect(summary.embeddingModel).toBe("mock-hash-embedding@1");
    expect(summary.embeddingDimension).toBe(16);
    expect(summary.chromaConfigured).toBe(false);
    expect(summary.volcenginePaidCallsEnabled).toBe(false);
    expect(summary.volcengineFunctionCallingEnabled).toBe(false);
    expect(summary.rtcTokenProvider).toBe("mock");
    expect(summary.rtcTokenConfigured).toBe(false);
    expect(summary.sessionSummaryRetentionDays).toBe(7);
    expect(summary.observabilityWindowSeconds).toBe(3_600);
    expect(summary.otlpTraceExportConfigured).toBe(false);
    expect(loadServerConfig({}).customerServicePolicyPath).toBe(
      "config/customer-service-policy.v1.json",
    );
    expect(loadServerConfig({}).ai.answerPolicyPath).toBe("config/rag-answer-policy.v1.json");
    expect(() => loadServerConfig({ VOLCENGINE_VOICE_API_VERSION: "2024-06-01" })).toThrow(
      /2025-06-01/,
    );
  });

  it("keeps cloud writes and paid Embedding behind separate explicit switches", () => {
    expect(() =>
      loadServerConfig({
        KNOWLEDGE_INDEX_PROVIDER: "chroma",
        CHROMA_API_KEY: "unit-test-chroma-key",
        CHROMA_TENANT: "unit-test-tenant",
        CHROMA_DATABASE: "unit-test-database",
      }),
    ).toThrow(/KNOWLEDGE_INDEX_WRITE_ENABLED/);
    expect(() =>
      loadServerConfig({
        EMBEDDING_PROVIDER: "volcengine",
        EMBEDDING_MODEL: "ep-unit-test-embedding",
        EMBEDDING_DIMENSION: "2048",
        VOLCENGINE_ARK_API_KEY: "unit-test-ark-key",
      }),
    ).toThrow(/EMBEDDING_PAID_CALLS_ENABLED/);

    const config = loadServerConfig({
      KNOWLEDGE_INDEX_PROVIDER: "chroma",
      KNOWLEDGE_INDEX_WRITE_ENABLED: "true",
      CHROMA_API_KEY: "unit-test-chroma-key",
      CHROMA_TENANT: "unit-test-tenant",
      CHROMA_DATABASE: "unit-test-database",
      EMBEDDING_PROVIDER: "volcengine",
      EMBEDDING_PAID_CALLS_ENABLED: "true",
      EMBEDDING_MODEL: "ep-unit-test-embedding",
      EMBEDDING_DIMENSION: "2048",
      VOLCENGINE_ARK_API_KEY: "unit-test-ark-key",
    });
    expect(config.knowledgeIndex.embedding.dimension).toBe(2_048);
    expect(safeConfigSummary(config)).toMatchObject({
      knowledgeIndexProvider: "chroma",
      knowledgeIndexWriteEnabled: true,
      embeddingProvider: "volcengine",
      embeddingPaidCallsEnabled: true,
      chromaConfigured: true,
    });
    expect(JSON.stringify(config)).not.toContain("unit-test-chroma-key");
  });

  it("requires a second paid-call switch and server-only Ark configuration", () => {
    expect(() =>
      loadServerConfig({
        LLM_PROVIDER: "volcengine",
        VOLCENGINE_ARK_MODEL: "ep-unit-test-model",
        VOLCENGINE_ARK_API_KEY: "unit-test-ark-key",
      }),
    ).toThrow(/LLM_PAID_CALLS_ENABLED/);
    expect(() =>
      loadServerConfig({
        LLM_PROVIDER: "volcengine",
        LLM_PAID_CALLS_ENABLED: "true",
      }),
    ).toThrow(/VOLCENGINE_ARK_MODEL/);
    expect(() =>
      loadServerConfig({
        LLM_PAID_CALLS_ENABLED: "true",
      }),
    ).toThrow(/requires LLM_PROVIDER=volcengine/);

    const config = loadServerConfig({
      LLM_PROVIDER: "volcengine",
      LLM_PAID_CALLS_ENABLED: "true",
      VOLCENGINE_ARK_MODEL: "ep-unit-test-model",
      VOLCENGINE_ARK_API_KEY: "unit-test-ark-key",
    });
    expect(config.ai.provider).toBe("volcengine");
    expect(config.ai.volcengine.apiKey?.reveal()).toBe("unit-test-ark-key");
    expect(safeConfigSummary(config).llmModelConfigured).toBe(true);
  });

  it("prevents API Key exfiltration through an arbitrary Ark base URL", () => {
    expect(() =>
      loadServerConfig({
        LLM_PROVIDER: "volcengine",
        LLM_PAID_CALLS_ENABLED: "true",
        VOLCENGINE_ARK_BASE_URL: "https://attacker.example/api/v3",
        VOLCENGINE_ARK_MODEL: "ep-unit-test-model",
        VOLCENGINE_ARK_API_KEY: "unit-test-ark-key",
      }),
    ).toThrow(/allow-listed official Ark API/);
  });

  it("allows the debug API only in local and test environments", () => {
    expect(loadServerConfig({ APP_ENV: "test", LLM_DEBUG_API_ENABLED: "true" }).ai).toMatchObject({
      debugApiEnabled: true,
      provider: "mock",
    });
    expect(() =>
      loadServerConfig({ APP_ENV: "production", LLM_DEBUG_API_ENABLED: "true" }),
    ).toThrow(/only allowed in local or test/);
  });

  it("bounds structured summary retention", () => {
    expect(
      loadServerConfig({ SESSION_SUMMARY_RETENTION_DAYS: "30" }).sessionSummaryRetentionDays,
    ).toBe(30);
    expect(() => loadServerConfig({ SESSION_SUMMARY_RETENTION_DAYS: "31" })).toThrow();
  });

  it("bounds the local rolling observability window", () => {
    expect(
      loadServerConfig({ OBSERVABILITY_WINDOW_SECONDS: "60" }).observabilityWindowSeconds,
    ).toBe(60);
    expect(() => loadServerConfig({ OBSERVABILITY_WINDOW_SECONDS: "59" })).toThrow();
  });

  it("allows a local OTLP collector but requires a credential-free HTTPS endpoint in production", () => {
    expect(
      loadServerConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318" }).telemetry
        .otlpEndpoint,
    ).toBe("http://127.0.0.1:4318");
    expect(() =>
      loadServerConfig({
        APP_ENV: "production",
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector.example.com:4318",
      }),
    ).toThrow(/use HTTPS/);
    expect(() =>
      loadServerConfig({
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://user:secret@collector.example.com?token=bad",
      }),
    ).toThrow(/no credentials/);
  });

  it("fails closed unless Function Calling has a public callback and secret", () => {
    const base = {
      VOICE_PROVIDER: "volcengine",
      VOLCENGINE_PAID_CALLS_ENABLED: "true",
      VOLCENGINE_RTC_APP_ID: "123456781234567812345678",
      VOLCENGINE_RTC_APP_KEY: "unit-test-app-key",
      VOLCENGINE_ACCESS_KEY_ID: "unit-test-access-key",
      VOLCENGINE_SECRET_ACCESS_KEY: "unit-test-secret-key",
      VOLCENGINE_FUNCTION_CALLING_ENABLED: "true",
    };

    expect(() => loadServerConfig(base)).toThrow(/VOLCENGINE_CALLBACK_SIGNING_SECRET/);
    expect(() =>
      loadServerConfig({
        ...base,
        VOLCENGINE_CALLBACK_SIGNING_SECRET: "unit-test-callback-secret",
        VOLCENGINE_FUNCTION_CALLBACK_URL: "http://localhost:8000/callback",
      }),
    ).toThrow(/public HTTPS URL/);
    expect(() =>
      loadServerConfig({
        ...base,
        VOLCENGINE_CALLBACK_SIGNING_SECRET: "unit-test-callback-secret",
        VOLCENGINE_FUNCTION_CALLBACK_URL: "https://192.168.1.8/callback",
      }),
    ).toThrow(/public HTTPS URL/);

    const config = loadServerConfig({
      ...base,
      VOLCENGINE_CALLBACK_SIGNING_SECRET: "unit-test-callback-secret",
      VOLCENGINE_FUNCTION_CALLBACK_URL:
        "https://voice.example.com/internal/provider-callbacks/volcengine/function-calls",
    });
    expect(config.volcengine.functionCallingEnabled).toBe(true);
  });
});
