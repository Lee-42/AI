export const OFFLOAD_DIRECTORY = "/large_tool_results/";
export const TARGET_ORDER_ID = "ORDER-A-4242";
export const TARGET_INCIDENT_CODE = "INCIDENT_PAYMENT_TIMEOUT";
export const TARGET_TRACE_ID = "trace-offload-4242";
export const TARGET_LINE_NUMBER = 4_242;
export const TEACHING_LOG_LINE_COUNT = 5_000;

export type VirtualFile = {
  content: string | string[] | Uint8Array;
};

export type ToolObservation = {
  id: string;
  name: string;
  content: string;
};

function createLogLine(lineNumber: number): string {
  if (lineNumber === TARGET_LINE_NUMBER) {
    return [
      `line=${lineNumber}`,
      "level=ERROR",
      `order_id=${TARGET_ORDER_ID}`,
      "region=华东",
      `incident_code=${TARGET_INCIDENT_CODE}`,
      "retryable=true",
      `trace_id=${TARGET_TRACE_ID}`
    ].join(" | ");
  }

  return [
    `line=${lineNumber}`,
    "level=INFO",
    `order_id=ORDER-NORMAL-${lineNumber.toString().padStart(4, "0")}`,
    "region=华南",
    "status=processed",
    "diagnostic_payload=healthy-service-response"
  ].join(" | ");
}

export function createLargeTeachingLog(
  lineCount = TEACHING_LOG_LINE_COUNT
): string {
  if (lineCount < TARGET_LINE_NUMBER) {
    throw new Error(
      `lineCount must be at least ${TARGET_LINE_NUMBER} so the target event is present.`
    );
  }

  return Array.from({ length: lineCount }, (_, index) =>
    createLogLine(index + 1)
  ).join("\n");
}

export function findOffloadedPaths(
  files: Record<string, VirtualFile> | undefined
): string[] {
  return Object.keys(files ?? {})
    .filter((path) => path.startsWith(OFFLOAD_DIRECTORY))
    .sort();
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (
        typeof block === "object" &&
        block !== null &&
        "text" in block &&
        typeof block.text === "string"
      ) {
        return block.text;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function getToolObservations(
  messages: readonly unknown[] | undefined
): ToolObservation[] {
  return (messages ?? []).flatMap((message, index) => {
    if (
      typeof message !== "object" ||
      message === null ||
      !("tool_call_id" in message) ||
      !("name" in message) ||
      typeof message.name !== "string"
    ) {
      return [];
    }

    const toolCallId =
      typeof message.tool_call_id === "string"
        ? message.tool_call_id
        : `message-${index}`;
    const messageId =
      "id" in message && typeof message.id === "string"
        ? message.id
        : toolCallId;
    const content =
      "content" in message ? stringifyMessageContent(message.content) : "";

    return [
      {
        id: `${messageId}:${toolCallId}`,
        name: message.name,
        content
      }
    ];
  });
}
