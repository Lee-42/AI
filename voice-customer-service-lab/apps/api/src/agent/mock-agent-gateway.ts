import type {
  AgentGateway,
  AgentGatewayResult,
  StartAgentGatewayCommand,
  StopAgentGatewayCommand,
} from "./agent-gateway.js";

export class MockAgentGateway implements AgentGateway {
  readonly name = "mock" as const;

  async start(command: StartAgentGatewayCommand): Promise<AgentGatewayResult> {
    return { providerRequestId: `mock-start-${command.taskId}` };
  }

  async stop(command: StopAgentGatewayCommand): Promise<AgentGatewayResult> {
    return { providerRequestId: `mock-stop-${command.taskId}` };
  }
}
