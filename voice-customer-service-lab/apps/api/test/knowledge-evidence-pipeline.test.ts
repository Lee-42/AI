import { describe, expect, it } from "vitest";

import {
  DeterministicCandidateReranker,
  type RerankedKnowledgeCandidate,
} from "../src/knowledge/candidate-reranker.js";
import { CommerceFixtureEmbeddingProvider } from "../src/knowledge/commerce-fixture-embedding-provider.js";
import {
  ContextAssembler,
  calculateEvidenceTokenBudget,
  type EvidenceBudgetPolicy,
} from "../src/knowledge/context-assembler.js";
import { FixtureCorpusSourceLoader } from "../src/knowledge/fixture-corpus-source-loader.js";
import { GroundedKnowledgeRetriever } from "../src/knowledge/grounded-knowledge-retriever.js";
import type { HybridKnowledgeCandidate } from "../src/knowledge/hybrid-knowledge-search.js";
import { HybridKnowledgeSearch } from "../src/knowledge/hybrid-knowledge-search.js";
import { IncrementalKnowledgeIndexer } from "../src/knowledge/incremental-knowledge-indexer.js";
import { KnowledgeIngestionPipeline } from "../src/knowledge/knowledge-ingestion-pipeline.js";
import { KnowledgeQueryPlanner } from "../src/knowledge/knowledge-query-planner.js";
import { loadKnowledgeSourceManifest } from "../src/knowledge/knowledge-source-manifest.js";
import { KnowledgeSourceRegistry } from "../src/knowledge/knowledge-source-registry.js";
import { ConservativeTokenCounter, type TokenCounter } from "../src/knowledge/token-counter.js";
import {
  InMemoryKnowledgeVectorCollection,
  type VectorCollectionContract,
} from "../src/knowledge/vector-collection.js";

const now = new Date("2026-08-05T00:00:00.000Z");

describe("knowledge evidence pipeline", () => {
  it("demotes a lexically similar candidate that negates the user's intent", () => {
    const reranked = new DeterministicCandidateReranker().rerank({
      plan: new KnowledgeQueryPlanner().plan("东西坏了怎么办"),
      candidates: [
        candidate({
          chunkId: "chunk-pickup",
          sourceId: "policy-pickup-fee-a@2026-01",
          title: "上门取件说明 A",
          content: "非质量原因退货的上门取件服务费为六元。",
          fusedScore: 0.08,
        }),
        candidate({
          chunkId: "chunk-quality",
          sourceId: "policy-quality-service@2026-01",
          title: "质量问题售后流程",
          content: "商品存在质量问题时，需要进入售后流程核验故障现象。",
          fusedScore: 0.04,
        }),
      ],
    });

    expect(reranked.map((item) => item.sourceId)).toEqual([
      "policy-quality-service@2026-01",
      "policy-pickup-fee-a@2026-01",
    ]);
    expect(reranked[1]?.reasons).toContain("negated_intent");
  });

  it("estimates mixed Chinese and ASCII text deterministically without a provider", () => {
    const counter = new ConservativeTokenCounter();

    expect(counter.count("退货 API v1!")).toBe(5);
    expect(counter.count("退货 API v1!")).toBe(5);
  });

  it("reserves prompt, output, protocol and safety tokens before evidence", () => {
    const available = calculateEvidenceTokenBudget({
      tokenCounter: { name: "literal-length", count: (text) => text.length },
      systemInstruction: "12345",
      question: "123",
      policy: {
        modelContextWindowTokens: 30,
        protocolOverheadTokens: 2,
        maxOutputTokens: 5,
        safetyMarginTokens: 3,
      },
    });

    expect(available).toBe(12);
  });

  it("keeps whole chunks and reports the next chunk when it exceeds the budget", () => {
    const assembler = new ContextAssembler({
      tokenCounter: {
        name: "block-fixture",
        count: (text) => (text.includes('chunk_id="chunk-one"') ? 5 : 6),
      },
    });
    const first = rerankedCandidate({ chunkId: "chunk-one", content: "第一条完整证据" });
    const second = rerankedCandidate({ chunkId: "chunk-two", content: "第二条完整证据" });

    const result = assembler.assemble({ candidates: [first, second], availableTokens: 5 });

    expect(result.usedTokens).toBe(5);
    expect(result.included.map((item) => item.content)).toEqual(["第一条完整证据"]);
    expect(result.excluded).toEqual([{ chunkId: "chunk-two", reason: "budget_exceeded" }]);
  });

  it("turns hybrid candidates into reranked active evidence with chunk provenance", async () => {
    const retriever = await createGroundedRetriever();

    const result = await retriever.retrieve(retrievalRequest("东西坏了怎么办"));

    expect(result.status).toBe("sufficient");
    expect(result.evidence[0]).toMatchObject({
      sourceId: "policy-quality-service@2026-01",
      chunkId: expect.stringMatching(/^chk_[a-f0-9]{64}$/u),
      status: "active",
    });
  });

  it("refuses to choose between relevant sources in the same governed conflict group", async () => {
    const retriever = await createGroundedRetriever();

    const result = await retriever.retrieve(retrievalRequest("上门取件费是多少"));

    expect(result).toMatchObject({
      status: "conflicting",
      evidence: expect.arrayContaining([
        expect.objectContaining({ sourceId: "policy-pickup-fee-a@2026-01" }),
        expect.objectContaining({ sourceId: "policy-pickup-fee-b@2026-01" }),
      ]),
    });
  });

  it("does not treat generic shipping rules as evidence for unsupported night delivery", async () => {
    const retriever = await createGroundedRetriever();

    const trace = await retriever.retrieveWithDiagnostics(retrievalRequest("夜间配送还支持吗"));

    expect(trace.result).toEqual({ status: "none", evidence: [] });
    expect(
      trace.reranked.find((candidate) => candidate.sourceId === "policy-shipping-standard@2026-01")
        ?.reasons,
    ).toContain("missing_required_signal");
  });

  it("returns only evidence that fits the context budget", async () => {
    const blockCounter: TokenCounter = {
      name: "one-block-budget-fixture",
      count: (text) => {
        if (!text.includes("<EVIDENCE")) return 0;
        return text.includes("policy-quality-service@2026-01") ? 5 : 6;
      },
    };
    const retriever = await createGroundedRetriever({
      tokenCounter: blockCounter,
      budgetPolicy: {
        modelContextWindowTokens: 5,
        protocolOverheadTokens: 0,
        maxOutputTokens: 0,
        safetyMarginTokens: 0,
      },
    });

    const trace = await retriever.retrieveWithDiagnostics(retrievalRequest("东西坏了怎么办"));

    expect(trace.result.status).toBe("sufficient");
    expect(trace.result.evidence.map((item) => item.sourceId)).toEqual([
      "policy-quality-service@2026-01",
    ]);
    expect(trace.excluded.some((item) => item.reason === "budget_exceeded")).toBe(true);
  });
});

