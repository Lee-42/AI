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
}

export interface AgentLifecycleServiceOptions {
  readonly gateway: AgentGateway;
  readonly resolveSession: (sessionId: string) => SessionSnapshot;
  readonly maxSessionSeconds: number;
  readonly clock?: () => Date;
  readonly idFactory?: (prefix: AgentIdPrefix) => string;
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

export class AgentLifecycleService {
  readonly #gateway: AgentGateway;
  readonly #resolveSession: (sessionId: string) => SessionSnapshot;
  readonly #maxSessionSeconds: number;
  readonly #clock: () => Date;
  readonly #idFactory: (prefix: AgentIdPrefix) => string;
  readonly #recordsBySessionId = new Map<string, AgentRecord>();
  readonly #recordsByStartKey = new Map<string, AgentRecord>();

  constructor(options: AgentLifecycleServiceOptions) {
    this.#gateway = options.gateway;
    this.#resolveSession = options.resolveSession;
    this.#maxSessionSeconds = options.maxSessionSeconds;
    this.#clock = options.clock ?? (() => new Date());
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
        state: "starting",
        revision: 1,
        created_at: now.toISOString(),
        deadline_at: new Date(Math.min(sessionDeadline, hardDeadline)).toISOString(),
        stopped_at: null,
        provider_request_id: null,
      },
      session,
      pending: null,
    };

    this.#recordsBySessionId.set(command.sessionId, record);
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
      })
      .catch((error: unknown) => {
        this.#transition(record, "orphaned");
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

  #dispatchStart(record: AgentRecord, correlationId: string): Promise<void> {
    this.#transition(record, "starting");
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

export class AgentLifecycleError extends Error {
  constructor(
    readonly code: "SESSION_NOT_ACTIVE" | "AGENT_NOT_STARTED" | "AGENT_RETRY_REQUIRES_SAME_KEY",
    message: string,
    readonly statusCode: 409,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AgentLifecycleError";
  }
}
