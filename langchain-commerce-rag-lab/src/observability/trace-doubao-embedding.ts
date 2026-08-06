import type { Client } from "langsmith";
import { traceable } from "langsmith/traceable";

export type DoubaoEmbeddingTraceInput = {
  text: string;
};

export type DoubaoEmbeddingTraceResult = {
  vector: number[];
  model: string;
  totalTokens?: number;
};

type CreateTracedEmbeddingOptions = {
  client?: Client;
  projectName?: string;
  tracingEnabled?: boolean;
};

type RunEmbedding = (
  input: DoubaoEmbeddingTraceInput
) => Promise<DoubaoEmbeddingTraceResult>;

export function summarizeEmbeddingTraceInput(
  input: Readonly<DoubaoEmbeddingTraceInput>
) {
  return {
    text: input.text,
    characterCount: input.text.length
  };
}

export function summarizeEmbeddingTraceOutput(
  output: Readonly<DoubaoEmbeddingTraceResult>
) {
  return {
    model: output.model,
    vectorDimension: output.vector.length,
    vectorPreview: output.vector.slice(0, 4).map((value) => {
      return Number(value.toFixed(6));
    }),
    ...(output.totalTokens === undefined
      ? {}
      : { totalTokens: output.totalTokens })
  };
}

function validateResult(
  result: DoubaoEmbeddingTraceResult
): DoubaoEmbeddingTraceResult {
  if (result.model.trim().length === 0) {
    throw new Error("Embedding trace result model must not be empty");
  }

  if (
    result.vector.length === 0 ||
    result.vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      "Embedding trace result must contain a non-empty finite vector"
    );
  }

  return result;
}

export function createTracedDoubaoEmbedding(
  runEmbedding: RunEmbedding,
  options: CreateTracedEmbeddingOptions = {}
) {
  return traceable(
    async (input: DoubaoEmbeddingTraceInput) => {
      if (input.text.trim().length === 0) {
        throw new Error("Embedding trace input text must not be empty");
      }

      return validateResult(await runEmbedding(input));
    },
    {
      name: "doubao-text-embedding",
      run_type: "embedding",
      client: options.client,
      project_name: options.projectName,
      tracingEnabled: options.tracingEnabled,
      tags: ["lesson-13-02", "volcengine", "embedding"],
      metadata: {
        provider: "volcengine-ark",
        lesson: "13-02",
        tracePayload: "summary"
      },
      // Trace 保留输入文本用于排错，但不接触请求头和 API Key。
      processInputs: summarizeEmbeddingTraceInput,
      // 调用方仍拿到完整向量，LangSmith 只接收下面的摘要。
      processOutputs: summarizeEmbeddingTraceOutput
    }
  );
}
