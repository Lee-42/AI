import {
  ApiErrorResponseSchema,
  ConversationEventSchema,
  CreateSessionResponseSchema,
  RtcCredentialsSchema,
  SessionSnapshotSchema,
  SessionStateSchema,
} from "@voice/contracts";
import { Check } from "typebox/value";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { loadServerConfig } from "../src/core/config.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("published HTTP contract", () => {
  it("keeps a successful Session response compatible with the shared schema", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      headers: { "idempotency-key": "contract-create-session" },
      payload: { locale: "zh-CN" },
    });

    expect(response.statusCode).toBe(201);
    expect(
      Check(
        {
          ConversationEvent: ConversationEventSchema,
          RtcCredentials: RtcCredentialsSchema,
          SessionSnapshot: SessionSnapshotSchema,
          SessionState: SessionStateSchema,
        },
        CreateSessionResponseSchema,
        response.json(),
      ),
    ).toBe(true);
  });

  it("keeps validation failures compatible with the shared error schema", async () => {
    const app = createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      payload: { locale: "zh-CN" },
    });

    expect(response.statusCode).toBe(400);
    expect(Check(ApiErrorResponseSchema, response.json())).toBe(true);
  });
});

function createApp() {
  const app = buildApp(loadServerConfig({ APP_ENV: "test" }));
  apps.push(app);
  return app;
}
