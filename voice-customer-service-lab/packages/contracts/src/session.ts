import { type Static, type TSchema, Type } from "typebox";

import { schemaRef } from "./schema-ref.js";

const IdentifierSchema = Type.String({
  minLength: 8,
  maxLength: 80,
  pattern: "^[a-z]{3}_[A-Za-z0-9]+$",
});
const EmptyPayloadSchema = Type.Object({}, { additionalProperties: false });

const EventEnvelopeProperties = {
  schema_version: Type.Literal(1),
  event_id: IdentifierSchema,
  session_id: IdentifierSchema,
  producer: Type.Union([
    Type.Literal("mock_voice_provider"),
    Type.Literal("volcengine_voice_provider"),
  ]),
  stream_id: IdentifierSchema,
  sequence: Type.Integer({ minimum: 1 }),
  occurred_at: Type.String({ format: "date-time" }),
  correlation_id: IdentifierSchema,
};

function eventSchema<
  const TEventType extends string,
  const TRoundId extends TSchema,
  const TResponseId extends TSchema,
  const TPayload extends TSchema,
>(eventType: TEventType, roundId: TRoundId, responseId: TResponseId, payload: TPayload) {
  return Type.Object(
    {
      ...EventEnvelopeProperties,
      event_type: Type.Literal(eventType),
      round_id: roundId,
      response_id: responseId,
      payload,
    },
    { additionalProperties: false },
  );
}

const SessionCreatedEventSchema = eventSchema(
  "session.created",
  Type.Null(),
  Type.Null(),
  Type.Object(
    {
      expires_at: Type.String({ format: "date-time" }),
    },
    { additionalProperties: false },
  ),
);

const RtcJoinSucceededEventSchema = eventSchema(
  "rtc.join.succeeded",
  Type.Null(),
  Type.Null(),
  EmptyPayloadSchema,
);

const AgentStartSucceededEventSchema = eventSchema(
  "agent.start.succeeded",
  Type.Null(),
  Type.Null(),
  EmptyPayloadSchema,
);

const SessionReadyEventSchema = eventSchema(
  "session.ready",
  Type.Null(),
  Type.Null(),
  Type.Object(
    {
      ready_components: Type.Array(Type.Union([Type.Literal("rtc"), Type.Literal("agent")]), {
        minItems: 2,
        maxItems: 2,
      }),
    },
    { additionalProperties: false },
  ),
);

const UserSpeechStartedEventSchema = eventSchema(
  "turn.user.speech.started",
  IdentifierSchema,
  Type.Null(),
  Type.Object(
    {
      round_origin: Type.Literal("user"),
    },
    { additionalProperties: false },
  ),
);

const UserTranscriptPartialEventSchema = eventSchema(
  "turn.user.transcript.partial",
  IdentifierSchema,
  Type.Null(),
  Type.Object(
    {
      text: Type.String(),
      revision: Type.Integer({ minimum: 1 }),
    },
    { additionalProperties: false },
  ),
);

const UserSpeechEndedEventSchema = eventSchema(
  "turn.user.speech.ended",
  IdentifierSchema,
  Type.Null(),
  EmptyPayloadSchema,
);

const UserTranscriptFinalEventSchema = eventSchema(
  "turn.user.transcript.final",
  IdentifierSchema,
  Type.Null(),
  Type.Object(
    {
      text: Type.String(),
      language: Type.Literal("zh-CN"),
    },
    { additionalProperties: false },
  ),
);

const AiResponseStartedEventSchema = eventSchema(
  "turn.ai.response.started",
  IdentifierSchema,
  IdentifierSchema,
  Type.Object(
    {
      model_route: Type.String(),
    },
    { additionalProperties: false },
  ),
);

