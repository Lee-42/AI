import type { ConversationEvent } from "@voice/contracts";

import type {
  VolcengineConversationStatusMessage,
  VolcengineSubtitle,
} from "./volcengine-rtc-message";

const MAX_TRACKED_ROUNDS = 256;

export type TurnPhase =
  | "capturing"
  | "endpointed"
  | "thinking"
  | "speaking"
  | "completed"
  | "interrupted"
  | "failed";

export type EndpointEvidence = "speech_end" | "final_transcript" | "provider_state";
export type OutputEvidence = "audio_event" | "assistant_subtitle" | "provider_state";
export type TurnSignalSource = "mock" | "rtc";

export interface TurnSignal {
  readonly kind:
    | "speech-started"
    | "transcript-partial"
    | "speech-ended"
    | "transcript-final"
    | "response-started"
    | "output-delta"
    | "output-started"
    | "response-completed"
    | "interrupted"
    | "failed";
  readonly roundId: string;
  readonly source: TurnSignalSource;
  readonly responseId?: string;
  readonly receivedAtMs: number;
  readonly providerEventTime?: number;
  readonly outputEvidence?: OutputEvidence;
}

export interface TurnSnapshot {
  readonly roundId: string;
  readonly responseId: string | null;
  readonly ordinal: number;
  readonly source: TurnSignalSource;
  readonly phase: TurnPhase;
  readonly endpointEvidence: EndpointEvidence | null;
  readonly outputEvidence: OutputEvidence | null;
  readonly startedAtMs: number | null;
  readonly endpointedAtMs: number | null;
  readonly firstOutputAtMs: number | null;
  readonly completedAtMs: number | null;
  readonly lastProviderEventTime: number | null;
}

export interface TurnInterruptionSnapshot {
  readonly interruptedRoundId: string;
  readonly nextRoundId: string | null;
  readonly detectedAtMs: number;
}

export interface TurnLifecycleState {
  readonly turn: TurnSnapshot | null;
  readonly observedTurns: number;
  readonly knownRoundIds: Readonly<Record<string, true>>;
  readonly lastInterruption: TurnInterruptionSnapshot | null;
  readonly interruptionCount: number;
}

export type TurnLifecycleAction =
  | { readonly type: "reset" }
  | { readonly type: "signal.received"; readonly signal: TurnSignal };

export const initialTurnLifecycleState: TurnLifecycleState = {
  turn: null,
  observedTurns: 0,
  knownRoundIds: {},
  lastInterruption: null,
  interruptionCount: 0,
};

export function turnLifecycleReducer(
  state: TurnLifecycleState,
  action: TurnLifecycleAction,
): TurnLifecycleState {
  if (action.type === "reset") {
    return initialTurnLifecycleState;
  }

  const { signal } = action;
  let turn = state.turn;
  let observedTurns = state.observedTurns;
  let knownRoundIds = state.knownRoundIds;
  let lastInterruption = state.lastInterruption;
  let interruptionCount = state.interruptionCount;

  if (!turn || turn.roundId !== signal.roundId) {
    if (knownRoundIds[signal.roundId] || observedTurns >= MAX_TRACKED_ROUNDS) {
      return state;
    }
    if (turn && !isTerminalPhase(turn.phase)) {
      if (!canSupersedeTurn(turn.phase, signal.kind)) {
        return state;
      }
      lastInterruption = {
        interruptedRoundId: turn.roundId,
        nextRoundId: signal.roundId,
        detectedAtMs: signal.receivedAtMs,
      };
      interruptionCount += 1;
    }
    observedTurns += 1;
    knownRoundIds = { ...knownRoundIds, [signal.roundId]: true };
    turn = createTurn(signal, observedTurns);
  }

  if (isTerminalPhase(turn.phase)) {
    return state;
  }

  if (
    signal.providerEventTime !== undefined &&
    turn.lastProviderEventTime !== null &&
    signal.providerEventTime < turn.lastProviderEventTime
  ) {
    return state;
  }

  if (
    signal.responseId &&
    turn.responseId &&
    signal.responseId !== turn.responseId &&
    signal.kind !== "response-started"
  ) {
    return state;
  }

  if (signal.kind === "interrupted") {
    lastInterruption = {
      interruptedRoundId: turn.roundId,
      nextRoundId: null,
      detectedAtMs: signal.receivedAtMs,
    };
    interruptionCount += 1;
  }

  const appliedTurn = applySignal(turn, signal);
  const nextTurn =
    signal.providerEventTime === undefined
      ? appliedTurn
      : { ...appliedTurn, lastProviderEventTime: signal.providerEventTime };
  if (nextTurn === turn && state.turn === turn) {
    return state;
  }
  return {
    turn: nextTurn,
    observedTurns,
    knownRoundIds,
    lastInterruption,
    interruptionCount,
  };
}

