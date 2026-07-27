import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import {
  loadManualSources,
  type ManualSource
} from "./manual-chunks.js";

export const LESSON_15_CHUNK_SIZE = 100;
export const LESSON_15_CHUNK_OVERLAP = 16;
export const LESSON_15_CONTENT_VERSION = 1;

export const DEFAULT_TEXT_SEPARATORS =
  RecursiveCharacterTextSplitter.getSeparatorsForLanguage("markdown");

const chinesePunctuation = [
  "。",
  "！",
  "？",
  "；",
  "，",
  "、"
] as const;
const softLineBreakIndex = DEFAULT_TEXT_SEPARATORS.indexOf("\n");

if (softLineBreakIndex === -1) {
  throw new Error("Markdown separators are missing a soft line break");
}

// 保留 Markdown 标题和段落优先级，只在软换行前插入中文边界。
export const CHINESE_AWARE_TEXT_SEPARATORS = [
  ...DEFAULT_TEXT_SEPARATORS.slice(0, softLineBreakIndex),
  ...chinesePunctuation,
  ...DEFAULT_TEXT_SEPARATORS.slice(softLineBreakIndex)
];

export const MANUAL_SPLIT_STRATEGIES = [
  "default",
  "chinese-punctuation"
] as const;

export type ManualSplitStrategy =
  (typeof MANUAL_SPLIT_STRATEGIES)[number];

export type ChineseManualChunkMetadata = {
  recordType: "lesson15-manual-chunk";
  splitStrategy: ManualSplitStrategy;
  sku: string;
  source: string;
  chunkIndex: number;
  startIndex: number;
  embeddingModel: string;
  contentVersion: number;
};

export type ChineseManualChunkSets = {
  sources: ManualSource[];
  byStrategy: Record<
    ManualSplitStrategy,
    Document<ChineseManualChunkMetadata>[]
  >;
  documents: Document<ChineseManualChunkMetadata>[];
};

const trailingPunctuation = new Set<string>(chinesePunctuation);

class ChineseBoundaryTextSplitter extends RecursiveCharacterTextSplitter {
  protected override splitOnSeparator(
    text: string,
    separator: string
  ): string[] {
    if (
      !separator ||
      !this.keepSeparator ||
      !trailingPunctuation.has(separator)
    ) {
      return super.splitOnSeparator(text, separator);
    }

    // 当前 LangChain JS 默认把 keepSeparator 附到下一块。中文句号更适合
    // 留在前一句末尾，因此只为新增的中文边界调整归属。
    const splits: string[] = [];
    let start = 0;
    let position = text.indexOf(separator, start);

    while (position !== -1) {
      const end = position + separator.length;
      splits.push(text.slice(start, end));
      start = end;
      position = text.indexOf(separator, start);
    }

    if (start < text.length) {
      splits.push(text.slice(start));
    }

    return splits.filter((split) => split.length > 0);
  }
}

function lesson15ChunkId(
  strategy: ManualSplitStrategy,
  sku: string,
  chunkIndex: number
): string {
  return (
    `lesson15:${strategy}:${sku}:chunk:` +
    String(chunkIndex).padStart(4, "0")
  );
}

function separatorsFor(
  strategy: ManualSplitStrategy
): readonly string[] {
  return strategy === "default"
    ? DEFAULT_TEXT_SEPARATORS
    : CHINESE_AWARE_TEXT_SEPARATORS;
}

export async function splitChineseManualSource(
  source: ManualSource,
  embeddingModel: string,
  strategy: ManualSplitStrategy
): Promise<Document<ChineseManualChunkMetadata>[]> {
  if (source.content.trim().length === 0) {
    throw new Error("Chinese retrieval source must not be empty");
  }

  if (embeddingModel.trim().length === 0) {
    throw new Error("Chinese retrieval embedding model must not be empty");
  }

  const splitter = new ChineseBoundaryTextSplitter({
    chunkSize: LESSON_15_CHUNK_SIZE,
    chunkOverlap: LESSON_15_CHUNK_OVERLAP,
    keepSeparator: true,
    separators: [...separatorsFor(strategy)]
  });
  const chunks = await splitter.splitText(source.content);
  let searchFrom = 0;

  return chunks.map((pageContent, index) => {
    const startIndex = source.content.indexOf(pageContent, searchFrom);

    if (startIndex === -1) {
      throw new Error(
        `Unable to locate ${strategy} chunk ${index + 1} in ${source.source}`
      );
    }

    searchFrom = startIndex + 1;
    const chunkIndex = index + 1;

    return new Document({
      id: lesson15ChunkId(strategy, source.sku, chunkIndex),
      pageContent,
      metadata: {
        recordType: "lesson15-manual-chunk",
        splitStrategy: strategy,
        sku: source.sku,
        source: source.source,
        chunkIndex,
        startIndex,
        embeddingModel,
        contentVersion: LESSON_15_CONTENT_VERSION
      }
    });
  });
}

export async function loadChineseManualChunkSets(
  embeddingModel: string
): Promise<ChineseManualChunkSets> {
  const sources = await loadManualSources();

  if (sources.length === 0) {
    throw new Error("No manual sources were found for lesson 15");
  }

  const [defaultChunksBySource, chineseChunksBySource] =
    await Promise.all([
      Promise.all(
        sources.map((source) => {
          return splitChineseManualSource(
            source,
            embeddingModel,
            "default"
          );
        })
      ),
      Promise.all(
        sources.map((source) => {
          return splitChineseManualSource(
            source,
            embeddingModel,
            "chinese-punctuation"
          );
        })
      )
    ]);
  const defaultChunks = defaultChunksBySource.flat();
  const chineseChunks = chineseChunksBySource.flat();
  const byStrategy = {
    default: defaultChunks,
    "chinese-punctuation": chineseChunks
  };

  return {
    sources,
    byStrategy,
    documents: [...defaultChunks, ...chineseChunks]
  };
}
