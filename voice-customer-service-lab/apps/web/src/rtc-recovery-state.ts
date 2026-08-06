import type { RtcConnectionPhase } from "./rtc-room-adapter";

export const RTC_RECOVERY_WINDOW_MS = 25_000;

export interface RtcRecoveryState {
  readonly status: "stable" | "recovering" | "exhausted";
  readonly startedAtMs: number | null;
  readonly deadlineAtMs: number | null;
  readonly recoveryCount: number;
  readonly lastRestoredAtMs: number | null;
}

export type RtcRecoveryAction =
  | { readonly type: "reset" }
  | {
      readonly type: "phase.observed";
      readonly phase: RtcConnectionPhase;
      readonly observedAtMs: number;
      readonly windowMs?: number;
    }
  | { readonly type: "window.elapsed"; readonly observedAtMs: number };

export const initialRtcRecoveryState: RtcRecoveryState = {
  status: "stable",
  startedAtMs: null,
  deadlineAtMs: null,
  recoveryCount: 0,
  lastRestoredAtMs: null,
};

export function rtcRecoveryReducer(
  state: RtcRecoveryState,
  action: RtcRecoveryAction,
): RtcRecoveryState {
  if (action.type === "reset") {
    return initialRtcRecoveryState;
  }
  if (action.type === "window.elapsed") {
    if (
      state.status !== "recovering" ||
      state.deadlineAtMs === null ||
      action.observedAtMs < state.deadlineAtMs
    ) {
      return state;
    }
    return { ...state, status: "exhausted" };
  }

  if (action.phase === "connected") {
    if (state.status !== "recovering") {
      return state;
    }
    return {
      status: "stable",
      startedAtMs: null,
      deadlineAtMs: null,
      recoveryCount: state.recoveryCount + 1,
      lastRestoredAtMs: action.observedAtMs,
    };
  }

  if (action.phase === "reconnecting" || action.phase === "disconnected") {
    if (state.status !== "stable") {
      return state;
    }
    return {
      ...state,
      status: "recovering",
      startedAtMs: action.observedAtMs,
      deadlineAtMs: action.observedAtMs + (action.windowMs ?? RTC_RECOVERY_WINDOW_MS),
    };
  }

  return state;
}

export function rtcRecoveryRemainingMs(state: RtcRecoveryState, nowMs: number): number | null {
  if (state.status !== "recovering" || state.deadlineAtMs === null) {
    return null;
  }
  return Math.max(0, state.deadlineAtMs - nowMs);
}