export function endpointToFirstOutputMs(turn: TurnSnapshot | null): number | null {
  if (!turn || turn.endpointedAtMs === null || turn.firstOutputAtMs === null) {
    return null;
  }
  return Math.max(0, Math.round(turn.firstOutputAtMs - turn.endpointedAtMs));
}

export function domainEventToTurnSignal(
  event: ConversationEvent,
  receivedAtMs: number,
): TurnSignal | null {
  const source = event.producer === "volcengine_voice_provider" ? "rtc" : "mock";
  const roundId = event.round_id ? `${source}:${event.round_id}` : "";
  switch (event.event_type) {
    case "turn.user.speech.started":
      return signal("speech-started", roundId, source, receivedAtMs);
    case "turn.user.transcript.partial":
      return signal("transcript-partial", roundId, source, receivedAtMs);
    case "turn.user.speech.ended":
      return signal("speech-ended", roundId, source, receivedAtMs);
    case "turn.user.transcript.final":
      return signal("transcript-final", roundId, source, receivedAtMs);
    case "turn.ai.response.started":
      return {
        ...signal("response-started", roundId, source, receivedAtMs),
        responseId: `${source}:${event.response_id}`,
      };
    case "turn.ai.transcript.delta":
      return {
        ...signal("output-delta", roundId, source, receivedAtMs),
        responseId: `${source}:${event.response_id}`,
      };
    case "turn.ai.audio.started":
      return {
        ...signal("output-started", roundId, source, receivedAtMs),
        responseId: `${source}:${event.response_id}`,
        outputEvidence: "audio_event",
      };
    case "turn.ai.response.completed":
      return {
        ...signal("response-completed", roundId, source, receivedAtMs),
        responseId: `${source}:${event.response_id}`,
      };
    case "session.created":
    case "rtc.join.succeeded":
    case "agent.start.succeeded":
    case "session.ready":
    case "session.end.requested":
    case "cleanup.finished":
    case "session.ended":
      return null;
  }
}

export function rtcSubtitleToTurnSignal(
  role: "user" | "assistant",
  subtitle: VolcengineSubtitle,
  receivedAtMs: number,
): TurnSignal {
  const roundId = `rtc:${subtitle.roundId}`;
  if (role === "assistant") {
    return {
      ...signal("output-started", roundId, "rtc", receivedAtMs),
      outputEvidence: "assistant_subtitle",
    };
  }
  return signal(
    subtitle.paragraph ? "transcript-final" : "transcript-partial",
    roundId,
    "rtc",
    receivedAtMs,
  );
}

export function rtcStatusToTurnSignal(
  status: VolcengineConversationStatusMessage,
  receivedAtMs: number,
): TurnSignal | null {
  const roundId = `rtc:${status.roundId}`;
  switch (status.stage) {
    case "thinking":
      return {
        ...signal("response-started", roundId, "rtc", receivedAtMs),
        providerEventTime: status.eventTime,
      };
    case "speaking":
      return {
        ...signal("output-started", roundId, "rtc", receivedAtMs),
        providerEventTime: status.eventTime,
        outputEvidence: "provider_state",
      };
    case "finished":
      return {
        ...signal("response-completed", roundId, "rtc", receivedAtMs),
        providerEventTime: status.eventTime,
      };
    case "interrupted":
      return {
        ...signal("interrupted", roundId, "rtc", receivedAtMs),
        providerEventTime: status.eventTime,
      };
    case "error":
      return {
        ...signal("failed", roundId, "rtc", receivedAtMs),
        providerEventTime: status.eventTime,
      };
    case "listening":
    case "unknown":
      return null;
  }
}

