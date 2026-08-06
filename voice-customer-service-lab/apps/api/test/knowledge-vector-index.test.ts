import type { ChromaClient, Collection } from "chromadb";
import { describe, expect, it, vi } from "vitest";

import { ChromaKnowledgeVectorCollection } from "../src/knowledge/chroma-knowledge-vector-collection.js";
import { FixtureCorpusSourceLoader } from "../src/knowledge/fixture-corpus-source-loader.js";
import { IncrementalKnowledgeIndexer } from "../src/knowledge/incremental-knowledge-indexer.js";
import {
  type IngestedKnowledgeChunk,
  KnowledgeIngestionPipeline,
} from "../src/knowledge/knowledge-ingestion-pipeline.js";
import { loadKnowledgeSourceManifest } from "../src/knowledge/knowledge-source-manifest.js";
import { DeterministicTextEmbeddingProvider } from "../src/knowledge/text-embedding-provider.js";
import type { VectorCollectionContract } from "../src/knowledge/vector-collection.js";
import {
  collectionContractMetadata,
  InMemoryKnowledgeVectorCollection,
} from "../src/knowledge/vector-collection.js";

const contract: VectorCollectionContract = {
  name: "voice_knowledge_dense_v1",
  recordSchemaVersion: 1,
  indexVersion: "voice-knowledge-dense@1",
  pipelineVersion: "knowledge-ingestion@1",
  embeddingModel: "mock-hash-embedding@1",
  embeddingDimension: 16,
  distanceSpace: "cosine",
  engine: "hnsw",
};

describe("incremental knowledge index", () => {
  it("embeds on the first run and skips unchanged chunks on replay", async () => {
    const chunks = await fixtureChunks();
    const collection = new InMemoryKnowledgeVectorCollection();
    const provider = new DeterministicTextEmbeddingProvider();
    const embed = vi.spyOn(provider, "embedDocuments");
    const indexer = new IncrementalKnowledgeIndexer({
      embeddingProvider: provider,
      collection,
      contract,
    });

    const first = await indexer.syncSource(chunks);
    const replay = await indexer.syncSource(chunks);

    expect(first).toMatchObject({ embedded: chunks.length, upserted: chunks.length, skipped: 0 });
    expect(replay).toMatchObject({ embedded: 0, upserted: 0, skipped: chunks.length });
    expect(embed).toHaveBeenCalledTimes(1);
    expect(await collection.count()).toBe(chunks.length);
  });

  it("upserts a changed revision before removing the source's stale vector", async () => {
    const original = await fixtureChunks();
    const changed = changedChunk(original[0]);
    const collection = new InMemoryKnowledgeVectorCollection();
    const provider = new DeterministicTextEmbeddingProvider();
    const indexer = new IncrementalKnowledgeIndexer({
      embeddingProvider: provider,
      collection,
      contract,
    });
    await indexer.syncSource(original);

    const summary = await indexer.syncSource([changed]);

    expect(summary).toMatchObject({ embedded: 1, upserted: 1, deleted: original.length });
    expect(
      await collection.listIdsBySource("tenant_demo_store", changed.metadata.source_id),
    ).toEqual([changed.id]);
  });

  it("keeps the previous vector when re-embedding a new revision fails", async () => {
    const original = await fixtureChunks();
    const collection = new InMemoryKnowledgeVectorCollection();
    const goodProvider = new DeterministicTextEmbeddingProvider();
    await new IncrementalKnowledgeIndexer({
      embeddingProvider: goodProvider,
      collection,
      contract,
    }).syncSource(original);
    const failingProvider = {
      ...goodProvider,
      name: "failing-test-provider",
      model: contract.embeddingModel,
      dimension: contract.embeddingDimension,
      embedDocuments: vi.fn(async () => {
        throw new Error("injected embedding failure");
      }),
    };
    const indexer = new IncrementalKnowledgeIndexer({
      embeddingProvider: failingProvider,
      collection,
      contract,
    });

    await expect(indexer.syncSource([changedChunk(original[0])])).rejects.toThrow(/injected/u);
    expect(
      await collection.listIdsBySource("tenant_demo_store", original[0]?.metadata.source_id ?? ""),
    ).toEqual(original.map((chunk) => chunk.id));
  });

  it("rejects reuse of one collection with a different vector-space contract", async () => {
    const collection = new InMemoryKnowledgeVectorCollection();
    await collection.ensureContract(contract);

    await expect(
      collection.ensureContract({ ...contract, embeddingModel: "another-model@1" }),
    ).rejects.toThrow(/does not match/u);
  });

  it("opens Chroma with precomputed vectors and validates versioned metadata", async () => {
    const cloudContract = { ...contract, engine: "spann" as const };
    const collection = {
      metadata: collectionContractMetadata(cloudContract),
      configuration: { hnsw: null, spann: { space: "cosine" } },
    } as unknown as Collection;
    const getOrCreateCollection = vi.fn(async () => collection);
    const adapter = new ChromaKnowledgeVectorCollection({
      client: { getOrCreateCollection } as unknown as ChromaClient,
      contract: cloudContract,
    });

    await adapter.ensureContract(cloudContract);

    expect(getOrCreateCollection).toHaveBeenCalledWith({
      name: cloudContract.name,
      metadata: collectionContractMetadata(cloudContract),
      configuration: { spann: { space: "cosine" } },
      embeddingFunction: null,
    });
  });
});

async function fixtureChunks(): Promise<readonly IngestedKnowledgeChunk[]> {
  const source = loadKnowledgeSourceManifest(
    "config/knowledge-source-manifest.v1.json",
  ).sources.find((item) => item.source_id === "policy-return-general@2026-01");
  if (!source) {
    throw new Error("Fixture source is missing.");
  }
  return (
    await new KnowledgeIngestionPipeline({
      loader: new FixtureCorpusSourceLoader(),
      pipelineVersion: contract.pipelineVersion,
    }).ingest(source)
  ).chunks;
}

function changedChunk(chunk: IngestedKnowledgeChunk | undefined): IngestedKnowledgeChunk {
  if (!chunk) {
    throw new Error("Fixture chunk is missing.");
  }
  const id = `chk_${"f".repeat(64)}`;
  return {
    ...chunk,
    id,
    text: `${chunk.text} 本次规则已经更新。`,
    metadata: {
      ...chunk.metadata,
      chunk_id: id,
      chunk_sha256: "e".repeat(64),
    },
  };
}
