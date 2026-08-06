import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { KnowledgeSourceRecord } from "./knowledge-source-manifest.js";

const corpusSchema = z
  .object({
    documents: z.array(
      z
        .object({
          source_id: z.string(),
          body: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export interface LoadedKnowledgeSource {
  readonly mediaType: "text/plain" | "text/markdown";
  readonly text: string;
  readonly byteLength: number;
}

export interface KnowledgeSourceLoader {
  load(source: KnowledgeSourceRecord): Promise<LoadedKnowledgeSource>;
}

export interface FixtureCorpusSourceLoaderOptions {
  readonly repositoryRoot?: string;
  readonly maxFileBytes?: number;
  readonly maxDocumentBytes?: number;
}

const defaultRepositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

/** Resolves only fixture:// JSON fragments used by this course; it never fetches a remote URL. */
export class FixtureCorpusSourceLoader implements KnowledgeSourceLoader {
  readonly #repositoryRoot: string;
  readonly #maxFileBytes: number;
  readonly #maxDocumentBytes: number;

  constructor(options: FixtureCorpusSourceLoaderOptions = {}) {
    this.#repositoryRoot = realpathSync(resolve(options.repositoryRoot ?? defaultRepositoryRoot));
    this.#maxFileBytes = positiveLimit(options.maxFileBytes ?? 1_000_000, "maxFileBytes");
    this.#maxDocumentBytes = positiveLimit(options.maxDocumentBytes ?? 256_000, "maxDocumentBytes");
  }

  async load(source: KnowledgeSourceRecord): Promise<LoadedKnowledgeSource> {
    const location = parseFixtureLocation(source.content_uri);
    if (location.sourceId !== source.source_id) {
      throw new Error("Fixture fragment does not match the governed source ID.");
    }

    const candidatePath = resolve(this.#repositoryRoot, location.relativePath);
    if (!isInsideRoot(this.#repositoryRoot, candidatePath)) {
      throw new Error("Fixture source path escapes the repository root.");
    }
    const resolvedPath = realpathSync(candidatePath);
    if (!isInsideRoot(this.#repositoryRoot, resolvedPath)) {
      throw new Error("Fixture source path escapes the repository root.");
    }
    const file = statSync(resolvedPath);
    if (!file.isFile()) {
      throw new Error("Fixture source must resolve to one regular file.");
    }
    if (file.size > this.#maxFileBytes) {
      throw new Error("Fixture corpus exceeds the configured file limit.");
    }
    const serialized = readFileSync(resolvedPath, "utf8");
    if (Buffer.byteLength(serialized, "utf8") > this.#maxFileBytes) {
      throw new Error("Fixture corpus exceeds the configured file limit.");
    }

    const corpus = corpusSchema.parse(JSON.parse(serialized));
    const document = corpus.documents.find((item) => item.source_id === location.sourceId);
    if (!document) {
      throw new Error("Governed source is missing from the fixture corpus.");
    }
    const byteLength = Buffer.byteLength(document.body, "utf8");
    if (byteLength > this.#maxDocumentBytes) {
      throw new Error("Knowledge document exceeds the configured size limit.");
    }
    return { mediaType: "text/plain", text: document.body, byteLength };
  }
}

function parseFixtureLocation(contentUri: string | null): {
  readonly relativePath: string;
  readonly sourceId: string;
} {
  const match = /^fixture:\/\/([^#]+)#([^#]+)$/u.exec(contentUri ?? "");
  if (!match?.[1] || !match[2]) {
    throw new Error("Knowledge source must use one valid fixture:// URI.");
  }
  return {
    relativePath: decodeURIComponent(match[1]),
    sourceId: decodeURIComponent(match[2]),
  };
}

function isInsideRoot(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== "" && !pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot);
}

function positiveLimit(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
