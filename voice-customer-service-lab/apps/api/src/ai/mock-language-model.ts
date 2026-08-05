import type {
  GeneratedGroundedAnswer,
  GenerateGroundedAnswerRequest,
  LanguageModel,
} from "./ai-ports.js";
import { AiOrchestratorError } from "./ai-types.js";

export interface MockLanguageModelOptions {
  readonly responseText?: string;
  readonly citedSourceIds?: readonly string[];
}

/** Deterministic, zero-cost model adapter for application and contract tests. */
export class MockLanguageModel implements LanguageModel {
  readonly name = "mock-llm";
  readonly calls: GenerateGroundedAnswerRequest[] = [];
  readonly #responseText: string | undefined;
  readonly #citedSourceIds: readonly string[] | undefined;

  constructor(options: MockLanguageModelOptions = {}) {
    this.#responseText = options.responseText;
    this.#citedSourceIds = options.citedSourceIds;
  }

  async generateGroundedAnswer(
    request: GenerateGroundedAnswerRequest,
  ): Promise<GeneratedGroundedAnswer> {
    if (request.signal?.aborted) {
      throw new AiOrchestratorError("AI_TURN_ABORTED", "The mock model call was cancelled.");
    }
    const first = request.evidence[0];
    if (!first) {
      throw new Error("MockLanguageModel requires at least one evidence item.");
    }

    this.calls.push(request);
    return {
      text: this.#responseText ?? first.content,
      citedSourceIds: this.#citedSourceIds ?? request.evidence.map((item) => item.sourceId),
      finishReason: "stop",
      usage: { inputTokens: 0, outputTokens: 0 },
      providerRequestId: null,
    };
  }
}
