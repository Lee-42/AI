import { describe, expect, it, vi } from "vitest";

import { buildChromaSearchWhere } from "../src/knowledge/chroma-knowledge-vector-collection.js";
import { CommerceFixtureEmbeddingProvider } from "../src/knowledge/commerce-fixture-embedding-provider.js";
import { FixtureCorpusSourceLoader } from "../src/knowledge/fixture-corpus-source-loader.js";
import {
  HybridKnowledgeSearch,
  reciprocalRankFusion,
} from "../src/knowledge/hybrid-knowledge-search.js";
import { IncrementalKnowledgeIndexer } from "../src/knowledge/incremental-knowledge-indexer.js";
import { KnowledgeIngestionPipeline } from "../src/knowledge/knowledge-ingestion-pipeline.js";
import { KnowledgeQueryPlanner } from "../src/knowledge/knowledge-query-planner.js";
import { loadKnowledgeSourceManifest } from "../src/knowledge/knowledge-source-manifest.js";
import { KnowledgeSourceRegistry } from "../src/knowledge/knowledge-source-registry.js";
import type {
  KnowledgeSearchHit,
  KnowledgeSearchScope,
  VectorCollectionContract,
} from "../src/knowledge/vector-collection.js";
import {
  InMemoryKnowledgeVectorCollection,
  toKnowledgeVectorMetadata,
} from "../src/knowledge/vector-collection.js";

const now = new Date("2026-08-05T00:00:00.000Z");

describe("knowledge query understanding and hybrid retrieval", () => {
  it("normalizes a colloquial query and adds bounded domain expansions", () => {
    const plan = new KnowledgeQueryPlanner().plan("  东西坏了，怎么售后？！ ");

    expect(plan.normalizedQuery).toBe("东西坏了 怎么售后");
    expect(plan.semanticQuery).toContain("质量");
    expect(plan.lexicalTerms).toEqual(expect.arrayContaining(["质量", "故障", "售后"]));
    expect(plan.signals).toContain("quality");
    expect(plan.lexicalTerms.length).toBeLessThanOrEqual(12);
  });

  it("combines dense and lexical branches without comparing their raw scores", async () => {
    const fixture = await createFixture();
    const search = new HybridKnowledgeSearch({
      ...fixture,
      now: () => now,
    });

    const result = await search.search({
      tenantId: "tenant_demo_store",
      query: "东西坏了怎么办",
      limit: 3,
    });

    expect(result.candidates[0]).toMatchObject({
      sourceId: "policy-quality-service@2026-01",
      lexicalRank: 1,
    });
    expect(result.candidates[0]?.denseRank).not.toBeNull();
    expect(result.branchCounts.dense).toBeGreaterThan(0);
    expect(result.branchCounts.lexical).toBeGreaterThan(0);
  });

  it("returns no candidates or Embedding call for a tenant without approved sources", async () => {
    const fixture = await createFixture();
    const embed = vi.spyOn(fixture.embeddingProvider, "embedDocuments");
    const search = new HybridKnowledgeSearch({ ...fixture, now: () => now });

    const result = await search.search({
      tenantId: "tenant_unknown_store",
      query: "退货规则",
      limit: 3,
    });

    expect(result.candidates).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it("uses the registry allowlist to exclude a highly similar superseded source", async () => {
    const fixture = await createFixture();
    const current = fixture.ingestedChunks[0];
    if (!current) {
      throw new Error("Fixture chunk is missing.");
    }
    const staleId = `chk_${"d".repeat(64)}`;
    const [staleEmbedding] = (
      await fixture.embeddingProvider.embedDocuments(["旧版夜间定时配送说明"])
    ).vectors;
    await fixture.collection.upsert([
      {
        id: staleId,
        document: "旧版资料写明部分城市支持夜间定时配送。",
        embedding: staleEmbedding ?? [],
        metadata: {
          ...toKnowledgeVectorMetadata(current.metadata, fixture.contract),
          source_id: "policy-night-delivery-old@2024-01",
          source_key: "policy-night-delivery-old",
          revision: "2024-01",
          title: "旧版夜间定时配送说明",
          chunk_id: staleId,
        },
      },
    ]);
    const search = new HybridKnowledgeSearch({ ...fixture, now: () => now });

    const result = await search.search({
      tenantId: "tenant_demo_store",
      query: "夜间定时配送",
      limit: 7,
    });

    expect(result.candidates.map((candidate) => candidate.sourceId)).not.toContain(
      "policy-night-delivery-old@2024-01",
    );
  });

  it("builds every Chroma branch from the same server-side scope", () => {
    const scope: KnowledgeSearchScope = {
      tenantId: "tenant_demo_store",
      allowedSourceIds: ["policy-return-general@2026-01"],
      indexVersion: "voice-knowledge-dense@1",
      pipelineVersion: "knowledge-ingestion@1",
    };

    expect(buildChromaSearchWhere(scope)).toEqual({
      $and: [
        { tenant_id: "tenant_demo_store" },
        { classification: "public" },
        { source_id: { $in: ["policy-return-general@2026-01"] } },
        { index_version: "voice-knowledge-dense@1" },
        { pipeline_version: "knowledge-ingestion@1" },
      ],
    });
  });

  it("uses reciprocal ranks so branch score scales cannot dominate fusion", async () => {
    const fixture = await createFixture();
    const stored = await fixture.collection.getByIds(
      fixture.ingestedChunks.slice(0, 2).map((chunk) => chunk.id),
    );
    const first = stored[0];
    const second = stored[1];
    if (!first || !second) {
      throw new Error("Stored fixture records are missing.");
    }
    const dense: KnowledgeSearchHit[] = [
      { ...first, score: 1_000_000 },
      { ...second, score: 999_999 },
    ];
    const lexical: KnowledgeSearchHit[] = [{ ...second, score: 0.000_1 }];

    const fused = reciprocalRankFusion(dense, lexical);

    expect(fused[0]?.chunkId).toBe(second.id);
    expect(fused[0]).toMatchObject({ denseRank: 2, lexicalRank: 1 });
  });
});

async function createFixture() {
  const embeddingProvider = new CommerceFixtureEmbeddingProvider();
  const contract: VectorCollectionContract = {
    name: "voice_knowledge_dense_fixture_v1",
    recordSchemaVersion: 1,
    indexVersion: "voice-knowledge-dense@1",
    pipelineVersion: "knowledge-ingestion@1",
    embeddingModel: embeddingProvider.model,
    embeddingDimension: embeddingProvider.dimension,
    distanceSpace: "cosine",
    engine: "hnsw",
  };
  const registry = new KnowledgeSourceRegistry(
    loadKnowledgeSourceManifest("config/knowledge-source-manifest.v1.json"),
  );
  const collection = new InMemoryKnowledgeVectorCollection();
  const pipeline = new KnowledgeIngestionPipeline({
    loader: new FixtureCorpusSourceLoader(),
    pipelineVersion: contract.pipelineVersion,
  });
  const indexer = new IncrementalKnowledgeIndexer({ embeddingProvider, collection, contract });
  const ingestedChunks = [];
  for (const source of registry.listRetrievable("tenant_demo_store", now)) {
    const result = await pipeline.ingest(source);
    ingestedChunks.push(...result.chunks);
    await indexer.syncSource(result.chunks);
  }
  return { registry, collection, embeddingProvider, contract, ingestedChunks };
}
