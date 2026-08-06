import type { IngestedKnowledgeChunk } from "./knowledge-ingestion-pipeline.js";
import type { TextEmbeddingProvider } from "./text-embedding-provider.js";
import { validateEmbeddingBatch } from "./text-embedding-provider.js";
import type {
  KnowledgeVectorCollection,
  KnowledgeVectorRecord,
  StoredKnowledgeVectorRecord,
  VectorCollectionContract,
} from "./vector-collection.js";
import { toKnowledgeVectorMetadata } from "./vector-collection.js";

export interface IncrementalIndexSummary {
  readonly tenantId: string;
  readonly sourceId: string;
  readonly discovered: number;
  readonly skipped: number;
  readonly embedded: number;
  readonly upserted: number;
  readonly deleted: number;
}

export interface IncrementalKnowledgeIndexerOptions {
  readonly embeddingProvider: TextEmbeddingProvider;
  readonly collection: KnowledgeVectorCollection;
  readonly contract: VectorCollectionContract;
  readonly batchSize?: number;
}

export class IncrementalKnowledgeIndexer {
  readonly #embeddingProvider: TextEmbeddingProvider;
  readonly #collection: KnowledgeVectorCollection;
  readonly #contract: VectorCollectionContract;
  readonly #batchSize: number;

  constructor(options: IncrementalKnowledgeIndexerOptions) {
    this.#embeddingProvider = options.embeddingProvider;
    this.#collection = options.collection;
    this.#contract = options.contract;
    this.#batchSize = options.batchSize ?? 64;
    if (!Number.isInteger(this.#batchSize) || this.#batchSize < 1 || this.#batchSize > 512) {
      throw new Error("batchSize must be an integer from 1 to 512.");
    }
    if (
      this.#embeddingProvider.model !== this.#contract.embeddingModel ||
      this.#embeddingProvider.dimension !== this.#contract.embeddingDimension
    ) {
      throw new Error("Embedding provider does not match the collection contract.");
    }
  }

  /** Synchronizes one governed source. Stable IDs make retries idempotent. */
  async syncSource(
    chunks: readonly IngestedKnowledgeChunk[],
    signal?: AbortSignal,
  ): Promise<IncrementalIndexSummary> {
    const { tenantId, sourceId } = validateOneSource(chunks, this.#contract.pipelineVersion);
    await this.#collection.ensureContract(this.#contract);

    const desiredIds = chunks.map((chunk) => chunk.id);
    const currentIds = await this.#collection.listIdsBySource(tenantId, sourceId);
    const existing = await this.#collection.getByIds(desiredIds);
    const existingById = new Map(existing.map((record) => [record.id, record]));
    const changed = chunks.filter(
      (chunk) => !isReusable(existingById.get(chunk.id), chunk, this.#contract),
    );

    // Finish every Upsert before deleting stale records, so a failed run keeps old data usable.
    for (let offset = 0; offset < changed.length; offset += this.#batchSize) {
      const batchChunks = changed.slice(offset, offset + this.#batchSize);
      const embeddings = await this.#embeddingProvider.embedDocuments(
        batchChunks.map((chunk) => chunk.text),
        signal,
      );
      validateEmbeddingBatch(embeddings, {
        count: batchChunks.length,
        model: this.#contract.embeddingModel,
        dimension: this.#contract.embeddingDimension,
      });
      const records: KnowledgeVectorRecord[] = batchChunks.map((chunk, index) => ({
        id: chunk.id,
        document: chunk.text,
        embedding: embeddings.vectors[index] ?? [],
        metadata: toKnowledgeVectorMetadata(chunk.metadata, this.#contract),
      }));
      await this.#collection.upsert(records);
    }

    const desiredIdSet = new Set(desiredIds);
    const staleIds = currentIds.filter((id) => !desiredIdSet.has(id));
    if (staleIds.length > 0) {
      await this.#collection.delete(staleIds);
    }

    return {
      tenantId,
      sourceId,
      discovered: chunks.length,
      skipped: chunks.length - changed.length,
      embedded: changed.length,
      upserted: changed.length,
      deleted: staleIds.length,
    };
  }
}

function isReusable(
  stored: StoredKnowledgeVectorRecord | undefined,
  chunk: IngestedKnowledgeChunk,
  contract: VectorCollectionContract,
): boolean {
  return Boolean(
    stored?.document === chunk.text &&
      stored.metadata?.chunk_sha256 === chunk.metadata.chunk_sha256 &&
      stored.metadata.pipeline_fingerprint === chunk.metadata.pipeline_fingerprint &&
      stored.metadata.embedding_model === contract.embeddingModel &&
      stored.metadata.embedding_dimension === contract.embeddingDimension &&
      stored.metadata.index_version === contract.indexVersion,
  );
}

function validateOneSource(
  chunks: readonly IngestedKnowledgeChunk[],
  pipelineVersion: string,
): { readonly tenantId: string; readonly sourceId: string } {
  const first = chunks[0];
  if (!first) {
    throw new Error("syncSource requires at least one chunk.");
  }
  const tenantId = first.metadata.tenant_id;
  const sourceId = first.metadata.source_id;
  const ids = new Set<string>();
  for (const chunk of chunks) {
    if (
      chunk.id !== chunk.metadata.chunk_id ||
      chunk.metadata.tenant_id !== tenantId ||
      chunk.metadata.source_id !== sourceId ||
      chunk.metadata.pipeline_version !== pipelineVersion ||
      ids.has(chunk.id)
    ) {
      throw new Error("syncSource accepts unique chunks from exactly one source and pipeline.");
    }
    ids.add(chunk.id);
  }
  return { tenantId, sourceId };
}
