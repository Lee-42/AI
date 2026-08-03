import { type Static, Type } from "typebox";

import { schemaRef } from "./schema-ref.js";

const RatioSchema = Type.Number({ minimum: 0, maximum: 1 });

export const RealtimeSliNameSchema = Type.Union(
  [Type.Literal("rtc_join"), Type.Literal("turn_first_output"), Type.Literal("barge_in_stop")],
  { $id: "RealtimeSliName" },
);
export type RealtimeSliName = Static<typeof RealtimeSliNameSchema>;

export const RealtimeSliObservationRequestSchema = Type.Object(
  {
    observation_id: Type.String({
      minLength: 8,
      maxLength: 80,
      pattern: "^obs_[A-Za-z0-9]+$",
    }),
    sli: schemaRef(RealtimeSliNameSchema),
    source: Type.Union([Type.Literal("mock"), Type.Literal("rtc")]),
    outcome: Type.Union([Type.Literal("success"), Type.Literal("failure")]),
    duration_ms: Type.Union([Type.Integer({ minimum: 0, maximum: 60_000 }), Type.Null()]),
  },
  { $id: "RealtimeSliObservationRequest", additionalProperties: false },
);
export type RealtimeSliObservationRequest = Static<typeof RealtimeSliObservationRequestSchema>;

export const RealtimeSliObservationAckSchema = Type.Object(
  {
    accepted: Type.Literal(true),
    replayed: Type.Boolean(),
  },
  { $id: "RealtimeSliObservationAck", additionalProperties: false },
);
export type RealtimeSliObservationAck = Static<typeof RealtimeSliObservationAckSchema>;

export const SloIndicatorNameSchema = Type.Union(
  [
    Type.Literal("control_plane_availability"),
    Type.Literal("rtc_join_success"),
    Type.Literal("turn_first_output"),
    Type.Literal("barge_in_stop"),
    Type.Literal("agent_cleanup"),
  ],
  { $id: "SloIndicatorName" },
);
export type SloIndicatorName = Static<typeof SloIndicatorNameSchema>;

export const SloIndicatorSchema = Type.Object(
  {
    name: schemaRef(SloIndicatorNameSchema),
    objective_ratio: RatioSchema,
    threshold_seconds: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
    measurement_quality: Type.Union([Type.Literal("authoritative"), Type.Literal("proxy")]),
    eligible_events: Type.Integer({ minimum: 0 }),
    good_events: Type.Integer({ minimum: 0 }),
    achieved_ratio: Type.Union([RatioSchema, Type.Null()]),
    error_budget_events: Type.Integer({ minimum: 0 }),
    error_budget_remaining_events: Type.Integer(),
    status: Type.Union([
      Type.Literal("no_data"),
      Type.Literal("meeting"),
      Type.Literal("breached"),
    ]),
  },
  { $id: "SloIndicator", additionalProperties: false },
);
export type SloIndicator = Static<typeof SloIndicatorSchema>;

export const SloSnapshotSchema = Type.Object(
  {
    generated_at: Type.String({ format: "date-time" }),
    window_seconds: Type.Integer({ minimum: 60 }),
    sample_warning: Type.Boolean(),
    indicators: Type.Array(schemaRef(SloIndicatorSchema), { minItems: 5, maxItems: 5 }),
  },
  { $id: "SloSnapshot", additionalProperties: false },
);
export type SloSnapshot = Static<typeof SloSnapshotSchema>;

export const PrometheusMetricsResponseSchema = Type.String({
  $id: "PrometheusMetricsResponse",
});
