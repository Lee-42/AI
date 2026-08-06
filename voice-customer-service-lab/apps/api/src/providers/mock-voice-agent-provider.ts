import { randomUUID } from "node:crypto";

import type { ConversationEvent, SessionCommandResponse, SessionSnapshot } from "@voice/contracts";

import type {
  CreateVoiceSessionCommand,
  EndVoiceSessionCommand,
  MockTurnCapableVoiceAgentProvider,
  SubmitMockTurnCommand,
} from "./voice-agent-provider.js";
import { VoiceProviderError } from "./voice-agent-provider.js";

type IdPrefix = "ses" | "usr" | "evt" | "rnd" | "rsp" | "str";

interface MockSessionRecord {
  snapshot: SessionSnapshot;
  readonly streamId: string;
  sequence: number;
}

interface TurnReplayRecord {
  readonly text: string;
  readonly events: readonly ConversationEvent[];
}

type EventEnvelopeKeys =
  | "schema_version"
  | "event_id"
  | "session_id"
  | "producer"
  | "stream_id"
  | "sequence"
  | "occurred_at"
  | "correlation_id";

type EventContent = ConversationEvent extends infer TEvent
  ? TEvent extends ConversationEvent
    ? Omit<TEvent, EventEnvelopeKeys>
    : never
  : never;

export interface MockVoiceAgentProviderOptions {
  readonly sessionTtlSeconds: number;
  readonly welcomeMessage: string;
  readonly clock?: () => Date;
  readonly idFactory?: (prefix: IdPrefix) => string;
}

export class MockVoiceAgentProvider implements MockTurnCapableVoiceAgentProvider {
  readonly name = "mock" as const;

  readonly #sessionTtlSeconds: number;
  readonly #welcomeMessage: string;
  readonly #clock: () => Date;
  readonly #idFactory: (prefix: IdPrefix) => string;
  readonly #sessions = new Map<string, MockSessionRecord>();
  readonly #sessionByIdempotencyKey = new Map<string, string>();
  readonly #createEventsByIdempotencyKey = new Map<string, readonly ConversationEvent[]>();
  readonly #turnsByIdempotencyKey = new Map<string, TurnReplayRecord>();
  readonly #endEventsByIdempotencyKey = new Map<string, readonly ConversationEvent[]>();

  constructor(options: MockVoiceAgentProviderOptions) {
    this.#sessionTtlSeconds = options.sessionTtlSeconds;
    this.#welcomeMessage = options.welcomeMessage;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory =
      options.idFactory ?? ((prefix) => `${prefix}_${randomUUID().replaceAll("-", "")}`);
  }

  async createSession(command: CreateVoiceSessionCommand): Promise<SessionCommandResponse> {
    const existingSessionId = this.#sessionByIdempotencyKey.get(command.idempotencyKey);
    if (existingSessionId) {
      const existing = this.#requireSession(existingSessionId);
      return this.#result(
        existing,
        this.#createEventsByIdempotencyKey.get(command.idempotencyKey) ?? [],
        true,
      );
    }

    const now = this.#clock();
    const sessionId = this.#idFactory("ses");
    const rtcUserId = this.#idFactory("usr");
    const record: MockSessionRecord = {
      snapshot: {
        session_id: sessionId,
        room_id: sessionId,
        rtc_user_id: rtcUserId,
        provider: this.name,
        state: "active",
        revision: 1,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + this.#sessionTtlSeconds * 1000).toISOString(),
      },
      streamId: this.#idFactory("str"),
      sequence: 0,
    };

    this.#sessions.set(sessionId, record);
    this.#sessionByIdempotencyKey.set(command.idempotencyKey, sessionId);

