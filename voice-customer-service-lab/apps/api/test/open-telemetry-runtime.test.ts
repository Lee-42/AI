import { describe, expect, it } from "vitest";

import { parseOtlpHeaders } from "../src/observability/open-telemetry-runtime.js";

describe("OTLP configuration", () => {
  it("parses encoded exporter headers without logging them", () => {
    expect(parseOtlpHeaders("Authorization=Bearer%20test,X-Tenant=demo")).toEqual({
      Authorization: "Bearer test",
      "X-Tenant": "demo",
    });
  });

  it("rejects malformed exporter headers", () => {
    expect(() => parseOtlpHeaders("missing-separator")).toThrow(/key=value/);
    expect(() => parseOtlpHeaders("Authorization=")).toThrow(/invalid header/);
  });
});
