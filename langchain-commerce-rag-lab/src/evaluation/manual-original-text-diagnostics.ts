import type { Collection } from "chromadb";
import type { SearchHit } from "../domain/search-result.js";
import type { TextEmbeddingProvider } from "../embeddings/contracts.js";
import type {
  ManualChunkMetadata,
  ManualSource
} from "../indexing/manual-chunks.js";
import { requireSearchHitFields } from "../retrieval/normalize-search-metadata.js";

export type ManualOriginalTextDiagnosticInput = {
  targetId: string;
  sku: string;
  exactSentence: string;
  fullSource: string;
  boundaryText: string;
  embeddingModel: string;
};

export type ManualOriginalTextDiagnostic = {
  storedById: boolean;
  storedEmbeddingModel: string;
  exactSentenceMatchIds: string[];
  fullSourceMatchIds: string[];
  fullSourceFilterError?: string;
  boundaryMatchIds: string[];
  directQueryTextsError?: string;
  semanticResults: {
    exactChunk: SearchHit[];
    exactSentence: SearchHit[];
    boundaryText: SearchHit[];
  };
};

export function buildBoundaryText(
  source: ManualSource,
  firstChunk: {
    pageContent: string;
    metadata: ManualChunkMetadata;
  },
  secondChunk: {
    pageContent: string;
    metadata: ManualChunkMetadata;
  },
  radius = 60
): string {
  if (!Number.isInteger(radius) || radius < 1) {
    throw new Error("Boundary radius must be a positive integer");
  }

  const firstEnd =
    firstChunk.metadata.startIndex + firstChunk.pageContent.length;
  const secondStart = secondChunk.metadata.startIndex;

  if (
    firstChunk.metadata.source !== source.source ||
    secondChunk.metadata.source !== source.source ||
    firstEnd > secondStart
  ) {
    throw new Error("Boundary chunks must be ordered within one source");
  }

  return source.content.slice(
    Math.max(firstChunk.metadata.startIndex, firstEnd - radius),
    Math.min(source.content.length, secondStart + radius)
  );
}

function requireNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty`);
  }
}

export async function diagnoseManualOriginalText(
  collection: Collection,
  embeddings: TextEmbeddingProvider,
  input: ManualOriginalTextDiagnosticInput
): Promise<ManualOriginalTextDiagnostic> {
  requireNonEmpty(input.targetId, "Target ID");
  requireNonEmpty(input.sku, "SKU");
  requireNonEmpty(input.exactSentence, "Exact sentence");
  requireNonEmpty(input.fullSource, "Full source");
  requireNonEmpty(input.boundaryText, "Boundary text");

  const target = await collection.get({
    ids: [input.targetId],
    include: ["documents", "metadatas"]
  });
  const [targetRow] = target.rows();

  if (!targetRow?.document) {
    throw new Error(`Target manual chunk ${input.targetId} was not found`);
  }

  const storedEmbeddingModel = String(
    targetRow.metadata?.embeddingModel ?? ""
  );

  if (storedEmbeddingModel !== input.embeddingModel) {
    throw new Error(
      `Embedding model mismatch: stored=${storedEmbeddingModel || "missing"}, ` +
        `query=${input.embeddingModel}`
    );
  }

  const exactOptions = {
    where: { sku: input.sku }
  };
  const [sentenceMatches, boundaryMatches, storedChunks] =
    await Promise.all([
      collection.get({
        ...exactOptions,
        whereDocument: { $contains: input.exactSentence }
      }),
      collection.get({
        ...exactOptions,
        whereDocument: { $contains: input.boundaryText }
      }),
      collection.get({
        ...exactOptions,
        include: ["documents", "metadatas"]
      })
    ]);
  let fullSourceFilterError: string | undefined;
  let fullSourceMatchIds: string[];

  try {
    const fullSourceMatches = await collection.get({
      ...exactOptions,
      whereDocument: { $contains: input.fullSource }
    });
    fullSourceMatchIds = fullSourceMatches.ids;
  } catch {
    // Cloud 可能限制 whereDocument 的值长度；回退为扫描已读取的 chunk。
    fullSourceFilterError =
      "whereDocument 拒绝了过长的完整说明书，已改为逐个 chunk 精确检查";
    fullSourceMatchIds = storedChunks
      .rows()
      .filter((row) => row.document?.includes(input.fullSource))
      .map((row) => row.id);
  }

  let directQueryTextsError: string | undefined;

  try {
    await collection.query({
      queryTexts: [input.exactSentence],
      nResults: 1
    });
  } catch (error) {
    directQueryTextsError =
      error instanceof Error ? error.message : String(error);
  }

  const vectors = await embeddings.embedDocuments([
    targetRow.document,
    input.exactSentence,
    input.boundaryText
  ]);
  const result = await collection.query({
    queryEmbeddings: vectors,
    nResults: 3,
    where: { sku: input.sku },
    include: ["documents", "metadatas", "distances"]
  });
  const rows = result.rows();

  if (rows.length !== 3) {
    throw new Error("Expected three semantic diagnostic result groups");
  }

  return {
    storedById: true,
    storedEmbeddingModel,
    exactSentenceMatchIds: sentenceMatches.ids,
    fullSourceMatchIds,
    ...(fullSourceFilterError ? { fullSourceFilterError } : {}),
    boundaryMatchIds: boundaryMatches.ids,
    ...(directQueryTextsError ? { directQueryTextsError } : {}),
    semanticResults: {
      exactChunk: (rows[0] ?? []).map(requireSearchHitFields),
      exactSentence: (rows[1] ?? []).map(requireSearchHitFields),
      boundaryText: (rows[2] ?? []).map(requireSearchHitFields)
    }
  };
}
