import { randomUUID } from "node:crypto";

import type {
  AgentCommandResponse,
  AgentSnapshot,
  AgentState,
  SessionSnapshot,
} from "@voice/contracts";

import type { AgentGateway } from "./agent-gateway.js";

type AgentIdPrefix = "tsk" | "bot";

interface AgentRecord {
  snapshot: AgentSnapshot;
  readonly session: SessionSnapshot;
  pending: Promise<void> | null;
  startFailure: unknown;
}

export interface AgentLifecycleServiceOptions {
  readonly gateway: AgentGateway;
  readonly resolveSession: (sessionId: string) => SessionSnapshot;
  readonly maxSessionSeconds: number;
  readonly clock?: () => Date;
  readonly monotonicClock?: () => number;
  readonly idFactory?: (prefix: AgentIdPrefix) => string;
  readonly onCleanupObservation?: (observation: {
    readonly provider: AgentGateway["name"];
    readonly outcome: "success" | "failure";
    readonly durationMs: number;
  }) => void;
}

export interface AgentCommand {
  readonly sessionId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

export interface ReapResult {
  readonly inspected: number;
  readonly stopped: number;
  readonly orphaned: number;
}

export interface AgentToolContext {
  readonly sessionId: string;
  readonly roomId: string;
  readonly taskId: string;
}

export interface SubmitToolResultCommand {
  readonly roomId: string;
  readonly toolCallId: string;
  readonly content: string;
  readonly correlationId: string;
}

export class AgentLifecycleService {
  readonly #gateway: AgentGateway;
  readonly #resolveSession: (sessionId: string) => SessionSnapshot;
  readonly #maxSessionSeconds: number;
  readonly #clock: () => Date;
  readonly #monotonicClock: () => number;
  readonly #idFactory: (prefix: AgentIdPrefix) => string;
  readonly #onCleanupObservation: AgentLifecycleServiceOptions["onCleanupObservation"];
  readonly #recordsBySessionId = new Map<string, AgentRecord>();
  readonly #recordsByStartKey = new Map<string, AgentRecord>();
  readonly #recordsByRoomId = new Map<string, AgentRecord>();

  constructor(options: AgentLifecycleServiceOptions) {
    this.#gateway = options.gateway;
    this.#resolveSession = options.resolveSession;
    this.#maxSessionSeconds = options.maxSessionSeconds;
    this.#clock = options.clock ?? (() => new Date());
    this.#monotonicClock = options.monotonicClock ?? (() => performance.now());
    this.#onCleanupObservation = options.onCleanupObservation;
    this.#idFactory =
      options.idFactory ?? ((prefix) => `${prefix}_${randomUUID().replaceAll("-", "")}`);
  }

  async start(command: AgentCommand): Promise<AgentCommandResponse> {
    const session = this.#resolveSession(command.sessionId);
    if (session.state !== "active") {
      throw new AgentLifecycleError(
        "SESSION_NOT_ACTIVE",
        "The session must be active before starting an AI Agent.",
        409,
      );
    }

    const scopedKey = `${command.sessionId}:${command.idempotencyKey}`;
    const replay = this.#recordsByStartKey.get(scopedKey);
    if (replay) {
      await this.#awaitPending(replay);
      if (replay.snapshot.state === "failed") {
        if (!isRetryableFailure(replay.startFailure)) {
          throw replay.startFailure;
        }
        await this.#dispatchStart(replay, command.correlationId);
      }
      return this.#result(replay, true);
    }

    const current = this.#recordsBySessionId.get(command.sessionId);
    if (current && !isTerminal(current.snapshot.state)) {
      await this.#awaitPending(current);
      return this.#result(current, true);
    }
    if (current?.snapshot.state === "failed") {
      throw new AgentLifecycleError(
        "AGENT_RETRY_REQUIRES_SAME_KEY",
        "Retry a failed start with the original Idempotency-Key.",
        409,
      );
    }

    const now = this.#clock();
    const sessionDeadline = new Date(session.expires_at).getTime();
    const hardDeadline = now.getTime() + this.#maxSessionSeconds * 1000;
    const record: AgentRecord = {
      snapshot: {
        task_id: this.#idFactory("tsk"),
        bot_user_id: this.#idFactory("bot"),
        provider: this.#gateway.name,
        prompt_policy_version: this.#gateway.promptPolicyVersion,
        state: "starting",
        revision: 1,
        created_at: now.toISOString(),
        deadline_at: new Date(Math.min(sessionDeadline, hardDeadline)).toISOString(),
        stopped_at: null,
        provider_request_id: null,
      },
      session,
      pending: null,
      startFailure: null,
    };

    this.#recordsBySessionId.set(command.sessionId, record);
    this.#recordsByRoomId.set(session.room_id, record);
    this.#recordsByStartKey.set(scopedKey, record);
    await this.#dispatchStart(record, command.correlationId);
    return this.#result(record, false);
  }

