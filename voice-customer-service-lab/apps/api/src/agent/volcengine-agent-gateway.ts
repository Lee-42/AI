import type {
  AgentGateway,
  AgentGatewayResult,
  StartAgentGatewayCommand,
  StopAgentGatewayCommand,
} from "./agent-gateway.js";
import type { VolcengineVoiceChatClient } from "./volcengine-voice-chat-client.js";

export interface VolcengineAgentGatewayOptions {
  readonly appId: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly idleTimeoutSeconds: number;
  readonly client: VolcengineVoiceChatClient;
}

export class VolcengineAgentGateway implements AgentGateway {
  readonly name = "volcengine" as const;

  readonly #appId: string;
  readonly #config: Readonly<Record<string, unknown>>;
  readonly #idleTimeoutSeconds: number;
  readonly #client: VolcengineVoiceChatClient;

  constructor(options: VolcengineAgentGatewayOptions) {
    this.#appId = options.appId;
    this.#config = options.config;
    this.#idleTimeoutSeconds = options.idleTimeoutSeconds;
    this.#client = options.client;
  }

  start(command: StartAgentGatewayCommand): Promise<AgentGatewayResult> {
    return this.#client.start({
      AppId: this.#appId,
      RoomId: command.roomId,
      TaskId: command.taskId,
      Config: this.#config,
      AgentConfig: {
        TargetUserId: [command.targetUserId],
        UserId: command.botUserId,
        IdleTimeout: this.#idleTimeoutSeconds,
      },
    });
  }

  stop(command: StopAgentGatewayCommand): Promise<AgentGatewayResult> {
    return this.#client.stop({
      AppId: this.#appId,
      RoomId: command.roomId,
      TaskId: command.taskId,
    });
  }
}
