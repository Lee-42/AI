import type {
  ChromaClient,
  Collection,
  CollectionMetadata,
  Metadata,
  Where,
  WhereDocument,
} from "chromadb";

import type {
  KnowledgeSearchHit,
  KnowledgeSearchScope,
  KnowledgeVectorCollection,
  KnowledgeVectorMetadata,
  KnowledgeVectorRecord,
  StoredKnowledgeVectorRecord,
  VectorCollectionContract,
} from "./vector-collection.js";
import {
  collectionContractMetadata,
  contractsEqual,
  lexicalRelevance,
} from "./vector-collection.js";

export interface ChromaKnowledgeVectorCollectionOptions {
  readonly client: ChromaClient;
  readonly contract: VectorCollectionContract;
}

/** Stores precomputed vectors; Chroma never chooses or silently downloads an Embedding model. */
export class ChromaKnowledgeVectorCollection implements KnowledgeVectorCollection {
  readonly #client: ChromaClient;
  readonly #contract: VectorCollectionContract;
  #collectionPromise: Promise<Collection> | undefined;

  constructor(options: ChromaKnowledgeVectorCollectionOptions) {
    this.#client = options.client;
    this.#contract = options.contract;
  }

  async ensureContract(contract: VectorCollectionContract): Promise<void> {
    if (!contractsEqual(contract, this.#contract)) {
      throw new Error("Requested contract does not match the configured Chroma collection.");
    }
    await this.#collection();
  }

  async getByIds(ids: readonly string[]): Promise<readonly StoredKnowledgeVectorRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const result = await (await this.#collection()).get({
      ids: [...ids],
      include: ["documents", "metadatas"],
    });
    return result.ids.map((id, index) => ({
      id,
      document: result.documents[index] ?? null,
      metadata: parseRecordMetadata(result.metadatas[index] ?? null),
    }));
  }

  async listIdsBySource(tenantId: string, sourceId: string): Promise<readonly string[]> {
    const result = await (await this.#collection()).get({
      where: { $and: [{ tenant_id: tenantId }, { source_id: sourceId }] },
      include: [],
    });
    return [...result.ids].sort();
  }

  async upsert(records: readonly KnowledgeVectorRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }
    await (await this.#collection()).upsert({
      ids: records.map((record) => record.id),
      embeddings: records.map((record) => [...record.embedding]),
      documents: records.map((record) => record.document),
      metadatas: records.map((record) => ({ ...record.metadata })),
    });
  }

  async delete(ids: readonly string[]): Promise<void> {
    if (ids.length > 0) {
      await (await this.#collection()).delete({ ids: [...ids] });
    }
  }

  async count(): Promise<number> {
    return (await this.#collection()).count();
  }

  async searchDense(
    queryEmbedding: readonly number[],
    scope: KnowledgeSearchScope,
    limit: number,
  ): Promise<readonly KnowledgeSearchHit[]> {
    validateSearchRequest(queryEmbedding, scope, limit, this.#contract);
    const result = await (await this.#collection()).query({
      queryEmbeddings: [[...queryEmbedding]],
      nResults: limit,
      where: buildChromaSearchWhere(scope),
      include: ["documents", "metadatas", "distances"],
    });
    const ids = result.ids[0] ?? [];
    return ids.flatMap((id, index) => {
      const metadata = parseRecordMetadata(result.metadatas[0]?.[index] ?? null);
      if (!metadata) {
        return [];
      }
      const distance = result.distances[0]?.[index];
      return [
        {
          id,
          document: result.documents[0]?.[index] ?? null,
          metadata,
          score: typeof distance === "number" ? 1 - distance : 0,
        },
      ];
    });
  }

  async searchLexical(
    terms: readonly string[],
    scope: KnowledgeSearchScope,
    limit: number,
  ): Promise<readonly KnowledgeSearchHit[]> {
    validateSearchRequest(undefined, scope, limit, this.#contract);
    const normalizedTerms = normalizeTerms(terms);
    if (normalizedTerms.length === 0) {
      return [];
    }
    const result = await (await this.#collection()).get({
      where: buildChromaSearchWhere(scope),
      whereDocument: buildWhereDocument(normalizedTerms),
      limit,
      include: ["documents", "metadatas"],
    });
    return result.ids
      .flatMap((id, index) => {
        const metadata = parseRecordMetadata(result.metadatas[index] ?? null);
        const document = result.documents[index] ?? null;
        if (!metadata || !document) {
          return [];
        }
        return [
          {
            id,
            document,
            metadata,
            score: lexicalRelevance(document, metadata.title, normalizedTerms),
          },
        ];
      })
      .filter((hit) => hit.score > 0)
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, limit);
  }

  #collection(): Promise<Collection> {
    this.#collectionPromise ??= this.#openCollection();
    return this.#collectionPromise;
  }

  async #openCollection(): Promise<Collection> {
    const expectedMetadata = collectionContractMetadata(this.#contract);
    const configuration =
      this.#contract.engine === "spann"
        ? { spann: { space: this.#contract.distanceSpace } }
        : { hnsw: { space: this.#contract.distanceSpace } };
    const collection = await this.#client.getOrCreateCollection({
      name: this.#contract.name,
      metadata: expectedMetadata,
      configuration,
      embeddingFunction: null,
    });
    assertCollectionMetadata(collection.metadata, expectedMetadata);
    const configuredEngine =
      this.#contract.engine === "spann"
        ? collection.configuration.spann
        : collection.configuration.hnsw;
    if (!configuredEngine) {
      throw new Error("Chroma collection index engine does not match its versioned contract.");
    }
    return collection;
  }
}

export function buildChromaSearchWhere(scope: KnowledgeSearchScope): Where {
  if (scope.allowedSourceIds.length === 0) {
    throw new Error("Chroma search requires at least one registry-approved source.");
  }
  return {
    $and: [
      { tenant_id: scope.tenantId },
      { classification: "public" },
      { source_id: { $in: [...new Set(scope.allowedSourceIds)] } },
      { index_version: scope.indexVersion },
      { pipeline_version: scope.pipelineVersion },
    ],
  };
}

function assertCollectionMetadata(
  actual: CollectionMetadata | undefined,
  expected: Readonly<Record<string, string | number>>,
): void {
  for (const [key, value] of Object.entries(expected)) {
    if (actual?.[key] !== value) {
      throw new Error(
        `Chroma collection metadata mismatch for ${key}; create a new versioned collection.`,
      );
    }
  }
}

function parseRecordMetadata(metadata: Metadata | null): KnowledgeVectorMetadata | null {
  if (
    !metadata ||
    typeof metadata.tenant_id !== "string" ||
    typeof metadata.source_id !== "string" ||
    typeof metadata.chunk_id !== "string" ||
    typeof metadata.chunk_sha256 !== "string" ||
    typeof metadata.pipeline_fingerprint !== "string" ||
    typeof metadata.embedding_model !== "string" ||
    typeof metadata.embedding_dimension !== "number" ||
    typeof metadata.index_version !== "string"
  ) {
    return null;
  }
  return metadata as KnowledgeVectorMetadata;
}

function buildWhereDocument(terms: readonly string[]): WhereDocument {
  return terms.length === 1
    ? { $contains: terms[0] ?? "" }
    : { $or: terms.map((term) => ({ $contains: term })) };
}

function validateSearchRequest(
  embedding: readonly number[] | undefined,
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
  if (embedding && embedding.length !== contract.embeddingDimension) {
    throw new Error("Query embedding does not match the collection dimension.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Knowledge search limit must be an integer from 1 to 100.");
  }
}

function normalizeTerms(terms: readonly string[]): string[] {
  return [...new Set(terms.map((term) => term.normalize("NFKC").trim().toLocaleLowerCase("zh-CN")))]
    .filter((term) => term.length > 0)
    .slice(0, 16);
}
