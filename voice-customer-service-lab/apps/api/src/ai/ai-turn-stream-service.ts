import type { AiStreamEvent } from "@voice/contracts";

import { LanguageModelError } from "./ai-ports.js";
import { AiOrchestratorError } from "./ai-types.js";
import type { RealtimeRagTurnPort } from "./realtime-rag-service.js";

export interface AiStreamTurnCommand {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly signal?: AbortSignal;
}

export interface AiTurnStreamServiceOptions {
  readonly ragService: RealtimeRagTurnPort;
  readonly deltaCharacters?: number;
}

/** Converts one provider-neutral answer into transport-neutral stream events. */
export class AiTurnStreamService {
  readonly #ragService: RealtimeRagTurnPort;
  readonly #deltaCharacters: number;

  constructor(options: AiTurnStreamServiceOptions) {
    this.#ragService = options.ragService;
    this.#deltaCharacters = options.deltaCharacters ?? 24;
    if (!Number.isInteger(this.#deltaCharacters) || this.#deltaCharacters < 1) {
      throw new Error("AiTurnStreamService deltaCharacters must be a positive integer.");
    }
  }

  async *stream(command: AiStreamTurnCommand): AsyncGenerator<AiStreamEvent> {
    // Keep this outside the catch: a synchronous idempotency conflict must reach the HTTP adapter
    // before it commits SSE headers.
    const handle = this.#ragService.openTurn({
      tenantId: command.tenantId,
      sessionId: command.sessionId,
      text: command.text,
      idempotencyKey: command.idempotencyKey,
      ...(command.signal ? { signal: command.signal } : {}),
    });
    const roundId = handle.roundId;
    let sequence = 1;
    yield envelope(command.sessionId, roundId, sequence, "stream.started", {});

    try {
      assertNotAborted(command.signal);
      const { response } = await handle.result;
      assertNotAborted(command.signal);

      let index = 0;
      for (const textDelta of chunkText(response.spokenText, this.#deltaCharacters)) {
        assertNotAborted(command.signal);
        sequence += 1;
        yield envelope(command.sessionId, roundId, sequence, "answer.delta", {
          index,
          text_delta: textDelta,
        });
        index += 1;
      }

      sequence += 1;
      yield envelope(command.sessionId, roundId, sequence, "answer.completed", {
        answer_mode: response.answerMode,
        evidence_status: response.evidenceStatus,
        policy_version: response.execution.policyVersion,
        citations: response.citations.map((citation) => ({
          source_id: citation.sourceId,
          title: citation.title,
          version: citation.version,
        })),
      });
    } catch (error) {
      sequence += 1;
      if (isCancellation(error, command.signal)) {
        yield envelope(command.sessionId, roundId, sequence, "stream.cancelled", {
          reason: "caller_cancelled",
        });
        return;
      }
      const failure = publicFailure(error);
      yield envelope(command.sessionId, roundId, sequence, "stream.failed", failure);
    }
  }
}

function envelope<TEvent extends AiStreamEvent["event_type"]>(
  sessionId: string,
  roundId: string,
  sequence: number,
  eventType: TEvent,
  payload: Extract<AiStreamEvent, { event_type: TEvent }>["payload"],
): Extract<AiStreamEvent, { event_type: TEvent }> {
  return {
    schema_version: 1,
    session_id: sessionId,
    round_id: roundId,
    sequence,
    event_type: eventType,
    payload,
  } as Extract<AiStreamEvent, { event_type: TEvent }>;
}

function chunkText(text: string, maximumCharacters: number): string[] {
  const characters = [...text.trim()];
  const chunks: string[] = [];
  for (let offset = 0; offset < characters.length; offset += maximumCharacters) {
    chunks.push(characters.slice(offset, offset + maximumCharacters).join(""));
  }
  return chunks;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AiOrchestratorError("AI_TURN_ABORTED", "The AI stream was cancelled.");
  }
}

function isCancellation(error: unknown, signal: AbortSignal | undefined): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof AiOrchestratorError && error.code === "AI_TURN_ABORTED")
  );
}

function publicFailure(error: unknown): {
  readonly code: string;
  readonly retryable: boolean;
} {
  if (error instanceof LanguageModelError || error instanceof AiOrchestratorError) {
    return { code: error.code, retryable: error.retryable };
  }
  return { code: "AI_STREAM_FAILED", retryable: false };
}
