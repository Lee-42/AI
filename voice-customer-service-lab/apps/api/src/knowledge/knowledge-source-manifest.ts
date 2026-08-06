import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

export const knowledgeSourceStates = [
  "draft",
  "published",
  "superseded",
  "withdrawn",
  "purge_pending",
  "purged",
] as const;

const timestampSchema = z.string().datetime({ offset: true });
const sourceKeySchema = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/u);
const revisionSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/u);

const lifecycleSchema = z
  .object({
    state: z.enum(knowledgeSourceStates),
    effective_from: timestampSchema.nullable(),
    effective_to: timestampSchema.nullable(),
    changed_at: timestampSchema,
    purge_after: timestampSchema.nullable(),
  })
  .strict();

const knowledgeSourceSchema = z
  .object({
    tenant_id: z.string().regex(/^tenant_[a-z0-9][a-z0-9_-]{2,63}$/u),
    source_id: z.string().regex(/^[a-z][a-z0-9-]{2,63}@[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/u),
    source_key: sourceKeySchema,
    revision: revisionSchema,
    title: z.string().trim().min(1).max(200),
    owner_team: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/u),
    classification: z.enum(["public", "internal", "restricted"]),
    conflict_group: z
      .string()
      .regex(/^[a-z][a-z0-9-]{2,63}$/u)
      .nullable(),
    content_uri: z
      .string()
      .regex(/^(?:fixture|oss|s3):\/\/[^\s]+$/u)
      .nullable(),
    content_sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
    lifecycle: lifecycleSchema,
  })
  .strict()
  .superRefine((source, context) => {
    if (source.source_id !== `${source.source_key}@${source.revision}`) {
      context.addIssue({
        code: "custom",
        path: ["source_id"],
        message: "source_id must equal source_key@revision",
      });
    }

    const isPurged = source.lifecycle.state === "purged";
    if (isPurged && (source.content_uri !== null || source.content_sha256 !== null)) {
      context.addIssue({
        code: "custom",
        path: ["content_uri"],
        message: "purged sources cannot retain content location or checksum",
      });
    }
    if (!isPurged && (source.content_uri === null || source.content_sha256 === null)) {
      context.addIssue({
        code: "custom",
        path: ["content_uri"],
        message: "non-purged sources require content location and checksum",
      });
    }

    if (source.lifecycle.state === "published" && source.lifecycle.effective_from === null) {
      context.addIssue({
        code: "custom",
        path: ["lifecycle", "effective_from"],
        message: "published sources require effective_from",
      });
    }
    if (source.lifecycle.state === "purge_pending" && source.lifecycle.purge_after === null) {
      context.addIssue({
        code: "custom",
        path: ["lifecycle", "purge_after"],
        message: "purge_pending sources require purge_after",
      });
    }
    if (
      source.lifecycle.state !== "purge_pending" &&
      source.lifecycle.state !== "purged" &&
      source.lifecycle.purge_after !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["lifecycle", "purge_after"],
        message: "purge_after is only valid during or after purge",
      });
    }
    if (
      source.lifecycle.effective_from !== null &&
      source.lifecycle.effective_to !== null &&
      Date.parse(source.lifecycle.effective_to) <= Date.parse(source.lifecycle.effective_from)
    ) {
      context.addIssue({
        code: "custom",
        path: ["lifecycle", "effective_to"],
        message: "effective_to must be later than effective_from",
      });
    }
  });

const knowledgeSourceManifestSchema = z
  .object({
    schema_version: z.literal(1),
    manifest_id: z.string().regex(/^[a-z][a-z0-9-]{2,63}@[A-Za-z0-9._-]{2,63}$/u),
    generated_at: timestampSchema,
    sources: z.array(knowledgeSourceSchema).min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const identities = new Set<string>();
    const publishedKeys = new Set<string>();
    for (const [index, source] of manifest.sources.entries()) {
      const identity = sourceIdentity(source.tenant_id, source.source_id);
      if (identities.has(identity)) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "source_id"],
          message: "tenant_id + source_id must be unique",
        });
      }
      identities.add(identity);

      if (source.lifecycle.state === "published") {
        const publishedKey = sourceIdentity(source.tenant_id, source.source_key);
        if (publishedKeys.has(publishedKey)) {
          context.addIssue({
            code: "custom",
            path: ["sources", index, "lifecycle", "state"],
            message: "one tenant + source_key can have only one published revision",
          });
        }
        publishedKeys.add(publishedKey);
      }
    }
  });

type ParsedKnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

export type KnowledgeSourceRecord = Readonly<
  Omit<ParsedKnowledgeSource, "lifecycle"> & {
    lifecycle: Readonly<ParsedKnowledgeSource["lifecycle"]>;
  }
>;

export interface KnowledgeSourceManifest {
  readonly schema_version: 1;
  readonly manifest_id: string;
  readonly generated_at: string;
  readonly sources: readonly KnowledgeSourceRecord[];
}

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

/** Validates the catalog before any source can enter the ingestion pipeline. */
export function parseKnowledgeSourceManifest(input: unknown): KnowledgeSourceManifest {
  return knowledgeSourceManifestSchema.parse(input);
}

export function loadKnowledgeSourceManifest(path: string): KnowledgeSourceManifest {
  const resolvedPath = isAbsolute(path) ? path : resolve(repositoryRoot, path);
  try {
    return parseKnowledgeSourceManifest(JSON.parse(readFileSync(resolvedPath, "utf8")));
  } catch {
    throw new Error(`Knowledge source manifest (${path}) is missing or invalid.`);
  }
}

export function sourceIdentity(tenantId: string, sourceId: string): string {
  return `${tenantId}\u0000${sourceId}`;
}
