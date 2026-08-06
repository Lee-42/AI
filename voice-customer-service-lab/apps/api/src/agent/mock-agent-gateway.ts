import type {
  AgentGateway,
  AgentGatewayResult,
  StartAgentGatewayCommand,
  StopAgentGatewayCommand,
  SubmitToolResultGatewayCommand,
} from "./agent-gateway.js";

export class MockAgentGateway implements AgentGateway {
  readonly name = "mock" as const;
  readonly promptPolicyVersion: string;

  constructor(promptPolicyVersion: string) {
    this.promptPolicyVersion = promptPolicyVersion;
  }

  async start(command: StartAgentGatewayCommand): Promise<AgentGatewayResult> {
    return { providerRequestId: `mock-start-${command.taskId}` };
  }

  async stop(command: StopAgentGatewayCommand): Promise<AgentGatewayResult> {
    return { providerRequestId: `mock-stop-${command.taskId}` };
  }

  async submitToolResult(command: SubmitToolResultGatewayCommand): Promise<AgentGatewayResult> {
    return { providerRequestId: `mock-function-${command.toolCallId}` };
  }
}
