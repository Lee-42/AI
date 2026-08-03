import type { SessionSnapshot } from "@voice/contracts";
import { describe, expect, it } from "vitest";
import type {
  AgentGateway,
  StartAgentGatewayCommand,
  StopAgentGatewayCommand,
  SubmitToolResultGatewayCommand,
} from "../src/agent/agent-gateway.js";
import { AgentGatewayError } from "../src/agent/agent-gateway.js";
import { AgentLifecycleService } from "../src/agent/agent-lifecycle-service.js";

describe("AgentLifecycleService", () => {
  it("starts once and stops with the exact same cloud identity", async () => {
    const gateway = new RecordingGateway();
    const service = createService(gateway);
    const startCommand = {
      sessionId: session.session_id,
      idempotencyKey: "start-agent-0001",
      correlationId: "cor_000001",
    };

    const started = await service.start(startCommand);
    const replay = await service.start(startCommand);
    const stopped = await service.stop({
      sessionId: session.session_id,
      idempotencyKey: "stop-agent-0001",
      correlationId: "cor_000002",
    });

    expect(started.agent.state).toBe("dispatched");
    expect(replay.command_replayed).toBe(true);
    expect(gateway.starts).toHaveLength(1);
    expect(gateway.stops).toHaveLength(1);
    expect(gateway.stops[0]).toMatchObject({
      roomId: session.room_id,
      taskId: started.agent.task_id,
    });
    expect(stopped.agent.state).toBe("stopped");
  });

  it("uses the hard deadline to reap an Agent and makes repeated cleanup harmless", async () => {
    let now = new Date("2026-07-29T00:00:00.000Z");
    const gateway = new RecordingGateway();
    const service = createService(gateway, () => now);
    const started = await service.start({
      sessionId: session.session_id,
      idempotencyKey: "start-agent-reaper",
      correlationId: "cor_000001",
    });

    now = new Date("2026-07-29T00:01:01.000Z");
    const first = await service.reapExpired();
    const replay = await service.reapExpired();

    expect(started.agent.deadline_at).toBe("2026-07-29T00:01:00.000Z");
    expect(first).toEqual({ inspected: 1, stopped: 1, orphaned: 0 });
    expect(replay).toEqual({ inspected: 0, stopped: 0, orphaned: 0 });
    expect(gateway.stops).toHaveLength(1);
  });

  it("marks a failed cleanup as orphaned and retries it on the next sweep", async () => {
    let now = new Date("2026-07-29T00:00:00.000Z");
    const gateway = new RecordingGateway();
    gateway.stopFailuresRemaining = 1;
    const service = createService(gateway, () => now);
    await service.start({
      sessionId: session.session_id,
      idempotencyKey: "start-agent-orphan",
      correlationId: "cor_000001",
    });

    now = new Date("2026-07-29T00:01:01.000Z");
    const failedSweep = await service.reapExpired();
    const recoveredSweep = await service.reapExpired();

    expect(failedSweep).toEqual({ inspected: 1, stopped: 0, orphaned: 1 });
    expect(recoveredSweep).toEqual({ inspected: 1, stopped: 1, orphaned: 0 });
    expect(gateway.stops).toHaveLength(2);
  });

  it("retries only a retryable failed Start with the original key", async () => {
    const retryableGateway = new RecordingGateway();
    retryableGateway.startFailuresRemaining = 1;
    retryableGateway.startFailureRetryable = true;
    const retryableService = createService(retryableGateway);
    const command = {
      sessionId: session.session_id,
      idempotencyKey: "start-retryable-key",
      correlationId: "cor_000001",
    };

    await expect(retryableService.start(command)).rejects.toMatchObject({ retryable: true });
    const recovered = await retryableService.start(command);

    expect(recovered.command_replayed).toBe(true);
    expect(retryableGateway.starts).toHaveLength(2);
    expect(retryableGateway.starts[1]?.taskId).toBe(retryableGateway.starts[0]?.taskId);

    const rejectedGateway = new RecordingGateway();
    rejectedGateway.startFailuresRemaining = 1;
    const rejectedService = createService(rejectedGateway);
    await expect(rejectedService.start(command)).rejects.toMatchObject({ retryable: false });
    await expect(rejectedService.start(command)).rejects.toMatchObject({ retryable: false });
    expect(rejectedGateway.starts).toHaveLength(1);
  });

  it("routes tool results through the active room binding and rejects them after stop", async () => {
    const gateway = new RecordingGateway();
    const service = createService(gateway);
    const started = await service.start({
      sessionId: session.session_id,
      idempotencyKey: "start-tool-context",
      correlationId: "cor_000001",
    });

    expect(service.resolveToolContext(session.room_id)).toEqual({
      sessionId: session.session_id,
      roomId: session.room_id,
      taskId: started.agent.task_id,
    });
    await service.submitToolResult({
      roomId: session.room_id,
      toolCallId: "call_order_001",
      content: '{"ok":true}',
      correlationId: "cor_000002",
    });
    expect(gateway.toolResults[0]).toMatchObject({
      roomId: session.room_id,
      taskId: started.agent.task_id,
      toolCallId: "call_order_001",
    });

    await service.stop({
      sessionId: session.session_id,
      idempotencyKey: "stop-tool-context",
      correlationId: "cor_000003",
    });
    expect(() => service.resolveToolContext(session.room_id)).toThrowError(
      expect.objectContaining({ code: "AGENT_TOOL_CONTEXT_NOT_FOUND" }),
    );
  });
});

