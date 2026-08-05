import { type Static, Type } from "typebox";

const AiIdentifierSchema = Type.String({
  minLength: 8,
  maxLength: 80,
  pattern: "^[a-z]{3,6}_[A-Za-z0-9]+$",
});

export const AiAnswerModeSchema = Type.Union(
  [
    Type.Literal("grounded_answer"),
    Type.Literal("clarify"),
    Type.Literal("direct_answer"),
    Type.Literal("abstain"),
    Type.Literal("tool_required"),
    Type.Literal("handoff"),
    Type.Literal("out_of_scope"),
    Type.Literal("safety_refusal"),
  ],
  { $id: "AiAnswerMode" },
);
export type AiAnswerMode = Static<typeof AiAnswerModeSchema>;

export const AiEvidenceStatusSchema = Type.Union(
  [
    Type.Literal("sufficient"),
    Type.Literal("none"),
    Type.Literal("conflicting"),
    Type.Literal("stale"),
    Type.Literal("not_applicable"),
  ],
  { $id: "AiEvidenceStatus" },
);
export type AiEvidenceStatus = Static<typeof AiEvidenceStatusSchema>;

export const AiDebugTurnHeadersSchema = Type.Object(
  {
    "idempotency-key": Type.String({
      minLength: 8,
      maxLength: 128,
      pattern: "^[A-Za-z0-9._:-]+$",
    }),
  },
  { additionalProperties: true },
);
export type AiDebugTurnHeaders = Static<typeof AiDebugTurnHeadersSchema>;

export const AiDebugTurnRequestSchema = Type.Object(
  {
    text: Type.String({ minLength: 1, maxLength: 2_000, pattern: "\\S" }),
  },
  { $id: "AiDebugTurnRequest", additionalProperties: false },
);
export type AiDebugTurnRequest = Static<typeof AiDebugTurnRequestSchema>;

const AiCitationSchema = Type.Object(
  {
    source_id: Type.String({ minLength: 3, maxLength: 128 }),
    title: Type.String({ minLength: 1, maxLength: 200 }),
    version: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

const AiModelUsageSchema = Type.Object(
  {
    input_tokens: Type.Integer({ minimum: 0 }),
    output_tokens: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const AiExecutionSchema = Type.Object(
  {
    policy_version: Type.String({ minLength: 3, maxLength: 64 }),
    router: Type.String({ minLength: 1, maxLength: 64 }),
    retriever: Type.Union([Type.String({ minLength: 1, maxLength: 64 }), Type.Null()]),
    model: Type.Union([Type.String({ minLength: 1, maxLength: 64 }), Type.Null()]),
    route_reason: Type.String({ minLength: 2, maxLength: 64 }),
    provider_request_id: Type.Union([Type.String({ minLength: 1, maxLength: 256 }), Type.Null()]),
    model_usage: Type.Union([AiModelUsageSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export const AiDebugTurnResponseSchema = Type.Object(
  {
    schema_version: Type.Literal(1),
    command_replayed: Type.Boolean(),
    session_id: AiIdentifierSchema,
    round_id: AiIdentifierSchema,
    answer_mode: AiAnswerModeSchema,
    evidence_status: AiEvidenceStatusSchema,
    spoken_text: Type.String({ minLength: 1, maxLength: 4_000 }),
    citations: Type.Array(AiCitationSchema, { maxItems: 12 }),
    execution: AiExecutionSchema,
  },
  { $id: "AiDebugTurnResponse", additionalProperties: false },
);
export type AiDebugTurnResponse = Static<typeof AiDebugTurnResponseSchema>;