function createTurn(signalValue: TurnSignal, ordinal: number): TurnSnapshot {
  return {
    roundId: signalValue.roundId,
    responseId: null,
    ordinal,
    source: signalValue.source,
    phase: "capturing",
    endpointEvidence: null,
    outputEvidence: null,
    startedAtMs: null,
    endpointedAtMs: null,
    firstOutputAtMs: null,
    completedAtMs: null,
    lastProviderEventTime: null,
  };
}

function applySignal(turn: TurnSnapshot, signalValue: TurnSignal): TurnSnapshot {
  switch (signalValue.kind) {
    case "speech-started":
    case "transcript-partial":
      return {
        ...turn,
        phase: furthestPhase(turn.phase, "capturing"),
        startedAtMs: turn.startedAtMs ?? signalValue.receivedAtMs,
      };
    case "speech-ended":
    case "transcript-final":
      return {
        ...turn,
        phase: furthestPhase(turn.phase, "endpointed"),
        endpointEvidence:
          turn.endpointEvidence ??
          (signalValue.kind === "speech-ended" ? "speech_end" : "final_transcript"),
        endpointedAtMs: turn.endpointedAtMs ?? signalValue.receivedAtMs,
      };
    case "response-started":
      return {
        ...turn,
        phase: furthestPhase(turn.phase, "thinking"),
        responseId: signalValue.responseId ?? turn.responseId,
        endpointEvidence: turn.endpointEvidence ?? "provider_state",
        endpointedAtMs: turn.endpointedAtMs ?? signalValue.receivedAtMs,
        ...(signalValue.responseId && turn.responseId && signalValue.responseId !== turn.responseId
          ? {
              firstOutputAtMs: null,
              outputEvidence: null,
            }
          : {}),
      };
    case "output-delta":
      return {
        ...turn,
        phase: furthestPhase(turn.phase, "thinking"),
        responseId: signalValue.responseId ?? turn.responseId,
      };
    case "output-started":
      return {
        ...turn,
        phase: "speaking",
        responseId: signalValue.responseId ?? turn.responseId,
        outputEvidence: turn.outputEvidence ?? signalValue.outputEvidence ?? "provider_state",
        firstOutputAtMs: turn.firstOutputAtMs ?? signalValue.receivedAtMs,
      };
    case "response-completed":
      return {
        ...turn,
        phase: "completed",
        responseId: signalValue.responseId ?? turn.responseId,
        completedAtMs: turn.completedAtMs ?? signalValue.receivedAtMs,
      };
    case "interrupted":
      return {
        ...turn,
        phase: "interrupted",
        completedAtMs: turn.completedAtMs ?? signalValue.receivedAtMs,
      };
    case "failed":
      return {
        ...turn,
        phase: "failed",
        completedAtMs: turn.completedAtMs ?? signalValue.receivedAtMs,
      };
  }
}

function furthestPhase(current: TurnPhase, candidate: TurnPhase): TurnPhase {
  return phaseRank(candidate) > phaseRank(current) ? candidate : current;
}

function phaseRank(phase: TurnPhase): number {
  switch (phase) {
    case "capturing":
      return 0;
    case "endpointed":
      return 1;
    case "thinking":
      return 2;
    case "speaking":
      return 3;
    case "completed":
    case "interrupted":
    case "failed":
      return 4;
  }
}

function isTerminalPhase(phase: TurnPhase): boolean {
  return ["completed", "interrupted", "failed"].includes(phase);
}

function canSupersedeTurn(phase: TurnPhase, kind: TurnSignal["kind"]): boolean {
  return (
    (phase === "thinking" || phase === "speaking") &&
    [
      "speech-started",
      "transcript-partial",
      "transcript-final",
      "response-started",
      "output-started",
    ].includes(kind)
  );
}

function signal(
  kind: TurnSignal["kind"],
  roundId: string,
  source: TurnSignalSource,
  receivedAtMs: number,
): TurnSignal {
  return { kind, roundId, source, receivedAtMs };
}
