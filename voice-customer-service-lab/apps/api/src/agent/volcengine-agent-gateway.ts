import {
  applyVolcengineBusinessToolPolicy,
  type VolcengineFunctionCallingOptions,
} from "../business-tools/volcengine-business-tool-policy.js";
import type {
  AgentGateway,
  AgentGatewayResult,
  StartAgentGatewayCommand,
  StopAgentGatewayCommand,
  SubmitToolResultGatewayCommand,
} from "./agent-gateway.js";
import {
  applyCustomerServicePromptPolicy,
  type CustomerServicePromptPolicy,
} from "./customer-service-prompt-policy.js";
import { applyVoiceInterruptionPolicy } from "./voice-interruption-policy.js";
import { applyAutomaticTurnDetectionPolicy } from "./voice-turn-detection-policy.js";
import type { VolcengineVoiceChatClient } from "./volcengine-voice-chat-client.js";

export interface VolcengineAgentGatewayOptions {
  readonly appId: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly promptPolicy: CustomerServicePromptPolicy;
  readonly functionCalling?: VolcengineFunctionCallingOptions;
  readonly idleTimeoutSeconds: number;
  readonly client: VolcengineVoiceChatClient;
}

export class VolcengineAgentGateway implements AgentGateway {
  readonly name = "volcengine" as const;
  readonly promptPolicyVersion: string;

  readonly #appId: string;
  readonly #config: Readonly<Record<string, unknown>>;
  readonly #welcomeMessage: string;
  readonly #idleTimeoutSeconds: number;
  readonly #client: VolcengineVoiceChatClient;

  constructor(options: VolcengineAgentGatewayOptions) {
    this.#appId = options.appId;
    this.promptPolicyVersion = options.promptPolicy.version;
    this.#welcomeMessage = options.promptPolicy.identity.welcome_message;
    this.#config = enableRealtimeClientMessages(
      applyVoiceInterruptionPolicy(
        applyAutomaticTurnDetectionPolicy(
          applyVolcengineBusinessToolPolicy(
            applyCustomerServicePromptPolicy(options.config, options.promptPolicy),
            options.functionCalling,
          ),
        ),
      ),
    );
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
        WelcomeMessage: this.#welcomeMessage,
        IdleTimeout: this.#idleTimeoutSeconds,
        EnableConversationStateCallback: true,
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

  submitToolResult(command: SubmitToolResultGatewayCommand): Promise<AgentGatewayResult> {
    return this.#client.submitToolResult({
      AppId: this.#appId,
      RoomId: command.roomId,
      TaskId: command.taskId,
      Command: "function",
      Message: JSON.stringify({
        ToolCallID: command.toolCallId,
        Content: command.content,
      }),
    });
  }
}

function enableRealtimeClientMessages(
  config: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const currentSubtitleConfig = isRecord(config.SubtitleConfig) ? config.SubtitleConfig : {};
  return {
    ...config,
    SubtitleConfig: {
      ...currentSubtitleConfig,
      // Keep the selected SubtitleMode, but make sure the browser receives subtitle messages.
      DisableRTSSubtitle: false,
      SubtitleMode: currentSubtitleConfig.SubtitleMode ?? 1,
    },
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
