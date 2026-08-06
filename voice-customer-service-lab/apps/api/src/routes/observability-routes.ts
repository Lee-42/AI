import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ApiErrorResponseSchema,
  PrometheusMetricsResponseSchema,
  RealtimeSliObservationAckSchema,
  RealtimeSliObservationRequestSchema,
  SessionParamsSchema,
  SloSnapshotSchema,
  schemaRef,
} from "@voice/contracts";
import type { FastifyInstance } from "fastify";

import type { ObservabilityService } from "../observability/observability-service.js";
import type { VoiceAgentProvider } from "../providers/voice-agent-provider.js";

export interface RegisterObservabilityRoutesOptions {
  readonly provider: VoiceAgentProvider;
  readonly observability: ObservabilityService;
}

export async function registerObservabilityRoutes(
  instance: FastifyInstance,
  options: RegisterObservabilityRoutesOptions,
) {
  const routes = instance.withTypeProvider<TypeBoxTypeProvider>();

  routes.post(
    "/api/v1/sessions/:session_id/realtime-observations",
    {
      schema: {
        operationId: "recordRealtimeSliObservation",
        tags: ["observability"],
        params: SessionParamsSchema,
        body: schemaRef(RealtimeSliObservationRequestSchema),
        response: {
          200: schemaRef(RealtimeSliObservationAckSchema),
          202: schemaRef(RealtimeSliObservationAckSchema),
          400: schemaRef(ApiErrorResponseSchema),
          404: schemaRef(ApiErrorResponseSchema),
        },
      },
    },
    async (request, reply) => {
      // Resolve the Session first; observations for invented IDs must not enter SLO data.
      options.provider.getSession(request.params.session_id);
      const result = options.observability.recordRealtime(request.params.session_id, request.body);
      return reply
        .header("Cache-Control", "no-store")
        .code(result.replayed ? 200 : 202)
        .send({ accepted: true, replayed: result.replayed });
    },
  );

  routes.get(
    "/internal/observability/slo",
    {
      schema: {
        operationId: "getLocalSloSnapshot",
        tags: ["observability"],
        response: { 200: schemaRef(SloSnapshotSchema) },
      },
    },
    async (_request, reply) =>
      reply.header("Cache-Control", "no-store").send(options.observability.snapshot()),
  );

  routes.get(
    "/internal/metrics",
    {
      schema: {
        operationId: "getPrometheusMetrics",
        tags: ["observability"],
        response: { 200: schemaRef(PrometheusMetricsResponseSchema) },
      },
    },
    async (_request, reply) =>
      reply
        .header("Cache-Control", "no-store")
        .type("text/plain; version=0.0.4; charset=utf-8")
        .send(options.observability.renderPrometheus()),
  );
}
