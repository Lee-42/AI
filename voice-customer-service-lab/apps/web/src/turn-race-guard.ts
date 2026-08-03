import type { TurnPhase, TurnSignal } from "./turn-lifecycle";

const MAX_TRACKED_IDENTITIES = 256;

export interface TurnGenerationToken {
  readonly generation: number;
  readonly roundId: string;
  readonly responseId: string | null;
}

export interface TurnInterruptionDecision {
  readonly interruptedRoundId: string;
  readonly interruptedResponseId: string | null;
  readonly nextRoundId: string | null;
  readonly detectedAtMs: number;
}

export type TurnRaceRejectReason =
  | "invalidated_round"
  | "previous_round"
  | "overlapping_round"
  | "terminal_round"
  | "stale_provider_event"
  | "invalidated_response"
  | "response_mismatch"
  | "identity_limit";

export type TurnRaceDecision =
  | {
      readonly accepted: true;
      readonly generation: number;
      readonly interruption?: TurnInterruptionDecision;
      readonly supersededResponseId?: string;
    }
  | {
      readonly accepted: false;
      readonly generation: number;
      readonly reason: TurnRaceRejectReason;
    };

/**
 * Synchronous gate used before React reducers. Once a Round/Response is cancelled,
 * late Provider messages cannot reach playback or transcript state.
 */
export class TurnRaceGuard {
  #generation = 0;
  #currentRoundId: string | null = null;
  #currentResponseId: string | null = null;
  #phase: TurnPhase | null = null;
  #lastProviderEventTime = -1;
  readonly #knownRoundIds = new Set<string>();
  readonly #knownResponseRounds = new Map<string, string>();
  readonly #invalidatedRoundIds = new Set<string>();
  readonly #invalidatedResponseIds = new Set<string>();

