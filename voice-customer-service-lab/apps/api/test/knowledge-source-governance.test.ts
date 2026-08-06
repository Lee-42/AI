import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  type KnowledgeSourceManifest,
  loadKnowledgeSourceManifest,
  parseKnowledgeSourceManifest,
} from "../src/knowledge/knowledge-source-manifest.js";
import {
  KnowledgeSourceRegistry,
  KnowledgeSourceRegistryError,
  knowledgeCleanupTargets,
} from "../src/knowledge/knowledge-source-registry.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const manifestPath = "config/knowledge-source-manifest.v1.json";

describe("knowledge source governance", () => {
  it("validates immutable identities and keeps the manifest aligned with the synthetic corpus", () => {
    const manifest = loadKnowledgeSourceManifest(manifestPath);
    const corpus = JSON.parse(
      readFileSync(`${repositoryRoot}/eval/rag/synthetic-corpus.v1.json`, "utf8"),
    ) as {
      documents: Array<{ source_id: string; title: string; body: string }>;
    };
    const manifestById = new Map(manifest.sources.map((source) => [source.source_id, source]));

    expect(manifest.sources).toHaveLength(corpus.documents.length);
    expect(
      manifest.sources
        .filter((source) => source.source_id.startsWith("policy-pickup-fee-"))
        .map((source) => source.conflict_group),
    ).toEqual(["pickup-fee-current", "pickup-fee-current"]);
    expect(manifestById.get("policy-return-general@2026-01")?.conflict_group).toBeNull();
    for (const document of corpus.documents) {
      const source = manifestById.get(document.source_id);
      expect(source?.title).toBe(document.title);
      expect(source?.content_sha256).toBe(
        createHash("sha256").update(document.body, "utf8").digest("hex"),
      );
    }
  });

  it("rejects duplicate tenant identities and mutable HTTP source locations", () => {
    const manifest = loadKnowledgeSourceManifest(manifestPath);
    const source = requiredSource(manifest);

    expect(() =>
      parseKnowledgeSourceManifest({
        ...manifest,
        manifest_id: "invalid-duplicates@1.0",
        sources: [source, source],
      }),
    ).toThrow();
    expect(() =>
      parseKnowledgeSourceManifest({
        ...manifest,
        manifest_id: "invalid-http-uri@1.0",
        sources: [{ ...source, content_uri: "https://example.com/policy.md" }],
      }),
    ).toThrow();
    expect(() =>
      parseKnowledgeSourceManifest({
        ...manifest,
        manifest_id: "invalid-current-revisions@1.0",
        sources: [
          source,
          {
            ...source,
            source_id: `${source.source_key}@next`,
            revision: "next",
            content_uri: "fixture://duplicate-current/next",
          },
        ],
      }),
    ).toThrow();
  });

  it("uses tenant + source ID as the isolation boundary", () => {
    const original = requiredSource(loadKnowledgeSourceManifest(manifestPath));
    const partner = { ...original, tenant_id: "tenant_partner_store" };
    const registry = new KnowledgeSourceRegistry(
      parseKnowledgeSourceManifest({
        schema_version: 1,
        manifest_id: "tenant-isolation-fixture@1.0",
        generated_at: "2026-08-05T00:00:00.000Z",
        sources: [original, partner],
      }),
    );

    expect(registry.listRetrievable("tenant_demo_store", date("2026-08-05"))).toHaveLength(1);
    expect(registry.listRetrievable("tenant_partner_store", date("2026-08-05"))).toHaveLength(1);
    expect(registry.get("tenant_unknown_store", original.source_id)).toBeUndefined();
    expect(() =>
      registry.withdraw("tenant_unknown_store", original.source_id, date("2026-08-06")),
    ).toThrowError(KnowledgeSourceRegistryError);
  });

  it("only exposes public, published and currently effective sources", () => {
    const manifest = loadKnowledgeSourceManifest(manifestPath);
    const registry = new KnowledgeSourceRegistry(manifest);
    const sourceIds = registry
      .listRetrievable("tenant_demo_store", date("2026-08-05"))
      .map((source) => source.source_id);

    expect(sourceIds).toHaveLength(7);
    expect(sourceIds).not.toContain("policy-night-delivery-old@2024-01");
    expect(registry.listRetrievable("tenant_unknown_store", date("2026-08-05"))).toEqual([]);
  });

  it("publishes one draft and supersedes the previous tenant revision", () => {
    const registry = registryWithDraft();

    const published = registry.publishDraft(
      "tenant_demo_store",
      "policy-return-general@2026-09",
      date("2026-09-01"),
    );

    expect(published.lifecycle.state).toBe("published");
    expect(
      registry.get("tenant_demo_store", "policy-return-general@2026-01")?.lifecycle.state,
    ).toBe("superseded");
    expect(
      registry
        .listRetrievable("tenant_demo_store", date("2026-09-01"))
        .filter((source) => source.source_key === "policy-return-general")
        .map((source) => source.source_id),
    ).toEqual(["policy-return-general@2026-09"]);
  });

  it("withdraws immediately, then requires retention and complete downstream cleanup", () => {
    const registry = registryWithDraft();
    const tenantId = "tenant_demo_store";
    const sourceId = "policy-return-general@2026-09";
    registry.publishDraft(tenantId, sourceId, date("2026-09-01"));
    registry.withdraw(tenantId, sourceId, date("2026-09-02"));

    expect(
      registry.listRetrievable(tenantId, date("2026-09-02")).map((source) => source.source_id),
    ).not.toContain(sourceId);
    const pending = registry.requestPurge(tenantId, sourceId, date("2026-09-02"), 7);
    expect(pending.lifecycle).toMatchObject({
      state: "purge_pending",
      purge_after: "2026-09-09T00:00:00.000Z",
    });

    expect(() =>
      registry.completePurge(tenantId, sourceId, date("2026-09-08"), knowledgeCleanupTargets),
    ).toThrowError(/retention window/u);
    expect(() =>
      registry.completePurge(tenantId, sourceId, date("2026-09-09"), ["source_blob"]),
    ).toThrowError(/cleanup is incomplete/u);

    const purged = registry.completePurge(
      tenantId,
      sourceId,
      date("2026-09-09"),
      knowledgeCleanupTargets,
    );
    expect(purged).toMatchObject({
      content_uri: null,
      content_sha256: null,
      lifecycle: { state: "purged" },
    });
    expect(registry.listEvents(tenantId).at(-1)).toMatchObject({
      eventType: "source.purged",
      cleanupTargets: knowledgeCleanupTargets,
    });
  });

  it("does not allow a published source to bypass withdrawal before purge", () => {
    const registry = new KnowledgeSourceRegistry(loadKnowledgeSourceManifest(manifestPath));

    expect(() =>
      registry.requestPurge(
        "tenant_demo_store",
        "policy-return-general@2026-01",
        date("2026-08-05"),
        7,
      ),
    ).toThrowError(/Cannot transition/u);
  });
});

function registryWithDraft(): KnowledgeSourceRegistry {
  const manifest = loadKnowledgeSourceManifest(manifestPath);
  const current = manifest.sources.find(
    (source) => source.source_id === "policy-return-general@2026-01",
  );
  if (!current) {
    throw new Error("Current return policy fixture is missing.");
  }
  const draft = {
    ...current,
    source_id: "policy-return-general@2026-09",
    revision: "2026-09",
    content_uri: "fixture://draft/policy-return-general@2026-09",
    content_sha256: "a".repeat(64),
    lifecycle: {
      state: "draft",
      effective_from: null,
      effective_to: null,
      changed_at: "2026-08-20T00:00:00.000Z",
      purge_after: null,
    },
  };
  return new KnowledgeSourceRegistry(
    parseKnowledgeSourceManifest({ ...manifest, sources: [...manifest.sources, draft] }),
  );
}

function requiredSource(manifest: KnowledgeSourceManifest) {
  const source = manifest.sources[0];
  if (!source) {
    throw new Error("Knowledge source fixture is missing.");
  }
  return source;
}

function date(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}
