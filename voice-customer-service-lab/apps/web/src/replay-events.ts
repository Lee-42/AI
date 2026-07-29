import type { ConversationEvent } from "@voice/contracts";

const EVENT_DELAY_MS: Partial<Record<ConversationEvent["event_type"], number>> = {
  "session.created": 120,
  "rtc.join.succeeded": 120,
  "agent.start.succeeded": 120,
  "turn.user.transcript.partial": 280,
  "turn.user.transcript.final": 420,
  "turn.ai.response.started": 500,
  "turn.ai.audio.started": 650,
  "turn.ai.response.completed": 500,
  "session.end.requested": 200,
  "cleanup.finished": 250,
};

export async function replayEvents(
  events: readonly ConversationEvent[],
  onEvent: (event: ConversationEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  for (const event of events) {
    if (signal.aborted) {
      return;
    }
    onEvent(event);
    await delay(EVENT_DELAY_MS[event.event_type] ?? 80, signal);
  }
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
