import type {
  AiAnswerPolicy,
  KnowledgeEvidence,
  KnowledgeRetriever,
  LanguageModel,
  TurnRouteDecision,
  TurnRouter,
} from "./ai-ports.js";
import type {
  AiAnswerMode,
  AiEvidenceStatus,
  AiOrchestrator,
  AiTurnRequest,
  AiTurnResponse,
} from "./ai-types.js";
import { AiOrchestratorError } from "./ai-types.js";

export interface DefaultAiOrchestratorOptions {
  readonly router: TurnRouter;
  readonly retriever: KnowledgeRetriever;
  readonly model: LanguageModel;
  readonly answerPolicy: AiAnswerPolicy;
  readonly retrievalLimit?: number;
}

/** Provider-neutral application service. HTTP, RTC, Chroma and model SDKs stay in adapters. */
export class DefaultAiOrchestrator implements AiOrchestrator {
  readonly #router: TurnRouter;
  readonly #retriever: KnowledgeRetriever;
  readonly #model: LanguageModel;
  readonly #answerPolicy: AiAnswerPolicy;
  readonly #retrievalLimit: number;

  constructor(options: DefaultAiOrchestratorOptions) {
    this.#router = options.router;
    this.#retriever = options.retriever;
    this.#model = options.model;
    this.#answerPolicy = options.answerPolicy;
    this.#retrievalLimit = options.retrievalLimit ?? 5;

    if (!Number.isInteger(this.#retrievalLimit) || this.#retrievalLimit < 1) {
      throw new Error("DefaultAiOrchestrator retrievalLimit must be a positive integer.");
    }
  }

  async answer(request: AiTurnRequest): Promise<AiTurnResponse> {
    assertNotAborted(request.signal);
    const signal = request.signal ? { signal: request.signal } : {};
    const route = await this.#router.route({
      tenantId: request.tenantId,
      sessionId: request.sessionId,
      roundId: request.roundId,
      locale: request.locale,
      text: request.text,
      ...signal,
    });
    assertNotAborted(request.signal);
    validateRoute(route);

    if (route.mode !== "grounded_answer") {
      return this.#policyResponse(request, route, route.mode, "not_applicable");
    }

    const retrieval = await this.#retriever.retrieve({
      tenantId: request.tenantId,
      query: route.query,
      locale: request.locale,
      limit: this.#retrievalLimit,
      ...signal,
    });
    assertNotAborted(request.signal);

    if (retrieval.status !== "sufficient") {
      return this.#policyResponse(request, route, "abstain", retrieval.status, {
        retriever: this.#retriever.name,
      });
    }
    validateSufficientEvidence(retrieval.evidence);

    const generated = await this.#model.generateGroundedAnswer({
      locale: request.locale,
      systemInstruction: request.groundedContext.systemInstruction,
      history: request.groundedContext.history.map((message) => ({ ...message })),
      question: request.text,
      evidence: retrieval.evidence.map(({ sourceId, title, content }) => ({
        sourceId,
        title,
        content,
      })),
      maxOutputTokens: this.#answerPolicy.maxOutputTokens,
      temperature: this.#answerPolicy.temperature,
      topP: this.#answerPolicy.topP,
      ...signal,
    });
    assertNotAborted(request.signal);

    const citations = validateAndMapModelOutput(generated, retrieval.evidence);
    return {
      sessionId: request.sessionId,
      roundId: request.roundId,
      answerMode: "grounded_answer",
      evidenceStatus: "sufficient",
      spokenText: generated.text.trim(),
      citations,
      execution: {
        policyVersion: this.#answerPolicy.version,
        router: this.#router.name,
        retriever: this.#retriever.name,
        model: this.#model.name,
        routeReason: route.reason,
        providerRequestId: generated.providerRequestId,
        modelUsage: generated.usage,
      },
    };
  }

  #policyResponse(
    request: AiTurnRequest,
    route: TurnRouteDecision,
    mode: AiAnswerMode,
    evidenceStatus: AiEvidenceStatus,
    dependencies: { readonly retriever?: string } = {},
  ): AiTurnResponse {
    const spokenText = this.#answerPolicy
      .responseFor({ mode, evidenceStatus, routeReason: route.reason })
      .trim();
    if (!spokenText) {
      throw new AiOrchestratorError(
        "AI_INVALID_ROUTE",
        "The answer policy returned an empty response for a non-generated route.",
      );
    }

    return {
      sessionId: request.sessionId,
      roundId: request.roundId,
      answerMode: mode,
      evidenceStatus,
      spokenText,
      citations: [],
      execution: {
        policyVersion: this.#answerPolicy.version,
        router: this.#router.name,
        retriever: dependencies.retriever ?? null,
        model: null,
        routeReason: route.reason,
        providerRequestId: null,
        modelUsage: null,
      },
    };
  }
}

function validateRoute(route: TurnRouteDecision): void {
  if (!route.query.trim() || !/^[a-z][a-z0-9._-]{1,63}$/i.test(route.reason)) {
    throw new AiOrchestratorError(
      "AI_INVALID_ROUTE",
      "The turn router returned an invalid query or reason code.",
    );
  }
}

function validateSufficientEvidence(evidence: readonly KnowledgeEvidence[]): void {
  if (
    evidence.length === 0 ||
    evidence.some(
      (item) =>
        item.status !== "active" ||
        !item.chunkId.trim() ||
        !item.sourceId.trim() ||
        !item.title.trim() ||
        !item.version.trim() ||
        !item.content.trim(),
    )
  ) {
    throw new AiOrchestratorError(
      "AI_INVALID_RETRIEVAL_RESULT",
      "Sufficient retrieval results require at least one complete, active evidence item.",
    );
  }
}

function validateAndMapModelOutput(
  generated: {
    readonly text: string;
    readonly citedSourceIds: readonly string[];
  },
  evidence: readonly KnowledgeEvidence[],
) {
  if (!generated.text.trim() || generated.citedSourceIds.length === 0) {
    throw new AiOrchestratorError(
      "AI_INVALID_MODEL_OUTPUT",
      "A grounded model answer requires non-empty text and at least one citation.",
    );
  }

  const evidenceById = new Map(evidence.map((item) => [item.sourceId, item]));
  const uniqueIds = [...new Set(generated.citedSourceIds)];
  const unknownId = uniqueIds.find((sourceId) => !evidenceById.has(sourceId));
  if (unknownId) {
    throw new AiOrchestratorError(
      "AI_INVALID_MODEL_OUTPUT",
      "The model cited a source that was not present in the retrieval result.",
    );
  }

  return uniqueIds.map((sourceId) => {
    const item = evidenceById.get(sourceId);
    if (!item) {
      throw new AiOrchestratorError(
        "AI_INVALID_MODEL_OUTPUT",
        "The model citation could not be mapped to retrieved evidence.",
      );
    }
    return { sourceId: item.sourceId, title: item.title, version: item.version };
  });
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AiOrchestratorError("AI_TURN_ABORTED", "The AI turn was cancelled.");
  }
}