class RecordingGateway implements AgentGateway {
  readonly name = "mock" as const;
  readonly promptPolicyVersion = "test-policy@1";
  readonly starts: StartAgentGatewayCommand[] = [];
  readonly stops: StopAgentGatewayCommand[] = [];
  readonly toolResults: SubmitToolResultGatewayCommand[] = [];
  startFailuresRemaining = 0;
  startFailureRetryable = false;
  stopFailuresRemaining = 0;

  async start(command: StartAgentGatewayCommand) {
    this.starts.push(command);
    if (this.startFailuresRemaining > 0) {
      this.startFailuresRemaining -= 1;
      throw new AgentGatewayError(
        this.startFailureRetryable ? "AGENT_PROVIDER_UNAVAILABLE" : "AGENT_PROVIDER_REJECTED",
        "simulated start failure",
        502,
        this.startFailureRetryable,
      );
    }
    return { providerRequestId: "provider-start-001" };
  }

  async stop(command: StopAgentGatewayCommand) {
    this.stops.push(command);
    if (this.stopFailuresRemaining > 0) {
      this.stopFailuresRemaining -= 1;
      throw new AgentGatewayError(
        "AGENT_PROVIDER_UNAVAILABLE",
        "simulated unavailable provider",
        502,
        true,
      );
    }
    return { providerRequestId: "provider-stop-001" };
  }

  async submitToolResult(command: SubmitToolResultGatewayCommand) {
    this.toolResults.push(command);
    return { providerRequestId: "provider-tool-001" };
  }
}

const session: SessionSnapshot = {
  session_id: "ses_000001",
  room_id: "ses_000001",
  rtc_user_id: "usr_000001",
  provider: "mock",
  state: "active",
  revision: 1,
  created_at: "2026-07-29T00:00:00.000Z",
  expires_at: "2026-07-29T00:20:00.000Z",
};

function createService(gateway: AgentGateway, clock = () => new Date("2026-07-29T00:00:00.000Z")) {
  let nextId = 0;
  return new AgentLifecycleService({
    gateway,
    resolveSession: () => session,
    maxSessionSeconds: 60,
    clock,
    idFactory: (prefix) => {
      nextId += 1;
      return `${prefix}_${String(nextId).padStart(6, "0")}`;
    },
  });
}
