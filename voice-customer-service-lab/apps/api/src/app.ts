import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AgentCommandResponseSchema,
  AgentSnapshotSchema,
  AgentStateSchema,
  ApiErrorResponseSchema,
  ConversationEventSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  HealthResponseSchema,
  MockTurnRequestSchema,
  PublicRuntimeConfigSchema,
  RtcCredentialsSchema,
  SessionCommandResponseSchema,
  SessionSnapshotSchema,
  SessionStateSchema,
  schemaRef,
} from "@voice/contracts";
import Fastify from "fastify";
import type { AgentGateway } from "./agent/agent-gateway.js";
import { AgentGatewayError } from "./agent/agent-gateway.js";
import { AgentLifecycleError, AgentLifecycleService } from "./agent/agent-lifecycle-service.js";
import { createAgentGateway } from "./agent/create-agent-gateway.js";
import type { ServerConfig } from "./core/config.js";
import { createVoiceAgentProvider } from "./providers/create-voice-agent-provider.js";
import type { VoiceAgentProvider } from "./providers/voice-agent-provider.js";
import { VoiceProviderError } from "./providers/voice-agent-provider.js";
import { registerSessionRoutes } from "./routes/session-routes.js";
import { createRtcCredentialIssuer } from "./rtc/create-rtc-credential-issuer.js";
import type { RtcCredentialIssuer } from "./rtc/rtc-credential-issuer.js";

export interface BuildAppOptions {
  readonly logger?: boolean;
  readonly voiceProvider?: VoiceAgentProvider;
  readonly rtcCredentialIssuer?: RtcCredentialIssuer;
  readonly agentGateway?: AgentGateway;
  readonly agentLifecycleService?: AgentLifecycleService;
}

export function buildApp(config: ServerConfig, options: BuildAppOptions = {}) {
  const voiceProvider = options.voiceProvider ?? createVoiceAgentProvider(config);
  const rtcCredentialIssuer = options.rtcCredentialIssuer ?? createRtcCredentialIssuer(config);
  const agentGateway = options.agentGateway ?? createAgentGateway(config);
  const agentLifecycle =
    options.agentLifecycleService ??
    new AgentLifecycleService({
      gateway: agentGateway,
      resolveSession: (sessionId) => voiceProvider.getSession(sessionId),
      maxSessionSeconds: config.maxSessionSeconds,
    });
  const app = Fastify({
    genReqId: () => `cor_${randomUUID().replaceAll("-", "")}`,
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
              "req.headers.idempotency-key",
            ],
            censor: "[REDACTED]",
          },
        }
      : false,
  }).withTypeProvider<TypeBoxTypeProvider>();

  for (const schema of [
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
    MockTurnRequestSchema,
    SessionCommandResponseSchema,
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
  });

  app.setErrorHandler((error, request, reply) => {
    if (
      error instanceof VoiceProviderError ||
      error instanceof AgentLifecycleError ||
      error instanceof AgentGatewayError
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

    request.log.error({ err: error }, "unhandled request error");
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
    });
  });

  const reaper = setInterval(() => {
    void agentLifecycle
      .reapExpired()
      .then((result) => {
        if (result.inspected > 0) {
          app.log.info({ agentReaper: result }, "expired AI Agent cleanup finished");
        }
      })
      .catch((error: unknown) => {
        app.log.error({ err: error }, "AI Agent reaper failed");
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
