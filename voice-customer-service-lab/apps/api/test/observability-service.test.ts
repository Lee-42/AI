import { describe, expect, it } from "vitest";

import { ObservabilityService } from "../src/observability/observability-service.js";

describe("ObservabilityService", () => {
  it("calculates honest rolling SLOs and deduplicates browser observations", () => {
    let now = new Date("2026-08-03T08:00:00.000Z");
    const service = new ObservabilityService({ windowSeconds: 3_600, clock: () => now });

    service.recordHttp({
      operation: "createVoiceSession",
      method: "POST",
      statusCode: 201,
      durationSeconds: 0.12,
    });
    service.recordHttp({
      operation: "startVoiceAgent",
      method: "POST",
      statusCode: 503,
      durationSeconds: 2.5,
    });
    const observation = {
      observation_id: "obs_000001",
      sli: "turn_first_output" as const,
      source: "rtc" as const,
      outcome: "success" as const,
      duration_ms: 1_500,
    };
    expect(service.recordRealtime("ses_000001", observation).replayed).toBe(false);
    expect(service.recordRealtime("ses_000001", observation).replayed).toBe(true);
    service.recordRealtime("ses_000001", {
      ...observation,
      observation_id: "obs_000002",
      duration_ms: 2_500,
    });
    service.recordRealtime("ses_000001", {
      ...observation,
      observation_id: "obs_000003",
      outcome: "failure",
      duration_ms: null,
    });
    service.recordAgentCleanup({ provider: "mock", outcome: "success", durationMs: 40_000 });

    const snapshot = service.snapshot();
    expect(snapshot.sample_warning).toBe(true);
    expect(snapshot.indicators).toHaveLength(5);
    expect(findIndicator(snapshot, "control_plane_availability")).toMatchObject({
      eligible_events: 2,
      good_events: 1,
      achieved_ratio: 0.5,
      measurement_quality: "authoritative",
      status: "breached",
    });
    expect(findIndicator(snapshot, "turn_first_output")).toMatchObject({
      eligible_events: 3,
      good_events: 1,
      threshold_seconds: 2,
      measurement_quality: "proxy",
      status: "breached",
    });
    expect(findIndicator(snapshot, "barge_in_stop").status).toBe("no_data");
    expect(findIndicator(snapshot, "agent_cleanup").status).toBe("meeting");

    now = new Date("2026-08-03T09:00:01.000Z");
    expect(findIndicator(service.snapshot(), "turn_first_output").status).toBe("no_data");
  });

  it("exports low-cardinality Prometheus metrics without resource IDs", () => {
    const service = new ObservabilityService({ windowSeconds: 3_600 });
    service.recordHttp({
      operation: "createVoiceSession",
      method: "POST",
      statusCode: 201,
      durationSeconds: 0.08,
    });
    service.recordRealtime("ses_private_123", {
      observation_id: "obs_000004",
      sli: "rtc_join",
      source: "rtc",
      outcome: "success",
      duration_ms: 320,
    });

    const metrics = service.renderPrometheus();
    expect(metrics).toContain("voice_api_http_requests_total");
    expect(metrics).toContain('operation="createVoiceSession"');
    expect(metrics).toContain('sli="rtc_join"');
    expect(metrics).not.toContain("ses_private_123");
    expect(metrics).not.toMatch(/transcript|手机号/u);
  });
});

function findIndicator(
  snapshot: ReturnType<ObservabilityService["snapshot"]>,
  name: ReturnType<ObservabilityService["snapshot"]>["indicators"][number]["name"],
) {
  const indicator = snapshot.indicators.find((item) => item.name === name);
  if (!indicator) {
    throw new Error(`Missing SLO indicator: ${name}`);
  }
  return indicator;
}
