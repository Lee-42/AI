import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createTracedDoubaoEmbedding,
  summarizeEmbeddingTraceInput,
  summarizeEmbeddingTraceOutput
} from "../src/observability/trace-doubao-embedding.js";

test("returns the complete vector when tracing is disabled", async () => {
  const tracedEmbedding = createTracedDoubaoEmbedding(
    async ({ text }) => ({
      vector: [0.1, 0.2, 0.3, 0.4, 0.5],
      model: `model-for-${text}`,
      totalTokens: 8
    }),
    { tracingEnabled: false }
  );

  const result = await tracedEmbedding({ text: "轻薄办公电脑" });

  assert.deepEqual(result.vector, [0.1, 0.2, 0.3, 0.4, 0.5]);
  assert.equal(result.model, "model-for-轻薄办公电脑");
});

test("trace summaries omit secrets and the complete vector", () => {
  const inputSummary = summarizeEmbeddingTraceInput({
    text: "轻薄办公电脑"
  });
  const outputSummary = summarizeEmbeddingTraceOutput({
    vector: [0.123456789, 0.2, 0.3, 0.4, 0.5],
    model: "doubao-embedding",
    totalTokens: 6
  });
  const serialized = JSON.stringify({ inputSummary, outputSummary });

  assert.deepEqual(inputSummary, {
    text: "轻薄办公电脑",
    characterCount: 6
  });
  assert.deepEqual(outputSummary, {
    model: "doubao-embedding",
    vectorDimension: 5,
    vectorPreview: [0.123457, 0.2, 0.3, 0.4],
    totalTokens: 6
  });
  assert.equal(serialized.includes("apiKey"), false);
  assert.equal(serialized.includes("Authorization"), false);
  assert.equal(serialized.includes("0.5"), false);
});

test("rejects empty input and invalid embedding output", async () => {
  const invalidInput = createTracedDoubaoEmbedding(
    async () => ({ vector: [1], model: "test-model" }),
    { tracingEnabled: false }
  );
  const invalidOutput = createTracedDoubaoEmbedding(
    async () => ({ vector: [Number.NaN], model: "test-model" }),
    { tracingEnabled: false }
  );

  await assert.rejects(
    invalidInput({ text: "  " }),
    /input text must not be empty/
  );
  await assert.rejects(
    invalidOutput({ text: "valid" }),
    /non-empty finite vector/
  );
});

test(".env.example never contains a LangSmith API key", async () => {
  const example = await readFile(
    new URL("../.env.example", import.meta.url),
    "utf8"
  );
  const keyLine = example
    .split(/\r?\n/u)
    .find((line) => line.startsWith("LANGSMITH_API_KEY="));
  const keyLength = keyLine?.slice("LANGSMITH_API_KEY=".length).length;

  // 只比较长度；即使失败，测试输出也不会泄露密钥内容。
  assert.equal(keyLength, 0);
});
