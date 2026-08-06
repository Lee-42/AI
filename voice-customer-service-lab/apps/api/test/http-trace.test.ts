import { trace } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";

import { parseTraceparent, startHttpTrace } from "../src/observability/http-trace.js";

describe("W3C Trace Context", () => {
  it("keeps a valid incoming trace ID and creates a new server span ID", () => {
    const incoming = `00-${"1".repeat(32)}-${"2".repeat(16)}-01`;
    const context = startHttpTrace({
      tracer: trace.getTracer("test"),
      incomingTraceparent: incoming,
      operation: "createVoiceSession",
      method: "POST",
      route: "/api/v1/sessions",
      correlationId: "cor_000001",
      randomHex: (bytes) => (bytes === 8 ? "3".repeat(16) : "4".repeat(32)),
    });

    expect(context.traceId).toBe("1".repeat(32));
    expect(context.parentSpanId).toBe("2".repeat(16));
    expect(context.spanId).toBe("3".repeat(16));
    expect(context.traceparent).toBe(`00-${"1".repeat(32)}-${"3".repeat(16)}-01`);
  });

  it("rejects malformed, uppercase and all-zero IDs", () => {
    expect(parseTraceparent(`00-${"0".repeat(32)}-${"2".repeat(16)}-01`)).toBeNull();
    expect(parseTraceparent(`00-${"A".repeat(32)}-${"2".repeat(16)}-01`)).toBeNull();
    expect(parseTraceparent("not-a-traceparent")).toBeNull();
  });
});
