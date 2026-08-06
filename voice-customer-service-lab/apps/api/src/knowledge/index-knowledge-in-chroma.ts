import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { loadServerConfig } from "../core/config.js";
import {
  createKnowledgeVectorCollection,
  createTextEmbeddingProvider,
  createVectorCollectionContract,
} from "./create-knowledge-index.js";
import { FixtureCorpusSourceLoader } from "./fixture-corpus-source-loader.js";
import { IncrementalKnowledgeIndexer } from "./incremental-knowledge-indexer.js";
import { KnowledgeIngestionPipeline } from "./knowledge-ingestion-pipeline.js";
import { loadKnowledgeSourceManifest } from "./knowledge-source-manifest.js";
import { KnowledgeSourceRegistry } from "./knowledge-source-registry.js";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

const config = loadServerConfig();
if (config.knowledgeIndex.provider !== "chroma" || !config.knowledgeIndex.writeEnabled) {
  throw new Error(
    "Cloud indexing is disabled. Set KNOWLEDGE_INDEX_PROVIDER=chroma and KNOWLEDGE_INDEX_WRITE_ENABLED=true explicitly.",
  );
}
const contract = createVectorCollectionContract(config);
const collection = createKnowledgeVectorCollection(config, contract);
const embeddingProvider = createTextEmbeddingProvider(config);
const indexer = new IncrementalKnowledgeIndexer({ embeddingProvider, collection, contract });
const pipeline = new KnowledgeIngestionPipeline({
  loader: new FixtureCorpusSourceLoader(),
  pipelineVersion: contract.pipelineVersion,
});
const registry = new KnowledgeSourceRegistry(
  loadKnowledgeSourceManifest("config/knowledge-source-manifest.v1.json"),
);
const sources = registry.listRetrievable("tenant_demo_store", new Date());
const summaries = [];

for (const source of sources) {
  const result = await pipeline.ingest(source);
  summaries.push(await indexer.syncSource(result.chunks));
}

process.stdout.write(
  `${JSON.stringify(
    {
      collection: contract.name,
      index_version: contract.indexVersion,
      embedding_model: contract.embeddingModel,
      embedding_dimension: contract.embeddingDimension,
      summaries,
      stored_vectors: await collection.count(),
    },
    null,
    2,
  )}\n`,
);
