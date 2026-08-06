import type { VolcengineSubtitle } from "./volcengine-rtc-message";

const MAX_STREAMS = 128;
const MAX_PENDING_PER_STREAM = 32;

interface StreamState {
  nextSequence: number;
  readonly pending: Map<number, VolcengineSubtitle>;
}

export interface OrderedSubtitleResult {
  readonly ready: readonly VolcengineSubtitle[];
  readonly duplicate: boolean;
  readonly gapDetected: boolean;
  readonly overflowed: boolean;
}

/**
 * RTC guarantees order inside one message stream, but reconnects can still create duplicates.
 * A small reorder buffer prevents a late sequence from overwriting newer subtitle state.
 */
export class RtcSubtitleOrderer {
  readonly #streams = new Map<string, StreamState>();

  push(item: VolcengineSubtitle): OrderedSubtitleResult {
    const streamKey = subtitleStreamKey(item);
    const existing = this.#streams.get(streamKey);
    if (!existing) {
      if (this.#streams.size >= MAX_STREAMS) {
        const oldestStream = this.#streams.keys().next().value;
        if (oldestStream) {
          this.#streams.delete(oldestStream);
        }
      }
      this.#streams.set(streamKey, {
        nextSequence: item.sequence + 1,
        pending: new Map(),
      });
      return { ready: [item], duplicate: false, gapDetected: false, overflowed: false };
    }

    if (item.sequence < existing.nextSequence || existing.pending.has(item.sequence)) {
      return { ready: [], duplicate: true, gapDetected: false, overflowed: false };
    }
    if (existing.pending.size >= MAX_PENDING_PER_STREAM) {
      return { ready: [], duplicate: false, gapDetected: true, overflowed: true };
    }

    existing.pending.set(item.sequence, item);
    const gapDetected = item.sequence > existing.nextSequence;
    const ready: VolcengineSubtitle[] = [];
    while (existing.pending.has(existing.nextSequence)) {
      const next = existing.pending.get(existing.nextSequence);
      existing.pending.delete(existing.nextSequence);
      existing.nextSequence += 1;
      if (next) {
        ready.push(next);
      }
    }

    return { ready, duplicate: false, gapDetected, overflowed: false };
  }

  reset(): void {
    this.#streams.clear();
  }
}

function subtitleStreamKey(item: VolcengineSubtitle): string {
  return `${item.userId}:${item.roundId}`;
}
