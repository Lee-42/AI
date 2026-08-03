import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AgentCommandResponseSchema,
  ApiErrorResponseSchema,
  CreateSessionHeadersSchema,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
  EndSessionResponseSchema,
  HandoffRequestSchema,
  HandoffResponseSchema,
  MockTurnRequestSchema,
  SessionCommandResponseSchema,
  SessionParamsSchema,
  schemaRef,
} from "@voice/contracts";
import type { FastifyInstance } from "fastify";

import type { AgentLifecycleService } from "../agent/agent-lifecycle-service.js";
import type { VoiceAgentProvider } from "../providers/voice-agent-provider.js";
import { supportsMockTurns, VoiceProviderError } from "../providers/voice-agent-provider.js";
import type { RtcCredentialIssuer } from "../rtc/rtc-credential-issuer.js";
import type { SessionClosureService } from "../session-data/session-closure-service.js";
import type { SessionDataService } from "../session-data/session-data-service.js";

export interface RegisterSessionRoutesOptions {
  readonly provider: VoiceAgentProvider;
  readonly rtcCredentialIssuer: RtcCredentialIssuer;
  readonly agentLifecycle: AgentLifecycleService;
  readonly sessionClosure: SessionClosureService;
  readonly sessionData: SessionDataService;
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
      options.sessionData.registerSession(result.session);
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
        headers: CreateSessionHeadersSchema,
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

      const result = await options.provider.submitMockTurn({
        sessionId: request.params.session_id,
        text: request.body.text.trim(),
        idempotencyKey: request.headers["idempotency-key"],
        correlationId: request.id,
      });
      options.sessionData.observeConversationEvents(result.session, result.events);
      return result;
    },
  );

  routes.post(
    "/api/v1/sessions/:session_id/handoff",
    {
      schema: {
        operationId: "requestHumanHandoff",
        tags: ["session-closure"],
        headers: CreateSessionHeadersSchema,
        params: SessionParamsSchema,
        body: schemaRef(HandoffRequestSchema),
        response: {
          200: schemaRef(HandoffResponseSchema),
          201: schemaRef(HandoffResponseSchema),
          400: schemaRef(ApiErrorResponseSchema),
          404: schemaRef(ApiErrorResponseSchema),
          409: schemaRef(ApiErrorResponseSchema),
          500: schemaRef(ApiErrorResponseSchema),
          502: schemaRef(ApiErrorResponseSchema),
          504: schemaRef(ApiErrorResponseSchema),
        },
      },
    },
    async (request, reply) => {
      const result = await options.sessionClosure.requestHandoff({
        sessionId: request.params.session_id,
        idempotencyKey: request.headers["idempotency-key"],
        correlationId: request.id,
        reason: request.body.reason,
      });
      return reply
        .header("Cache-Control", "no-store")
        .code(result.command_replayed ? 200 : 201)
        .send(result);
    },
  );

  routes.delete(
    "/api/v1/sessions/:session_id",
    {
      schema: {
        operationId: "endVoiceSession",
        tags: ["sessions"],
        headers: CreateSessionHeadersSchema,
        params: SessionParamsSchema,
        response: {
          200: schemaRef(EndSessionResponseSchema),
          400: schemaRef(ApiErrorResponseSchema),
          404: schemaRef(ApiErrorResponseSchema),
          500: schemaRef(ApiErrorResponseSchema),
        },
      },
    },
    async (request, reply) => {
      const result = await options.sessionClosure.endSession({
        sessionId: request.params.session_id,
        idempotencyKey: request.headers["idempotency-key"],
        correlationId: request.id,
      });
      return reply.header("Cache-Control", "no-store").send(result);
    },
  );
}