  accept(signal: TurnSignal): TurnRaceDecision {
    if (this.#invalidatedRoundIds.has(signal.roundId)) {
      return this.#reject("invalidated_round");
    }
    if (signal.responseId) {
      if (this.#invalidatedResponseIds.has(signal.responseId)) {
        return this.#reject("invalidated_response");
      }
      const knownRoundId = this.#knownResponseRounds.get(signal.responseId);
      if (knownRoundId && knownRoundId !== signal.roundId) {
        return this.#reject("response_mismatch");
      }
      if (!knownRoundId && this.#knownResponseRounds.size >= MAX_TRACKED_IDENTITIES) {
        return this.#reject("identity_limit");
      }
    }

    let interruption: TurnInterruptionDecision | undefined;
    if (this.#currentRoundId !== signal.roundId) {
      if (this.#knownRoundIds.has(signal.roundId)) {
        return this.#reject("previous_round");
      }
      if (this.#knownRoundIds.size >= MAX_TRACKED_IDENTITIES) {
        return this.#reject("identity_limit");
      }
      if (this.#currentRoundId && this.#phase && !isTerminalPhase(this.#phase)) {
        if (!isInterruptiblePhase(this.#phase) || !canBeginSupersedingRound(signal.kind)) {
          return this.#reject("overlapping_round");
        }
        interruption = this.#invalidateCurrentRound(signal.roundId, signal.receivedAtMs);
      }
      this.#generation += 1;
      this.#currentRoundId = signal.roundId;
      this.#currentResponseId = null;
      this.#phase = null;
      this.#lastProviderEventTime = -1;
      this.#knownRoundIds.add(signal.roundId);
    } else if (this.#phase && isTerminalPhase(this.#phase)) {
      return this.#reject("terminal_round");
    }

    if (
      signal.providerEventTime !== undefined &&
      signal.providerEventTime < this.#lastProviderEventTime
    ) {
      return this.#reject("stale_provider_event");
    }

    let supersededResponseId: string | undefined;
    if (signal.responseId) {
      if (!this.#currentResponseId) {
        this.#trackResponse(signal.responseId);
        this.#currentResponseId = signal.responseId;
      } else if (this.#currentResponseId !== signal.responseId) {
        if (signal.kind !== "response-started" || this.#phase === "speaking") {
          return this.#reject("response_mismatch");
        }
        this.#trackResponse(signal.responseId);
        supersededResponseId = this.#currentResponseId;
        this.#invalidatedResponseIds.add(this.#currentResponseId);
        this.#currentResponseId = signal.responseId;
        this.#generation += 1;
      }
    }

    if (signal.providerEventTime !== undefined) {
      this.#lastProviderEventTime = signal.providerEventTime;
    }
    this.#phase = nextPhase(this.#phase, signal.kind);

    if (signal.kind === "interrupted" && this.#currentRoundId) {
      interruption = this.#invalidateCurrentRound(null, signal.receivedAtMs);
      this.#generation += 1;
    }

    return {
      accepted: true,
      generation: this.#generation,
      ...(interruption ? { interruption } : {}),
      ...(supersededResponseId ? { supersededResponseId } : {}),
    };
  }

  capture(): TurnGenerationToken | null {
    if (!this.#currentRoundId) {
      return null;
    }
    return {
      generation: this.#generation,
      roundId: this.#currentRoundId,
      responseId: this.#currentResponseId,
    };
  }

  isCurrent(token: TurnGenerationToken): boolean {
    return (
      token.generation === this.#generation &&
      token.roundId === this.#currentRoundId &&
      token.responseId === this.#currentResponseId &&
      !this.#invalidatedRoundIds.has(token.roundId)
    );
  }

  reset(): void {
    this.#generation = 0;
    this.#currentRoundId = null;
    this.#currentResponseId = null;
    this.#phase = null;
    this.#lastProviderEventTime = -1;
    this.#knownRoundIds.clear();
    this.#knownResponseRounds.clear();
    this.#invalidatedRoundIds.clear();
    this.#invalidatedResponseIds.clear();
  }

  #invalidateCurrentRound(
    nextRoundId: string | null,
    detectedAtMs: number,
  ): TurnInterruptionDecision {
    const interruptedRoundId = this.#currentRoundId ?? "";
    const interruptedResponseId = this.#currentResponseId;
    this.#invalidatedRoundIds.add(interruptedRoundId);
    if (interruptedResponseId) {
      this.#invalidatedResponseIds.add(interruptedResponseId);
    }
    this.#phase = "interrupted";
    return {
      interruptedRoundId,
      interruptedResponseId,
      nextRoundId,
      detectedAtMs,
    };
  }

  #reject(reason: TurnRaceRejectReason): TurnRaceDecision {
    return { accepted: false, generation: this.#generation, reason };
  }

  #trackResponse(responseId: string): void {
    this.#knownResponseRounds.set(responseId, this.#currentRoundId ?? "");
  }
}

function nextPhase(current: TurnPhase | null, kind: TurnSignal["kind"]): TurnPhase {
  switch (kind) {
    case "speech-started":
    case "transcript-partial":
      return furthestPhase(current, "capturing");
    case "speech-ended":
    case "transcript-final":
      return furthestPhase(current, "endpointed");
    case "response-started":
    case "output-delta":
      return furthestPhase(current, "thinking");
    case "output-started":
      return "speaking";
    case "response-completed":
      return "completed";
    case "interrupted":
      return "interrupted";
    case "failed":
      return "failed";
  }
}

function furthestPhase(current: TurnPhase | null, candidate: TurnPhase): TurnPhase {
  if (!current || phaseRank(candidate) > phaseRank(current)) {
    return candidate;
  }
  return current;
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

function canBeginSupersedingRound(kind: TurnSignal["kind"]): boolean {
  return [
    "speech-started",
    "transcript-partial",
    "transcript-final",
    "response-started",
    "output-started",
  ].includes(kind);
}

function isInterruptiblePhase(phase: TurnPhase): boolean {
  return phase === "thinking" || phase === "speaking";
}

function isTerminalPhase(phase: TurnPhase): boolean {
  return phase === "completed" || phase === "interrupted" || phase === "failed";
}
