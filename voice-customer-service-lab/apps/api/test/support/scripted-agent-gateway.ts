import type {
  AgentGateway,
  AgentGatewayResult,
  StartAgentGatewayCommand,
  StopAgentGatewayCommand,
  SubmitToolResultGatewayCommand,
} from "../../src/agent/agent-gateway.js";
import { AgentGatewayError } from "../../src/agent/agent-gateway.js";

export type AgentGatewayOperation = "start" | "stop" | "submitToolResult";

export type AgentGatewayStep =
  | {
      readonly outcome: "success";
      readonly providerRequestId?: string | null;
      readonly gate?: Promise<void>;
    }
  | {
      readonly outcome: "error";
      readonly code:
        | "AGENT_PROVIDER_REJECTED"
        | "AGENT_PROVIDER_UNAVAILABLE"
        | "AGENT_PROVIDER_TIMEOUT";
      readonly gate?: Promise<void>;
    };

export interface AgentGatewayScript {
  readonly start?: readonly AgentGatewayStep[];
  readonly stop?: readonly AgentGatewayStep[];
  readonly submitToolResult?: readonly AgentGatewayStep[];
}

type AgentGatewayCommand =
  | StartAgentGatewayCommand
  | StopAgentGatewayCommand
  | SubmitToolResultGatewayCommand;

interface CallWaiter {
  readonly operation: AgentGatewayOperation;
  readonly count: number;
  readonly resolve: () => void;
}

/** Test-only gateway whose outcomes are consumed in a deterministic order. */
export class ScriptedAgentGateway implements AgentGateway {
  readonly name = "mock" as const;
  readonly promptPolicyVersion = "test-fault-policy@1";
  readonly calls: Record<AgentGatewayOperation, AgentGatewayCommand[]> = {
    start: [],
    stop: [],
    submitToolResult: [],
  };

  readonly #steps: Record<AgentGatewayOperation, AgentGatewayStep[]>;
  readonly #waiters: CallWaiter[] = [];

  constructor(script: AgentGatewayScript = {}) {
    this.#steps = {
      start: [...(script.start ?? [])],
      stop: [...(script.stop ?? [])],
      submitToolResult: [...(script.submitToolResult ?? [])],
    };
  }

  start(command: StartAgentGatewayCommand): Promise<AgentGatewayResult> {
    return this.#execute("start", command);
  }

  stop(command: StopAgentGatewayCommand): Promise<AgentGatewayResult> {
    return this.#execute("stop", command);
  }

  submitToolResult(command: SubmitToolResultGatewayCommand): Promise<AgentGatewayResult> {
    return this.#execute("submitToolResult", command);
  }

  waitForCallCount(operation: AgentGatewayOperation, count: number): Promise<void> {
    if (this.calls[operation].length >= count) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.#waiters.push({ operation, count, resolve });
    });
  }

  remainingSteps(operation: AgentGatewayOperation): number {
    return this.#steps[operation].length;
  }

  async #execute(
    operation: AgentGatewayOperation,
    command: AgentGatewayCommand,
  ): Promise<AgentGatewayResult> {
    this.calls[operation].push(command);
    this.#resolveWaiters();

    const step = this.#steps[operation].shift() ?? { outcome: "success" as const };
    await step.gate;
    if (step.outcome === "error") {
      throw gatewayError(step.code);
    }

    return {
      providerRequestId:
        step.providerRequestId ?? `scripted-${operation}-${this.calls[operation].length}`,
    };
  }

  #resolveWaiters(): void {
    for (let index = this.#waiters.length - 1; index >= 0; index -= 1) {
      const waiter = this.#waiters[index];
      if (waiter && this.calls[waiter.operation].length >= waiter.count) {
        this.#waiters.splice(index, 1);
        waiter.resolve();
      }
    }
  }
}

export interface DeferredGate {
  readonly wait: Promise<void>;
  readonly release: () => void;
}

export function createDeferredGate(): DeferredGate {
  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

function gatewayError(code: Extract<AgentGatewayStep, { outcome: "error" }>["code"]) {
  const timedOut = code === "AGENT_PROVIDER_TIMEOUT";
  const retryable = code !== "AGENT_PROVIDER_REJECTED";
  return new AgentGatewayError(
    code,
    `scripted ${timedOut ? "timeout" : "provider failure"}`,
    timedOut ? 504 : 502,
    retryable,
  );
}