    const events: ConversationEvent[] = [
      this.#event(record, command.correlationId, {
        event_type: "session.created",
        round_id: null,
        response_id: null,
        payload: { expires_at: record.snapshot.expires_at },
      }),
      this.#event(record, command.correlationId, {
        event_type: "rtc.join.succeeded",
        round_id: null,
        response_id: null,
        payload: {},
      }),
      this.#event(record, command.correlationId, {
        event_type: "agent.start.succeeded",
        round_id: null,
        response_id: null,
        payload: {},
      }),
      this.#event(record, command.correlationId, {
        event_type: "session.ready",
        round_id: null,
        response_id: null,
        payload: { ready_components: ["rtc", "agent"] },
      }),
    ];
    const welcomeRoundId = this.#idFactory("rnd");
    const welcomeResponseId = this.#idFactory("rsp");
    events.push(
      this.#event(record, command.correlationId, {
        event_type: "turn.ai.response.started",
        round_id: welcomeRoundId,
        response_id: welcomeResponseId,
        payload: { model_route: "fixed/welcome-policy" },
      }),
      this.#event(record, command.correlationId, {
        event_type: "turn.ai.transcript.delta",
        round_id: welcomeRoundId,
        response_id: welcomeResponseId,
        payload: { text_delta: this.#welcomeMessage, index: 0 },
      }),
      this.#event(record, command.correlationId, {
        event_type: "turn.ai.audio.started",
        round_id: welcomeRoundId,
        response_id: welcomeResponseId,
        payload: {},
      }),
      this.#event(record, command.correlationId, {
        event_type: "turn.ai.response.completed",
        round_id: welcomeRoundId,
        response_id: welcomeResponseId,
        payload: { finish_reason: "stop" },
      }),
    );

    this.#createEventsByIdempotencyKey.set(command.idempotencyKey, events);

    return this.#result(record, events, false);
  }

  async submitMockTurn(command: SubmitMockTurnCommand): Promise<SessionCommandResponse> {
    const record = this.#requireSession(command.sessionId);
    const scopedKey = `${command.sessionId}:${command.idempotencyKey}`;
    const replay = this.#turnsByIdempotencyKey.get(scopedKey);
    if (replay) {
      if (replay.text !== command.text) {
        throw new VoiceProviderError(
          "IDEMPOTENCY_KEY_REUSED",
          "The Idempotency-Key was already used with a different Mock turn.",
          409,
        );
      }
      return this.#result(record, replay.events, true);
    }
    if (record.snapshot.state !== "active") {
      throw new VoiceProviderError("SESSION_NOT_ACTIVE", "The session is no longer active.", 409);
    }

    const roundId = command.answer.roundId;
    const responseId = this.#idFactory("rsp");
    const partialText = command.text.slice(0, Math.max(1, Math.ceil(command.text.length / 2)));

    const events = [
      this.#event(record, command.correlationId, {
        event_type: "turn.user.speech.started",
        round_id: roundId,
        response_id: null,
        payload: { round_origin: "user" },
      }),
      this.#event(record, command.correlationId, {
        event_type: "turn.user.transcript.partial",
        round_id: roundId,
        response_id: null,
        payload: { text: partialText, revision: 1 },
      }),
      this.#event(record, command.correlationId, {
        event_type: "turn.user.speech.ended",
        round_id: roundId,
        response_id: null,
        payload: {},
      }),
      this.#event(record, command.correlationId, {
        event_type: "turn.user.transcript.final",
        round_id: roundId,
        response_id: null,
        payload: { text: command.text, language: "zh-CN" },
      }),
      this.#event(record, command.correlationId, {
        event_type: "turn.ai.response.started",
        round_id: roundId,
        response_id: responseId,
        payload: { model_route: `rag/${command.answer.execution.model ?? "policy"}` },
      }),
      this.#event(record, command.correlationId, {
        event_type: "turn.ai.transcript.delta",
        round_id: roundId,
        response_id: responseId,
        payload: { text_delta: command.answer.spokenText, index: 0 },
      }),
      this.#event(record, command.correlationId, {
        event_type: "turn.ai.audio.started",
        round_id: roundId,
        response_id: responseId,
        payload: {},
      }),
      this.#event(record, command.correlationId, {
        event_type: "turn.ai.response.completed",
        round_id: roundId,
        response_id: responseId,
        payload: { finish_reason: "stop" },
      }),
    ];

    record.snapshot = {
      ...record.snapshot,
      revision: record.snapshot.revision + 1,
    };
    this.#turnsByIdempotencyKey.set(scopedKey, { text: command.text, events });
    return this.#result(record, events, false);
  }

  getSession(sessionId: string): SessionSnapshot {
    return { ...this.#requireSession(sessionId).snapshot };
  }

  async endSession(command: EndVoiceSessionCommand): Promise<SessionCommandResponse> {
    const record = this.#requireSession(command.sessionId);
    const scopedKey = `${command.sessionId}:${command.idempotencyKey}`;
    const replay = this.#endEventsByIdempotencyKey.get(scopedKey);
    if (replay) {
      return this.#result(record, replay, true);
    }
    if (record.snapshot.state === "ended") {
      return this.#result(record, [], true);
    }

    const events = [
      this.#event(record, command.correlationId, {
        event_type: "session.end.requested",
        round_id: null,
        response_id: null,
        payload: { reason: "user_request" },
      }),
      this.#event(record, command.correlationId, {
        event_type: "cleanup.finished",
        round_id: null,
        response_id: null,
        payload: {
          resource_results: [
            { resource: "rtc", status: "released" },
            { resource: "agent", status: "released" },
          ],
        },
      }),
      this.#event(record, command.correlationId, {
        event_type: "session.ended",
        round_id: null,
        response_id: null,
        payload: { reason: "user_request" },
      }),
    ];

    record.snapshot = {
      ...record.snapshot,
      state: "ended",
      revision: record.snapshot.revision + 1,
    };
    // Active-turn replay data contains transcript text; discard it as soon as the Session closes.
    for (const key of this.#turnsByIdempotencyKey.keys()) {
      if (key.startsWith(`${command.sessionId}:`)) {
        this.#turnsByIdempotencyKey.delete(key);
      }
    }
    this.#endEventsByIdempotencyKey.set(scopedKey, events);
    return this.#result(record, events, false);
  }

  #requireSession(sessionId: string): MockSessionRecord {
    const record = this.#sessions.get(sessionId);
    if (!record) {
      throw new VoiceProviderError("SESSION_NOT_FOUND", "The session does not exist.", 404);
    }
    return record;
  }

  #result(
    record: MockSessionRecord,
    events: readonly ConversationEvent[],
    commandReplayed: boolean,
  ): SessionCommandResponse {
    return {
      session: { ...record.snapshot },
      events: [...events],
      command_replayed: commandReplayed,
    };
  }

  #event(
    record: MockSessionRecord,
    correlationId: string,
    content: EventContent,
  ): ConversationEvent {
    record.sequence += 1;

    // This is the single place where Provider data becomes our domain envelope.
    return {
      schema_version: 1,
      event_id: this.#idFactory("evt"),
      session_id: record.snapshot.session_id,
      producer: "mock_voice_provider",
      stream_id: record.streamId,
      sequence: record.sequence,
      occurred_at: this.#clock().toISOString(),
      correlation_id: correlationId,
      ...content,
    } as ConversationEvent;
  }
}
