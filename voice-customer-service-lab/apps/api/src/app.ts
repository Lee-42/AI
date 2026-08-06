import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { type Tracer, trace } from "@opentelemetry/api";
import {
  AgentCommandResponseSchema,
  AgentSnapshotSchema,
  AgentStateSchema,
  AiAnswerModeSchema,
  AiDebugStreamResponseSchema,
  AiDebugTurnRequestSchema,
  AiDebugTurnResponseSchema,
  AiEvidenceStatusSchema,
  AiStreamEventSchema,
  ApiErrorResponseSchema,
  ConversationEventSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  EndSessionResponseSchema,
  FunctionCallCallbackAckSchema,
  HandoffReasonSchema,
  HandoffRequestSchema,
  HandoffResponseSchema,
  HandoffTicketSchema,
  HealthResponseSchema,
  MockBusinessToolCallRequestSchema,
  MockBusinessToolCallResponseSchema,
  MockTurnRequestSchema,
  OrderStatusToolResultSchema,
  PrometheusMetricsResponseSchema,
  PublicRuntimeConfigSchema,
  RealtimeSliNameSchema,
  RealtimeSliObservationAckSchema,
  RealtimeSliObservationRequestSchema,
  RtcCredentialsSchema,
  SessionCommandResponseSchema,
  SessionPrivacySummarySchema,
  SessionSnapshotSchema,
  SessionStateSchema,
  SessionSummaryTopicSchema,
  SloIndicatorNameSchema,
  SloIndicatorSchema,
  SloSnapshotSchema,
  schemaRef,
  VolcengineFunctionCallCallbackRequestSchema,
} from "@voice/contracts";
import Fastify, { LogController } from "fastify";
import type { AgentGateway } from "./agent/agent-gateway.js";
import { AgentGatewayError } from "./agent/agent-gateway.js";
import { AgentLifecycleError, AgentLifecycleService } from "./agent/agent-lifecycle-service.js";
import { createAgentGateway } from "./agent/create-agent-gateway.js";
import { AiDebugService, AiDebugServiceError } from "./ai/ai-debug-service.js";
import { LanguageModelError } from "./ai/ai-ports.js";
import { AiTurnStreamService } from "./ai/ai-turn-stream-service.js";
import type { AiOrchestrator } from "./ai/ai-types.js";
import { AiOrchestratorError } from "./ai/ai-types.js";
import { createRealtimeRagService } from "./ai/create-realtime-rag-service.js";
import { RealtimeRagServiceError, type RealtimeRagTurnPort } from "./ai/realtime-rag-service.js";
import { BusinessToolError, BusinessToolService } from "./business-tools/business-tool-service.js";
import { DemoOrderRepository } from "./business-tools/demo-order-repository.js";
import type { ServerConfig } from "./core/config.js";
import {
  finishHttpTrace,
  type HttpTraceContext,
  startHttpTrace,
} from "./observability/http-trace.js";
import { ObservabilityService } from "./observability/observability-service.js";
import { createVoiceAgentProvider } from "./providers/create-voice-agent-provider.js";
import type { VoiceAgentProvider } from "./providers/voice-agent-provider.js";
import { VoiceProviderError } from "./providers/voice-agent-provider.js";
import { registerAiDebugRoutes } from "./routes/ai-debug-routes.js";
import { registerBusinessToolRoutes } from "./routes/business-tool-routes.js";
import { registerObservabilityRoutes } from "./routes/observability-routes.js";
import { registerSessionRoutes } from "./routes/session-routes.js";
import { createRtcCredentialIssuer } from "./rtc/create-rtc-credential-issuer.js";
import type { RtcCredentialIssuer } from "./rtc/rtc-credential-issuer.js";
import {
  SessionClosureError,
  SessionClosureService,
} from "./session-data/session-closure-service.js";
import { SessionDataService } from "./session-data/session-data-service.js";

