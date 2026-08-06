import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { loadServerConfig } from "../src/core/config.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("critical customer journey", () => {
  it("creates, serves and hands off one Mock voice session without a cloud call", async () => {
    const app = buildApp(loadServerConfig({ APP_ENV: "test" }));
    apps.push(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      headers: { "idempotency-key": "e2e-create-session" },
      payload: { locale: "zh-CN" },
    });
    const created = createResponse.json();
    expect(createResponse.statusCode).toBe(201);
    expect(created).toMatchObject({
      session: { provider: "mock", state: "active" },
      rtc_credentials: { kind: "mock" },
    });

    const sessionId = created.session.session_id as string;
    const started = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/agent`,
      headers: { "idempotency-key": "e2e-start-agent" },
    });
    expect(started.statusCode).toBe(201);

    const turn = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/mock-turns`,
      headers: { "idempotency-key": "e2e-rag-turn" },
      payload: { text: "普通商品多久可以申请退货？" },
    });
    expect(turn.statusCode).toBe(200);
    const assistantDelta = turn
      .json()
      .events.find(
        (event: { event_type: string }) => event.event_type === "turn.ai.transcript.delta",
      );
    expect(assistantDelta.payload.text_delta).toContain("七个自然日");
    expect(assistantDelta.round_id).toMatch(/^rnd_[a-f0-9]{32}$/u);
    expect(turn.json().events.at(-1)?.event_type).toBe("turn.ai.response.completed");

    const tool = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/mock-tool-calls`,
      payload: {
        tool_call_id: "call_e2e_order_tool",
        name: "get_order_status",
        arguments: { order_reference: "DEMO-1001" },
      },
    });
    expect(tool.statusCode).toBe(200);
    expect(tool.json().result.fulfillment_status).toBe("shipped");

    const handoff = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/handoff`,
      headers: { "idempotency-key": "e2e-handoff" },
      payload: { reason: "user_request" },
    });
    const handedOff = handoff.json();
    expect(handoff.statusCode).toBe(201);
    expect(handedOff).toMatchObject({
      session: { state: "ended" },
      handoff: { human_connected: false, status: "recorded" },
      summary: {
        outcome: "handoff_requested",
        raw_audio_retained: false,
        transcript_retained: false,
      },
    });
  });
});
