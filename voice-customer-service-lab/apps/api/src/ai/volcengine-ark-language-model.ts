import { z } from "zod";

import type { SecretValue } from "../core/secret-value.js";
import type {
  GeneratedGroundedAnswer,
  GenerateGroundedAnswerRequest,
  LanguageModel,
} from "./ai-ports.js";
import { LanguageModelError } from "./ai-ports.js";
import { AiOrchestratorError } from "./ai-types.js";

const arkResponseSchema = z
  .object({
    id: z.string().min(1).max(256),
    choices: z
      .array(
        z
          .object({
            finish_reason: z.string(),
            message: z
              .object({
                content: z.string(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
    usage: z
      .object({
        prompt_tokens: z.number().int().nonnegative(),
        completion_tokens: z.number().int().nonnegative(),
      })
      .passthrough(),
  })
  .passthrough();

export interface VolcengineArkLanguageModelOptions {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: SecretValue;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

/** Volcengine Ark Chat Completions adapter. Provider JSON never escapes this module. */
export class VolcengineArkLanguageModel implements LanguageModel {
  readonly name = "volcengine-ark";
  readonly #baseUrl: string;
  readonly #model: string;
  readonly #apiKey: SecretValue;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: VolcengineArkLanguageModelOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#model = options.model;
    this.#apiKey = options.apiKey;
    this.#timeoutMs = options.timeoutMs;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async generateGroundedAnswer(
    request: GenerateGroundedAnswerRequest,
  ): Promise<GeneratedGroundedAnswer> {
    if (request.signal?.aborted) {
      throw new AiOrchestratorError("AI_TURN_ABORTED", "The model call was cancelled.");
    }
    const timeoutSignal = AbortSignal.timeout(this.#timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeoutSignal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#apiKey.reveal()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.#model,
          messages: [
            { role: "system", content: request.systemInstruction },
            ...request.history.map(({ role, content }) => ({ role, content })),
            { role: "user", content: buildGroundedUserMessage(request) },
          ],
          max_tokens: request.maxOutputTokens,
          temperature: request.temperature,
          top_p: request.topP,
          stream: false,
        }),
        signal,
      });
    } catch {
      if (request.signal?.aborted) {
        throw new AiOrchestratorError("AI_TURN_ABORTED", "The model call was cancelled.");
      }
      if (timeoutSignal.aborted) {
        throw new LanguageModelError(
          "LLM_PROVIDER_TIMEOUT",
          "The language model provider did not respond before the configured deadline.",
          true,
        );
      }
      throw new LanguageModelError(
        "LLM_PROVIDER_UNAVAILABLE",
        "The language model provider could not be reached.",
        true,
      );
    }

    if (!response.ok) {
      throw providerHttpError(response.status);
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw invalidResponse();
    }
    const parsed = arkResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw invalidResponse();
    }
    const choice = parsed.data.choices[0];
    if (!choice || !["stop", "length"].includes(choice.finish_reason)) {
      throw invalidResponse();
    }
    const extracted = extractCitations(choice.message.content);

    return {
      text: extracted.text,
      citedSourceIds: extracted.sourceIds,
      finishReason: choice.finish_reason === "length" ? "length" : "stop",
      usage: {
        inputTokens: parsed.data.usage.prompt_tokens,
        outputTokens: parsed.data.usage.completion_tokens,
      },
      providerRequestId: parsed.data.id,
    };
  }
}

function buildGroundedUserMessage(request: GenerateGroundedAnswerRequest): string {
  const evidence = request.evidence
    .map((item, index) =>
      [
        `<EVIDENCE index="${index + 1}" source_id="${item.sourceId}">`,
        `TITLE: ${item.title}`,
        item.content,
        "</EVIDENCE>",
      ].join("\n"),
    )
    .join("\n\n");
  return [`QUESTION:\n${request.question}`, `EVIDENCE:\n${evidence}`].join("\n\n");
}

function extractCitations(content: string): {
  readonly text: string;
  readonly sourceIds: string[];
} {
  const sourceIds: string[] = [];
  const citationPattern = /\[([A-Za-z0-9][A-Za-z0-9@._:-]{2,127})\]/g;
  for (const match of content.matchAll(citationPattern)) {
    const sourceId = match[1];
    if (sourceId && !sourceIds.includes(sourceId)) {
      sourceIds.push(sourceId);
    }
  }
  const text = content
    .replace(citationPattern, "")
    .replace(/[ \t]+([，。！？；：])/gu, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { text, sourceIds };
}

function providerHttpError(status: number): LanguageModelError {
  if (status === 401 || status === 403) {
    return new LanguageModelError(
      "LLM_PROVIDER_AUTHENTICATION_FAILED",
      "The language model provider rejected the server credential.",
      false,
    );
  }
  if (status === 429) {
    return new LanguageModelError(
      "LLM_PROVIDER_RATE_LIMITED",
      "The language model provider rate-limited the request.",
      true,
    );
  }
  if (status >= 500) {
    return new LanguageModelError(
      "LLM_PROVIDER_UNAVAILABLE",
      "The language model provider is temporarily unavailable.",
      true,
    );
  }
  return new LanguageModelError(
    "LLM_PROVIDER_REJECTED",
    "The language model provider rejected the request.",
    false,
  );
}

function invalidResponse(): LanguageModelError {
  return new LanguageModelError(
    "LLM_INVALID_RESPONSE",
    "The language model provider returned an invalid response.",
    false,
  );
}
