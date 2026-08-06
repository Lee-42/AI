import type { ConversationEvent, SessionSnapshot } from "@voice/contracts";
import { describe, expect, it } from "vitest";

import { SessionDataService } from "../src/session-data/session-data-service.js";

describe("SessionDataService", () => {
  it("deduplicates final turns and stores only structured privacy-safe facts", () => {
    const service = createService();
    const event = finalTranscript("evt_000001", "我的手机号是13800138000，请帮我查订单");

    service.registerSession(session);
    service.observeConversationEvents(session, [event, event]);
    const summary = service.finalize({ ...session, state: "ended" }, "completed");

    expect(summary).toMatchObject({
      turn_count: 1,
      topics: ["order_status"],
      sensitive_input_detected: true,
      raw_audio_retained: false,
      transcript_retained: false,
      generated_at: "2026-08-03T00:00:00.000Z",
      retention_expires_at: "2026-08-10T00:00:00.000Z",
    });
    expect(JSON.stringify(summary)).not.toContain("13800138000");
    expect(service.finalize(session, "handoff_requested")).toEqual(summary);
  });

  it("purges an expired summary according to the configured retention", () => {
    let now = new Date("2026-08-03T00:00:00.000Z");
    const service = new SessionDataService({
      retentionDays: 1,
      clock: () => now,
      idFactory: () => "sum_000001",
    });
    service.registerSession(session);
    service.finalize({ ...session, state: "ended" }, "completed");

    now = new Date("2026-08-04T00:00:00.001Z");
    expect(service.purgeExpired()).toBe(1);
    expect(service.purgeExpired()).toBe(0);
  });
});

function createService() {
  return new SessionDataService({
    retentionDays: 7,
    clock: () => new Date("2026-08-03T00:00:00.000Z"),
    idFactory: () => "sum_000001",
  });
}

function finalTranscript(eventId: string, text: string): ConversationEvent {
  return {
    schema_version: 1,
    event_id: eventId,
    session_id: session.session_id,
    producer: "mock_voice_provider",
    stream_id: "str_000001",
    sequence: 1,
    occurred_at: "2026-08-03T00:00:00.000Z",
    correlation_id: "cor_000001",
    event_type: "turn.user.transcript.final",
    round_id: "rnd_000001",
    response_id: null,
    payload: { text, language: "zh-CN" },
  };
}

const session: SessionSnapshot = {
  session_id: "ses_000001",
  room_id: "ses_000001",
  rtc_user_id: "usr_000001",
  provider: "mock",
  state: "active",
  revision: 1,
  created_at: "2026-08-03T00:00:00.000Z",
  expires_at: "2026-08-03T00:20:00.000Z",
};
