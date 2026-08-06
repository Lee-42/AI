import type { AiTurnResponse } from "./ai-types.js";
import type { RealtimeRagTurnPort } from "./realtime-rag-service.js";

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

/** Thin debug adapter; turn policy and replay lifecycle belong to RealtimeRagService. */
export class AiDebugService {
  readonly #ragService: RealtimeRagTurnPort;

  constructor(ragService: RealtimeRagTurnPort) {
    this.#ragService = ragService;
  }

  async answer(command: AiDebugTurnCommand): Promise<AiDebugTurnResult> {
    const result = await this.#ragService.answer(command);
    return { response: result.response, replayed: result.replayed };
  }
}

export class AiDebugServiceError extends Error {
  constructor(
    readonly code: "AI_DEBUG_API_DISABLED",
    message: string,
    readonly statusCode: 404,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AiDebugServiceError";
  }
}
