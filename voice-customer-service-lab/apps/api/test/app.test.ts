import { afterEach, describe, expect, it } from "vitest";

import type { AgentGateway } from "../src/agent/agent-gateway.js";
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
    expect(schema.paths?.["/api/v1/sessions/{session_id}/mock-tool-calls"]?.post?.operationId).toBe(
      "invokeMockBusinessTool",
    );
    expect(schema.paths?.["/api/v1/sessions/{session_id}/ai/debug-turns"]?.post?.operationId).toBe(
      "createAiDebugTurn",
    );
    expect(
      schema.paths?.["/internal/provider-callbacks/volcengine/function-calls"]?.post?.operationId,
    ).toBe("receiveVolcengineFunctionCalls");
    expect(schema.paths?.["/api/v1/sessions/{session_id}/handoff"]?.post?.operationId).toBe(
      "requestHumanHandoff",
    );
    expect(
      schema.paths?.["/api/v1/sessions/{session_id}/realtime-observations"]?.post?.operationId,
    ).toBe("recordRealtimeSliObservation");
    expect(schema.paths?.["/internal/metrics"]?.get?.operationId).toBe("getPrometheusMetrics");
    expect(schema.paths?.["/internal/observability/slo"]?.get?.operationId).toBe(
      "getLocalSloSnapshot",
    );
  });

  it("propagates trace context and exposes privacy-safe local metrics and SLOs", async () => {
    const app = createTestApp();
    const incomingTraceparent = `00-${"1".repeat(32)}-${"2".repeat(16)}-01`;
    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      headers: {
        "idempotency-key": "test-observability-session",
        traceparent: incomingTraceparent,
      },
      payload: { locale: "zh-CN" },
    });
    const created = createdResponse.json();
    const responseTraceparent = createdResponse.headers.traceparent;
    expect(responseTraceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/u);
    expect(String(responseTraceparent).split("-")[1]).toBe("1".repeat(32));
    expect(createdResponse.headers["x-correlation-id"]).toMatch(/^cor_/u);

    const observation = {
      observation_id: "obs_http0001",
      sli: "turn_first_output",
      source: "rtc",
      outcome: "success",
      duration_ms: 1_250,
    };
    const observationUrl = `/api/v1/sessions/${created.session.session_id}/realtime-observations`;
    const accepted = await app.inject({
      method: "POST",
      url: observationUrl,
      payload: observation,
    });
    const replay = await app.inject({
      method: "POST",
      url: observationUrl,
      payload: observation,
    });
    const injectedTranscript = await app.inject({
      method: "POST",
      url: observationUrl,
      payload: { ...observation, observation_id: "obs_http0002", transcript: "禁止上传" },
    });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toEqual({ accepted: true, replayed: false });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().replayed).toBe(true);
    expect(injectedTranscript.statusCode).toBe(400);

    const slo = (await app.inject({ method: "GET", url: "/internal/observability/slo" })).json();
    expect(
      slo.indicators.find((indicator: { name: string }) => indicator.name === "turn_first_output"),
    ).toMatchObject({
      eligible_events: 1,
      good_events: 1,
      threshold_seconds: 2,
      measurement_quality: "proxy",
    });

    const metrics = await app.inject({ method: "GET", url: "/internal/metrics" });
    expect(metrics.headers["content-type"]).toContain("text/plain");
    expect(metrics.body).toContain("voice_api_http_requests_total");
    expect(metrics.body).toContain('operation="createVoiceSession"');
    expect(metrics.body).not.toContain(created.session.session_id);
    expect(metrics.body).not.toContain("禁止上传");
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
      headers: { "idempotency-key": "test-mock-turn-0001" },
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
      headers: { "idempotency-key": "test-session-end-0001" },
    });
    expect(endResponse.statusCode).toBe(200);
    expect(endResponse.json().session.state).toBe("ended");
    expect(endResponse.json().summary).toMatchObject({
      outcome: "completed",
      turn_count: 1,
      topics: ["order_status"],
      raw_audio_retained: false,
      transcript_retained: false,
    });
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
    const metrics = await app.inject({ method: "GET", url: "/internal/metrics" });

    expect(started.statusCode).toBe(201);
    expect(started.json().agent.state).toBe("dispatched");
    expect(started.json().agent.provider).toBe("mock");
    expect(started.json().agent.prompt_policy_version).toBe("commerce-cs-zh-cn@2026-08-03.1");
    expect(replay.statusCode).toBe(200);
    expect(replay.json().command_replayed).toBe(true);
    expect(stopped.statusCode).toBe(200);
    expect(stopped.json().agent).toMatchObject({
      task_id: started.json().agent.task_id,
      state: "stopped",
    });
    expect(metrics.body).toContain("voice_agent_cleanup_total");
    expect(metrics.body).toContain('outcome="success",provider="mock"');
  });

  it("queries only the current demo customer's order and replays by tool call ID", async () => {
    const app = createTestApp();
    const created = (
      await app.inject({
        method: "POST",
        url: "/api/v1/sessions",
        headers: { "idempotency-key": "test-tool-session" },
        payload: { locale: "zh-CN" },
      })
    ).json();
    const url = `/api/v1/sessions/${created.session.session_id}/mock-tool-calls`;
    const request = {
      method: "POST" as const,
      url,
      payload: {
        tool_call_id: "call_order_http_001",
        name: "get_order_status",
        arguments: { order_reference: "DEMO-1001" },
      },
    };

    const first = await app.inject(request);
    const replay = await app.inject(request);
    const otherCustomer = await app.inject({
      ...request,
      payload: {
        tool_call_id: "call_order_http_002",
        name: "get_order_status",
        arguments: { order_reference: "DEMO-9009" },
      },
    });
    const injectedCustomerId = await app.inject({
      ...request,
      payload: {
        tool_call_id: "call_order_http_003",
        name: "get_order_status",
        arguments: { order_reference: "DEMO-1001", customer_id: "another-customer" },
      },
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      replayed: false,
      result: { order_reference: "DEMO-1001", fulfillment_status: "shipped" },
    });
    expect(JSON.stringify(first.json())).not.toMatch(/address|phone/i);
    expect(replay.json().replayed).toBe(true);
    expect(otherCustomer.statusCode).toBe(404);
    expect(otherCustomer.json().error.code).toBe("ORDER_NOT_FOUND");
    expect(injectedCustomerId.statusCode).toBe(400);
    expect(injectedCustomerId.json().error.code).toBe("INVALID_REQUEST");
  });

  it("creates one honest handoff ticket and excludes raw transcript from the summary", async () => {
    const app = createTestApp();
    const created = (
      await app.inject({
        method: "POST",
        url: "/api/v1/sessions",
        headers: { "idempotency-key": "test-handoff-session" },
        payload: { locale: "zh-CN" },
      })
    ).json();
    await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${created.session.session_id}/mock-turns`,
      headers: { "idempotency-key": "test-handoff-turn" },
      payload: { text: "我的手机号是13800138000，我要转人工" },
    });
    const request = {
      method: "POST" as const,
      url: `/api/v1/sessions/${created.session.session_id}/handoff`,
      headers: { "idempotency-key": "test-handoff-request" },
      payload: { reason: "user_request" },
    };

    const first = await app.inject(request);
    const replay = await app.inject({
      ...request,
      headers: { "idempotency-key": "another-browser-retry-key" },
    });
    const changedReason = await app.inject({
      ...request,
      headers: { "idempotency-key": "changed-reason-key" },
      payload: { reason: "repeated_failure" },
    });
    const injectedTranscript = await app.inject({
      ...request,
      headers: { "idempotency-key": "invalid-handoff-body" },
      payload: { reason: "user_request", transcript: "不应由浏览器上传" },
    });

    expect(first.statusCode).toBe(201);
    expect(first.headers["cache-control"]).toBe("no-store");
    expect(first.json()).toMatchObject({
      session: { state: "ended" },
      handoff: {
        status: "recorded",
        human_connected: false,
        reason: "user_request",
      },
      summary: {
        outcome: "handoff_requested",
        turn_count: 1,
        topics: ["human_handoff"],
        sensitive_input_detected: true,
        raw_audio_retained: false,
        transcript_retained: false,
      },
      command_replayed: false,
    });
    expect(JSON.stringify(first.json())).not.toContain("13800138000");
    expect(replay.statusCode).toBe(200);
    expect(replay.json().handoff.ticket_id).toBe(first.json().handoff.ticket_id);
    expect(replay.json().command_replayed).toBe(true);
    expect(changedReason.statusCode).toBe(409);
    expect(changedReason.json().error.code).toBe("HANDOFF_ALREADY_REQUESTED");
    expect(injectedTranscript.statusCode).toBe(400);
  });

  it("authenticates a Volcengine callback and returns the result with our stored task identity", async () => {
    const toolResults: Array<{ taskId: string; toolCallId: string; content: string }> = [];
    const gateway: AgentGateway = {
      name: "volcengine",
      promptPolicyVersion: "test-policy@1",
      start: async () => ({ providerRequestId: "provider-start-001" }),
      stop: async () => ({ providerRequestId: "provider-stop-001" }),
      submitToolResult: async (command) => {
        toolResults.push(command);
        return { providerRequestId: "provider-tool-001" };
      },
    };
    const app = buildApp(createFunctionCallingConfig(), { agentGateway: gateway });
    apps.push(app);
    const created = (
      await app.inject({
        method: "POST",
        url: "/api/v1/sessions",
        headers: { "idempotency-key": "test-callback-session" },
        payload: { locale: "zh-CN" },
      })
    ).json();
    const started = (
      await app.inject({
        method: "POST",
        url: `/api/v1/sessions/${created.session.session_id}/agent`,
        headers: { "idempotency-key": "test-callback-agent" },
      })
    ).json();
    const callbackPayload = {
      Message: JSON.stringify([
        {
          id: "call_order_callback_001",
          type: "function",
          function: {
            name: "get_order_status",
            arguments: JSON.stringify({ order_reference: "DEMO-1001" }),
          },
        },
      ]),
      Signature: "unit-test-callback-secret",
      Type: "tool_calls",
      RoomID: created.session.room_id,
      // The provider callback TaskID is diagnostic metadata, not our StartVoiceChat task ID.
      TaskID: "provider-internal-task-id",
      TaskType: "voiceChat",
      AppId: "123456781234567812345678",
    };

    const first = await app.inject({
      method: "POST",
      url: "/internal/provider-callbacks/volcengine/function-calls",
      payload: callbackPayload,
    });
    const replay = await app.inject({
      method: "POST",
      url: "/internal/provider-callbacks/volcengine/function-calls",
      payload: callbackPayload,
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ accepted: true, tool_call_count: 1, replayed_count: 0 });
    expect(replay.json().replayed_count).toBe(1);
    expect(toolResults[0]).toMatchObject({
      taskId: started.agent.task_id,
      toolCallId: "call_order_callback_001",
    });
    expect(JSON.parse(toolResults[0]?.content ?? "{}")).toMatchObject({
      ok: true,
      result: { order_reference: "DEMO-1001" },
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

function createFunctionCallingConfig() {
  return loadServerConfig({
    APP_ENV: "test",
    VOICE_PROVIDER: "volcengine",
    VOLCENGINE_PAID_CALLS_ENABLED: "true",
    VOLCENGINE_FUNCTION_CALLING_ENABLED: "true",
    VOLCENGINE_FUNCTION_CALLBACK_URL:
      "https://voice.example.com/internal/provider-callbacks/volcengine/function-calls",
    VOLCENGINE_RTC_APP_ID: "123456781234567812345678",
    VOLCENGINE_RTC_APP_KEY: "unit-test-app-key",
    VOLCENGINE_ACCESS_KEY_ID: "unit-test-access-key",
    VOLCENGINE_SECRET_ACCESS_KEY: "unit-test-secret-key",
    VOLCENGINE_CALLBACK_SIGNING_SECRET: "unit-test-callback-secret",
  });
}
