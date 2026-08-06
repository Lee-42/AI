import type { ConversationEvent, SessionSnapshot } from "@voice/contracts";

export type ConversationUiState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ending"
  | "ended"
  | "failed";

export interface TranscriptMessage {
  readonly id: string;
  readonly roundId: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly isFinal: boolean;
  readonly isInterrupted?: boolean;
}

export interface ConversationState {
  readonly uiState: ConversationUiState;
  readonly session: SessionSnapshot | null;
  readonly transcript: readonly TranscriptMessage[];
  readonly lastSequenceByStream: Readonly<Record<string, number>>;
  readonly errorMessage: string | null;
}

export type ConversationAction =
  | { readonly type: "reset" }
  | { readonly type: "command.started"; readonly command: "create" | "turn" | "end" }
  | { readonly type: "session.updated"; readonly session: SessionSnapshot }
  | { readonly type: "event.received"; readonly event: ConversationEvent }
  | { readonly type: "round.interrupted"; readonly roundId: string }
  | { readonly type: "response.invalidated"; readonly responseId: string }
  | { readonly type: "command.failed"; readonly message: string };

export const initialConversationState: ConversationState = {
  uiState: "idle",
  session: null,
  transcript: [],
  lastSequenceByStream: {},
  errorMessage: null,
};

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
  switch (action.type) {
    case "reset":
      return initialConversationState;
    case "command.started":
      return {
        ...state,
        uiState:
          action.command === "create"
            ? "connecting"
            : action.command === "end"
              ? "ending"
              : state.uiState,
        errorMessage: null,
      };
    case "session.updated":
      return { ...state, session: action.session };
    case "command.failed":
      return { ...state, uiState: "failed", errorMessage: action.message };
    case "round.interrupted":
      return {
        ...state,
        uiState: "listening",
        transcript: interruptAssistantMessages(state.transcript, action.roundId),
      };
    case "response.invalidated":
      return {
        ...state,
        transcript: state.transcript.map((message) =>
          message.role === "assistant" && message.id === action.responseId
            ? { ...message, isFinal: true, isInterrupted: true }
            : message,
        ),
      };
    case "event.received":
      return reduceEvent(state, action.event);
  }
}

function reduceEvent(state: ConversationState, event: ConversationEvent): ConversationState {
  const lastSequence = state.lastSequenceByStream[event.stream_id] ?? 0;
  if (event.sequence <= lastSequence) {
    return state;
  }

  const next = {
    ...state,
    lastSequenceByStream: {
      ...state.lastSequenceByStream,
      [event.stream_id]: event.sequence,
    },
  };

  switch (event.event_type) {
    case "session.created":
      return { ...next, uiState: "connecting" };
    case "session.ready":
      return { ...next, uiState: "listening" };
    case "turn.user.speech.started":
    case "turn.user.speech.ended":
      return { ...next, uiState: "listening" };
    case "turn.user.transcript.partial":
      return {
        ...next,
        transcript: upsertMessage(next.transcript, {
          id: normalizedRoundId(event),
          roundId: normalizedRoundId(event),
          role: "user",
          text: event.payload.text,
          isFinal: false,
        }),
      };
    case "turn.user.transcript.final":
      return {
        ...next,
        uiState: "thinking",
        transcript: upsertMessage(next.transcript, {
          id: normalizedRoundId(event),
          roundId: normalizedRoundId(event),
          role: "user",
          text: event.payload.text,
          isFinal: true,
        }),
      };
    case "turn.ai.response.started":
      return { ...next, uiState: "thinking" };
    case "turn.ai.transcript.delta":
      return {
        ...next,
        transcript: appendAssistantDelta(
          next.transcript,
          normalizedResponseId(event),
          normalizedRoundId(event),
          event.payload.text_delta,
        ),
      };
    case "turn.ai.audio.started":
      return { ...next, uiState: "speaking" };
    case "turn.ai.response.completed":
      return {
        ...next,
        uiState: "listening",
        transcript: finalizeMessage(next.transcript, normalizedResponseId(event)),
      };
    case "session.end.requested":
      return { ...next, uiState: "ending" };
    case "session.ended":
      return { ...next, uiState: "ended" };
    case "rtc.join.succeeded":
    case "agent.start.succeeded":
    case "cleanup.finished":
      return next;
  }
}

function upsertMessage(
  messages: readonly TranscriptMessage[],
  message: TranscriptMessage,
): readonly TranscriptMessage[] {
  const existingIndex = messages.findIndex((item) => item.id === message.id);
  if (existingIndex === -1) {
    return [...messages, message];
  }
  return messages.map((item, index) => (index === existingIndex ? message : item));
}

function appendAssistantDelta(
  messages: readonly TranscriptMessage[],
  responseId: string,
  roundId: string,
  textDelta: string,
): readonly TranscriptMessage[] {
  const existing = messages.find((message) => message.id === responseId);
  return upsertMessage(messages, {
    id: responseId,
    roundId,
    role: "assistant",
    text: `${existing?.text ?? ""}${textDelta}`,
    isFinal: false,
  });
}

function interruptAssistantMessages(
  messages: readonly TranscriptMessage[],
  roundId: string,
): readonly TranscriptMessage[] {
  return messages.map((message) =>
    message.role === "assistant" && message.roundId === roundId
      ? { ...message, isFinal: true, isInterrupted: true }
      : message,
  );
}

function normalizedRoundId(event: ConversationEvent): string {
  const source = event.producer === "volcengine_voice_provider" ? "rtc" : "mock";
  return `${source}:${event.round_id}`;
}

function normalizedResponseId(event: ConversationEvent): string {
  const source = event.producer === "volcengine_voice_provider" ? "rtc" : "mock";
  return `${source}:${event.response_id}`;
}

function finalizeMessage(
  messages: readonly TranscriptMessage[],
  responseId: string,
): readonly TranscriptMessage[] {
  return messages.map((message) =>
    message.id === responseId ? { ...message, isFinal: true } : message,
  );
}
