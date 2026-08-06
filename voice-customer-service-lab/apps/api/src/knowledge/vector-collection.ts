import type { KnowledgeChunkMetadata } from "./knowledge-ingestion-pipeline.js";

type MetadataValue = string | number | boolean | null;

export interface KnowledgeVectorMetadata extends Record<string, MetadataValue> {
  readonly schema_version: 1;
  readonly tenant_id: string;
  readonly source_id: string;
  readonly source_key: string;
  readonly revision: string;
  readonly title: string;
  readonly owner_team: string;
  readonly classification: "public";
  readonly conflict_group: string | null;
  readonly document_id: string;
  readonly chunk_id: string;
  readonly chunk_index: number;
  readonly chunk_count: number;
  readonly section_index: number;
  readonly section_path: string;
  readonly start_character: number;
  readonly end_character: number;
  readonly source_sha256: string;
  readonly chunk_sha256: string;
  readonly pipeline_version: string;
  readonly pipeline_fingerprint: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly embedding_model: string;
  readonly embedding_dimension: number;
  readonly index_version: string;
}

export interface KnowledgeVectorRecord {
  readonly id: string;
  readonly document: string;
  readonly embedding: readonly number[];
  readonly metadata: KnowledgeVectorMetadata;
}

export interface StoredKnowledgeVectorRecord {
  readonly id: string;
  readonly document: string | null;
  readonly metadata: KnowledgeVectorMetadata | null;
}

export interface KnowledgeSearchScope {
  readonly tenantId: string;
  /** Resolved by the trusted source registry, never accepted from the browser. */
  readonly allowedSourceIds: readonly string[];
  readonly indexVersion: string;
  readonly pipelineVersion: string;
}

export interface KnowledgeSearchHit extends StoredKnowledgeVectorRecord {
  /** Branch-local score. Rank fusion does not compare scores across branches. */
  readonly score: number;
}

export interface VectorCollectionContract {
  readonly name: string;
  readonly recordSchemaVersion: 1;
  readonly indexVersion: string;
  readonly pipelineVersion: string;
  readonly embeddingModel: string;
  readonly embeddingDimension: number;
  readonly distanceSpace: "cosine";
  readonly engine: "hnsw" | "spann";
}

export interface KnowledgeVectorCollection {
  ensureContract(contract: VectorCollectionContract): Promise<void>;
  getByIds(ids: readonly string[]): Promise<readonly StoredKnowledgeVectorRecord[]>;
  listIdsBySource(tenantId: string, sourceId: string): Promise<readonly string[]>;
  upsert(records: readonly KnowledgeVectorRecord[]): Promise<void>;
  delete(ids: readonly string[]): Promise<void>;
  count(): Promise<number>;
  searchDense(
    queryEmbedding: readonly number[],
    scope: KnowledgeSearchScope,
    limit: number,
  ): Promise<readonly KnowledgeSearchHit[]>;
  searchLexical(
    terms: readonly string[],
    scope: KnowledgeSearchScope,
    limit: number,
  ): Promise<readonly KnowledgeSearchHit[]>;
}

/** In-memory adapter keeps tests and the lesson exercise offline and deterministic. */
export class InMemoryKnowledgeVectorCollection implements KnowledgeVectorCollection {
  readonly #records = new Map<string, KnowledgeVectorRecord>();
  #contract: VectorCollectionContract | undefined;

  async ensureContract(contract: VectorCollectionContract): Promise<void> {
    if (this.#contract && !contractsEqual(this.#contract, contract)) {
      throw new Error("Vector collection contract does not match the existing collection.");
    }
    this.#contract = { ...contract };
  }

  async getByIds(ids: readonly string[]): Promise<readonly StoredKnowledgeVectorRecord[]> {
    return ids.flatMap((id) => {
      const record = this.#records.get(id);
      return record ? [{ id, document: record.document, metadata: { ...record.metadata } }] : [];
    });
  }

  async listIdsBySource(tenantId: string, sourceId: string): Promise<readonly string[]> {
    return [...this.#records.values()]
      .filter(
        (record) =>
          record.metadata.tenant_id === tenantId && record.metadata.source_id === sourceId,
      )
      .map((record) => record.id)
      .sort();
  }

  async upsert(records: readonly KnowledgeVectorRecord[]): Promise<void> {
    const contract = this.#requiredContract();
    for (const record of records) {
      assertRecordMatchesContract(record, contract);
      this.#records.set(record.id, cloneRecord(record));
    }
  }

  async delete(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      this.#records.delete(id);
    }
  }

  async count(): Promise<number> {
    return this.#records.size;
  }

  async searchDense(
    queryEmbedding: readonly number[],
    scope: KnowledgeSearchScope,
    limit: number,
  ): Promise<readonly KnowledgeSearchHit[]> {
    const contract = this.#requiredContract();
    validateSearchRequest(scope, limit, contract);
    if (queryEmbedding.length !== contract.embeddingDimension) {
      throw new Error("Query embedding does not match the collection dimension.");
    }
    return this.#scopedRecords(scope)
      .map((record) => ({
        id: record.id,
        document: record.document,
        metadata: { ...record.metadata },
        score: cosineSimilarity(queryEmbedding, record.embedding),
      }))
      .sort(compareSearchHits)
      .slice(0, limit);
  }

