import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AiDebugTurnHeadersSchema,
  AiDebugTurnRequestSchema,
  AiDebugTurnResponseSchema,
  ApiErrorResponseSchema,
  SessionParamsSchema,
  schemaRef,
} from "@voice/contracts";
import type { FastifyInstance } from "fastify";

import { type AiDebugService, AiDebugServiceError } from "../ai/ai-debug-service.js";
import type { VoiceAgentProvider } from "../providers/voice-agent-provider.js";
import { VoiceProviderError } from "../providers/voice-agent-provider.js";

export interface RegisterAiDebugRoutesOptions {
  readonly provider: VoiceAgentProvider;
  readonly service: AiDebugService | undefined;
  readonly resolveTenantId: (sessionId: string) => string;
}

export async function registerAiDebugRoutes(
  instance: FastifyInstance,
  options: RegisterAiDebugRoutesOptions,
) {
  const routes = instance.withTypeProvider<TypeBoxTypeProvider>();

  routes.post(
    "/api/v1/sessions/:session_id/ai/debug-turns",
    {
      schema: {
        operationId: "createAiDebugTurn",
        tags: ["ai-debug"],
        headers: AiDebugTurnHeadersSchema,
        params: SessionParamsSchema,
        body: schemaRef(AiDebugTurnRequestSchema),
        response: {
          200: schemaRef(AiDebugTurnResponseSchema),
          201: schemaRef(AiDebugTurnResponseSchema),
          400: schemaRef(ApiErrorResponseSchema),
          404: schemaRef(ApiErrorResponseSchema),
          409: schemaRef(ApiErrorResponseSchema),
          502: schemaRef(ApiErrorResponseSchema),
          503: schemaRef(ApiErrorResponseSchema),
          504: schemaRef(ApiErrorResponseSchema),
          500: schemaRef(ApiErrorResponseSchema),
        },
      },
    },
    async (request, reply) => {
      if (!options.service) {
        throw new AiDebugServiceError(
          "AI_DEBUG_API_DISABLED",
          "The AI debug API is disabled.",
          404,
        );
      }
      const session = options.provider.getSession(request.params.session_id);
      if (session.state !== "active") {
        throw new VoiceProviderError("SESSION_NOT_ACTIVE", "The session is no longer active.", 409);
      }

      const result = await options.service.answer({
        tenantId: options.resolveTenantId(session.session_id),
        sessionId: session.session_id,
        text: request.body.text,
        idempotencyKey: request.headers["idempotency-key"],
      });
      const response = result.response;
      return reply
        .status(result.replayed ? 200 : 201)
        .header("Cache-Control", "no-store")
        .send({
          schema_version: 1 as const,
          command_replayed: result.replayed,
          session_id: response.sessionId,
          round_id: response.roundId,
          answer_mode: response.answerMode,
          evidence_status: response.evidenceStatus,
          spoken_text: response.spokenText,
          citations: response.citations.map((citation) => ({
            source_id: citation.sourceId,
            title: citation.title,
            version: citation.version,
          })),
          execution: {
            policy_version: response.execution.policyVersion,
            router: response.execution.router,
            retriever: response.execution.retriever,
            model: response.execution.model,
            route_reason: response.execution.routeReason,
            provider_request_id: response.execution.providerRequestId,
            model_usage: response.execution.modelUsage
              ? {
                  input_tokens: response.execution.modelUsage.inputTokens,
                  output_tokens: response.execution.modelUsage.outputTokens,
                }
              : null,
          },
        });
    },
  );
}