const AiTranscriptDeltaEventSchema = eventSchema(
  "turn.ai.transcript.delta",
  IdentifierSchema,
  IdentifierSchema,
  Type.Object(
    {
      text_delta: Type.String(),
      index: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  ),
);

const AiAudioStartedEventSchema = eventSchema(
  "turn.ai.audio.started",
  IdentifierSchema,
  IdentifierSchema,
  EmptyPayloadSchema,
);

const AiResponseCompletedEventSchema = eventSchema(
  "turn.ai.response.completed",
  IdentifierSchema,
  IdentifierSchema,
  Type.Object(
    {
      finish_reason: Type.Literal("stop"),
    },
    { additionalProperties: false },
  ),
);

const SessionEndRequestedEventSchema = eventSchema(
  "session.end.requested",
  Type.Null(),
  Type.Null(),
  Type.Object(
    {
      reason: Type.Literal("user_request"),
    },
    { additionalProperties: false },
  ),
);

const CleanupFinishedEventSchema = eventSchema(
  "cleanup.finished",
  Type.Null(),
  Type.Null(),
  Type.Object(
    {
      resource_results: Type.Array(
        Type.Object(
          {
            resource: Type.Union([Type.Literal("rtc"), Type.Literal("agent")]),
            status: Type.Literal("released"),
          },
          { additionalProperties: false },
        ),
      ),
    },
    { additionalProperties: false },
  ),
);

const SessionEndedEventSchema = eventSchema(
  "session.ended",
  Type.Null(),
  Type.Null(),
  Type.Object(
    {
      reason: Type.Literal("user_request"),
    },
    { additionalProperties: false },
  ),
);

export const ConversationEventSchema = Type.Union(
  [
    SessionCreatedEventSchema,
    RtcJoinSucceededEventSchema,
    AgentStartSucceededEventSchema,
    SessionReadyEventSchema,
    UserSpeechStartedEventSchema,
    UserTranscriptPartialEventSchema,
    UserSpeechEndedEventSchema,
    UserTranscriptFinalEventSchema,
    AiResponseStartedEventSchema,
    AiTranscriptDeltaEventSchema,
    AiAudioStartedEventSchema,
    AiResponseCompletedEventSchema,
    SessionEndRequestedEventSchema,
    CleanupFinishedEventSchema,
    SessionEndedEventSchema,
  ],
  { $id: "ConversationEvent" },
);
export type ConversationEvent = Static<typeof ConversationEventSchema>;

export const SessionStateSchema = Type.Union(
  [
    Type.Literal("new"),
    Type.Literal("creating"),
    Type.Literal("connecting"),
    Type.Literal("active"),
    Type.Literal("reconnecting"),
    Type.Literal("ending"),
    Type.Literal("ended"),
    Type.Literal("failed"),
  ],
  { $id: "SessionState" },
);
export type SessionState = Static<typeof SessionStateSchema>;

export const SessionSnapshotSchema = Type.Object(
  {
    session_id: IdentifierSchema,
    room_id: IdentifierSchema,
    rtc_user_id: IdentifierSchema,
    provider: Type.Union([Type.Literal("mock"), Type.Literal("volcengine")]),
    state: schemaRef(SessionStateSchema),
    revision: Type.Integer({ minimum: 1 }),
    created_at: Type.String({ format: "date-time" }),
    expires_at: Type.String({ format: "date-time" }),
  },
  {
    $id: "SessionSnapshot",
    additionalProperties: false,
  },
);
export type SessionSnapshot = Static<typeof SessionSnapshotSchema>;

export const CreateSessionHeadersSchema = Type.Object({
  "idempotency-key": Type.String({
    minLength: 8,
    maxLength: 128,
    pattern: "^[A-Za-z0-9._:-]+$",
  }),
});
export type CreateSessionHeaders = Static<typeof CreateSessionHeadersSchema>;

export const CreateSessionRequestSchema = Type.Object(
  {
    locale: Type.Literal("zh-CN"),
  },
  {
    $id: "CreateSessionRequest",
    additionalProperties: false,
  },
);
export type CreateSessionRequest = Static<typeof CreateSessionRequestSchema>;

const RtcCredentialProperties = {
  app_id: Type.String({ minLength: 1, maxLength: 64 }),
  room_id: IdentifierSchema,
  user_id: IdentifierSchema,
  token: Type.String({ minLength: 8 }),
  expires_at: Type.String({ format: "date-time" }),
};

export const RtcCredentialsSchema = Type.Union(
  [
    Type.Object(
      {
        kind: Type.Literal("mock"),
        ...RtcCredentialProperties,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal("volcengine"),
        ...RtcCredentialProperties,
      },
      { additionalProperties: false },
    ),
  ],
  { $id: "RtcCredentials" },
);
export type RtcCredentials = Static<typeof RtcCredentialsSchema>;

export const SessionParamsSchema = Type.Object(
  {
    session_id: IdentifierSchema,
  },
  { additionalProperties: false },
);
export type SessionParams = Static<typeof SessionParamsSchema>;

export const AgentStateSchema = Type.Union(
  [
    Type.Literal("starting"),
    Type.Literal("dispatched"),
    Type.Literal("active"),
    Type.Literal("stopping"),
    Type.Literal("stopped"),
    Type.Literal("failed"),
    Type.Literal("orphaned"),
  ],
  { $id: "AgentState" },
);
export type AgentState = Static<typeof AgentStateSchema>;

export const AgentSnapshotSchema = Type.Object(
  {
    task_id: IdentifierSchema,
    bot_user_id: IdentifierSchema,
    provider: Type.Union([Type.Literal("mock"), Type.Literal("volcengine")]),
    prompt_policy_version: Type.String({ minLength: 3, maxLength: 64 }),
    state: schemaRef(AgentStateSchema),
    revision: Type.Integer({ minimum: 1 }),
    created_at: Type.String({ format: "date-time" }),
    deadline_at: Type.String({ format: "date-time" }),
    stopped_at: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    provider_request_id: Type.Union([Type.String({ minLength: 1, maxLength: 128 }), Type.Null()]),
  },
  {
    $id: "AgentSnapshot",
    additionalProperties: false,
  },
);
export type AgentSnapshot = Static<typeof AgentSnapshotSchema>;

export const AgentCommandResponseSchema = Type.Object(
  {
    agent: schemaRef(AgentSnapshotSchema),
    command_replayed: Type.Boolean(),
  },
  {
    $id: "AgentCommandResponse",
    additionalProperties: false,
  },
);
export type AgentCommandResponse = Static<typeof AgentCommandResponseSchema>;

export const MockTurnRequestSchema = Type.Object(
  {
    text: Type.String({ minLength: 1, maxLength: 500, pattern: "\\S" }),
  },
  {
    $id: "MockTurnRequest",
    additionalProperties: false,
  },
);
export type MockTurnRequest = Static<typeof MockTurnRequestSchema>;

export const SessionCommandResponseSchema = Type.Object(
  {
    session: schemaRef(SessionSnapshotSchema),
    events: Type.Array(schemaRef(ConversationEventSchema)),
    command_replayed: Type.Boolean(),
  },
  {
    $id: "SessionCommandResponse",
    additionalProperties: false,
  },
);
export type SessionCommandResponse = Static<typeof SessionCommandResponseSchema>;

export const CreateSessionResponseSchema = Type.Object(
  {
    session: schemaRef(SessionSnapshotSchema),
    rtc_credentials: schemaRef(RtcCredentialsSchema),
    events: Type.Array(schemaRef(ConversationEventSchema)),
    command_replayed: Type.Boolean(),
  },
  {
    $id: "CreateSessionResponse",
    additionalProperties: false,
  },
);
export type CreateSessionResponse = Static<typeof CreateSessionResponseSchema>;
