import { createHash, randomUUID } from "node:crypto";
import type { AiOrchestrator, AiTurnResponse } from "./ai-types.js";
import { AiOrchestratorError } from "./ai-types.js";
import type {
  ConversationMemory,
  ConversationMemoryScope,
  ConversationMemoryWriteOutcome,
} from "./conversation-memory.js";
import type { RealtimeConversationPolicy } from "./realtime-conversation-policy.js";
import type { SafeFallbackPolicy } from "./safe-fallback-policy.js";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/u;
const MAX_SCOPE_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 16_000;

export interface RealtimeRagTurnCommand {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly text: string;
  readonly idempotencyKey: string;
  readonly signal?: AbortSignal;
}

export interface RealtimeRagTurnResult {
  readonly response: AiTurnResponse;
  readonly replayed: boolean;
  readonly completion: "answered" | "degraded";
  readonly memoryOutcome:
    | ConversationMemoryWriteOutcome
    | "not_recorded_failure"
    | "not_recorded_session_closed";
}

export interface RealtimeRagTurnHandle {
  readonly roundId: string;
  readonly replayed: boolean;
  readonly result: Promise<RealtimeRagTurnResult>;
}

export interface RealtimeRagTurnPort {
  readonly welcomeMessage: string;
  openTurn(command: RealtimeRagTurnCommand): RealtimeRagTurnHandle;
  answer(command: RealtimeRagTurnCommand): Promise<RealtimeRagTurnResult>;
  clearSession(scope: ConversationMemoryScope): void;
}

export class RealtimeRagServiceError extends Error {
  readonly code = "RAG_IDEMPOTENCY_KEY_REUSED";
  readonly statusCode = 409;
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "RealtimeRagServiceError";
  }
}

interface ReplayRecord {
  readonly fingerprint: string;
  readonly roundId: string;
  readonly lifecycle: TurnLifecycle;
  readonly pending: Promise<Omit<RealtimeRagTurnResult, "replayed">>;
}

interface TurnLifecycle {
  cleared: boolean;
}

export class RealtimeRagService implements RealtimeRagTurnPort {
  readonly welcomeMessage: string;
  readonly #orchestrator: AiOrchestrator;
  readonly #conversationPolicy: RealtimeConversationPolicy;
  readonly #memory: ConversationMemory;
  readonly #fallbackPolicy: SafeFallbackPolicy;
  readonly #roundIdFactory: () => string;
  readonly #replays = new Map<string, ReplayRecord>();

  constructor(options: {
    readonly orchestrator: AiOrchestrator;
    readonly conversationPolicy: RealtimeConversationPolicy;
    readonly memory: ConversationMemory;
    readonly fallbackPolicy: SafeFallbackPolicy;
    readonly roundIdFactory?: () => string;
  }) {
    this.#orchestrator = options.orchestrator;
    this.#conversationPolicy = options.conversationPolicy;
    this.#memory = options.memory;
    this.#fallbackPolicy = options.fallbackPolicy;
    this.#roundIdFactory =
      options.roundIdFactory ?? (() => `rnd_${randomUUID().replaceAll("-", "")}`);
    this.welcomeMessage = options.conversationPolicy.welcomeMessage;
  }