function candidate(
  overrides: Partial<HybridKnowledgeCandidate> & Pick<HybridKnowledgeCandidate, "chunkId">,
): HybridKnowledgeCandidate {
  return {
    chunkId: overrides.chunkId,
    sourceId: overrides.sourceId ?? "policy-example@2026-01",
    title: overrides.title ?? "示例政策",
    revision: overrides.revision ?? "2026-01",
    conflictGroup: overrides.conflictGroup ?? null,
    content: overrides.content ?? "示例内容",
    fusedScore: overrides.fusedScore ?? 0.03,
    denseRank: overrides.denseRank ?? 1,
    lexicalRank: overrides.lexicalRank ?? 1,
  };
}

function rerankedCandidate(
  overrides: Partial<RerankedKnowledgeCandidate> & Pick<RerankedKnowledgeCandidate, "chunkId">,
): RerankedKnowledgeCandidate {
  return {
    ...candidate(overrides),
    rerankScore: overrides.rerankScore ?? 0.9,
    reasons: overrides.reasons ?? ["query_term_coverage"],
  };
}

function retrievalRequest(query: string) {
  return {
    tenantId: "tenant_demo_store",
    query,
    locale: "zh-CN" as const,
    limit: 3,
  };
}

async function createGroundedRetriever(
  options: {
    readonly tokenCounter?: TokenCounter;
    readonly budgetPolicy?: EvidenceBudgetPolicy;
  } = {},
): Promise<GroundedKnowledgeRetriever> {
  const embeddingProvider = new CommerceFixtureEmbeddingProvider();
  const contract: VectorCollectionContract = {
    name: "voice_knowledge_dense_fixture_v1",
    recordSchemaVersion: 1,
    indexVersion: "voice-knowledge-dense@1",
    pipelineVersion: "knowledge-ingestion@1",
    embeddingModel: embeddingProvider.model,
    embeddingDimension: embeddingProvider.dimension,
    distanceSpace: "cosine",
    engine: "hnsw",
  };
  const registry = new KnowledgeSourceRegistry(
    loadKnowledgeSourceManifest("config/knowledge-source-manifest.v1.json"),
  );
  const collection = new InMemoryKnowledgeVectorCollection();
  const pipeline = new KnowledgeIngestionPipeline({
    loader: new FixtureCorpusSourceLoader(),
    pipelineVersion: contract.pipelineVersion,
  });
  const indexer = new IncrementalKnowledgeIndexer({ embeddingProvider, collection, contract });
  for (const source of registry.listRetrievable("tenant_demo_store", now)) {
    const ingested = await pipeline.ingest(source);
    await indexer.syncSource(ingested.chunks);
  }
  const search = new HybridKnowledgeSearch({
    registry,
    collection,
    embeddingProvider,
    contract,
    now: () => now,
  });
  return new GroundedKnowledgeRetriever({
    search,
    reranker: new DeterministicCandidateReranker(),
    tokenCounter: options.tokenCounter ?? new ConservativeTokenCounter(),
    systemInstruction: "只根据当前证据回答。",
    budgetPolicy:
      options.budgetPolicy ??
      ({
        modelContextWindowTokens: 1_024,
        protocolOverheadTokens: 32,
        maxOutputTokens: 128,
        safetyMarginTokens: 64,
      } satisfies EvidenceBudgetPolicy),
  });
}
