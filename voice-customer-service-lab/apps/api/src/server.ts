import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { buildApp } from "./app.js";
import { loadServerConfig, safeConfigSummary } from "./core/config.js";
import { startOpenTelemetry } from "./observability/open-telemetry-runtime.js";

try {
  // pnpm runs this script from apps/api, so resolve the Monorepo root explicitly.
  loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const config = loadServerConfig();
const telemetry = startOpenTelemetry(config);
const app = buildApp(config, { logger: true, tracer: telemetry.tracer });

app.addHook("onClose", async () => telemetry.shutdown());

app.log.info(
  { config: safeConfigSummary(config), otlpTraceExportConfigured: telemetry.configured },
  "validated server configuration",
);

await app.listen({
  host: config.apiHost,
  port: config.apiPort,
});