  async stop(command: AgentCommand): Promise<AgentCommandResponse> {
    // Resolve first so a caller cannot probe Agent IDs through a nonexistent Session.
    this.#resolveSession(command.sessionId);
    const record = this.#recordsBySessionId.get(command.sessionId);
    if (!record) {
      throw new AgentLifecycleError(
        "AGENT_NOT_STARTED",
        "No AI Agent has been started for this session.",
        409,
      );
    }

    await this.#awaitPending(record, true);
    if (record.snapshot.state === "stopped") {
      return this.#result(record, true);
    }
    this.#transition(record, "stopping");
    const cleanupStartedAt = this.#monotonicClock();
    const pending = this.#gateway
      .stop({
        roomId: record.session.room_id,
        taskId: record.snapshot.task_id,
        correlationId: command.correlationId,
      })
      .then((result) => {
        record.snapshot = {
          ...record.snapshot,
          state: "stopped",
          revision: record.snapshot.revision + 1,
          stopped_at: this.#clock().toISOString(),
          provider_request_id: result.providerRequestId,
        };
        this.#observeCleanup("success", cleanupStartedAt);
      })
      .catch((error: unknown) => {
        this.#transition(record, "orphaned");
        this.#observeCleanup("failure", cleanupStartedAt);
        throw error;
      })
      .finally(() => {
        record.pending = null;
      });
    record.pending = pending;
    await pending;
    return this.#result(record, false);
  }

  async reapExpired(): Promise<ReapResult> {
    const now = this.#clock().getTime();
    const candidates = [...this.#recordsBySessionId.entries()].filter(([, record]) => {
      const expired = new Date(record.snapshot.deadline_at).getTime() <= now;
      return expired && !["stopped", "stopping"].includes(record.snapshot.state);
    });
    let stopped = 0;
    let orphaned = 0;

    for (const [sessionId, record] of candidates) {
      try {
        await this.stop({
          sessionId,
          idempotencyKey: `reaper:${record.snapshot.task_id}`,
          correlationId: `cor_${randomUUID().replaceAll("-", "")}`,
        });
        stopped += 1;
      } catch {
        orphaned += 1;
      }
    }

    return { inspected: candidates.length, stopped, orphaned };
  }

  async stopAll(): Promise<ReapResult> {
    const activeRecords = [...this.#recordsBySessionId.entries()].filter(
      ([, record]) => record.snapshot.state !== "stopped",
    );
    let stopped = 0;
    let orphaned = 0;

    for (const [sessionId, record] of activeRecords) {
      try {
        await this.stop({
          sessionId,
          idempotencyKey: `shutdown:${record.snapshot.task_id}`,
          correlationId: `cor_${randomUUID().replaceAll("-", "")}`,
        });
        stopped += 1;
      } catch {
        orphaned += 1;
      }
    }

    return { inspected: activeRecords.length, stopped, orphaned };
  }

  resolveToolContext(roomId: string): AgentToolContext {
    const record = this.#recordsByRoomId.get(roomId);
    if (!record || !["starting", "dispatched"].includes(record.snapshot.state)) {
      throw new AgentLifecycleError(
        "AGENT_TOOL_CONTEXT_NOT_FOUND",
        "No active AI Agent is bound to the callback room.",
        404,
      );
    }
    return {
      sessionId: record.session.session_id,
      roomId: record.session.room_id,
      taskId: record.snapshot.task_id,
    };
  }

  async submitToolResult(command: SubmitToolResultCommand) {
    const context = this.resolveToolContext(command.roomId);
    return this.#gateway.submitToolResult({
      roomId: context.roomId,
      taskId: context.taskId,
      toolCallId: command.toolCallId,
      content: command.content,
      correlationId: command.correlationId,
    });
  }

  #dispatchStart(record: AgentRecord, correlationId: string): Promise<void> {
    this.#transition(record, "starting");
    record.startFailure = null;
    const pending = this.#gateway
      .start({
        roomId: record.session.room_id,
        taskId: record.snapshot.task_id,
        botUserId: record.snapshot.bot_user_id,
        targetUserId: record.session.rtc_user_id,
        correlationId,
      })
      .then((result) => {
        // Provider HTTP 200 only means the task was dispatched, not that the Bot joined RTC.
        record.snapshot = {
          ...record.snapshot,
          state: "dispatched",
          revision: record.snapshot.revision + 1,
          provider_request_id: result.providerRequestId,
        };
      })
      .catch((error: unknown) => {
        record.startFailure = error;
        this.#transition(record, "failed");
        throw error;
      })
      .finally(() => {
        record.pending = null;
      });
    record.pending = pending;
    return pending;
  }

  async #awaitPending(record: AgentRecord, ignoreFailure = false): Promise<void> {
    if (!record.pending) {
      return;
    }
    try {
      await record.pending;
    } catch (error) {
      if (!ignoreFailure) {
        throw error;
      }
    }
  }

  #transition(record: AgentRecord, state: AgentState): void {
    if (record.snapshot.state === state) {
      return;
    }
    record.snapshot = {
      ...record.snapshot,
      state,
      revision: record.snapshot.revision + 1,
    };
  }

  #observeCleanup(outcome: "success" | "failure", startedAt: number): void {
    try {
      this.#onCleanupObservation?.({
        provider: this.#gateway.name,
        outcome,
        durationMs: Math.max(0, this.#monotonicClock() - startedAt),
      });
    } catch {
      // Telemetry must never turn a successful cleanup into a customer-visible failure.
    }
  }

  #result(record: AgentRecord, commandReplayed: boolean): AgentCommandResponse {
    return {
      agent: { ...record.snapshot },
      command_replayed: commandReplayed,
    };
  }
}

function isTerminal(state: AgentState): boolean {
  return state === "stopped" || state === "failed";
}

function isRetryableFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    (error as { retryable?: unknown }).retryable === true
  );
}

export class AgentLifecycleError extends Error {
  constructor(
    readonly code:
      | "SESSION_NOT_ACTIVE"
      | "AGENT_NOT_STARTED"
      | "AGENT_RETRY_REQUIRES_SAME_KEY"
      | "AGENT_TOOL_CONTEXT_NOT_FOUND",
    message: string,
    readonly statusCode: 404 | 409,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AgentLifecycleError";
  }
}
