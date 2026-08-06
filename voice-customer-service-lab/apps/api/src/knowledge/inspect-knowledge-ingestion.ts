import { FixtureCorpusSourceLoader } from "./fixture-corpus-source-loader.js";
import { KnowledgeIngestionPipeline } from "./knowledge-ingestion-pipeline.js";
import { loadKnowledgeSourceManifest } from "./knowledge-source-manifest.js";
import { KnowledgeSourceRegistry } from "./knowledge-source-registry.js";

const manifest = loadKnowledgeSourceManifest("config/knowledge-source-manifest.v1.json");
const registry = new KnowledgeSourceRegistry(manifest);
const pipeline = new KnowledgeIngestionPipeline({ loader: new FixtureCorpusSourceLoader() });
const sources = registry.listRetrievable("tenant_demo_store", new Date("2026-08-05T00:00:00.000Z"));
const results = await Promise.all(sources.map((source) => pipeline.ingest(source)));

process.stdout.write(
  `${JSON.stringify(
    results.map((result) => ({
      source_id: result.sourceId,
      document_id: result.documentId,
      chunks: result.chunks.map((chunk) => ({
        chunk_id: chunk.id,
        text: chunk.text,
        metadata: chunk.metadata,
      })),
    })),
    null,
    2,
  )}\n`,
);
