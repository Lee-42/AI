import assert from "node:assert/strict";
import test from "node:test";
import {
  DoubaoEmbeddingError,
  DoubaoTextEmbeddings,
  type EmbeddingRequestMetrics
} from "../src/embeddings/doubao-text-embeddings.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function successResponse(
  vectors: number[][],
  indexes = vectors.map((_, index) => index)
): Response {
  return jsonResponse({
    id: "request-id",
    object: "list",
    model: "test-embedding-model",
    data: vectors.map((embedding, position) => ({
      object: "embedding",
      index: indexes[position],
      embedding
    })),
    usage: {
      prompt_tokens: 5,
      total_tokens: 5
    }
  });
}

function multimodalSuccessResponse(vector: number[]): Response {
  return jsonResponse({
    id: "multimodal-request-id",
    object: "list",
    model: "doubao-embedding-vision-251215",
    data: {
      object: "embedding",
      embedding: vector
    },
    usage: {
      prompt_tokens: 3,
      total_tokens: 3
    }
  });
}

const baseOptions = {
  apiKey: "test-key",
  baseURL: "https://example.com/api/v3",
  model: "test-embedding-model",
  apiMode: "text",
  maxRetries: 0
} as const;

test("embeds documents and restores response index order", async () => {
  let requestedURL = "";
  let authorization = "";
  let metrics: EmbeddingRequestMetrics | undefined;
  const embeddings = new DoubaoTextEmbeddings({
    ...baseOptions,
    fetch: async (input, init) => {
      requestedURL = String(input);
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return successResponse(
        [
          [3, 4],
          [1, 2]
        ],
        [1, 0]
      );
    },
    onRequestComplete: (value) => {
      metrics = value;
    }
  });

  const vectors = await embeddings.embedDocuments(["first", "second"]);

  assert.deepEqual(vectors, [
    [1, 2],
    [3, 4]
  ]);
  assert.equal(requestedURL, "https://example.com/api/v3/embeddings");
  assert.equal(authorization, "Bearer test-key");
  assert.deepEqual(metrics, {
    requestId: "request-id",
    model: "test-embedding-model",
    inputCount: 2,
    promptTokens: 5,
    totalTokens: 5
  });
});

test("splits large input into configured batches", async () => {
  const batchSizes: number[] = [];
  const embeddings = new DoubaoTextEmbeddings({
    ...baseOptions,
    batchSize: 2,
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        input: string[];
      };
      batchSizes.push(body.input.length);
      return successResponse(body.input.map(() => [0.1, 0.2]));
    }
  });

  const vectors = await embeddings.embedDocuments(["a", "b", "c"]);

  assert.deepEqual(batchSizes, [2, 1]);
  assert.equal(vectors.length, 3);
});

test("retries a rate-limited request a finite number of times", async () => {
  let calls = 0;
  const embeddings = new DoubaoTextEmbeddings({
    ...baseOptions,
    maxRetries: 1,
    retryDelayMs: 0,
    fetch: async () => {
      calls += 1;

      if (calls === 1) {
        return jsonResponse(
          {
            error: {
              code: "RateLimitExceeded",
              message: "try again later"
            }
          },
          429
        );
      }

      return successResponse([[0.1, 0.2]]);
    }
  });

  const vector = await embeddings.embedQuery("hello");

  assert.deepEqual(vector, [0.1, 0.2]);
  assert.equal(calls, 2);
});

test("rejects malformed vectors", async () => {
  const embeddings = new DoubaoTextEmbeddings({
    ...baseOptions,
    fetch: async () =>
      jsonResponse({
        model: "test-embedding-model",
        data: [
          {
            index: 0,
            embedding: [0.1, "not-a-number"]
          }
        ]
      })
  });

  await assert.rejects(
    embeddings.embedQuery("hello"),
    (error: unknown) => {
      assert.equal(error instanceof DoubaoEmbeddingError, true);
      assert.match(
        (error as Error).message,
        /response validation failed/
      );
      return true;
    }
  );
});

test("rejects empty text before making a request", async () => {
  let calls = 0;
  const embeddings = new DoubaoTextEmbeddings({
    ...baseOptions,
    fetch: async () => {
      calls += 1;
      return successResponse([[0.1, 0.2]]);
    }
  });

  await assert.rejects(
    embeddings.embedQuery("  "),
    /input at index 0 must not be empty/
  );
  assert.equal(calls, 0);
});

test("embeds text through the current multimodal API", async () => {
  const requestBodies: unknown[] = [];
  const requestedURLs: string[] = [];
  const embeddings = new DoubaoTextEmbeddings({
    ...baseOptions,
    apiMode: "multimodal",
    fetch: async (input, init) => {
      requestedURLs.push(String(input));
      requestBodies.push(JSON.parse(String(init?.body)));
      return multimodalSuccessResponse([0.25, -0.5, 0.75]);
    }
  });

  const vectors = await embeddings.embedDocuments(["first", "second"]);

  assert.deepEqual(vectors, [
    [0.25, -0.5, 0.75],
    [0.25, -0.5, 0.75]
  ]);
  assert.deepEqual(requestedURLs, [
    "https://example.com/api/v3/embeddings/multimodal",
    "https://example.com/api/v3/embeddings/multimodal"
  ]);
  assert.deepEqual(requestBodies, [
    {
      model: "test-embedding-model",
      input: [{ type: "text", text: "first" }],
      encoding_format: "float"
    },
    {
      model: "test-embedding-model",
      input: [{ type: "text", text: "second" }],
      encoding_format: "float"
    }
  ]);
});
