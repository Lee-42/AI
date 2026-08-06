import type { ServerConfig } from "../core/config.js";
import { MockVoiceAgentProvider } from "./mock-voice-agent-provider.js";
import type { VoiceAgentProvider } from "./voice-agent-provider.js";

export function createVoiceAgentProvider(
  config: ServerConfig,
  welcomeMessage: string,
): VoiceAgentProvider {
  // Session identity belongs to our control plane; VOICE_PROVIDER only selects the Agent gateway.
  return new MockVoiceAgentProvider({
    sessionTtlSeconds: config.sessionTtlSeconds,
    welcomeMessage,
  });
}
