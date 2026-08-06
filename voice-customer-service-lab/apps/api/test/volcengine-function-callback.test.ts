import { describe, expect, it } from "vitest";

import {
  parseVolcengineToolCalls,
  verifyVolcengineCallback,
} from "../src/business-tools/volcengine-function-callback.js";
import { SecretValue } from "../src/core/secret-value.js";

describe("Volcengine Function Calling callback", () => {
  it("parses the provider's two JSON encoding layers", () => {
    const message = JSON.stringify([
      {
        id: "call_order_001",
        type: "function",
        function: {
          name: "get_order_status",
          arguments: JSON.stringify({ order_reference: "DEMO-1001" }),
        },
      },
    ]);

    expect(parseVolcengineToolCalls(message)).toEqual([
      {
        id: "call_order_001",
        name: "get_order_status",
        arguments: { order_reference: "DEMO-1001" },
      },
    ]);
  });

  it("fails closed for malformed messages and mismatched callback identity", () => {
    expect(() => parseVolcengineToolCalls("not-json")).toThrowError(
      expect.objectContaining({ code: "INVALID_PROVIDER_TOOL_MESSAGE" }),
    );
    expect(() =>
      verifyVolcengineCallback(
        "wrong-secret",
        "123456781234567812345678",
        new SecretValue("expected-secret"),
        "123456781234567812345678",
      ),
    ).toThrowError(expect.objectContaining({ code: "FUNCTION_CALLBACK_UNAUTHORIZED" }));
  });
});
