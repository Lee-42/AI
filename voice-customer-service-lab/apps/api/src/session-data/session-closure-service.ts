import { randomUUID } from "node:crypto";

import type {
  EndSessionResponse,
  HandoffReason,
  HandoffResponse,
  HandoffTicket,
  SessionCommandResponse,
} from "@voice/contracts";

import {
  AgentLifecycleError,
  type AgentLifecycleService,
} from "../agent/agent-lifecycle-service.js";
import type { VoiceAgentProvider } from "../providers/voice-agent-provider.js";
import { VoiceProviderError } from "../providers/voice-agent-provider.js";
import type { SessionDataService } from "./session-data-service.js";

export interface CloseSessionCommand {
  readonly sessionId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

export interface RequestHandoffCommand extends CloseSessionCommand {
  readonly reason: HandoffReason;
}

interface HandoffRecord {
  readonly reason: HandoffReason;
  readonly ticket: HandoffTicket;
  pending: Promise<HandoffResponse> | null;
  result: HandoffResponse | null;
}

export interface SessionClosureServiceOptions {
  readonly provider: VoiceAgentProvider;
  readonly agentLifecycle: AgentLifecycleService;
  readonly sessionData: SessionDataService;
  readonly retentionDays: number;
  readonly onSessionClosed?: (sessionId: string) => void;
  readonly clock?: () => Date;
  readonly ticketIdFactory?: () => string;
}

export class SessionClosureService {
  readonly #provider: VoiceAgentProvider;
  readonly #agentLifecycle: AgentLifecycleService;
  readonly #sessionData: SessionDataService;
  readonly #clock: () => Date;
  readonly #retentionDays: number;
  readonly #ticketIdFactory: () => string;
  readonly #onSessionClosed: (sessionId: string) => void;
  readonly #handoffsBySessionId = new Map<string, HandoffRecord>();

  constructor(options: SessionClosureServiceOptions) {
    this.#provider = options.provider;
    this.#agentLifecycle = options.agentLifecycle;
    this.#sessionData = options.sessionData;
    this.#retentionDays = options.retentionDays;
    this.#onSessionClosed = options.onSessionClosed ?? (() => undefined);
    this.#clock = options.clock ?? (() => new Date());
    this.#ticketIdFactory =
      options.ticketIdFactory ?? (() => `hnd_${randomUUID().replaceAll("-", "")}`);
  }

  async endSession(command: CloseSessionCommand): Promise<EndSessionResponse> {
    const closed = await this.#close(command);
    return {
      ...closed,
      summary: this.#sessionData.finalize(closed.session, "completed"),
    };
  }

  async requestHandoff(command: RequestHandoffCommand): Promise<HandoffResponse> {
    this.purgeExpired();
    const existing = this.#handoffsBySessionId.get(command.sessionId);
    if (existing) {
      if (existing.reason !== command.reason) {
        throw new SessionClosureError(
          "HANDOFF_ALREADY_REQUESTED",
          "This session already has a handoff request with another reason.",
          409,
        );
      }
      const result = existing.result ?? (await existing.pending) ?? null;
      if (result) {
        return { ...result, command_replayed: true };
      }
      return this.#dispatchHandoff(existing, command, true);
    }

    const session = this.#provider.getSession(command.sessionId);
    if (session.state !== "active") {
      throw new VoiceProviderError("SESSION_NOT_ACTIVE", "The session is no longer active.", 409);
    }
    const record: HandoffRecord = {
      reason: command.reason,
      ticket: {
        ticket_id: this.#ticketIdFactory(),
        status: "recorded",
        human_connected: false,
        reason: command.reason,
        requested_at: this.#clock().toISOString(),
        message: "已记录演示转人工工单；当前没有真人坐席接入。",
      },
      pending: null,
      result: null,
    };
    this.#handoffsBySessionId.set(command.sessionId, record);
    return this.#dispatchHandoff(record, command, false);
  }

  purgeExpired(): number {
    const now = this.#clock().getTime();
    let purged = 0;
    for (const [sessionId, record] of this.#handoffsBySessionId) {
      const expiresAt =
        record.result?.summary.retention_expires_at ??
        new Date(
          new Date(record.ticket.requested_at).getTime() +
            this.#retentionDays * 24 * 60 * 60 * 1000,
        ).toISOString();
      if (new Date(expiresAt).getTime() <= now) {
        this.#handoffsBySessionId.delete(sessionId);
        purged += 1;
      }
    }
    return purged;
  }

  async #dispatchHandoff(
    record: HandoffRecord,
    command: RequestHandoffCommand,
    replayed: boolean,
  ): Promise<HandoffResponse> {
    const pending = this.#close({
      ...command,
      idempotencyKey: `handoff:${command.idempotencyKey}`,
    })
      .then((closed) => {
        const result: HandoffResponse = {
          ...closed,
          summary: this.#sessionData.finalize(closed.session, "handoff_requested"),
          handoff: record.ticket,
          command_replayed: replayed || closed.command_replayed,
        };
        record.result = result;
        return result;
      })
      .finally(() => {
        record.pending = null;
      });
    record.pending = pending;
    return pending;
  }

  async #close(command: CloseSessionCommand): Promise<SessionCommandResponse> {
    try {
      await this.#agentLifecycle.stop({
        sessionId: command.sessionId,
        idempotencyKey: `session-close:${command.idempotencyKey}`,
        correlationId: command.correlationId,
      });
    } catch (error) {
      if (!(error instanceof AgentLifecycleError && error.code === "AGENT_NOT_STARTED")) {
        throw error;
      }
    }

    const closed = await this.#provider.endSession({
      sessionId: command.sessionId,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
    });
    this.#onSessionClosed(closed.session.session_id);
    return closed;
  }
}

export class SessionClosureError extends Error {
  constructor(
    readonly code: "HANDOFF_ALREADY_REQUESTED",
    message: string,
    readonly statusCode: 409,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "SessionClosureError";
  }
}
