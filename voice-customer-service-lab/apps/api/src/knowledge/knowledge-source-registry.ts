import {
  type KnowledgeSourceManifest,
  type KnowledgeSourceRecord,
  sourceIdentity,
} from "./knowledge-source-manifest.js";

export const knowledgeCleanupTargets = ["source_blob", "chunks", "vectors", "cache"] as const;
export type KnowledgeCleanupTarget = (typeof knowledgeCleanupTargets)[number];

export type KnowledgeLifecycleEventType =
  | "source.published"
  | "source.superseded"
  | "source.withdrawn"
  | "source.purge_requested"
  | "source.purged";

export interface KnowledgeLifecycleEvent {
  readonly tenantId: string;
  readonly sourceId: string;
  readonly eventType: KnowledgeLifecycleEventType;
  readonly occurredAt: string;
  readonly cleanupTargets: readonly KnowledgeCleanupTarget[];
}

export type KnowledgeSourceRegistryErrorCode =
  | "KNOWLEDGE_SOURCE_NOT_FOUND"
  | "KNOWLEDGE_SOURCE_INVALID_TRANSITION"
  | "KNOWLEDGE_SOURCE_PURGE_NOT_DUE"
  | "KNOWLEDGE_SOURCE_PURGE_INCOMPLETE";

export class KnowledgeSourceRegistryError extends Error {
  constructor(
    readonly code: KnowledgeSourceRegistryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "KnowledgeSourceRegistryError";
  }
}

/**
 * In-memory course implementation of the knowledge control plane.
 * Production should persist records and lifecycle events transactionally.
 */
export class KnowledgeSourceRegistry {
  readonly #sources = new Map<string, KnowledgeSourceRecord>();
  readonly #events: KnowledgeLifecycleEvent[] = [];

  constructor(manifest: KnowledgeSourceManifest) {
    for (const source of manifest.sources) {
      this.#sources.set(sourceIdentity(source.tenant_id, source.source_id), cloneSource(source));
    }
  }

  get(tenantId: string, sourceId: string): KnowledgeSourceRecord | undefined {
    const source = this.#sources.get(sourceIdentity(tenantId, sourceId));
    return source ? cloneSource(source) : undefined;
  }

  /** Every lookup starts with the trusted tenant and fails closed on lifecycle or classification. */
  listRetrievable(tenantId: string, at: Date): readonly KnowledgeSourceRecord[] {
    const timestamp = validTime(at);
    return [...this.#sources.values()]
      .filter(
        (source) =>
          source.tenant_id === tenantId &&
          source.classification === "public" &&
          source.lifecycle.state === "published" &&
          source.lifecycle.effective_from !== null &&
          Date.parse(source.lifecycle.effective_from) <= timestamp &&
          (source.lifecycle.effective_to === null ||
            timestamp < Date.parse(source.lifecycle.effective_to)),
      )
      .sort((left, right) => left.source_id.localeCompare(right.source_id))
      .map(cloneSource);
  }

  publishDraft(tenantId: string, sourceId: string, at: Date): KnowledgeSourceRecord {
    const changedAt = validIsoTime(at);
    const draft = this.#requiredSource(tenantId, sourceId);
    this.#requireState(draft, ["draft"]);

    for (const source of this.#sources.values()) {
      if (
        source.tenant_id === tenantId &&
        source.source_key === draft.source_key &&
        source.lifecycle.state === "published"
      ) {
        const superseded = replaceLifecycle(source, {
          state: "superseded",
          effective_to: changedAt,
          changed_at: changedAt,
        });
        this.#replace(superseded);
        this.#recordEvent(superseded, "source.superseded", changedAt);
      }
    }

    const published = replaceLifecycle(draft, {
      state: "published",
      effective_from: changedAt,
      effective_to: null,
      changed_at: changedAt,
      purge_after: null,
    });
    this.#replace(published);
    this.#recordEvent(published, "source.published", changedAt);
    return cloneSource(published);
  }

  withdraw(tenantId: string, sourceId: string, at: Date): KnowledgeSourceRecord {
    const changedAt = validIsoTime(at);
    const source = this.#requiredSource(tenantId, sourceId);
    this.#requireState(source, ["published"]);
    const withdrawn = replaceLifecycle(source, {
      state: "withdrawn",
      effective_to: changedAt,
      changed_at: changedAt,
    });
    this.#replace(withdrawn);
    this.#recordEvent(withdrawn, "source.withdrawn", changedAt);
    return cloneSource(withdrawn);
  }

  requestPurge(
    tenantId: string,
    sourceId: string,
    at: Date,
    retentionDays: number,
  ): KnowledgeSourceRecord {
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3_650) {
      throw new Error("retentionDays must be an integer from 1 to 3650.");
    }
    const changedAt = validIsoTime(at);
    const source = this.#requiredSource(tenantId, sourceId);
    this.#requireState(source, ["draft", "superseded", "withdrawn"]);
    const purgeAfter = new Date(Date.parse(changedAt) + retentionDays * 86_400_000).toISOString();
    const pending = replaceLifecycle(source, {
      state: "purge_pending",
      changed_at: changedAt,
      purge_after: purgeAfter,
    });
    this.#replace(pending);
    this.#recordEvent(pending, "source.purge_requested", changedAt, knowledgeCleanupTargets);
    return cloneSource(pending);
  }

