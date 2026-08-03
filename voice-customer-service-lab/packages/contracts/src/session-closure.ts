import { type Static, Type } from "typebox";

import { schemaRef } from "./schema-ref.js";
import { ConversationEventSchema, SessionSnapshotSchema } from "./session.js";

const IdentifierSchema = Type.String({
  minLength: 8,
  maxLength: 80,
  pattern: "^[a-z]{3}_[A-Za-z0-9]+$",
});

export const SessionSummaryTopicSchema = Type.Union(
  [Type.Literal("general_support"), Type.Literal("order_status"), Type.Literal("human_handoff")],
  { $id: "SessionSummaryTopic" },
);
export type SessionSummaryTopic = Static<typeof SessionSummaryTopicSchema>;

export const SessionPrivacySummarySchema = Type.Object(
  {
    summary_id: IdentifierSchema,
    session_id: IdentifierSchema,
    outcome: Type.Union([Type.Literal("completed"), Type.Literal("handoff_requested")]),
    turn_count: Type.Integer({ minimum: 0 }),
    topics: Type.Array(schemaRef(SessionSummaryTopicSchema), {
      maxItems: 3,
      uniqueItems: true,
    }),
    sensitive_input_detected: Type.Boolean(),
    raw_audio_retained: Type.Literal(false),
    transcript_retained: Type.Literal(false),
    generated_at: Type.String({ format: "date-time" }),
    retention_expires_at: Type.String({ format: "date-time" }),
  },
  { $id: "SessionPrivacySummary", additionalProperties: false },
);
export type SessionPrivacySummary = Static<typeof SessionPrivacySummarySchema>;

export const HandoffReasonSchema = Type.Union(
  [
    Type.Literal("user_request"),
    Type.Literal("unsupported_request"),
    Type.Literal("safety_concern"),
    Type.Literal("repeated_failure"),
  ],
  { $id: "HandoffReason" },
);
export type HandoffReason = Static<typeof HandoffReasonSchema>;

export const HandoffRequestSchema = Type.Object(
  {
    reason: schemaRef(HandoffReasonSchema),
  },
  { $id: "HandoffRequest", additionalProperties: false },
);
export type HandoffRequest = Static<typeof HandoffRequestSchema>;

export const HandoffTicketSchema = Type.Object(
  {
    ticket_id: IdentifierSchema,
    status: Type.Literal("recorded"),
    human_connected: Type.Literal(false),
    reason: schemaRef(HandoffReasonSchema),
    requested_at: Type.String({ format: "date-time" }),
    message: Type.Literal("已记录演示转人工工单；当前没有真人坐席接入。"),
  },
  { $id: "HandoffTicket", additionalProperties: false },
);
export type HandoffTicket = Static<typeof HandoffTicketSchema>;

export const EndSessionResponseSchema = Type.Object(
  {
    session: schemaRef(SessionSnapshotSchema),
    events: Type.Array(schemaRef(ConversationEventSchema)),
    summary: schemaRef(SessionPrivacySummarySchema),
    command_replayed: Type.Boolean(),
  },
  { $id: "EndSessionResponse", additionalProperties: false },
);
export type EndSessionResponse = Static<typeof EndSessionResponseSchema>;

export const HandoffResponseSchema = Type.Object(
  {
    session: schemaRef(SessionSnapshotSchema),
    events: Type.Array(schemaRef(ConversationEventSchema)),
    summary: schemaRef(SessionPrivacySummarySchema),
    handoff: schemaRef(HandoffTicketSchema),
    command_replayed: Type.Boolean(),
  },
  { $id: "HandoffResponse", additionalProperties: false },
);
export type HandoffResponse = Static<typeof HandoffResponseSchema>;
