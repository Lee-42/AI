import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { ServerConfig } from "../core/config.js";
import type { SecretValue } from "../core/secret-value.js";
import type { AgentGateway } from "./agent-gateway.js";
import { MockAgentGateway } from "./mock-agent-gateway.js";
import { VolcengineAgentGateway } from "./volcengine-agent-gateway.js";
import { VolcengineVoiceChatClient } from "./volcengine-voice-chat-client.js";

const voiceConfigFileSchema = z
  .object({
    Config: z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0, {
      message: "Config must not be empty",
    }),
  })
  .strict();

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

export function createAgentGateway(config: ServerConfig): AgentGateway {
  if (config.voiceProvider === "mock") {
    return new MockAgentGateway();
  }

  const appId = requireValue(config.volcengine.rtcAppId, "VOLCENGINE_RTC_APP_ID");
  const accessKeyId = requireSecret(config.volcengine.accessKeyId, "VOLCENGINE_ACCESS_KEY_ID");
  const secretAccessKey = requireSecret(
    config.volcengine.secretAccessKey,
    "VOLCENGINE_SECRET_ACCESS_KEY",
  );
  const voiceConfig = loadVoiceConfig(config.volcengine.voiceConfigPath);
  const client = new VolcengineVoiceChatClient({
    accessKeyId,
    secretAccessKey,
    apiVersion: config.volcengine.voiceApiVersion,
  });

  return new VolcengineAgentGateway({
    appId,
    config: voiceConfig,
    idleTimeoutSeconds: config.volcengine.agentIdleTimeoutSeconds,
    client,
  });
}

export function loadVoiceConfig(path: string): Readonly<Record<string, unknown>> {
  const resolvedPath = isAbsolute(path) ? path : resolve(repositoryRoot, path);
  let contents: string;
  try {
    contents = readFileSync(resolvedPath, "utf8");
  } catch {
    throw new Error(
      `Cannot read VOLCENGINE_VOICE_CONFIG_PATH (${path}); copy the console Config into an ignored local JSON file.`,
    );
  }

  try {
    return Object.freeze(voiceConfigFileSchema.parse(JSON.parse(contents)).Config);
  } catch {
    throw new Error(
      `VOLCENGINE_VOICE_CONFIG_PATH (${path}) must contain one non-empty top-level Config object.`,
    );
  }
}

function requireValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required for the Volcengine Agent gateway.`);
  }
  return value;
}

function requireSecret(value: SecretValue | undefined, name: string): SecretValue {
  if (!value) {
    throw new Error(`${name} is required for the Volcengine Agent gateway.`);
  }
  return value;
}