  completePurge(
    tenantId: string,
    sourceId: string,
    at: Date,
    completedTargets: readonly KnowledgeCleanupTarget[],
  ): KnowledgeSourceRecord {
    const changedAt = validIsoTime(at);
    const source = this.#requiredSource(tenantId, sourceId);
    this.#requireState(source, ["purge_pending"]);
    if (
      source.lifecycle.purge_after === null ||
      Date.parse(changedAt) < Date.parse(source.lifecycle.purge_after)
    ) {
      throw new KnowledgeSourceRegistryError(
        "KNOWLEDGE_SOURCE_PURGE_NOT_DUE",
        "The knowledge source retention window has not elapsed.",
      );
    }

    const completed = new Set(completedTargets);
    const missing = knowledgeCleanupTargets.filter((target) => !completed.has(target));
    if (missing.length > 0) {
      throw new KnowledgeSourceRegistryError(
        "KNOWLEDGE_SOURCE_PURGE_INCOMPLETE",
        `Knowledge cleanup is incomplete: ${missing.join(", ")}.`,
      );
    }

    const purged: KnowledgeSourceRecord = {
      ...source,
      content_uri: null,
      content_sha256: null,
      lifecycle: {
        ...source.lifecycle,
        state: "purged",
        changed_at: changedAt,
      },
    };
    this.#replace(purged);
    this.#recordEvent(purged, "source.purged", changedAt, knowledgeCleanupTargets);
    return cloneSource(purged);
  }

  listEvents(tenantId: string): readonly KnowledgeLifecycleEvent[] {
    return this.#events
      .filter((event) => event.tenantId === tenantId)
      .map((event) => ({ ...event, cleanupTargets: [...event.cleanupTargets] }));
  }

  #requiredSource(tenantId: string, sourceId: string): KnowledgeSourceRecord {
    const source = this.#sources.get(sourceIdentity(tenantId, sourceId));
    if (!source) {
      // A tenant-scoped miss never reveals whether another tenant owns the same source ID.
      throw new KnowledgeSourceRegistryError(
        "KNOWLEDGE_SOURCE_NOT_FOUND",
        "Knowledge source was not found.",
      );
    }
    return source;
  }

  #requireState(source: KnowledgeSourceRecord, allowed: readonly string[]): void {
    if (!allowed.includes(source.lifecycle.state)) {
      throw new KnowledgeSourceRegistryError(
        "KNOWLEDGE_SOURCE_INVALID_TRANSITION",
        `Cannot transition a knowledge source from ${source.lifecycle.state}.`,
      );
    }
  }

  #replace(source: KnowledgeSourceRecord): void {
    this.#sources.set(sourceIdentity(source.tenant_id, source.source_id), source);
  }

  #recordEvent(
    source: KnowledgeSourceRecord,
    eventType: KnowledgeLifecycleEventType,
    occurredAt: string,
    cleanupTargets: readonly KnowledgeCleanupTarget[] = [],
  ): void {
    this.#events.push({
      tenantId: source.tenant_id,
      sourceId: source.source_id,
      eventType,
      occurredAt,
      cleanupTargets: [...cleanupTargets],
    });
  }
}

function replaceLifecycle(
  source: KnowledgeSourceRecord,
  lifecycle: Partial<KnowledgeSourceRecord["lifecycle"]>,
): KnowledgeSourceRecord {
  return { ...source, lifecycle: { ...source.lifecycle, ...lifecycle } };
}

function cloneSource(source: KnowledgeSourceRecord): KnowledgeSourceRecord {
  return { ...source, lifecycle: { ...source.lifecycle } };
}

function validTime(value: Date): number {
  const timestamp = value.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error("Lifecycle time must be a valid Date.");
  }
  return timestamp;
}

function validIsoTime(value: Date): string {
  validTime(value);
  return value.toISOString();
}
