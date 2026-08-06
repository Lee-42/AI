import assert from "node:assert/strict";
import test from "node:test";
import {
  ChromaClient,
  CloudClient
} from "chromadb";
import { createChromaClient } from "../src/vectorstores/chroma-client.js";

const baseConnection = {
  url: "http://localhost:8000",
  apiKey: undefined,
  tenant: undefined,
  database: undefined,
  host: undefined
} as const;

test("creates a local Chroma client from CHROMA_URL", () => {
  const client = createChromaClient({
    ...baseConnection,
    mode: "local"
  });

  assert.equal(client instanceof ChromaClient, true);
  assert.equal(client instanceof CloudClient, false);
});

test("creates a cloud client only when cloud credentials are complete", () => {
  assert.throws(
    () =>
      createChromaClient({
        ...baseConnection,
        mode: "cloud"
      }),
    /CHROMA_API_KEY is required/
  );

  const client = createChromaClient({
    ...baseConnection,
    mode: "cloud",
    apiKey: "test-key",
    tenant: "test-tenant",
    database: "test-database",
    host: "https://api.trychroma.com"
  });

  assert.equal(client instanceof CloudClient, true);
});
