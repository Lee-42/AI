import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { buildApp } from "./app.js";
import { loadServerConfig } from "./core/config.js";

const app = buildApp(loadServerConfig({ APP_ENV: "test" }));
await app.ready();

const output = fileURLToPath(
  new URL("../../../packages/contracts/openapi/voice-api.v1.json", import.meta.url),
);
await writeFile(output, `${JSON.stringify(sortKeys(app.swagger()), null, 2)}\n`, "utf8");
await app.close();

console.log("wrote packages/contracts/openapi/voice-api.v1.json");

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortKeys(child)]),
    );
  }
  return value;
}
