import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ApiErrorResponseSchema,
  FunctionCallCallbackAckSchema,
  MockBusinessToolCallRequestSchema,
  MockBusinessToolCallResponseSchema,
  SessionParamsSchema,
  schemaRef,
  VolcengineFunctionCallCallbackRequestSchema,
} from "@voice/contracts";
import type { FastifyInstance } from "fastify";

import type { AgentLifecycleService } from "../agent/agent-lifecycle-service.js";
import {
  BusinessToolError,
  type BusinessToolService,
  toModelToolError,
  toModelToolResult,
} from "../business-tools/business-tool-service.js";
import {
  parseVolcengineToolCalls,
  verifyVolcengineCallback,
} from "../business-tools/volcengine-function-callback.js";
import type { SecretValue } from "../core/secret-value.js";
import type { VoiceAgentProvider } from "../providers/voice-agent-provider.js";
import { VoiceProviderError } from "../providers/voice-agent-provider.js";
import type { SessionDataService } from "../session-data/session-data-service.js";

export interface RegisterBusinessToolRoutesOptions {
  readonly provider: VoiceAgentProvider;
  readonly tools: BusinessToolService;
  readonly agentLifecycle: AgentLifecycleService;
  readonly mockToolsEnabled: boolean;
  readonly expectedVolcengineAppId: string | undefined;
  readonly callbackSigningSecret: SecretValue | undefined;
  readonly sessionData: SessionDataService;
}

export async function registerBusinessToolRoutes(
  instance: FastifyInstance,
  options: RegisterBusinessToolRoutesOptions,
) {
  const routes = instance.withTypeProvider<TypeBoxTypeProvider>();

  routes.post(
    "/api/v1/sessions/:session_id/mock-tool-calls",
    {
      schema: {
        operationId: "invokeMockBusinessTool",
        tags: ["mock-tools"],
        params: SessionParamsSchema,
        body: schemaRef(MockBusinessToolCallRequestSchema),
        response: {
          200: schemaRef(MockBusinessToolCallResponseSchema),
          400: schemaRef(ApiErrorResponseSchema),
          404: schemaRef(ApiErrorResponseSchema),
          409: schemaRef(ApiErrorResponseSchema),
          501: schemaRef(ApiErrorResponseSchema),
          500: schemaRef(ApiErrorResponseSchema),
        },
      },
    },
    async (request, reply) => {
      if (!options.mockToolsEnabled) {
        throw new VoiceProviderError(
          "PROVIDER_NOT_IMPLEMENTED",
          "The direct business tool endpoint is only available in Mock mode.",
          501,
        );
      }
      const session = options.provider.getSession(request.params.session_id);
      if (session.state !== "active") {
        throw new VoiceProviderError("SESSION_NOT_ACTIVE", "The session is no longer active.", 409);
      }

      const result = await options.tools.invoke({
        sessionId: session.session_id,
        toolCallId: request.body.tool_call_id,
        name: request.body.name,
        arguments: request.body.arguments,
      });
      options.sessionData.recordTopic(session, "order_status");
      return reply.header("Cache-Control", "no-store").send(result);
    },
  );

  routes.post(
    "/internal/provider-callbacks/volcengine/function-calls",
    {
      schema: {
        operationId: "receiveVolcengineFunctionCalls",
        tags: ["provider-callbacks"],
        body: schemaRef(VolcengineFunctionCallCallbackRequestSchema),
        response: {
          200: schemaRef(FunctionCallCallbackAckSchema),
          400: schemaRef(ApiErrorResponseSchema),
          401: schemaRef(ApiErrorResponseSchema),
          404: schemaRef(ApiErrorResponseSchema),
          503: schemaRef(ApiErrorResponseSchema),
          500: schemaRef(ApiErrorResponseSchema),
        },
      },
    },
    async (request, reply) => {
      verifyVolcengineCallback(
        request.body.Signature,
        request.body.AppId,
        options.callbackSigningSecret,
        options.expectedVolcengineAppId,
      );
      const context = options.agentLifecycle.resolveToolContext(request.body.RoomID);
      const toolCalls = parseVolcengineToolCalls(request.body.Message);
      let replayedCount = 0;

      for (const toolCall of toolCalls) {
        let content: string;
        try {
          const result = await options.tools.invoke({
            sessionId: context.sessionId,
            toolCallId: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
          });
          options.sessionData.recordTopic(
            options.provider.getSession(context.sessionId),
            "order_status",
          );
          replayedCount += result.replayed ? 1 : 0;
          content = toModelToolResult(result);
        } catch (error) {
          if (!(error instanceof BusinessToolError)) {
            throw error;
          }
          // Business failures are tool results; returning HTTP 4xx would trigger useless callback retries.
          content = toModelToolError(error);
        }

        await options.agentLifecycle.submitToolResult({
          roomId: context.roomId,
          toolCallId: toolCall.id,
          content,
          correlationId: request.id,
        });
      }

      return reply.header("Cache-Control", "no-store").send({
        accepted: true as const,
        tool_call_count: toolCalls.length,
        replayed_count: replayedCount,
      });
    },
  );
}
