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
    expect(schema.paths?.["/api/v1/sessions"]?.post?.operationId).toBe("createVoiceSession");
    expect(schema.paths?.["/api/v1/sessions/{session_id}"]?.delete?.operationId).toBe(
      "endVoiceSession",
    );
    expect(schema.paths?.["/api/v1/sessions/{session_id}/mock-turns"]?.post?.operationId).toBe(
      "submitMockVoiceTurn",
    );
    expect(schema.paths?.["/api/v1/sessions/{session_id}/agent"]?.post?.operationId).toBe(
      "startVoiceAgent",
    );
    expect(schema.paths?.["/api/v1/sessions/{session_id}/agent"]?.delete?.operationId).toBe(
      "stopVoiceAgent",
    );
  });

  it("runs a complete mock session without cloud credentials", async () => {
    const app = createTestApp();
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      headers: { "idempotency-key": "test-create-0001" },
      payload: { locale: "zh-CN" },
    });
    const created = createResponse.json();

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.headers["cache-control"]).toBe("no-store");
    expect(created.session.provider).toBe("mock");
    expect(created.session.state).toBe("active");
    expect(created.session.room_id).toBe(created.session.session_id);
    expect(created.session.rtc_user_id).toMatch(/^usr_/);
    expect(created.rtc_credentials).toMatchObject({
      kind: "mock",
      app_id: "mock",
      room_id: created.session.room_id,
      user_id: created.session.rtc_user_id,
      expires_at: created.session.expires_at,
    });
    expect(created.rtc_credentials.token).toMatch(/^mock\./);
    expect(created.events.map((event: { event_type: string }) => event.event_type)).toEqual([
      "session.created",
      "rtc.join.succeeded",
      "agent.start.succeeded",
      "session.ready",
    ]);

    const turnResponse = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${created.session.session_id}/mock-turns`,
      payload: { text: "我的模拟订单什么时候到？" },
    });
    const turn = turnResponse.json();

    expect(turnResponse.statusCode).toBe(200);
    expect(turn.events.map((event: { sequence: number }) => event.sequence)).toEqual([
      5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(JSON.stringify(turn.events)).toContain("DEMO-1001");

    const endResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/sessions/${created.session.session_id}`,
    });
    expect(endResponse.statusCode).toBe(200);
    expect(endResponse.json().session.state).toBe("ended");
  });

  it("replays resource creation while rotating the short-lived credential", async () => {
    const app = createTestApp();
    const request = {
      method: "POST" as const,
      url: "/api/v1/sessions",
      headers: { "idempotency-key": "test-create-replay" },
      payload: { locale: "zh-CN" },
    };

    const first = await app.inject(request);
    const replay = await app.inject(request);

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().session.session_id).toBe(first.json().session.session_id);
    expect(replay.json().command_replayed).toBe(true);
    expect(replay.json().rtc_credentials.token).not.toBe(first.json().rtc_credentials.token);
  });

  it("starts and stops one Agent idempotently without a cloud call", async () => {
    const app = createTestApp();
    const created = (
      await app.inject({
        method: "POST",
        url: "/api/v1/sessions",
        headers: { "idempotency-key": "test-agent-session" },
        payload: { locale: "zh-CN" },
      })
    ).json();
    const request = {
      method: "POST" as const,
      url: `/api/v1/sessions/${created.session.session_id}/agent`,
      headers: { "idempotency-key": "test-agent-start" },
    };

    const started = await app.inject(request);
    const replay = await app.inject(request);
    const stopped = await app.inject({
      method: "DELETE",
      url: request.url,
      headers: { "idempotency-key": "test-agent-stop" },
    });

    expect(started.statusCode).toBe(201);
    expect(started.json().agent.state).toBe("dispatched");
    expect(started.json().agent.provider).toBe("mock");
    expect(replay.statusCode).toBe(200);
    expect(replay.json().command_replayed).toBe(true);
    expect(stopped.statusCode).toBe(200);
    expect(stopped.json().agent).toMatchObject({
      task_id: started.json().agent.task_id,
      state: "stopped",
    });
  });

  it("rejects requests that do not match the session contract", async () => {
    const app = createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      payload: { locale: "zh-CN" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_REQUEST");
  });

  it("allows both local Web origins and the DELETE session command", async () => {
    const app = createTestApp();

    for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173"]) {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/v1/sessions/ses_000001",
        headers: {
          origin,
          "access-control-request-method": "DELETE",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
      expect(response.headers["access-control-allow-methods"]).toContain("DELETE");
    }
  });
});

function createTestApp() {
  const app = buildApp(loadServerConfig({ APP_ENV: "test" }));
  apps.push(app);
  return app;
}
