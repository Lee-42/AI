import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { SecretValue } from "../core/secret-value.js";
import { BusinessToolError } from "./business-tool-service.js";

const providerToolCallsSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^call_[A-Za-z0-9_-]{1,123}$/),
        type: z.literal("function"),
        function: z
          .object({
            name: z.string().min(1).max(128),
            arguments: z.string().min(2).max(4_096),
          })
          .strict(),
      })
      .strict(),
  )
  .min(1)
  .max(4);

export interface ParsedProviderToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: unknown;
}

export function verifyVolcengineCallback(
  actualSignature: string,
  actualAppId: string,
  expectedSignature: SecretValue | undefined,
  expectedAppId: string | undefined,
): void {
  if (!expectedSignature || !expectedAppId) {
    throw new BusinessToolError(
      "FUNCTION_CALLBACK_DISABLED",
      "The Function Calling callback is not configured.",
      503,
    );
  }

  if (
    actualAppId !== expectedAppId ||
    !constantTimeEquals(actualSignature, expectedSignature.reveal())
  ) {
    throw new BusinessToolError(
      "FUNCTION_CALLBACK_UNAUTHORIZED",
      "The Function Calling callback could not be authenticated.",
      401,
    );
  }
}

export function parseVolcengineToolCalls(message: string): readonly ParsedProviderToolCall[] {
  let outer: unknown;
  try {
    outer = JSON.parse(message);
  } catch {
    throw invalidProviderMessage();
  }

  const parsed = providerToolCallsSchema.safeParse(outer);
  if (!parsed.success) {
    throw invalidProviderMessage();
  }

  return parsed.data.map((toolCall) => {
    let args: unknown;
    try {
      // Volcengine encodes function.arguments as JSON inside the outer Message JSON string.
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      throw invalidProviderMessage();
    }
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: args,
    };
  });
}

function constantTimeEquals(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function invalidProviderMessage(): BusinessToolError {
  return new BusinessToolError(
    "INVALID_PROVIDER_TOOL_MESSAGE",
    "The provider tool message does not match the supported callback contract.",
    400,
  );
}
