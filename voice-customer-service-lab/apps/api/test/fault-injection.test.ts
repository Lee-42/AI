import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { loadServerConfig } from "../src/core/config.js";
import { createDeferredGate, ScriptedAgentGateway } from "./support/scripted-agent-gateway.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("Agent fault injection", () => {
  it("recovers a timed-out Start with the same idempotency key and task identity", async () => {
    const gateway = new ScriptedAgentGateway({
      start: [
        { outcome: "error", code: "AGENT_PROVIDER_TIMEOUT" },
        { outcome: "success", providerRequestId: "provider-start-recovered" },
      ],
    });
    const app = createApp(gateway);
    const sessionId = await createSession(app, "fault-start-session");
    const request = {
      method: "POST" as const,
      url: `/api/v1/sessions/${sessionId}/agent`,
      headers: { "idempotency-key": "fault-stable-start-key" },
    };

    const timedOut = await app.inject(request);
    const recovered = await app.inject(request);

    expect(timedOut.statusCode).toBe(504);
    expect(timedOut.json().error).toMatchObject({
      code: "AGENT_PROVIDER_TIMEOUT",
      retryable: true,
    });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json()).toMatchObject({
      command_replayed: true,
      agent: { state: "dispatched", provider_request_id: "provider-start-recovered" },
    });
    expect(gateway.calls.start).toHaveLength(2);
    expect(gateway.calls.start[1]?.taskId).toBe(gateway.calls.start[0]?.taskId);
    expect(gateway.remainingSteps("start")).toBe(0);
  });

  it("retries an orphaned cleanup before ending the Session", async () => {
    const gateway = new ScriptedAgentGateway({
      stop: [
        { outcome: "error", code: "AGENT_PROVIDER_UNAVAILABLE" },
        { outcome: "success", providerRequestId: "provider-stop-recovered" },
      ],
    });
    const app = createApp(gateway);
    const sessionId = await createSession(app, "fault-stop-session");
    await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/agent`,
      headers: { "idempotency-key": "fault-start-before-stop" },
    });
    const closeRequest = {
      method: "DELETE" as const,
      url: `/api/v1/sessions/${sessionId}`,
      headers: { "idempotency-key": "fault-stable-close-key" },
    };

    const unavailable = await app.inject(closeRequest);
    const recovered = await app.inject(closeRequest);

    expect(unavailable.statusCode).toBe(502);
    expect(unavailable.json().error.retryable).toBe(true);
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json().session.state).toBe("ended");
    expect(gateway.calls.stop).toHaveLength(2);
    expect(gateway.calls.stop[1]?.taskId).toBe(gateway.calls.stop[0]?.taskId);
  });

  it("coalesces concurrent duplicate Start commands into one Provider call", async () => {
    const gate = createDeferredGate();
    const gateway = new ScriptedAgentGateway({
      start: [{ outcome: "success", gate: gate.wait }],
    });
    const app = createApp(gateway);
    const sessionId = await createSession(app, "fault-concurrent-session");
    const request = {
      method: "POST" as const,
      url: `/api/v1/sessions/${sessionId}/agent`,
      headers: { "idempotency-key": "fault-concurrent-start-key" },
    };

    const firstPending = app.inject(request);
    await gateway.waitForCallCount("start", 1);
    const duplicatePending = app.inject(request);
    gate.release();
    const [first, duplicate] = await Promise.all([firstPending, duplicatePending]);

    expect([first.statusCode, duplicate.statusCode].sort()).toEqual([200, 201]);
    expect(gateway.calls.start).toHaveLength(1);
    expect([first.json().command_replayed, duplicate.json().command_replayed].sort()).toEqual([
      false,
      true,
    ]);
  });
});

function createApp(agentGateway: ScriptedAgentGateway) {
  const app = buildApp(loadServerConfig({ APP_ENV: "test" }), { agentGateway });
  apps.push(app);
  return app;
}

async function createSession(
  app: ReturnType<typeof buildApp>,
  idempotencyKey: string,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    headers: { "idempotency-key": idempotencyKey },
    payload: { locale: "zh-CN" },
  });
  expect(response.statusCode).toBe(201);
  return response.json().session.session_id;
}
