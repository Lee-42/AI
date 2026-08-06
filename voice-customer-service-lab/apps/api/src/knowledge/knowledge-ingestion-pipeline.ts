import { createHash } from "node:crypto";
import type { KnowledgeSourceLoader } from "./fixture-corpus-source-loader.js";
import type { KnowledgeSourceRecord } from "./knowledge-source-manifest.js";

export interface KnowledgeChunkMetadata {
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
  readonly effective_to?: string;
}

export interface IngestedKnowledgeChunk {
  readonly id: string;
  readonly text: string;
  readonly metadata: KnowledgeChunkMetadata;
}

export interface KnowledgeIngestionResult {
  readonly documentId: string;
  readonly sourceId: string;
  readonly sourceSha256: string;
  readonly chunks: readonly IngestedKnowledgeChunk[];
}

export interface ParsedKnowledgeSection {
  readonly sectionIndex: number;
  readonly sectionPath: string;
  readonly text: string;
}

export interface KnowledgeIngestionPipelineOptions {
  readonly loader: KnowledgeSourceLoader;
  readonly pipelineVersion?: string;
  readonly maxCharacters?: number;
  readonly overlapCharacters?: number;
}

interface PendingChunk {
  readonly sectionIndex: number;
  readonly sectionPath: string;
  readonly startCharacter: number;
  readonly endCharacter: number;
  readonly text: string;
}

/** Deterministic pipeline: verify -> clean -> parse sections -> chunk -> attach metadata. */
export class KnowledgeIngestionPipeline {
  readonly #loader: KnowledgeSourceLoader;
  readonly #pipelineVersion: string;
  readonly #maxCharacters: number;
  readonly #overlapCharacters: number;
  readonly #pipelineFingerprint: string;

