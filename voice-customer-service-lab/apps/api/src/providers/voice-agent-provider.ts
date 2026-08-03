import type {
  CreateSessionRequest,
  SessionCommandResponse,
  SessionSnapshot,
} from "@voice/contracts";

export interface CreateVoiceSessionCommand {
  readonly body: CreateSessionRequest;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

export interface SubmitMockTurnCommand {
  readonly sessionId: string;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

export interface EndVoiceSessionCommand {
  readonly sessionId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

export interface VoiceAgentProvider {
  readonly name: SessionSnapshot["provider"];
  createSession(command: CreateVoiceSessionCommand): Promise<SessionCommandResponse>;
  getSession(sessionId: string): SessionSnapshot;
  endSession(command: EndVoiceSessionCommand): Promise<SessionCommandResponse>;
}

export interface MockTurnCapableVoiceAgentProvider extends VoiceAgentProvider {
  submitMockTurn(command: SubmitMockTurnCommand): Promise<SessionCommandResponse>;
}

export function supportsMockTurns(
  provider: VoiceAgentProvider,
): provider is MockTurnCapableVoiceAgentProvider {
  return "submitMockTurn" in provider && typeof provider.submitMockTurn === "function";
}

export class VoiceProviderError extends Error {
  constructor(
    readonly code:
      | "SESSION_NOT_FOUND"
      | "SESSION_NOT_ACTIVE"
      | "PROVIDER_NOT_IMPLEMENTED"
      | "IDEMPOTENCY_KEY_REUSED",
    message: string,
    readonly statusCode: 404 | 409 | 501,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "VoiceProviderError";
  }
}
