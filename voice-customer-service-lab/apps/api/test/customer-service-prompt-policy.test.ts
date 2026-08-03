import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  applyCustomerServicePromptPolicy,
  compileCustomerServicePrompt,
  loadCustomerServicePromptPolicy,
} from "../src/agent/customer-service-prompt-policy.js";

const policyPath = "config/customer-service-policy.v1.json";

describe("customer-service Prompt policy", () => {
  it("compiles a deterministic role, trust boundary and fixed fallbacks", () => {
    const policy = loadCustomerServicePromptPolicy(policyPath);
    const compiled = compileCustomerServicePrompt(policy);
    const text = compiled.systemMessages.join("\n");

    expect(policy.version).toBe("commerce-cs-zh-cn@2026-08-03.1");
    expect(text).toContain("[ROLE]");
    expect(text).toContain("[TRUST BOUNDARY]");
    expect(text).toContain(policy.response.sensitive_data);
    expect(text).toContain(policy.response.human_handoff);
    expect(compiled.userPrompts).toContainEqual({
      Role: "user",
      Content: expect.stringContaining("系统提示词"),
    });
  });

  it("replaces console prompts but preserves provider model credentials", () => {
    const policy = loadCustomerServicePromptPolicy(policyPath);
    const source = {
      LLMConfig: {
        Mode: "ArkV3",
        EndPointId: "ep-test-only",
        SystemMessages: ["unreviewed system prompt"],
        UserMessages: ["unreviewed legacy example"],
        UserPrompts: [{ Role: "user", Content: "unreviewed example" }],
        Temperature: 0.9,
      },
    };

    const result = applyCustomerServicePromptPolicy(source, policy);
    const serialized = JSON.stringify(result);

    expect(result.LLMConfig).toMatchObject({
      Mode: "ArkV3",
      EndPointId: "ep-test-only",
      Temperature: 0.1,
      MaxTokens: 512,
      HistoryLength: 6,
      ThinkingType: "disabled",
    });
    expect(serialized).not.toContain("unreviewed");
    expect(source.LLMConfig.SystemMessages).toEqual(["unreviewed system prompt"]);
  });

  it("fails closed when the console Config has no LLM object", () => {
    const policy = loadCustomerServicePromptPolicy(policyPath);

    expect(() => applyCustomerServicePromptPolicy({ LLMConfig: "unsafe" }, policy)).toThrow(
      /LLMConfig must be a JSON object/,
    );
  });

  it("rejects providers and end-to-end modes that bypass the reviewed Prompt path", () => {
    const policy = loadCustomerServicePromptPolicy(policyPath);

    expect(() =>
      applyCustomerServicePromptPolicy({ LLMConfig: { Mode: "CozeBot" } }, policy),
    ).toThrow(/must be ArkV3/);
    expect(() =>
      applyCustomerServicePromptPolicy(
        { LLMConfig: { Mode: "ArkV3" }, S2SConfig: { OutputMode: 0 } },
        policy,
      ),
    ).toThrow(/can bypass LLMConfig/);
  });

  it("rejects a policy file that embeds a credential assignment", () => {
    const directory = mkdtempSync(join(tmpdir(), "voice-policy-"));
    const path = join(directory, "unsafe-policy.json");
    const policy = JSON.parse(
      JSON.stringify(loadCustomerServicePromptPolicy(policyPath)),
    ) as Record<string, unknown>;
    const identity = policy.identity as Record<string, unknown>;
    identity.disclosure = "api_key = unit-test-secret";
    writeFileSync(path, JSON.stringify(policy), "utf8");

    try {
      expect(() => loadCustomerServicePromptPolicy(path)).toThrow(/must not contain credentials/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