export interface BuildAppOptions {
  readonly logger?: boolean;
  readonly voiceProvider?: VoiceAgentProvider;
  readonly rtcCredentialIssuer?: RtcCredentialIssuer;
  readonly agentGateway?: AgentGateway;
  readonly agentLifecycleService?: AgentLifecycleService;
  readonly businessToolService?: BusinessToolService;
  readonly sessionDataService?: SessionDataService;
  readonly sessionClosureService?: SessionClosureService;
  readonly observabilityService?: ObservabilityService;
  readonly aiOrchestrator?: AiOrchestrator;
  readonly realtimeRagService?: RealtimeRagTurnPort;
  readonly tracer?: Tracer;
}

interface ActiveRequestObservation {
  readonly startedAt: bigint;
  readonly trace: HttpTraceContext;
}

export function buildApp(config: ServerConfig, options: BuildAppOptions = {}) {
  const realtimeRagService =
    options.realtimeRagService ??
    createRealtimeRagService(config, {
      ...(options.aiOrchestrator ? { orchestrator: options.aiOrchestrator } : {}),
    });
  const voiceProvider =
    options.voiceProvider ?? createVoiceAgentProvider(config, realtimeRagService.welcomeMessage);
  const resolveTenantId = (_sessionId: string) => "tenant_demo_store";
  const rtcCredentialIssuer = options.rtcCredentialIssuer ?? createRtcCredentialIssuer(config);
  const agentGateway = options.agentGateway ?? createAgentGateway(config);
  const observability =
    options.observabilityService ??
    new ObservabilityService({ windowSeconds: config.observabilityWindowSeconds });
  const agentLifecycle =
    options.agentLifecycleService ??
    new AgentLifecycleService({
      gateway: agentGateway,
      resolveSession: (sessionId) => voiceProvider.getSession(sessionId),
      maxSessionSeconds: config.maxSessionSeconds,
      onCleanupObservation: (observation) => observability.recordAgentCleanup(observation),
    });
  const businessTools =
    options.businessToolService ??
    new BusinessToolService({
      orderRepository: new DemoOrderRepository(),
      resolvePrincipal: (sessionId) => {
        // This local principal is server-bound. Production must bind the authenticated subject at Session creation.
        voiceProvider.getSession(sessionId);
        return { tenantId: "tenant_demo_store", customerId: "customer_demo_primary" };
      },
    });
  const sessionData =
    options.sessionDataService ??
    new SessionDataService({ retentionDays: config.sessionSummaryRetentionDays });
  const sessionClosure =
    options.sessionClosureService ??
    new SessionClosureService({
      provider: voiceProvider,
      agentLifecycle,
      sessionData,
      retentionDays: config.sessionSummaryRetentionDays,
      onSessionClosed: (sessionId) =>
        realtimeRagService.clearSession({ tenantId: resolveTenantId(sessionId), sessionId }),
    });
  const aiDebugService = config.ai.debugApiEnabled
    ? new AiDebugService(realtimeRagService)
    : undefined;
  const aiTurnStreamService = config.ai.debugApiEnabled
    ? new AiTurnStreamService({ ragService: realtimeRagService })
    : undefined;
  const tracer = options.tracer ?? trace.getTracer("voice-customer-service-api", "0.1.0");
  const activeRequests = new WeakMap<object, ActiveRequestObservation>();
  const app = Fastify({
    genReqId: () => `cor_${randomUUID().replaceAll("-", "")}`,
    ajv: {
      // Reject undeclared fields instead of silently mutating privacy-sensitive request bodies.
      customOptions: { removeAdditional: false },
    },
    logController: new LogController({ disableRequestLogging: true }),
    logger: options.logger
      ? {
          level: config.logLevel.toLowerCase(),
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "*.token",
              "*.secret",
              "*.appKey",
              "*.accessKey",
              "*.ServerMessageSignature",
              "req.body.Signature",
              "req.headers.idempotency-key",
            ],
            censor: "[REDACTED]",
          },
        }
      : false,
  }).withTypeProvider<TypeBoxTypeProvider>();

  for (const schema of [
    AiAnswerModeSchema,
    AiEvidenceStatusSchema,
    AiDebugTurnRequestSchema,
    AiDebugTurnResponseSchema,
    AgentStateSchema,
    AgentSnapshotSchema,
    AgentCommandResponseSchema,
    ApiErrorResponseSchema,
    HealthResponseSchema,
    PublicRuntimeConfigSchema,
    SessionStateSchema,
    SessionSnapshotSchema,
    RtcCredentialsSchema,
    ConversationEventSchema,
    CreateSessionRequestSchema,
    CreateSessionResponseSchema,
    EndSessionResponseSchema,
    FunctionCallCallbackAckSchema,
    MockBusinessToolCallRequestSchema,
    MockBusinessToolCallResponseSchema,
    MockTurnRequestSchema,
    HandoffReasonSchema,
    HandoffRequestSchema,
    HandoffResponseSchema,
    HandoffTicketSchema,
    OrderStatusToolResultSchema,
    PrometheusMetricsResponseSchema,
    RealtimeSliNameSchema,
    RealtimeSliObservationAckSchema,
    RealtimeSliObservationRequestSchema,
    SessionCommandResponseSchema,
    SessionPrivacySummarySchema,
    SessionSummaryTopicSchema,
    SloIndicatorNameSchema,
    SloIndicatorSchema,
    SloSnapshotSchema,
    VolcengineFunctionCallCallbackRequestSchema,
    AiStreamEventSchema,
    AiDebugStreamResponseSchema,
  ]) {
    app.addSchema(schema);
  }

  app.register(swagger, {
    openapi: {
      info: {
        title: "Voice Customer Service API",
        version: "0.1.0",
      },
    },
  });

  app.register(cors, {
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "Traceparent"],
    exposedHeaders: ["Traceparent", "X-Correlation-Id"],
  });

  app.addHook("onRequest", async (request, reply) => {
    const operation = requestOperation(request);
    const route = request.routeOptions.url || "unmatched";
    const requestTrace = startHttpTrace({
      tracer,
      incomingTraceparent: singleHeader(request.headers.traceparent),
      operation,
      method: request.method,
      route,
      correlationId: request.id,
    });
    activeRequests.set(request, { startedAt: process.hrtime.bigint(), trace: requestTrace });
    reply.header("Traceparent", requestTrace.traceparent);
    reply.header("X-Correlation-Id", request.id);
  });

  app.addHook("onResponse", async (request, reply) => {
    const active = activeRequests.get(request);
    if (!active) {
      return;
    }
    const durationSeconds = Number(process.hrtime.bigint() - active.startedAt) / 1_000_000_000;
    const operation = requestOperation(request);
    const route = request.routeOptions.url || "unmatched";
    observability.recordHttp({
      operation,
      method: request.method,
      statusCode: reply.statusCode,
      durationSeconds,
    });
    finishHttpTrace(active.trace, reply.statusCode);
    request.log.info(
      {
        event: "http_request_completed",
        trace_id: active.trace.traceId,
        span_id: active.trace.spanId,
        parent_span_id: active.trace.parentSpanId,
        correlation_id: request.id,
        http: {
          operation,
          method: request.method,
          route,
          status_code: reply.statusCode,
          duration_ms: Math.round(durationSeconds * 1_000),
        },
      },
      "request completed",
    );
    activeRequests.delete(request);
  });

  app.setErrorHandler((error, request, reply) => {
    if (
      error instanceof VoiceProviderError ||
      error instanceof AgentLifecycleError ||
      error instanceof AgentGatewayError ||
      error instanceof BusinessToolError ||
      error instanceof SessionClosureError ||
      error instanceof AiDebugServiceError ||
      error instanceof RealtimeRagServiceError
    ) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          correlation_id: request.id,
        },
      });
    }

    if (error instanceof LanguageModelError || error instanceof AiOrchestratorError) {
      return reply.status(aiErrorStatus(error)).send({
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          correlation_id: request.id,
        },
      });
    }

    if (isValidationError(error)) {
      return reply.status(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "The request does not match the HTTP contract.",
          retryable: false,
          correlation_id: request.id,
        },
      });
    }

    const active = activeRequests.get(request);
    request.log.error(
      {
        event: "unhandled_request_error",
        trace_id: active?.trace.traceId,
        span_id: active?.trace.spanId,
        correlation_id: request.id,
        error: { name: errorName(error) },
      },
      "unhandled request error",
    );
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "The service could not complete the request.",
        retryable: false,
        correlation_id: request.id,
      },
    });
  });

  app.register(async (instance) => {
    const routes = instance.withTypeProvider<TypeBoxTypeProvider>();

    routes.get(
      "/healthz",
      {
        schema: {
          operationId: "getHealth",
          tags: ["health"],
          response: {
            200: schemaRef(HealthResponseSchema),
          },
        },
      },
      async () => ({ status: "ok" as const }),
    );

    routes.get(
      "/api/v1/config",
      {
        schema: {
          operationId: "getPublicRuntimeConfig",
          tags: ["public-config"],
          response: {
            200: schemaRef(PublicRuntimeConfigSchema),
            500: schemaRef(ApiErrorResponseSchema),
          },
        },
      },
      async () => ({
        api_version: "v1" as const,
        environment: config.appEnv,
        max_session_seconds: config.maxSessionSeconds,
      }),
    );

    await routes.register(registerSessionRoutes, {
      provider: voiceProvider,
      rtcCredentialIssuer,
      agentLifecycle,
      sessionClosure,
      sessionData,
      ragService: realtimeRagService,
      // The demo Tenant is bound by trusted server code, never accepted from the request.
      resolveTenantId,
    });
    await routes.register(registerAiDebugRoutes, {
      provider: voiceProvider,
      service: aiDebugService,
      streamService: aiTurnStreamService,
      // The demo Tenant is bound by trusted server code, never accepted from the debug request.
      resolveTenantId,
    });
    await routes.register(registerBusinessToolRoutes, {
      provider: voiceProvider,
      tools: businessTools,
      agentLifecycle,
      mockToolsEnabled: config.voiceProvider === "mock",
      expectedVolcengineAppId: config.volcengine.functionCallingEnabled
        ? config.volcengine.rtcAppId
        : undefined,
      callbackSigningSecret: config.volcengine.functionCallingEnabled
        ? config.volcengine.callbackSigningSecret
        : undefined,
      sessionData,
    });
    await routes.register(registerObservabilityRoutes, {
      provider: voiceProvider,
      observability,
    });
  });

  const reaper = setInterval(() => {
    void agentLifecycle
      .reapExpired()
      .then((result) => {
        const purgedSummaries = sessionData.purgeExpired();
        const purgedHandoffs = sessionClosure.purgeExpired();
        if (result.inspected > 0) {
          app.log.info({ agentReaper: result }, "expired AI Agent cleanup finished");
        }
        if (purgedSummaries > 0 || purgedHandoffs > 0) {
          app.log.info(
            { purgedSummaries, purgedHandoffs },
            "expired session privacy records purged",
          );
        }
      })
      .catch((error: unknown) => {
        app.log.error(
          { event: "agent_reaper_failed", error: { name: errorName(error) } },
          "AI Agent reaper failed",
        );
      });
  }, config.agentReaperIntervalSeconds * 1000);
  reaper.unref();

  app.addHook("onClose", async () => {
    clearInterval(reaper);
    const result = await agentLifecycle.stopAll();
    if (result.inspected > 0) {
      app.log.info({ agentShutdown: result }, "AI Agent shutdown cleanup finished");
    }
  });

  return app;
}

function isValidationError(error: unknown): error is { validation: unknown } {
  return typeof error === "object" && error !== null && "validation" in error;
}

function requestOperation(request: {
  readonly routeOptions: { readonly schema?: unknown };
}): string {
  const schema = request.routeOptions.schema;
  if (typeof schema !== "object" || schema === null || !("operationId" in schema)) {
    return "unmatched";
  }
  const operationId = (schema as { operationId?: unknown }).operationId;
  return typeof operationId === "string" ? operationId : "unmatched";
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function aiErrorStatus(error: LanguageModelError | AiOrchestratorError): 409 | 502 | 503 | 504 {
  if (error instanceof AiOrchestratorError) {
    return error.code === "AI_TURN_ABORTED" ? 409 : 502;
  }
  return {
    LLM_PROVIDER_AUTHENTICATION_FAILED: 503 as const,
    LLM_PROVIDER_RATE_LIMITED: 503 as const,
    LLM_PROVIDER_REJECTED: 502 as const,
    LLM_PROVIDER_UNAVAILABLE: 503 as const,
    LLM_PROVIDER_TIMEOUT: 504 as const,
    LLM_INVALID_RESPONSE: 502 as const,
  }[error.code];
}
