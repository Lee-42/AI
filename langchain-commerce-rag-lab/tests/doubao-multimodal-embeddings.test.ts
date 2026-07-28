import assert from "node:assert/strict";
import test from "node:test";
import { DoubaoMultimodalEmbeddings } from "../src/embeddings/doubao-multimodal-embeddings.js";

function successResponse(
  vector: number[],
  model = "doubao-embedding-vision-test"
): Response {
  return Response.json({
    id: "request-id",
    model,
    data: {
      embedding: vector
    },
    usage: {
      prompt_tokens: 12,
      total_tokens: 12
    }
  });
}

test("embeds images and text through the same multimodal endpoint", async () => {
  const requests: Array<{
    url: string;
    body: Record<string, unknown>;
  }> = [];
  const inputTypes: string[] = [];
  const embeddings = new DoubaoMultimodalEmbeddings({
    apiKey: "test-key",
    baseURL: "https://example.com/api/v3",
    model: "test-model",
    fetch: async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>
      });
      return successResponse([0.25, -0.5, 0.75]);
    },
    imageFetch: async () => {
      return new Response(Uint8Array.from([255, 216, 255, 217]), {
        headers: {
          "content-type": "image/jpeg"
        }
      });
    },
    onRequestComplete: (metrics) => {
      inputTypes.push(metrics.inputType);
    }
  });

  const imageVector = await embeddings.embedImage(
    "https://example.com/laptop.jpg"
  );
  const textVector = await embeddings.embedText("银色轻薄笔记本");

  assert.deepEqual(imageVector, [0.25, -0.5, 0.75]);
  assert.deepEqual(textVector, [0.25, -0.5, 0.75]);
  assert.deepEqual(inputTypes, ["image", "text"]);
  assert.equal(
    requests[0]?.url,
    "https://example.com/api/v3/embeddings/multimodal"
  );
  assert.equal(requests[1]?.url, requests[0]?.url);
  const imageBody = requests[0]?.body as {
    input?: Array<{
      image_url?: {
        url?: string;
      };
    }>;
  };
  assert.match(
    imageBody.input?.[0]?.image_url?.url ?? "",
    /^data:image\/jpeg;base64,/
  );
  assert.equal(requests[0]?.body.model, "test-model");
  assert.equal(requests[0]?.body.encoding_format, "float");
  assert.deepEqual(requests[1]?.body, {
    model: "test-model",
    input: [
      {
        type: "text",
        text: "银色轻薄笔记本"
      }
    ],
    encoding_format: "float"
  });
});

test("rejects invalid multimodal inputs before making a request", async () => {
  let requestCount = 0;
  const embeddings = new DoubaoMultimodalEmbeddings({
    apiKey: "test-key",
    baseURL: "https://example.com/api/v3",
    model: "test-model",
    fetch: async () => {
      requestCount += 1;
      return successResponse([1, 0]);
    },
    imageFetch: async () => {
      requestCount += 1;
      return new Response(Uint8Array.from([1]), {
        headers: {
          "content-type": "image/jpeg"
        }
      });
    }
  });

  await assert.rejects(embeddings.embedText("  "), /must not be empty/);
  await assert.rejects(
    embeddings.embedImage("file:///tmp/laptop.jpg"),
    /must use http or https/
  );
  assert.equal(requestCount, 0);
});

test("rejects a dimension change between image and text vectors", async () => {
  let requestCount = 0;
  const embeddings = new DoubaoMultimodalEmbeddings({
    apiKey: "test-key",
    baseURL: "https://example.com/api/v3",
    model: "test-model",
    fetch: async () => {
      requestCount += 1;
      return successResponse(
        requestCount === 1 ? [1, 0, 0] : [1, 0]
      );
    },
    imageFetch: async () => {
      return new Response(Uint8Array.from([1]), {
        headers: {
          "content-type": "image/jpeg"
        }
      });
    }
  });

  await embeddings.embedImage("https://example.com/laptop.jpg");
  await assert.rejects(
    embeddings.embedText("笔记本"),
    /dimension changed from 3 to 2/
  );
});

test("does not expose Base64 image data in remote errors", async () => {
  const embeddings = new DoubaoMultimodalEmbeddings({
    apiKey: "test-key",
    baseURL: "https://example.com/api/v3",
    model: "test-model",
    fetch: async () => {
      return Response.json(
        {
          error: {
            code: "InvalidImage",
            message:
              "Rejected url data:image/jpeg;base64,/9j/secret-image-bytes"
          }
        },
        { status: 400 }
      );
    },
    imageFetch: async () => {
      return new Response(Uint8Array.from([255, 216, 255, 217]), {
        headers: {
          "content-type": "image/jpeg"
        }
      });
    }
  });

  await assert.rejects(
    embeddings.embedImage("https://example.com/laptop.jpg"),
    (error: Error) => {
      assert.match(error.message, /embedded image payload/);
      assert.doesNotMatch(error.message, /secret-image-bytes/);
      return true;
    }
  );
});
