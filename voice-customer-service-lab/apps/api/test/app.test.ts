import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { loadServerConfig } from "../src/core/config.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("HTTP contracts", () => {
  it("returns the health contract", async () => {
    const app = createTestApp();
    const response = await app.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns only allow-listed public configuration", async () => {
    const app = createTestApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/config" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["api_version", "environment", "max_session_seconds"]);
    expect(JSON.stringify(body)).not.toMatch(/app.key|access.key|secret|token/i);
  });

  it("keeps stable OpenAPI operation IDs", async () => {
    const app = createTestApp();
    await app.ready();
    const schema = app.swagger();

    expect(schema.paths?.["/healthz"]?.get?.operationId).toBe("getHealth");
    expect(schema.paths?.["/api/v1/config"]?.get?.operationId).toBe("getPublicRuntimeConfig");
  });
});

function createTestApp() {
  const app = buildApp(loadServerConfig({ APP_ENV: "test" }));
  apps.push(app);
  return app;
}