  async searchLexical(
    terms: readonly string[],
    scope: KnowledgeSearchScope,
    limit: number,
  ): Promise<readonly KnowledgeSearchHit[]> {
    const contract = this.#requiredContract();
    validateSearchRequest(scope, limit, contract);
    const normalizedTerms = normalizeLexicalTerms(terms);
    if (normalizedTerms.length === 0) {
      return [];
    }
    return this.#scopedRecords(scope)
      .map((record) => ({
        id: record.id,
        document: record.document,
        metadata: { ...record.metadata },
        score: lexicalRelevance(record.document, record.metadata.title, normalizedTerms),
      }))
      .filter((record) => record.score > 0)
      .sort(compareSearchHits)
      .slice(0, limit);
  }

  #requiredContract(): VectorCollectionContract {
    if (!this.#contract) {
      throw new Error("Vector collection contract must be ensured before use.");
    }
    return this.#contract;
  }

  #scopedRecords(scope: KnowledgeSearchScope): readonly KnowledgeVectorRecord[] {
    const allowedSourceIds = new Set(scope.allowedSourceIds);
    return [...this.#records.values()].filter(
      (record) =>
        record.metadata.tenant_id === scope.tenantId &&
        record.metadata.classification === "public" &&
        allowedSourceIds.has(record.metadata.source_id) &&
        record.metadata.index_version === scope.indexVersion &&
        record.metadata.pipeline_version === scope.pipelineVersion,
    );
  }
}

export function toKnowledgeVectorMetadata(
  metadata: KnowledgeChunkMetadata,
  contract: VectorCollectionContract,
): KnowledgeVectorMetadata {
  return {
    ...metadata,
    effective_to: metadata.effective_to ?? null,
    embedding_model: contract.embeddingModel,
    embedding_dimension: contract.embeddingDimension,
    index_version: contract.indexVersion,
  };
}

export function collectionContractMetadata(
  contract: VectorCollectionContract,
): Record<string, string | number> {
  return {
    record_schema_version: contract.recordSchemaVersion,
    index_version: contract.indexVersion,
    pipeline_version: contract.pipelineVersion,
    embedding_model: contract.embeddingModel,
    embedding_dimension: contract.embeddingDimension,
    distance_space: contract.distanceSpace,
    index_engine: contract.engine,
  };
}

export function contractsEqual(
  left: VectorCollectionContract,
  right: VectorCollectionContract,
): boolean {
  return (
    JSON.stringify(collectionContractMetadata(left)) ===
      JSON.stringify(collectionContractMetadata(right)) && left.name === right.name
  );
}

export function lexicalRelevance(
  document: string,
  title: string,
  terms: readonly string[],
): number {
  const normalizedDocument = document.normalize("NFKC").toLocaleLowerCase("zh-CN");
  const normalizedTitle = title.normalize("NFKC").toLocaleLowerCase("zh-CN");
  return terms.reduce((score, term) => {
    const titleMatch = normalizedTitle.includes(term) ? 3 : 0;
    const documentMatches = normalizedDocument.split(term).length - 1;
    return score + titleMatch + Math.min(documentMatches, 3);
  }, 0);
}

function validateSearchRequest(
  scope: KnowledgeSearchScope,
  limit: number,
  contract: VectorCollectionContract,
): void {
  if (
    !scope.tenantId ||
    scope.allowedSourceIds.length === 0 ||
    scope.indexVersion !== contract.indexVersion ||
    scope.pipelineVersion !== contract.pipelineVersion
  ) {
    throw new Error("Knowledge search requires one trusted, compatible retrieval scope.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Knowledge search limit must be an integer from 1 to 100.");
  }
}

function normalizeLexicalTerms(terms: readonly string[]): string[] {
  return [...new Set(terms.map((term) => term.normalize("NFKC").trim().toLocaleLowerCase("zh-CN")))]
    .filter((term) => term.length > 0)
    .slice(0, 16);
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator === 0 ? 0 : dot / denominator;
}

function compareSearchHits(left: KnowledgeSearchHit, right: KnowledgeSearchHit): number {
  return right.score - left.score || left.id.localeCompare(right.id);
}

function assertRecordMatchesContract(
  record: KnowledgeVectorRecord,
  contract: VectorCollectionContract,
): void {
  if (
    record.id !== record.metadata.chunk_id ||
    record.embedding.length !== contract.embeddingDimension ||
    record.embedding.some((value) => !Number.isFinite(value)) ||
    record.metadata.embedding_model !== contract.embeddingModel ||
    record.metadata.embedding_dimension !== contract.embeddingDimension ||
    record.metadata.index_version !== contract.indexVersion ||
    record.metadata.pipeline_version !== contract.pipelineVersion
  ) {
    throw new Error("Vector record does not match the collection contract.");
  }
}

function cloneRecord(record: KnowledgeVectorRecord): KnowledgeVectorRecord {
  return {
    id: record.id,
    document: record.document,
    embedding: [...record.embedding],
    metadata: { ...record.metadata },
  };
}