  constructor(options: KnowledgeIngestionPipelineOptions) {
    this.#loader = options.loader;
    this.#pipelineVersion = options.pipelineVersion ?? "knowledge-ingestion@1";
    this.#maxCharacters = integerInRange(options.maxCharacters ?? 300, 16, 10_000);
    this.#overlapCharacters = integerInRange(options.overlapCharacters ?? 40, 0, 2_000);
    if (this.#overlapCharacters >= this.#maxCharacters) {
      throw new Error("overlapCharacters must be smaller than maxCharacters.");
    }
    if (!/^[a-z][a-z0-9-]{2,63}@[A-Za-z0-9._-]{1,32}$/u.test(this.#pipelineVersion)) {
      throw new Error("pipelineVersion must be one stable versioned identifier.");
    }
    this.#pipelineFingerprint = stableId("pipe", [
      this.#pipelineVersion,
      String(this.#maxCharacters),
      String(this.#overlapCharacters),
    ]);
  }

  async ingest(source: KnowledgeSourceRecord): Promise<KnowledgeIngestionResult> {
    assertIngestible(source);
    const loaded = await this.#loader.load(source);
    const actualSourceHash = sha256(loaded.text);
    if (actualSourceHash !== source.content_sha256) {
      throw new Error("Knowledge source checksum does not match its governed manifest.");
    }

    const cleaned = cleanKnowledgeText(loaded.text);
    if (cleaned.length === 0) {
      throw new Error("Knowledge source is empty after deterministic cleaning.");
    }
    const sections = parseKnowledgeSections(cleaned, source.title);
    const pendingChunks = sections.flatMap((section) =>
      splitSection(section, this.#maxCharacters, this.#overlapCharacters),
    );
    if (pendingChunks.length === 0) {
      throw new Error("Knowledge source did not produce any chunks.");
    }

    const documentId = stableId("doc", [source.tenant_id, source.source_id, actualSourceHash]);
    const chunkCount = pendingChunks.length;
    const chunks = pendingChunks.map((chunk, chunkIndex) => {
      const chunkHash = sha256(chunk.text);
      const chunkId = stableId("chk", [
        documentId,
        this.#pipelineFingerprint,
        String(chunk.sectionIndex),
        String(chunkIndex),
        String(chunk.startCharacter),
        String(chunk.endCharacter),
        chunkHash,
      ]);
      const metadata: KnowledgeChunkMetadata = {
        schema_version: 1,
        tenant_id: source.tenant_id,
        source_id: source.source_id,
        source_key: source.source_key,
        revision: source.revision,
        title: source.title,
        owner_team: source.owner_team,
        classification: "public",
        conflict_group: source.conflict_group,
        document_id: documentId,
        chunk_id: chunkId,
        chunk_index: chunkIndex,
        chunk_count: chunkCount,
        section_index: chunk.sectionIndex,
        section_path: chunk.sectionPath,
        start_character: chunk.startCharacter,
        end_character: chunk.endCharacter,
        source_sha256: actualSourceHash,
        chunk_sha256: chunkHash,
        pipeline_version: this.#pipelineVersion,
        pipeline_fingerprint: this.#pipelineFingerprint,
        effective_from: requiredEffectiveFrom(source),
        ...(source.lifecycle.effective_to ? { effective_to: source.lifecycle.effective_to } : {}),
      };
      return { id: chunkId, text: chunk.text, metadata };
    });

    return {
      documentId,
      sourceId: source.source_id,
      sourceSha256: actualSourceHash,
      chunks,
    };
  }
}

/** Cleaning improves consistency; it deliberately does not remove untrusted document instructions. */
export function cleanKnowledgeText(input: string): string {
  const normalized = input
    .normalize("NFC")
    .replace(/^\uFEFF/u, "")
    .replace(/[\u200B\u2060]/gu, "")
    .replace(/\r\n?/gu, "\n");
  return stripUnsupportedControlCharacters(normalized)
    .split("\n")
    .map((line) => line.replace(/[\t ]+/gu, " ").trim())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/** Markdown headings become metadata; body text remains data and is never executed as instructions. */
export function parseKnowledgeSections(
  cleanedText: string,
  fallbackTitle: string,
): readonly ParsedKnowledgeSection[] {
  const sections: ParsedKnowledgeSection[] = [];
  const headingPath: string[] = [];
  let bodyLines: string[] = [];

  const flush = () => {
    const text = bodyLines.join("\n").trim();
    bodyLines = [];
    if (text.length === 0) {
      return;
    }
    sections.push({
      sectionIndex: sections.length,
      sectionPath: headingPath.length > 0 ? headingPath.join(" > ") : fallbackTitle,
      text,
    });
  };

  for (const line of cleanedText.split("\n")) {
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (!heading?.[1] || !heading[2]) {
      bodyLines.push(line);
      continue;
    }
    flush();
    const level = heading[1].length;
    headingPath.splice(level - 1);
    headingPath.push(heading[2].trim());
  }
  flush();
  return sections;
}

function splitSection(
  section: ParsedKnowledgeSection,
  maxCharacters: number,
  overlapCharacters: number,
): PendingChunk[] {
  const characters = [...section.text];
  const chunks: PendingChunk[] = [];
  let start = 0;

  while (start < characters.length) {
    let end = Math.min(start + maxCharacters, characters.length);
    if (end < characters.length) {
      const minimumBoundary = start + Math.floor(maxCharacters * 0.6);
      for (let cursor = end; cursor > minimumBoundary; cursor -= 1) {
        if (/[。！？!?；;\n]/u.test(characters[cursor - 1] ?? "")) {
          end = cursor;
          break;
        }
      }
    }

    let contentStart = start;
    let contentEnd = end;
    while (/\s/u.test(characters[contentStart] ?? "") && contentStart < contentEnd) {
      contentStart += 1;
    }
    while (/\s/u.test(characters[contentEnd - 1] ?? "") && contentEnd > contentStart) {
      contentEnd -= 1;
    }
    if (contentEnd > contentStart) {
      chunks.push({
        sectionIndex: section.sectionIndex,
        sectionPath: section.sectionPath,
        startCharacter: contentStart,
        endCharacter: contentEnd,
        text: characters.slice(contentStart, contentEnd).join(""),
      });
    }
    if (end >= characters.length) {
      break;
    }

    const nextStart = Math.max(start + 1, end - overlapCharacters);
    start = nextStart;
    while (/\s/u.test(characters[start] ?? "") && start < end) {
      start += 1;
    }
  }
  return chunks;
}

function assertIngestible(
  source: KnowledgeSourceRecord,
): asserts source is KnowledgeSourceRecord & {
  readonly classification: "public";
  readonly content_uri: string;
  readonly content_sha256: string;
} {
  if (
    source.lifecycle.state !== "published" ||
    source.classification !== "public" ||
    source.content_uri === null ||
    source.content_sha256 === null ||
    source.lifecycle.effective_from === null
  ) {
    throw new Error("Only governed public and published sources can be ingested.");
  }
}

function requiredEffectiveFrom(source: KnowledgeSourceRecord): string {
  if (source.lifecycle.effective_from === null) {
    throw new Error("Published knowledge source is missing effective_from.");
  }
  return source.lifecycle.effective_from;
}

function stableId(prefix: "pipe" | "doc" | "chk", parts: readonly string[]): string {
  return `${prefix}_${sha256(parts.join("\u0000"))}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function integerInRange(value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Chunk setting must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function stripUnsupportedControlCharacters(value: string): string {
  return [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        character === "\n" ||
        character === "\t" ||
        (codePoint >= 32 && codePoint < 127) ||
        codePoint >= 160
      );
    })
    .join("");
}
