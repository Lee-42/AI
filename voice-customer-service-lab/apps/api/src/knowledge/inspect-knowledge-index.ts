import { loadServerConfig } from "../core/config.js";
import { createVectorCollectionContract } from "./create-knowledge-index.js";
import { FixtureCorpusSourceLoader } from "./fixture-corpus-source-loader.js";
import { IncrementalKnowledgeIndexer } from "./incremental-knowledge-indexer.js";
import { KnowledgeIngestionPipeline } from "./knowledge-ingestion-pipeline.js";
import { loadKnowledgeSourceManifest } from "./knowledge-source-manifest.js";
import { KnowledgeSourceRegistry } from "./knowledge-source-registry.js";
import { DeterministicTextEmbeddingProvider } from "./text-embedding-provider.js";
import { InMemoryKnowledgeVectorCollection } from "./vector-collection.js";

// Deliberately ignore process.env: this exercise must never reach a paid provider or cloud store.
const config = loadServerConfig({});
const contract = createVectorCollectionContract(config);
const collection = new InMemoryKnowledgeVectorCollection();
const embeddingProvider = new DeterministicTextEmbeddingProvider({
  model: contract.embeddingModel,
  dimension: contract.embeddingDimension,
});
const indexer = new IncrementalKnowledgeIndexer({ embeddingProvider, collection, contract });
const pipeline = new KnowledgeIngestionPipeline({
  loader: new FixtureCorpusSourceLoader(),
  pipelineVersion: contract.pipelineVersion,
});
const registry = new KnowledgeSourceRegistry(
  loadKnowledgeSourceManifest("config/knowledge-source-manifest.v1.json"),
);
const sources = registry.listRetrievable("tenant_demo_store", new Date("2026-08-05T00:00:00.000Z"));
const ingested = await Promise.all(sources.map((source) => pipeline.ingest(source)));

const firstRun = [];
for (const result of ingested) {
  firstRun.push(await indexer.syncSource(result.chunks));
}
const replay = [];
for (const result of ingested) {
  replay.push(await indexer.syncSource(result.chunks));
}

process.stdout.write(
  `${JSON.stringify(
    {
      mode: "offline-deterministic",
      collection: contract,
      first_run: total(firstRun),
      replay: total(replay),
      stored_vectors: await collection.count(),
    },
    null,
    2,
  )}\n`,
);

function total(
  summaries: readonly {
    readonly discovered: number;
    readonly skipped: number;
    readonly embedded: number;
    readonly upserted: number;
    readonly deleted: number;
  }[],
) {
  return summaries.reduce(
    (result, summary) => ({
      discovered: result.discovered + summary.discovered,
      skipped: result.skipped + summary.skipped,
      embedded: result.embedded + summary.embedded,
      upserted: result.upserted + summary.upserted,
      deleted: result.deleted + summary.deleted,
    }),
    { discovered: 0, skipped: 0, embedded: 0, upserted: 0, deleted: 0 },
  );
}
