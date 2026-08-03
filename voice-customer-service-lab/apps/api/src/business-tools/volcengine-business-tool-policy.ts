import type { SecretValue } from "../core/secret-value.js";
import { APPROVED_BUSINESS_TOOLS } from "./order-tool-definition.js";

export interface VolcengineFunctionCallingOptions {
  readonly callbackUrl: string;
  readonly callbackSignature: SecretValue;
}

/** Removes console-authored tools and adds only the reviewed catalog when explicitly enabled. */
export function applyVolcengineBusinessToolPolicy(
  config: Readonly<Record<string, unknown>>,
  functionCalling: VolcengineFunctionCallingOptions | undefined,
): Readonly<Record<string, unknown>> {
  const llmConfig = requiredRecord(config.LLMConfig, "LLMConfig");
  const { Tools: _consoleTools, MCP: _consoleMcp, ...reviewedLlmConfig } = llmConfig;
  const {
    FunctionCallingConfig: _consoleCallback,
    WebSearchAgentConfig: _consoleWebSearch,
    ...reviewedConfig
  } = config;

  if (!functionCalling) {
    return {
      ...reviewedConfig,
      LLMConfig: reviewedLlmConfig,
    };
  }

  const visionConfig = optionalRecord(config.VisionConfig, "VisionConfig");
  if (visionConfig.Enable === true) {
    throw new Error("VisionConfig.Enable must be false when Function Calling is enabled.");
  }

  return {
    ...reviewedConfig,
    LLMConfig: {
      ...reviewedLlmConfig,
      Tools: APPROVED_BUSINESS_TOOLS,
    },
    FunctionCallingConfig: {
      ServerMessageUrl: functionCalling.callbackUrl,
      ServerMessageSignature: functionCalling.callbackSignature.reveal(),
    },
  };
}

function requiredRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }
  throw new Error(`${path} must be a JSON object before applying the business tool policy.`);
}

function optionalRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (value === undefined) {
    return {};
  }
  return requiredRecord(value, path);
}
