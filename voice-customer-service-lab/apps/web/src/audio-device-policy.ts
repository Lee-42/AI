import type { AudioInputDevice } from "./media-device-manager";

export type MicrophoneSelectionReason = "unchanged" | "initial" | "fallback" | "unavailable";

export interface MicrophoneSelectionDecision {
  readonly deviceId: string;
  readonly reason: MicrophoneSelectionReason;
}

/** Keeps the current microphone when possible and otherwise selects a deterministic fallback. */
export function reconcileMicrophoneSelection(
  currentDeviceId: string,
  microphones: readonly AudioInputDevice[],
): MicrophoneSelectionDecision {
  if (microphones.some((device) => device.deviceId === currentDeviceId)) {
    return { deviceId: currentDeviceId, reason: "unchanged" };
  }

  const fallback = microphones[0]?.deviceId ?? "";
  if (!fallback) {
    return { deviceId: "", reason: "unavailable" };
  }
  return {
    deviceId: fallback,
    reason: currentDeviceId ? "fallback" : "initial",
  };
}

export type MicrophoneLevelState = "unavailable" | "silent" | "low" | "healthy" | "high";

/** RTC volume is diagnostic evidence only; it must never create or end a conversation turn. */
export function classifyMicrophoneLevel(level: number | null): MicrophoneLevelState {
  if (level === null) {
    return "unavailable";
  }
  if (level <= 25) {
    return "silent";
  }
  if (level <= 75) {
    return "low";
  }
  if (level <= 204) {
    return "healthy";
  }
  return "high";
}
