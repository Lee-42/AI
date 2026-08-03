import type {
  ConversationStage,
  VolcengineConversationStatusMessage,
  VolcengineSubtitle,
} from "./volcengine-rtc-message";

export interface RealtimeTranscriptMessage {
  readonly id: string;
  readonly roundId: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly isFinal: boolean;
  readonly isInterrupted?: boolean;
}

export interface RealtimeConversationState {
  readonly stage: ConversationStage | null;
  readonly stageEventTime: number;
  readonly transcript: readonly RealtimeTranscriptMessage[];
}

export type RealtimeConversationAction =
  | { readonly type: "reset" }
  | {
      readonly type: "subtitle.received";
      readonly role: RealtimeTranscriptMessage["role"];
      readonly subtitle: VolcengineSubtitle;
    }
  | {
      readonly type: "status.received";
      readonly status: VolcengineConversationStatusMessage;
    }
  | { readonly type: "round.interrupted"; readonly roundId: string };

export const initialRealtimeConversationState: RealtimeConversationState = {
  stage: null,
  stageEventTime: -1,
  transcript: [],
};

export function realtimeConversationReducer(
  state: RealtimeConversationState,
  action: RealtimeConversationAction,
): RealtimeConversationState {
  switch (action.type) {
    case "reset":
      return initialRealtimeConversationState;
    case "status.received":
      if (action.status.eventTime < state.stageEventTime) {
        return state;
      }
      return {
        ...state,
        stage: action.status.stage,
        stageEventTime: action.status.eventTime,
      };
    case "round.interrupted":
      return {
        ...state,
        stage: "listening",
        transcript: interruptAssistantMessages(state.transcript, action.roundId),
      };
    case "subtitle.received":
      return {
        ...state,
        transcript: applySubtitle(state.transcript, action.role, action.subtitle),
      };
  }
}

function applySubtitle(
  transcript: readonly RealtimeTranscriptMessage[],
  role: RealtimeTranscriptMessage["role"],
  subtitle: VolcengineSubtitle,
): readonly RealtimeTranscriptMessage[] {
  const id = `rtc:${role}:${subtitle.roundId}`;
  const roundId = `rtc:${subtitle.roundId}`;
  const existing = transcript.find((message) => message.id === id);
  const text =
    role === "assistant" ? mergeAssistantText(existing?.text ?? "", subtitle.text) : subtitle.text;
  const next = { id, roundId, role, text, isFinal: subtitle.paragraph };

  if (!existing) {
    return [...transcript, next];
  }
  return transcript.map((message) => (message.id === id ? next : message));
}

function interruptAssistantMessages(
  messages: readonly RealtimeTranscriptMessage[],
  roundId: string,
): readonly RealtimeTranscriptMessage[] {
  return messages.map((message) =>
    message.role === "assistant" && message.roundId === roundId
      ? { ...message, isFinal: true, isInterrupted: true }
      : message,
  );
}

function mergeAssistantText(current: string, incoming: string): string {
  if (!current || incoming.startsWith(current)) {
    return incoming;
  }
  if (current.endsWith(incoming)) {
    return current;
  }
  return `${current}${incoming}`;
}
