import { randomUUID } from "node:crypto";

import type {
  ConversationEvent,
  SessionPrivacySummary,
  SessionSnapshot,
  SessionSummaryTopic,
} from "@voice/contracts";

type SummaryOutcome = SessionPrivacySummary["outcome"];

interface SessionDataRecord {
  readonly sessionExpiresAt: string;
  readonly finalEventIds: Set<string>;
  readonly topics: Set<SessionSummaryTopic>;
  turnCount: number;
  sensitiveInputDetected: boolean;
  summary: SessionPrivacySummary | null;
}

export interface SessionDataServiceOptions {
  readonly retentionDays: number;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

/** Builds a useful summary without retaining raw audio or transcript text. */
export class SessionDataService {
  readonly #retentionDays: number;
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  readonly #records = new Map<string, SessionDataRecord>();

  constructor(options: SessionDataServiceOptions) {
    this.#retentionDays = options.retentionDays;
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? (() => `sum_${randomUUID().replaceAll("-", "")}`);
  }

  registerSession(session: SessionSnapshot): void {
    this.purgeExpired();
    if (this.#records.has(session.session_id)) {
      return;
    }
    this.#records.set(session.session_id, {
      sessionExpiresAt: session.expires_at,
      finalEventIds: new Set(),
      topics: new Set(),
      turnCount: 0,
      sensitiveInputDetected: false,
      summary: null,
    });
  }

  observeConversationEvents(session: SessionSnapshot, events: readonly ConversationEvent[]): void {
    const record = this.#requireRecord(session);
    if (record.summary) {
      return;
    }

    for (const event of events) {
      if (
        event.event_type !== "turn.user.transcript.final" ||
        record.finalEventIds.has(event.event_id)
      ) {
        continue;
      }
      record.finalEventIds.add(event.event_id);
      record.turnCount += 1;
      record.topics.add(classifyTopic(event.payload.text));
      record.sensitiveInputDetected ||= containsSensitiveInput(event.payload.text);
      // Deliberately do not keep event.payload.text after classification.
    }
  }

  recordTopic(session: SessionSnapshot, topic: SessionSummaryTopic): void {
    const record = this.#requireRecord(session);
    if (!record.summary) {
      record.topics.add(topic);
    }
  }

  finalize(session: SessionSnapshot, outcome: SummaryOutcome): SessionPrivacySummary {
    const record = this.#requireRecord(session);
    if (record.summary) {
      return record.summary;
    }

    const generatedAt = this.#clock();
    const summary: SessionPrivacySummary = {
      summary_id: this.#idFactory(),
      session_id: session.session_id,
      outcome,
      turn_count: record.turnCount,
      topics: orderedTopics(record.topics),
      sensitive_input_detected: record.sensitiveInputDetected,
      raw_audio_retained: false,
      transcript_retained: false,
      generated_at: generatedAt.toISOString(),
      retention_expires_at: new Date(
        generatedAt.getTime() + this.#retentionDays * 24 * 60 * 60 * 1000,
      ).toISOString(),
    };
    record.summary = summary;
    // Event IDs are useful only while deduplicating live observations.
    record.finalEventIds.clear();
    record.topics.clear();
    return summary;
  }

  purgeExpired(): number {
    const now = this.#clock().getTime();
    let purged = 0;
    for (const [sessionId, record] of this.#records) {
      const expiresAt = record.summary?.retention_expires_at ?? record.sessionExpiresAt;
      if (new Date(expiresAt).getTime() <= now) {
        this.#records.delete(sessionId);
        purged += 1;
      }
    }
    return purged;
  }

  #requireRecord(session: SessionSnapshot): SessionDataRecord {
    this.registerSession(session);
    const record = this.#records.get(session.session_id);
    if (!record) {
      throw new Error("Session data record could not be initialized.");
    }
    return record;
  }
}

function classifyTopic(text: string): SessionSummaryTopic {
  if (/(人工|真人|坐席)/u.test(text)) {
    return "human_handoff";
  }
  if (/(订单|物流|快递|发货)/u.test(text)) {
    return "order_status";
  }
  return "general_support";
}

function containsSensitiveInput(text: string): boolean {
  return /1[3-9]\d{9}/u.test(text) || /(密码|验证码)\s*[:：]?\s*[A-Za-z0-9]{4,}/u.test(text);
}

function orderedTopics(topics: ReadonlySet<SessionSummaryTopic>): SessionSummaryTopic[] {
  const order: readonly SessionSummaryTopic[] = [
    "general_support",
    "order_status",
    "human_handoff",
  ];
  return order.filter((topic) => topics.has(topic));
}
