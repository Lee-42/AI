import {
  ChromaClient,
  CloudClient
} from "chromadb";
import { config } from "../config.js";

export type ChromaConnectionConfig = typeof config.chroma;

function requireCloudValue(
  value: string | undefined,
  environmentVariable: string
): string {
  if (!value) {
    throw new Error(
      `${environmentVariable} is required when CHROMA_MODE=cloud`
    );
  }

  return value;
}

function normalizeCloudHost(host: string | undefined): string | undefined {
  if (!host) {
    return undefined;
  }

  return host.includes("://") ? new URL(host).hostname : host;
}

export function createChromaClient(
  connection: ChromaConnectionConfig = config.chroma
): ChromaClient {
  if (connection.mode === "cloud") {
    const host = normalizeCloudHost(connection.host);

    return new CloudClient({
      apiKey: requireCloudValue(
        connection.apiKey,
        "CHROMA_API_KEY"
      ),
      tenant: requireCloudValue(
        connection.tenant,
        "CHROMA_TENANT"
      ),
      database: requireCloudValue(
        connection.database,
        "CHROMA_DATABASE"
      ),
      ...(host ? { host } : {})
    });
  }

  const url = new URL(connection.url);

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("CHROMA_URL must not contain a path, query, or hash");
  }

  return new ChromaClient({
    host: url.hostname,
    port: url.port
      ? Number(url.port)
      : url.protocol === "https:"
        ? 443
        : 80,
    ssl: url.protocol === "https:"
  });
}
