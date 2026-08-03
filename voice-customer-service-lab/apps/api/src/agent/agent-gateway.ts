export interface StartAgentGatewayCommand {
  readonly roomId: string;
  readonly taskId: string;
  readonly botUserId: string;
  readonly targetUserId: string;
  readonly correlationId: string;
}

export interface StopAgentGatewayCommand {
  readonly roomId: string;
  readonly taskId: string;
  readonly correlationId: string;
}

export interface SubmitToolResultGatewayCommand {
  readonly roomId: string;
  readonly taskId: string;
  readonly toolCallId: string;
  readonly content: string;
  readonly correlationId: string;
}

export interface AgentGatewayResult {
  readonly providerRequestId: string | null;
}

export interface AgentGateway {
  readonly name: "mock" | "volcengine";
  readonly promptPolicyVersion: string;
  start(command: StartAgentGatewayCommand): Promise<AgentGatewayResult>;
  stop(command: StopAgentGatewayCommand): Promise<AgentGatewayResult>;
  submitToolResult(command: SubmitToolResultGatewayCommand): Promise<AgentGatewayResult>;
}

export class AgentGatewayError extends Error {
  constructor(
    readonly code:
      | "AGENT_PROVIDER_REJECTED"
      | "AGENT_PROVIDER_UNAVAILABLE"
      | "AGENT_PROVIDER_TIMEOUT",
    message: string,
    readonly statusCode: 502 | 504,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AgentGatewayError";
  }
}
