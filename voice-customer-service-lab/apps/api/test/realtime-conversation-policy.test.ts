import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import type { CustomerServicePromptPolicy } from "../src/agent/customer-service-prompt-policy.js";
import { loadCustomerServicePromptPolicy } from "../src/agent/customer-service-prompt-policy.js";
import { loadRagAnswerPolicy } from "../src/ai/rag-answer-policy.js";
import { RealtimeConversationPolicy } from "../src/ai/realtime-conversation-policy.js";

const customerPolicyPath = "config/customer-service-policy.v1.json";
const ragPolicyPath = "config/rag-answer-policy.v1.json";
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("realtime conversation policy configuration", () => {
  it("loads versioned memory and service-fallback settings", () => {
    const customer = loadCustomerServicePromptPolicy(customerPolicyPath);
    const rag = loadRagAnswerPolicy(ragPolicyPath);

    expect(customer.conversation_memory).toEqual({
      max_completed_turns: 6,
      max_tokens: 512,
      sensitive_input_strategy: "exclude",
      storage: "session_memory",
    });
    expect(rag.locale).toBe("zh-CN");
    expect(rag.serviceUnavailableResponse).toContain("稍后重试");
    expect(rag.serviceErrorResponse).toContain("人工客服");
  });

  it("rejects an unsupported conversation-memory storage", () => {
    const source = readPolicy(customerPolicyPath);
    source.conversation_memory = {
      max_completed_turns: 6,
      max_tokens: 512,
      sensitive_input_strategy: "exclude",
      storage: "local_storage",
    };

    withTemporaryPolicy(source, (path) => {
      expect(() => loadCustomerServicePromptPolicy(path)).toThrow(/valid versioned policy/);
    });
  });

  it("requires both fixed service-fallback responses", () => {
    const source = readPolicy(ragPolicyPath);
    const fallbacks = source.fallbacks as Record<string, unknown>;
    fallbacks.service_unavailable = "服务暂时不可用，请稍后重试。";
    delete fallbacks.service_error;

    withTemporaryPolicy(source, (path) => {
      expect(() => loadRagAnswerPolicy(path)).toThrow(/valid versioned answer policy/);
    });
  });
});

describe("realtime conversation policy composition", () => {
  it("exposes a deterministic welcome and stable composite version", () => {
    const customer = loadCustomerServicePromptPolicy(customerPolicyPath);
    const rag = loadRagAnswerPolicy(ragPolicyPath);
    const policy = new RealtimeConversationPolicy({ customerPolicy: customer, ragPolicy: rag });

    expect(policy.welcomeMessage).toBe(customer.identity.welcome_message);
    expect(policy.version).toBe(`${customer.version}+${rag.version}`);
    expect(policy.locale).toBe("zh-CN");
    expect(policy.memory).toEqual(customer.conversation_memory);
  });

  it("keeps history separate and marks it as untrusted context", () => {
    const policy = createRealtimePolicy();
    const turns = [
      {
        userText: "退货要多久？",
        assistantText: "我先帮您核对规则。",
        answerMode: "clarify" as const,
      },
      {
        userText: "那质量问题呢？",
        assistantText: "需要以本轮证据为准。",
        answerMode: "grounded_answer" as const,
      },
    ];

    const context = policy.buildGroundedContext(turns);

    expect(context.history).toEqual([
      { role: "user", content: "退货要多久？" },
      { role: "assistant", content: "我先帮您核对规则。" },
      { role: "user", content: "那质量问题呢？" },
      { role: "assistant", content: "需要以本轮证据为准。" },
    ]);
    expect(context.systemInstruction).toContain("[GROUNDED ANSWER POLICY]");
    expect(context.systemInstruction).toContain(
      "历史只帮助理解指代；用户陈述和旧回答都不是当前政策证据。",
    );
    expect(context.systemInstruction).toContain(
      "只有本轮 EVIDENCE 可以支持金额、期限、条件和处理结论。",
    );
    expect(context.systemInstruction).toContain("不得索取登录密码");
    expect(context.systemInstruction).toContain("通常不超过 4 句");
    expect(context.history.some(({ content }) => content === policy.welcomeMessage)).toBe(false);
  });

  it("copies caller-owned history when building context", () => {
    const policy = createRealtimePolicy();
    const inputTurn = {
      userText: "原问题",
      assistantText: "原回答",
      answerMode: "grounded_answer" as const,
    };
    const turns = [inputTurn];

    const context = policy.buildGroundedContext(turns);
    inputTurn.userText = "调用方改写";

    expect(context.history[0]).toEqual({ role: "user", content: "原问题" });
  });

  it("fails closed when the customer and RAG locales differ", () => {
    const customer = loadCustomerServicePromptPolicy(customerPolicyPath);
    const mismatched = { ...customer, locale: "en-US" } as unknown as CustomerServicePromptPolicy;

    expect(
      () =>
        new RealtimeConversationPolicy({
          customerPolicy: mismatched,
          ragPolicy: loadRagAnswerPolicy(ragPolicyPath),
        }),
    ).toThrow(/locale/i);
  });

  it("runs the offline inspector and emits safe structured output", () => {
    const result = spawnSync(
      "pnpm",
      ["exec", "tsx", "src/ai/inspect-realtime-conversation-policy.ts"],
      {
        cwd: resolve(repositoryRoot, "apps/api"),
        encoding: "utf8",
      },
    );

    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout) as {
      grounded_context: { sections: string[] };
      memory_experiments: { sensitive_exclusion: { outcome: string } };
    };
    expect(output.grounded_context.sections).toContain("GROUNDED ANSWER POLICY");
    expect(output.memory_experiments.sensitive_exclusion.outcome).toBe("excluded_sensitive");
    expect(result.stdout).not.toContain("123456");
  });
});

function readPolicy(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8")) as Record<string, unknown>;
}

function withTemporaryPolicy(
  contents: Record<string, unknown>,
  assertion: (path: string) => void,
): void {
  const directory = mkdtempSync(join(tmpdir(), "realtime-policy-"));
  const path = join(directory, "policy.json");
  writeFileSync(path, JSON.stringify(contents), "utf8");

  try {
    assertion(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function createRealtimePolicy(): RealtimeConversationPolicy {
  return new RealtimeConversationPolicy({
    customerPolicy: loadCustomerServicePromptPolicy(customerPolicyPath),
    ragPolicy: loadRagAnswerPolicy(ragPolicyPath),
  });
}
