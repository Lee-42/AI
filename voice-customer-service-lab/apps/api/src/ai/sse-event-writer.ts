import type { AiStreamEvent } from "@voice/contracts";

export interface SseWritable {
  write(chunk: string): boolean;
  once(event: "drain", listener: () => void): unknown;
  off(event: "drain", listener: () => void): unknown;
}

/** Writes one SSE frame and pauses when the socket buffer reports backpressure. */
export class SseEventWriter {
  constructor(
    private readonly output: SseWritable,
    private readonly signal: AbortSignal,
  ) {}

  async write(event: AiStreamEvent): Promise<void> {
    throwIfAborted(this.signal);
    if (!this.output.write(serializeSseEvent(event))) {
      await waitForDrain(this.output, this.signal);
    }
  }
}

export function serializeSseEvent(event: AiStreamEvent): string {
  return [
    `id: ${event.round_id}:${event.sequence}`,
    `event: ${event.event_type}`,
    `data: ${JSON.stringify(event)}`,
    "",
    "",
  ].join("\n");
}

function waitForDrain(output: SseWritable, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      output.off("drain", onDrain);
      signal.removeEventListener("abort", onAbort);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };

    output.once("drain", onDrain);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
    }
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError();
  }
}

function abortError(): Error {
  const error = new Error("The SSE stream was cancelled.");
  error.name = "AbortError";
  return error;
}
