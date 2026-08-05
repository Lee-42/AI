import { createHash, randomUUID } from "node:crypto";

import type { AiOrchestrator, AiTurnResponse } from "./ai-types.js";

export interface AiDebugTurnCommand {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly text: string;
  readonly idempotencyKey: string;
}

export interface AiDebugTurnResult {
  readonly response: AiTurnResponse;
  readonly replayed: boolean;
}

interface ReplayRecord {
  readonly fingerprint: string;
  readonly result: Promise<AiTurnResponse>;
}

/** Process-local idempotency for the local/test debug endpoint. */
export class AiDebugService {
  readonly #orchestrator: AiOrchestrator;
  readonly #replays = new Map<string, ReplayRecord>();

  constructor(orchestrator: AiOrchestrator) {
    this.#orchestrator = orchestrator;
  }

  async answer(command: AiDebugTurnCommand): Promise<AiDebugTurnResult> {
    const replayKey = `${command.sessionId}:${command.idempotencyKey}`;
    const fingerprint = createHash("sha256").update(command.text).digest("hex");
    const existing = this.#replays.get(replayKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new AiDebugServiceError(
          "AI_DEBUG_IDEMPOTENCY_KEY_REUSED",
          "The idempotency key was already used with different debug text.",
          409,
        );
      }
      return { response: await existing.result, replayed: true };
    }

    const result = this.#orchestrator.answer({
      tenantId: command.tenantId,
      sessionId: command.sessionId,
      roundId: `round_${randomUUID().replaceAll("-", "")}`,
      locale: "zh-CN",
      text: command.text,
    });
    // Store the in-flight Promise before awaiting so concurrent retries share one paid call.
    this.#replays.set(replayKey, { fingerprint, result });
    return { response: await result, replayed: false };
  }
}

export class AiDebugServiceError extends Error {
  constructor(
    readonly code: "AI_DEBUG_API_DISABLED" | "AI_DEBUG_IDEMPOTENCY_KEY_REUSED",
    message: string,
    readonly statusCode: 404 | 409,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AiDebugServiceError";
  }
}
