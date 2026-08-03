const HEADER_BYTES = 8;
const MAX_MESSAGE_BYTES = 64 * 1024;

export type ConversationStage =
  | "error"
  | "unknown"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "finished";

export interface VolcengineSubtitle {
  readonly text: string;
  readonly language: string;
  readonly userId: string;
  readonly sequence: number;
  readonly definite: boolean;
  readonly paragraph: boolean;
  readonly roundId: number;
  readonly firstCharPos?: number;
  readonly lastCharPos?: number;
}

export interface VolcengineSubtitleMessage {
  readonly kind: "subtitle";
  readonly items: readonly VolcengineSubtitle[];
}

export interface VolcengineConversationStatusMessage {
  readonly kind: "conversation-status";
  readonly taskId: string;
  readonly userId: string;
  readonly roundId: number;
  readonly eventTime: number;
  readonly stage: ConversationStage;
  readonly stageCode: number;
  readonly description: string;
  readonly errorCode?: number;
  readonly errorReason?: string;
}

export type VolcengineRtcMessage = VolcengineSubtitleMessage | VolcengineConversationStatusMessage;

export type VolcengineRtcDecodeResult =
  | { readonly status: "decoded"; readonly message: VolcengineRtcMessage }
  | { readonly status: "ignored"; readonly reason: "unsupported_type" }
  | {
      readonly status: "rejected";
      readonly reason: "invalid_frame" | "invalid_utf8" | "invalid_json" | "invalid_payload";
    };

/**
 * VoiceChat uses an 8-byte TLV header: 4-byte type + 4-byte big-endian payload length.
 * Parsing stays at the provider boundary so the rest of the UI never handles raw bytes.
 */
export function decodeVolcengineRtcMessage(buffer: ArrayBuffer): VolcengineRtcDecodeResult {
  if (buffer.byteLength < HEADER_BYTES || buffer.byteLength > MAX_MESSAGE_BYTES) {
    return { status: "rejected", reason: "invalid_frame" };
  }

  const bytes = new Uint8Array(buffer);
  const type = String.fromCharCode(...bytes.subarray(0, 4));
  const payloadLength = new DataView(buffer, 4, 4).getUint32(0, false);
  if (payloadLength !== buffer.byteLength - HEADER_BYTES) {
    return { status: "rejected", reason: "invalid_frame" };
  }

  if (type !== "subv" && type !== "conv") {
    return { status: "ignored", reason: "unsupported_type" };
  }

  let payloadText: string;
  try {
    payloadText = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(HEADER_BYTES));
  } catch {
    return { status: "rejected", reason: "invalid_utf8" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return { status: "rejected", reason: "invalid_json" };
  }

  const message = type === "subv" ? parseSubtitleMessage(payload) : parseStatusMessage(payload);
  return message
    ? { status: "decoded", message }
    : { status: "rejected", reason: "invalid_payload" };
}

function parseSubtitleMessage(payload: unknown): VolcengineSubtitleMessage | null {
  if (!isRecord(payload) || payload.type !== "subtitle" || !Array.isArray(payload.data)) {
    return null;
  }

  const items = payload.data.map(parseSubtitle);
  if (items.length === 0 || items.some((item) => item === null)) {
    return null;
  }
  return { kind: "subtitle", items: items as VolcengineSubtitle[] };
}

function parseSubtitle(value: unknown): VolcengineSubtitle | null {
  if (
    !isRecord(value) ||
    !isBoundedString(value.text, 10_000) ||
    !isBoundedString(value.language, 32) ||
    !isBoundedString(value.userId, 128) ||
    !isNonNegativeInteger(value.sequence) ||
    typeof value.definite !== "boolean" ||
    typeof value.paragraph !== "boolean" ||
    !isNonNegativeInteger(value.roundId)
  ) {
    return null;
  }

  if (
    (value.firstCharPos !== undefined && !isNonNegativeInteger(value.firstCharPos)) ||
    (value.lastCharPos !== undefined && !isNonNegativeInteger(value.lastCharPos))
  ) {
    return null;
  }

  return {
    text: value.text,
    language: value.language,
    userId: value.userId,
    sequence: value.sequence,
    definite: value.definite,
    paragraph: value.paragraph,
    roundId: value.roundId,
    ...(value.firstCharPos === undefined ? {} : { firstCharPos: value.firstCharPos }),
    ...(value.lastCharPos === undefined ? {} : { lastCharPos: value.lastCharPos }),
  };
}

function parseStatusMessage(payload: unknown): VolcengineConversationStatusMessage | null {
  if (
    !isRecord(payload) ||
    !isBoundedString(payload.TaskId, 128) ||
    !isBoundedString(payload.UserID, 128) ||
    !isNonNegativeInteger(payload.RoundID) ||
    !isNonNegativeInteger(payload.EventTime) ||
    !isRecord(payload.Stage) ||
    !isNonNegativeInteger(payload.Stage.Code) ||
    !isBoundedString(payload.Stage.Description, 128)
  ) {
    return null;
  }

  const errorInfo = payload.ErrorInfo;
  if (
    errorInfo !== undefined &&
    (!isRecord(errorInfo) ||
      !isNonNegativeInteger(errorInfo.ErrorCode) ||
      !isBoundedString(errorInfo.Reason, 512))
  ) {
    return null;
  }

  return {
    kind: "conversation-status",
    taskId: payload.TaskId,
    userId: payload.UserID,
    roundId: payload.RoundID,
    eventTime: payload.EventTime,
    stage: mapStage(payload.Stage.Code),
    stageCode: payload.Stage.Code,
    description: payload.Stage.Description,
    ...(isRecord(errorInfo)
      ? { errorCode: errorInfo.ErrorCode as number, errorReason: errorInfo.Reason as string }
      : {}),
  };
}

function mapStage(code: number): ConversationStage {
  switch (code) {
    case 0:
      return "error";
    case 1:
      return "listening";
    case 2:
      return "thinking";
    case 3:
      return "speaking";
    case 4:
      return "interrupted";
    case 5:
      return "finished";
    default:
      return "unknown";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
