import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type {
  KnowledgeEvidence,
  KnowledgeRetrievalRequest,
  KnowledgeRetrievalResult,
  KnowledgeRetriever,
} from "./ai-ports.js";

const corpusSchema = z.object({
  documents: z.array(
    z.object({
      source_id: z.string(),
      title: z.string(),
      version: z.string(),
      status: z.enum(["active", "stale"]),
      body: z.string(),
    }),
  ),
});

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

/** Deterministic synthetic fixture adapter; it is not the production Retriever. */
export class SyntheticKnowledgeRetriever implements KnowledgeRetriever {
  readonly name = "synthetic-fixture-retriever";
  readonly #documents: ReadonlyMap<string, KnowledgeEvidence>;

  constructor(path = "eval/rag/synthetic-corpus.v1.json") {
    const resolvedPath = isAbsolute(path) ? path : resolve(repositoryRoot, path);
    const corpus = corpusSchema.parse(JSON.parse(readFileSync(resolvedPath, "utf8")));
    this.#documents = new Map(
      corpus.documents.map((document) => [
        document.source_id,
        {
          sourceId: document.source_id,
          title: document.title,
          version: document.version,
          content: document.body,
          status: document.status,
          score: null,
        },
      ]),
    );
  }

  async retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalResult> {
    if (request.tenantId !== "tenant_demo_store") {
      return { status: "none", evidence: [] };
    }

    const ids = selectSourceIds(request.query).slice(0, request.limit);
    const evidence = ids.flatMap((sourceId) => {
      const item = this.#documents.get(sourceId);
      return item ? [item] : [];
    });
    if (evidence.length === 0) {
      return { status: "none", evidence: [] };
    }
    if (evidence.every((item) => item.status === "stale")) {
      return { status: "stale", evidence };
    }
    if (ids.some((sourceId) => sourceId.startsWith("policy-pickup-fee-"))) {
      return { status: "conflicting", evidence };
    }
    return { status: "sufficient", evidence };
  }
}

function selectSourceIds(query: string): string[] {
  if (/春节|库存|优惠|促销/u.test(query)) {
    return [];
  }
  if (/上门.*取件|取件费/u.test(query)) {
    return ["policy-pickup-fee-a@2026-01", "policy-pickup-fee-b@2026-01"];
  }
  if (/夜间.*配送/u.test(query)) {
    return ["policy-night-delivery-old@2024-01"];
  }
  if (/环保|填充物/u.test(query)) {
    return ["policy-green-packaging@2026-01"];
  }
  if (/质量|故障/u.test(query)) {
    return ["policy-quality-service@2026-01", "policy-return-general@2026-01"];
  }
  if (/退货|换货|退换|签收|定制商品|数字商品/u.test(query)) {
    return ["policy-return-general@2026-01"];
  }
  if (/发票/u.test(query)) {
    return ["policy-invoice@2026-01"];
  }
  if (/配送|出库|送达|偏远/u.test(query)) {
    return ["policy-shipping-standard@2026-01"];
  }
  return [];
}
