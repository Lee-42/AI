import { describe, expect, it } from "vitest";

import {
  type ConversationMemorySnapshot,
  SessionConversationMemory,
} from "../src/ai/conversation-memory.js";
import { BasicSensitiveConversationDetector } from "../src/ai/sensitive-conversation-detector.js";

const literalLengthCounter = {
  name: "literal-length",
  count: (text: string) => text.length,
};

describe("session conversation memory", () => {
  it("evicts the oldest whole turn when the turn limit is exceeded", () => {
    const memory = createMemory({ maxCompletedTurns: 2, maxTokens: 1_000 });
    const scope = { tenantId: "tenant-a", sessionId: "session-a" };

    memory.recordCompletedTurn(scope, turn("一", "答一"));
    memory.recordCompletedTurn(scope, turn("二", "答二"));
    const result = memory.recordCompletedTurn(scope, turn("三", "答三"));

    expect(result.outcome).toBe("stored");
    expect(result.evictedBy).toEqual(["turn_limit"]);
    expect(result.snapshot.turns).toEqual([turn("二", "答二"), turn("三", "答三")]);
  });

  it("evicts oldest whole turns until the token budget fits", () => {
    const memory = createMemory({ maxCompletedTurns: 10, maxTokens: 42 });
    const scope = { tenantId: "tenant-a", sessionId: "session-a" };

    memory.recordCompletedTurn(scope, turn("一", "甲"));
    memory.recordCompletedTurn(scope, turn("二", "乙"));
    const result = memory.recordCompletedTurn(scope, turn("三", "丙"));

    expect(result.evictedBy).toEqual(["token_limit"]);
    expect(result.snapshot.turns).toEqual([turn("二", "乙"), turn("三", "丙")]);
    expect(result.snapshot.estimatedTokens).toBe(40);
  });

  it("rejects one oversized turn without mutating existing memory", () => {
    const memory = createMemory({ maxCompletedTurns: 2, maxTokens: 24 });
    const scope = { tenantId: "tenant-a", sessionId: "session-a" };
    memory.recordCompletedTurn(scope, turn("一", "甲"));
    const before = memory.read(scope);

    const result = memory.recordCompletedTurn(scope, turn("问题太长", "回答也太长"));

    expect(result).toEqual({
      outcome: "excluded_oversized",
      evictedBy: [],
      snapshot: before,
    });
    expect(memory.read(scope)).toEqual(before);
  });

  it("excludes the complete pair when either side contains sensitive data", () => {
    const memory = createMemory({ maxCompletedTurns: 3, maxTokens: 200 });
    const scope = { tenantId: "tenant-a", sessionId: "session-a" };

    const userSensitive = memory.recordCompletedTurn(
      scope,
      turn("验证码 123456", "请不要发送验证码"),
    );
    const assistantSensitive = memory.recordCompletedTurn(
      scope,
      turn("请继续", "登录密码: demo-secret"),
    );

    expect(userSensitive.outcome).toBe("excluded_sensitive");
    expect(assistantSensitive.outcome).toBe("excluded_sensitive");
    expect(memory.read(scope)).toEqual({ turns: [], estimatedTokens: 0 });
  });

  it("isolates the same session id by trusted tenant scope", () => {
    const memory = createMemory({ maxCompletedTurns: 3, maxTokens: 200 });
    const tenantA = { tenantId: "tenant-a", sessionId: "same-session" };
    const tenantB = { tenantId: "tenant-b", sessionId: "same-session" };

    memory.recordCompletedTurn(tenantA, turn("A 的问题", "A 的回答"));
    memory.recordCompletedTurn(tenantB, turn("B 的问题", "B 的回答"));

    expect(memory.read(tenantA).turns).toEqual([turn("A 的问题", "A 的回答")]);
    expect(memory.read(tenantB).turns).toEqual([turn("B 的问题", "B 的回答")]);
  });

  it("clears exactly one trusted session scope", () => {
    const memory = createMemory({ maxCompletedTurns: 3, maxTokens: 200 });
    const first = { tenantId: "tenant-a", sessionId: "session-1" };
    const second = { tenantId: "tenant-a", sessionId: "session-2" };
    memory.recordCompletedTurn(first, turn("一", "甲"));
    memory.recordCompletedTurn(second, turn("二", "乙"));

    memory.clear(first);

    expect(memory.read(first)).toEqual({ turns: [], estimatedTokens: 0 });
    expect(memory.read(second).turns).toEqual([turn("二", "乙")]);
  });

  it("copies caller-owned turns and returned snapshots", () => {
    const memory = createMemory({ maxCompletedTurns: 3, maxTokens: 200 });
    const scope = { tenantId: "tenant-a", sessionId: "session-a" };
    const input = {
      userText: "原问题",
      assistantText: "原回答",
      answerMode: "grounded_answer" as const,
    };

    const result = memory.recordCompletedTurn(scope, input);
    input.userText = "被调用方修改";
    const exposed = result.snapshot as {
      turns: Array<{ userText: string }>;
    } & ConversationMemorySnapshot;
    if (exposed.turns[0]) exposed.turns[0].userText = "修改快照";

    expect(memory.read(scope).turns).toEqual([turn("原问题", "原回答")]);
  });

  it("rejects blank trusted scopes and incomplete turns", () => {
    const memory = createMemory({ maxCompletedTurns: 3, maxTokens: 200 });

    expect(() =>
      memory.recordCompletedTurn({ tenantId: "", sessionId: "session-a" }, turn("问题", "回答")),
    ).toThrow(/tenantId/);
    expect(() =>
      memory.recordCompletedTurn(
        { tenantId: "tenant-a", sessionId: "session-a" },
        turn(" ", "回答"),
      ),
    ).toThrow(/userText/);
  });
});

describe("basic sensitive conversation detector", () => {
  it("returns categories without returning matched secret values", () => {
    const detector = new BasicSensitiveConversationDetector();
    const categories = detector.detect(
      "密码: demo-secret，验证码 123456，手机号 13800138000，卡号 6222021234567890，CVV 123",
    );

    expect(categories).toEqual([
      "password",
      "verification_code",
      "phone_number",
      "payment_card",
      "security_code",
    ]);
    expect(JSON.stringify(categories)).not.toContain("demo-secret");
    expect(JSON.stringify(categories)).not.toContain("13800138000");
  });
});

function createMemory(options: { maxCompletedTurns: number; maxTokens: number }) {
  return new SessionConversationMemory({
    ...options,
    tokenCounter: literalLengthCounter,
    sensitiveDetector: new BasicSensitiveConversationDetector(),
  });
}

function turn(userText: string, assistantText: string) {
  return { userText, assistantText, answerMode: "grounded_answer" as const };
}
