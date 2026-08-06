import { describe, expect, it, vi } from "vitest";

import { SecretValue } from "../src/core/secret-value.js";
import { VolcengineTextEmbeddingProvider } from "../src/knowledge/volcengine-text-embedding-provider.js";

describe("VolcengineTextEmbeddingProvider", () => {
  it("maps text requests and validates vector dimensions", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ model: "seed-embedding", data: { embedding: [0.1, 0.2, 0.3, 0.4] } }),
    );
    const provider = createProvider(fetchImpl);

    const batch = await provider.embedDocuments(["退货规则", "配送规则"]);

    expect(batch).toMatchObject({ model: "ep-unit-test-embedding", dimension: 4 });
    expect(batch.vectors).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer unit-test-ark-key" });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "ep-unit-test-embedding",
      input: [{ type: "text", text: "退货规则" }],
      encoding_format: "float",
    });
  });

  it("rejects malformed responses without exposing response bodies", async () => {
    const provider = createProvider(
      vi.fn<typeof fetch>(
        async () => new Response('{"secret":"unit-test-provider-secret"}', { status: 500 }),
      ),
    );

    await expect(provider.embedDocuments(["退货规则"])).rejects.toSatisfy((error: Error) => {
      expect(error.message).toContain("HTTP 500");
      expect(error.message).not.toContain("unit-test-provider-secret");
      return true;
    });
  });
});

function createProvider(fetchImpl: typeof fetch): VolcengineTextEmbeddingProvider {
  return new VolcengineTextEmbeddingProvider({
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "ep-unit-test-embedding",
    dimension: 4,
    apiKey: new SecretValue("unit-test-ark-key"),
    timeoutMs: 5_000,
    fetchImpl,
  });
}
