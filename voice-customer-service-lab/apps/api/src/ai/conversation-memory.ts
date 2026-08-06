import type { TokenCounter } from "../knowledge/token-counter.js";
import type { AiAnswerMode } from "./ai-types.js";
import type { SensitiveConversationDetector } from "./sensitive-conversation-detector.js";

const MAX_SCOPE_ID_LENGTH = 128;
const MAX_TURN_TEXT_LENGTH = 16_000;

export interface ConversationMemoryScope {
  readonly tenantId: string;
  readonly sessionId: string;
}

export interface ConversationMemoryTurn {
  readonly userText: string;
  readonly assistantText: string;
  readonly answerMode: AiAnswerMode;
}

export interface ConversationMemorySnapshot {
  readonly turns: readonly ConversationMemoryTurn[];
  readonly estimatedTokens: number;
}

export type ConversationMemoryWriteOutcome = "stored" | "excluded_sensitive" | "excluded_oversized";

export type ConversationMemoryEvictionReason = "turn_limit" | "token_limit";

export interface ConversationMemoryWriteResult {
  readonly outcome: ConversationMemoryWriteOutcome;
  readonly snapshot: ConversationMemorySnapshot;
  readonly evictedBy: readonly ConversationMemoryEvictionReason[];
}

export interface ConversationMemory {
  read(scope: ConversationMemoryScope): ConversationMemorySnapshot;
  recordCompletedTurn(
    scope: ConversationMemoryScope,
    turn: ConversationMemoryTurn,
  ): ConversationMemoryWriteResult;
  clear(scope: ConversationMemoryScope): void;
}

interface StoredTurn {
  readonly turn: ConversationMemoryTurn;
  readonly estimatedTokens: number;
}

export class SessionConversationMemory implements ConversationMemory {
  readonly #maxCompletedTurns: number;
  readonly #maxTokens: number;
  readonly #tokenCounter: TokenCounter;
  readonly #sensitiveDetector: SensitiveConversationDetector;
  readonly #sessions = new Map<string, readonly StoredTurn[]>();

  constructor(options: {
    readonly maxCompletedTurns: number;
    readonly maxTokens: number;
    readonly tokenCounter: TokenCounter;
    readonly sensitiveDetector: SensitiveConversationDetector;
  }) {
    assertPositiveInteger(options.maxCompletedTurns, "maxCompletedTurns");
    assertPositiveInteger(options.maxTokens, "maxTokens");
    this.#maxCompletedTurns = options.maxCompletedTurns;
    this.#maxTokens = options.maxTokens;
    this.#tokenCounter = options.tokenCounter;
    this.#sensitiveDetector = options.sensitiveDetector;
  }

  read(scope: ConversationMemoryScope): ConversationMemorySnapshot {
    const stored = this.#sessions.get(scopeKey(scope)) ?? [];
    return snapshotOf(stored);
  }

  recordCompletedTurn(
    scope: ConversationMemoryScope,
    turn: ConversationMemoryTurn,
  ): ConversationMemoryWriteResult {
    const key = scopeKey(scope);
    assertBoundedText(turn.userText, "userText", MAX_TURN_TEXT_LENGTH);
    assertBoundedText(turn.assistantText, "assistantText", MAX_TURN_TEXT_LENGTH);
    const current = this.#sessions.get(key) ?? [];

    const isSensitive =
      this.#sensitiveDetector.detect(turn.userText).length > 0 ||
      this.#sensitiveDetector.detect(turn.assistantText).length > 0;
    if (isSensitive) {
      return excludedResult("excluded_sensitive", current);
    }

    const clonedTurn = cloneTurn(turn);
    const estimatedTokens = this.#tokenCounter.count(formatTurn(clonedTurn));
    if (!Number.isInteger(estimatedTokens) || estimatedTokens < 0) {
      throw new Error("TokenCounter must return a non-negative integer.");
    }
    if (estimatedTokens > this.#maxTokens) {
      return excludedResult("excluded_oversized", current);
    }

    const next: StoredTurn[] = [...current, { turn: clonedTurn, estimatedTokens }];
    const evictedBy: ConversationMemoryEvictionReason[] = [];

    while (next.length > this.#maxCompletedTurns) {
      next.shift();
      addReason(evictedBy, "turn_limit");
    }
    while (sumTokens(next) > this.#maxTokens) {
      next.shift();
      addReason(evictedBy, "token_limit");
    }

    this.#sessions.set(key, next);
    return { outcome: "stored", snapshot: snapshotOf(next), evictedBy };
  }

  clear(scope: ConversationMemoryScope): void {
    this.#sessions.delete(scopeKey(scope));
  }
}

function formatTurn(turn: ConversationMemoryTurn): string {
  return `USER:\n${turn.userText}\nASSISTANT:\n${turn.assistantText}`;
}

function scopeKey(scope: ConversationMemoryScope): string {
  assertBoundedText(scope.tenantId, "tenantId", MAX_SCOPE_ID_LENGTH);
  assertBoundedText(scope.sessionId, "sessionId", MAX_SCOPE_ID_LENGTH);
  if (scope.tenantId.includes("\0") || scope.sessionId.includes("\0")) {
    throw new Error("Conversation memory scope ids must not contain null characters.");
  }
  return `${scope.tenantId}\0${scope.sessionId}`;
}

function excludedResult(
  outcome: Exclude<ConversationMemoryWriteOutcome, "stored">,
  stored: readonly StoredTurn[],
): ConversationMemoryWriteResult {
  return { outcome, snapshot: snapshotOf(stored), evictedBy: [] };
}

function snapshotOf(stored: readonly StoredTurn[]): ConversationMemorySnapshot {
  return {
    turns: stored.map(({ turn }) => cloneTurn(turn)),
    estimatedTokens: sumTokens(stored),
  };
}

function cloneTurn(turn: ConversationMemoryTurn): ConversationMemoryTurn {
  return {
    userText: turn.userText,
    assistantText: turn.assistantText,
    answerMode: turn.answerMode,
  };
}

function sumTokens(stored: readonly StoredTurn[]): number {
  return stored.reduce((total, item) => total + item.estimatedTokens, 0);
}

function addReason(
  reasons: ConversationMemoryEvictionReason[],
  reason: ConversationMemoryEvictionReason,
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function assertBoundedText(value: string, name: string, maxLength: number): void {
  if (value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`${name} must contain 1 to ${maxLength} characters.`);
  }
}
