import type { SearchHit } from "../domain/search-result.js";

export const DEFAULT_RAG_CONTEXT_MAX_CHARACTERS = 4_000;
export const DEFAULT_RAG_CONTEXT_MAX_SOURCES = 3;

const CONTEXT_OPEN = "<retrieved_context>\n";
const CONTEXT_CLOSE = "\n</retrieved_context>";
const EMPTY_CONTEXT = "(no retrieved sources)";

export type RagCitationMetadata = {
  sku?: string;
  source?: string;
  chunkIndex?: number;
};

export type RagContextSource = {
  sourceId: string;
  rank: number;
  metadata: RagCitationMetadata;
};

export type RagContextOptions = {
  maxCharacters?: number;
  maxSources?: number;
};

export type BuiltRagContext = {
  text: string;
  sources: RagContextSource[];
  sourceIds: string[];
  duplicateSourceIds: string[];
  omittedSourceIds: string[];
  inputHitCount: number;
  uniqueHitCount: number;
  usedCharacters: number;
  maxCharacters: number;
};

type NormalizedSource = RagContextSource & {
  content: string;
};

function positiveInteger(
  value: number,
  name: string,
  minimum = 1
): number {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer of at least ${minimum}`);
  }

  return value;
}

function normalizeSourceId(id: string): string {
  const normalized = id.trim();

  if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/u.test(normalized)) {
    throw new Error(
      `RAG source ID "${normalized.slice(0, 40)}" contains unsafe characters`
    );
  }

  return normalized;
}

function optionalMetadataString(
  metadata: SearchHit["metadata"],
  key: string
): string | undefined {
  const value = metadata[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  return escapeContextText(
    value.trim().replace(/\s+/gu, " ").slice(0, 240)
  );
}

function optionalMetadataInteger(
  metadata: SearchHit["metadata"],
  key: string
): number | undefined {
  const value = metadata[key];

  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : undefined;
}

function citationMetadata(
  metadata: SearchHit["metadata"]
): RagCitationMetadata {
  const sku = optionalMetadataString(metadata, "sku");
  const source = optionalMetadataString(metadata, "source");
  const chunkIndex = optionalMetadataInteger(metadata, "chunkIndex");

  return {
    ...(sku ? { sku } : {}),
    ...(source ? { source } : {}),
    ...(chunkIndex !== undefined ? { chunkIndex } : {})
  };
}

function escapeContextText(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function sanitizeRetrievedContent(content: string): string {
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    throw new Error("RAG source content must not be empty");
  }

  // 防止正文伪造本节使用的 source block 边界。
  return escapeContextText(trimmed)
    .replace(/\[source=/giu, "［source=")
    .replace(/\[end-source\]/giu, "［end-source］");
}

function normalizeHits(hits: SearchHit[]): {
  sources: NormalizedSource[];
  duplicateSourceIds: string[];
} {
  const seen = new Set<string>();
  const contentById = new Map<string, string>();
  const metadataById = new Map<string, string>();
  const duplicates = new Set<string>();
  const sources: NormalizedSource[] = [];

  hits.forEach((hit, index) => {
    const sourceId = normalizeSourceId(hit.id);
    const content = sanitizeRetrievedContent(hit.content);
    const metadata = citationMetadata(hit.metadata);
    const serializedMetadata = JSON.stringify(metadata);

    if (seen.has(sourceId)) {
      if (
        contentById.get(sourceId) !== content ||
        metadataById.get(sourceId) !== serializedMetadata
      ) {
        throw new Error(
          `Duplicate RAG source ${sourceId} contains conflicting ` +
            "content or citation metadata"
        );
      }

      duplicates.add(sourceId);
      return;
    }

    seen.add(sourceId);
    contentById.set(sourceId, content);
    metadataById.set(sourceId, serializedMetadata);
    sources.push({
      sourceId,
      rank: index + 1,
      metadata,
      content
    });
  });

  return {
    sources,
    duplicateSourceIds: [...duplicates]
  };
}

function renderSourceBlock(
  source: NormalizedSource,
  content = source.content
): string {
  return [
    `[source=${source.sourceId}]`,
    `metadata=${JSON.stringify(source.metadata)}`,
    "content:",
    content,
    "[end-source]"
  ].join("\n");
}

export function buildRagContext(
  hits: SearchHit[],
  options: RagContextOptions = {}
): BuiltRagContext {
  const maxCharacters = positiveInteger(
    options.maxCharacters ?? DEFAULT_RAG_CONTEXT_MAX_CHARACTERS,
    "RAG context character budget",
    128
  );
  const maxSources = positiveInteger(
    options.maxSources ?? DEFAULT_RAG_CONTEXT_MAX_SOURCES,
    "RAG context source limit"
  );
  const { sources: uniqueSources, duplicateSourceIds } =
    normalizeHits(hits);

  if (uniqueSources.length === 0) {
    const text = `${CONTEXT_OPEN}${EMPTY_CONTEXT}${CONTEXT_CLOSE}`;

    return {
      text,
      sources: [],
      sourceIds: [],
      duplicateSourceIds,
      omittedSourceIds: [],
      inputHitCount: hits.length,
      uniqueHitCount: 0,
      usedCharacters: text.length,
      maxCharacters
    };
  }

  const wrapperLength = CONTEXT_OPEN.length + CONTEXT_CLOSE.length;
  const bodyBudget = maxCharacters - wrapperLength;
  const blocks: string[] = [];
  const includedSources: RagContextSource[] = [];
  let bodyLength = 0;

  for (const source of uniqueSources) {
    if (includedSources.length >= maxSources) {
      break;
    }

    const separator = blocks.length === 0 ? "" : "\n\n";
    const fullBlock = renderSourceBlock(source);

    if (
      bodyLength + separator.length + fullBlock.length <=
      bodyBudget
    ) {
      blocks.push(fullBlock);
      bodyLength += separator.length + fullBlock.length;
      includedSources.push({
        sourceId: source.sourceId,
        rank: source.rank,
        metadata: source.metadata
      });
      continue;
    }

    // 保持 source block 完整；低排名 block 超预算时整体省略。
    if (blocks.length > 0) {
      break;
    }

    throw new Error(
      "RAG context budget is too small for the highest-ranked source block"
    );
  }

  const text = `${CONTEXT_OPEN}${blocks.join("\n\n")}${CONTEXT_CLOSE}`;
  const includedIds = new Set(
    includedSources.map((source) => source.sourceId)
  );

  if (text.length > maxCharacters) {
    throw new Error("Built RAG context exceeds its character budget");
  }

  return {
    text,
    sources: includedSources,
    sourceIds: includedSources.map((source) => source.sourceId),
    duplicateSourceIds,
    omittedSourceIds: uniqueSources
      .filter((source) => !includedIds.has(source.sourceId))
      .map((source) => source.sourceId),
    inputHitCount: hits.length,
    uniqueHitCount: uniqueSources.length,
    usedCharacters: text.length,
    maxCharacters
  };
}
