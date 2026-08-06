import { describe, expect, it } from "vitest";

import { AgentLifecycleService } from "../src/agent/agent-lifecycle-service.js";
import { MockAgentGateway } from "../src/agent/mock-agent-gateway.js";
import { MockVoiceAgentProvider } from "../src/providers/mock-voice-agent-provider.js";
import type {
  CreateVoiceSessionCommand,
  EndVoiceSessionCommand,
  VoiceAgentProvider,
} from "../src/providers/voice-agent-provider.js";
import { SessionClosureService } from "../src/session-data/session-closure-service.js";
import { SessionDataService } from "../src/session-data/session-data-service.js";

describe("SessionClosureService RAG cleanup", () => {
  it("cleans the exact Session after a successful normal close", async () => {
    const fixture = await createFixture();

    await fixture.closure.endSession(closeCommand(fixture.sessionId));

    expect(fixture.cleaned).toEqual([fixture.sessionId]);
    expect(fixture.stateObservedDuringCleanup).toEqual(["ended"]);
  });

  it("uses the same post-close cleanup for a handoff", async () => {
    const fixture = await createFixture();

    await fixture.closure.requestHandoff({
      ...closeCommand(fixture.sessionId),
      reason: "user_request",
    });

    expect(fixture.cleaned).toEqual([fixture.sessionId]);
    expect(fixture.stateObservedDuringCleanup).toEqual(["ended"]);
  });

  it("does not clear RAG state when Provider closure fails", async () => {
    const fixture = await createFixture({ failProviderEnd: true });

    await expect(fixture.closure.endSession(closeCommand(fixture.sessionId))).rejects.toThrow(
      "provider close failed",
    );

    expect(fixture.cleaned).toEqual([]);
  });
});

async function createFixture(options: { readonly failProviderEnd?: boolean } = {}) {
  const realProvider = new MockVoiceAgentProvider({
    sessionTtlSeconds: 1_200,
    welcomeMessage: "您好，我是测试 AI 客服。",
  });
  const created = await realProvider.createSession({
    body: { locale: "zh-CN" },
    idempotencyKey: "closure-create-key",
    correlationId: "cor_closure_create",
  });
  const provider: VoiceAgentProvider = options.failProviderEnd
    ? new FailingEndProvider(realProvider)
    : realProvider;
  const sessionData = new SessionDataService({ retentionDays: 7 });
  sessionData.registerSession(created.session);
  const agentLifecycle = new AgentLifecycleService({
    gateway: new MockAgentGateway("test-policy@1"),
    resolveSession: (sessionId) => provider.getSession(sessionId),
    maxSessionSeconds: 900,
  });
  const cleaned: string[] = [];
  const stateObservedDuringCleanup: string[] = [];
  const closure = new SessionClosureService({
    provider,
    agentLifecycle,
    sessionData,
    retentionDays: 7,
    onSessionClosed: (sessionId) => {
      cleaned.push(sessionId);
      stateObservedDuringCleanup.push(provider.getSession(sessionId).state);
    },
  });

  return {
    closure,
    cleaned,
    stateObservedDuringCleanup,
    sessionId: created.session.session_id,
  };
}

function closeCommand(sessionId: string) {
  return {
    sessionId,
    idempotencyKey: "closure-command-key",
    correlationId: "cor_closure_command",
  };
}

class FailingEndProvider implements VoiceAgentProvider {
  readonly name = "mock" as const;
  readonly #delegate: MockVoiceAgentProvider;

  constructor(delegate: MockVoiceAgentProvider) {
    this.#delegate = delegate;
  }

  createSession(command: CreateVoiceSessionCommand) {
    return this.#delegate.createSession(command);
  }

  getSession(sessionId: string) {
    return this.#delegate.getSession(sessionId);
  }

  async endSession(_command: EndVoiceSessionCommand): Promise<never> {
    throw new Error("provider close failed");
  }
}
