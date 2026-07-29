import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AgentCommandResponseSchema,
  ApiErrorResponseSchema,
  CreateSessionHeadersSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  MockTurnRequestSchema,
  SessionCommandResponseSchema,
  SessionParamsSchema,
  schemaRef,
} from "@voice/contracts";
import type { FastifyInstance } from "fastify";

import {
  AgentLifecycleError,
  type AgentLifecycleService,
} from "../agent/agent-lifecycle-service.js";
import type { VoiceAgentProvider } from "../providers/voice-agent-provider.js";
import { supportsMockTurns, VoiceProviderError } from "../providers/voice-agent-provider.js";
import type { RtcCredentialIssuer } from "../rtc/rtc-credential-issuer.js";

export interface RegisterSessionRoutesOptions {
  readonly provider: VoiceAgentProvider;
  readonly rtcCredentialIssuer: RtcCredentialIssuer;
  readonly agentLifecycle: AgentLifecycleService;
}

export async function registerSessionRoutes(
  instance: FastifyInstance,
  options: RegisterSessionRoutesOptions,
) {
  const routes = instance.withTypeProvider<TypeBoxTypeProvider>();

  routes.post(
    "/api/v1/sessions/:session_id/agent",
    {
      schema: {
        operationId: "startVoiceAgent",
        tags: ["agents"],
        headers: CreateSessionHeadersSchema,
        params: SessionParamsSchema,
        response: {
          200: schemaRef(AgentCommandResponseSchema),
          201: schemaRef(AgentCommandResponseSchema),
          404: schemaRef(ApiErrorResponseSchema),
          409: schemaRef(ApiErrorResponseSchema),
          502: schemaRef(ApiErrorResponseSchema),
          504: schemaRef(ApiErrorResponseSchema),
          500: schemaRef(ApiErrorResponseSchema),
        },
      },
    },
    async (request, reply) => {
      const result = await options.agentLifecycle.start({
        sessionId: request.params.session_id,
        idempotencyKey: request.headers["idempotency-key"],
        correlationId: request.id,
      });
      return reply.code(result.command_replayed ? 200 : 201).send(result);
    },
  );

  routes.delete(
    "/api/v1/sessions/:session_id/agent",
    {
      schema: {
        operationId: "stopVoiceAgent",
        tags: ["agents"],
        headers: CreateSessionHeadersSchema,
        params: SessionParamsSchema,
        response: {
          200: schemaRef(AgentCommandResponseSchema),
          404: schemaRef(ApiErrorResponseSchema),
          409: schemaRef(ApiErrorResponseSchema),
          502: schemaRef(ApiErrorResponseSchema),
          504: schemaRef(ApiErrorResponseSchema),
          500: schemaRef(ApiErrorResponseSchema),
        },
      },
    },
    async (request) =>
      options.agentLifecycle.stop({
        sessionId: request.params.session_id,
        idempotencyKey: request.headers["idempotency-key"],
        correlationId: request.id,
      }),
  );

  routes.post(
    "/api/v1/sessions",
    {
      schema: {
        operationId: "createVoiceSession",
        tags: ["sessions"],
        headers: CreateSessionHeadersSchema,
        body: schemaRef(CreateSessionRequestSchema),
        response: {
          200: schemaRef(CreateSessionResponseSchema),
          201: schemaRef(CreateSessionResponseSchema),
          400: schemaRef(ApiErrorResponseSchema),
          500: schemaRef(ApiErrorResponseSchema),
        },
      },
    },
    async (request, reply) => {
      const result = await options.provider.createSession({
        body: request.body,
        idempotencyKey: request.headers["idempotency-key"],
        correlationId: request.id,
      });
      const rtcCredentials = options.rtcCredentialIssuer.issue({ session: result.session });

      return reply
        .header("Cache-Control", "no-store")
        .header("Pragma", "no-cache")
        .code(result.command_replayed ? 200 : 201)
        .send({
          ...result,
          rtc_credentials: rtcCredentials,
        });
    },
  );

  routes.post(
    "/api/v1/sessions/:session_id/mock-turns",
    {
      schema: {
        operationId: "submitMockVoiceTurn",
        tags: ["mock-sessions"],
        params: SessionParamsSchema,
        body: schemaRef(MockTurnRequestSchema),
        response: {
          200: schemaRef(SessionCommandResponseSchema),
          400: schemaRef(ApiErrorResponseSchema),
          404: schemaRef(ApiErrorResponseSchema),
          409: schemaRef(ApiErrorResponseSchema),
          501: schemaRef(ApiErrorResponseSchema),
          500: schemaRef(ApiErrorResponseSchema),
        },
      },
    },
    async (request) => {
      if (!supportsMockTurns(options.provider)) {
        throw new VoiceProviderError(
          "PROVIDER_NOT_IMPLEMENTED",
          "Mock turns are only available with VOICE_PROVIDER=mock.",
          501,
        );
      }

      return options.provider.submitMockTurn({
        sessionId: request.params.session_id,
        text: request.body.text.trim(),
        correlationId: request.id,
      });
    },
  );

  routes.delete(
    "/api/v1/sessions/:session_id",
    {
      schema: {
        operationId: "endVoiceSession",
        tags: ["sessions"],
        params: SessionParamsSchema,
        response: {
          200: schemaRef(SessionCommandResponseSchema),
          400: schemaRef(ApiErrorResponseSchema),
          404: schemaRef(ApiErrorResponseSchema),
          500: schemaRef(ApiErrorResponseSchema),
        },
      },
    },
    async (request) => {
      try {
        await options.agentLifecycle.stop({
          sessionId: request.params.session_id,
          idempotencyKey: `session-end:${request.id}`,
          correlationId: request.id,
        });
      } catch (error) {
        if (!(error instanceof AgentLifecycleError && error.code === "AGENT_NOT_STARTED")) {
          throw error;
        }
      }

      return options.provider.endSession({
        sessionId: request.params.session_id,
        correlationId: request.id,
      });
    },
  );
}
