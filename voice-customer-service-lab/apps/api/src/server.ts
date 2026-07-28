import { loadEnvFile } from "node:process";

import { buildApp } from "./app.js";
import { loadServerConfig, safeConfigSummary } from "./core/config.js";

try {
  loadEnvFile(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

const config = loadServerConfig();
const app = buildApp(config, { logger: true });

app.log.info({ config: safeConfigSummary(config) }, "validated server configuration");

await app.listen({
  host: config.apiHost,
  port: config.apiPort,
});
