import type { AiStreamEvent } from "@voice/contracts";
import { describe, expect, it, vi } from "vitest";

import { SseEventWriter, type SseWritable, serializeSseEvent } from "../src/ai/sse-event-writer.js";

describe("SseEventWriter", () => {
  it("serializes one typed event as one SSE frame", () => {
    const frame = serializeSseEvent(startedEvent);

    expect(frame).toContain("id: round_stream001:1\n");
    expect(frame).toContain("event: stream.started\n");
    expect(frame).toContain(`data: ${JSON.stringify(startedEvent)}\n\n`);
  });

  it("waits for drain instead of growing an unbounded write queue", async () => {
    let drain: (() => void) | undefined;
    const output: SseWritable = {
      write: vi.fn(() => false),
      once: (_event, listener) => {
        drain = listener;
      },
      off: vi.fn(),
    };
    const writer = new SseEventWriter(output, new AbortController().signal);
    let settled = false;

    const pending = writer.write(startedEvent).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    drain?.();
    await pending;
    expect(settled).toBe(true);
  });

  it("stops waiting for drain when the caller cancels", async () => {
    const controller = new AbortController();
    const output: SseWritable = {
      write: () => false,
      once: vi.fn(),
      off: vi.fn(),
    };
    const pending = new SseEventWriter(output, controller.signal).write(startedEvent);

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

const startedEvent: AiStreamEvent = {
  schema_version: 1,
  session_id: "ses_stream001",
  round_id: "round_stream001",
  sequence: 1,
  event_type: "stream.started",
  payload: {},
};