  openTurn(command: RealtimeRagTurnCommand): RealtimeRagTurnHandle {
    const normalized = normalizeCommand(command);
    const replayKey = buildReplayKey(normalized);
    const fingerprint = createHash("sha256").update(normalized.text).digest("hex");
    const existing = this.#replays.get(replayKey);

    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new RealtimeRagServiceError(
          "The idempotency key was already used with different turn text.",
        );
      }
      return {
        roundId: existing.roundId,
        replayed: true,
        result: existing.pending.then((result) => ({ ...result, replayed: true })),
      };
    }

    const roundId = this.#roundIdFactory();
    const lifecycle: TurnLifecycle = { cleared: false };
    const pending = this.#execute(normalized, roundId, lifecycle).catch((error: unknown) => {
      if (isCancellation(error, normalized.signal)) {
        this.#replays.delete(replayKey);
      }
      throw error;
    });
    this.#replays.set(replayKey, { fingerprint, roundId, lifecycle, pending });

    return {
      roundId,
      replayed: false,
      result: pending.then((result) => ({ ...result, replayed: false })),
    };
  }

  answer(command: RealtimeRagTurnCommand): Promise<RealtimeRagTurnResult> {
    return this.openTurn(command).result;
  }

  clearSession(scope: ConversationMemoryScope): void {
    const prefix = buildScopePrefix(scope);
    this.#memory.clear(scope);
    for (const [key, record] of this.#replays) {
      if (key.startsWith(prefix)) {
        record.lifecycle.cleared = true;
        this.#replays.delete(key);
      }
    }
  }

  async #execute(
    command: RealtimeRagTurnCommand,
    roundId: string,
    lifecycle: TurnLifecycle,
  ): Promise<Omit<RealtimeRagTurnResult, "replayed">> {
    const scope = { tenantId: command.tenantId, sessionId: command.sessionId };
    const snapshot = this.#memory.read(scope);

    let response: AiTurnResponse;
    try {
      response = await this.#orchestrator.answer({
        tenantId: command.tenantId,
        sessionId: command.sessionId,
        roundId,
        locale: this.#conversationPolicy.locale,
        text: command.text,
        groundedContext: this.#conversationPolicy.buildGroundedContext(snapshot.turns),
        ...(command.signal ? { signal: command.signal } : {}),
      });
    } catch (error) {
      const decision = this.#fallbackPolicy.forFailure(error, command.signal);
      if (decision.action === "silent") throw error;

      return {
        response: {
          sessionId: command.sessionId,
          roundId,
          answerMode: "abstain",
          evidenceStatus: "not_applicable",
          spokenText: decision.spokenText,
          citations: [],
          execution: {
            policyVersion: this.#conversationPolicy.version,
            router: "realtime-rag-service",
            retriever: null,
            model: null,
            routeReason: decision.reason,
            providerRequestId: null,
            modelUsage: null,
          },
        },
        completion: "degraded",
        memoryOutcome: "not_recorded_failure",
      };
    }

    const normalizedResponse: AiTurnResponse = {
      ...response,
      execution: {
        ...response.execution,
        policyVersion: this.#conversationPolicy.version,
      },
    };
    if (lifecycle.cleared) {
      return {
        response: normalizedResponse,
        completion: "answered",
        memoryOutcome: "not_recorded_session_closed",
      };
    }
    const write = this.#memory.recordCompletedTurn(scope, {
      userText: command.text,
      assistantText: normalizedResponse.spokenText,
      answerMode: normalizedResponse.answerMode,
    });

    return {
      response: normalizedResponse,
      completion: "answered",
      memoryOutcome: write.outcome,
    };
  }
}

function normalizeCommand(command: RealtimeRagTurnCommand): RealtimeRagTurnCommand {
  assertScopeId(command.tenantId, "tenantId");
  assertScopeId(command.sessionId, "sessionId");
  if (!IDEMPOTENCY_KEY_PATTERN.test(command.idempotencyKey)) {
    throw new Error("idempotencyKey must contain 8 to 128 safe characters.");
  }
  const text = command.text.trim().replace(/\s+/gu, " ");
  if (text.length === 0 || text.length > MAX_TEXT_LENGTH) {
    throw new Error(`text must contain 1 to ${MAX_TEXT_LENGTH} characters.`);
  }
  return { ...command, text };
}

function buildReplayKey(command: RealtimeRagTurnCommand): string {
  return `${buildScopePrefix(command)}${command.idempotencyKey}`;
}

function buildScopePrefix(scope: ConversationMemoryScope): string {
  assertScopeId(scope.tenantId, "tenantId");
  assertScopeId(scope.sessionId, "sessionId");
  return `${scope.tenantId}\0${scope.sessionId}\0`;
}

function assertScopeId(value: string, name: string): void {
  if (value.trim().length === 0 || value.length > MAX_SCOPE_ID_LENGTH || value.includes("\0")) {
    throw new Error(`${name} must contain 1 to ${MAX_SCOPE_ID_LENGTH} safe characters.`);
  }
}

function isCancellation(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof AiOrchestratorError && error.code === "AI_TURN_ABORTED")
  );
}
