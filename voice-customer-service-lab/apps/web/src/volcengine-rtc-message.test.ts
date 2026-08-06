import { describe, expect, it } from "vitest";

import { decodeVolcengineRtcMessage } from "./volcengine-rtc-message";

describe("decodeVolcengineRtcMessage", () => {
  it("decodes a strict subtitle TLV message", () => {
    const result = decodeVolcengineRtcMessage(
      encodeTlv("subv", {
        type: "subtitle",
        data: [
          {
            text: "您好",
            language: "zh-CN",
            userId: "bot_000001",
            sequence: 1,
            definite: true,
            paragraph: false,
            roundId: 7,
            firstCharPos: 0,
            lastCharPos: 1,
          },
        ],
      }),
    );

    expect(result).toEqual({
      status: "decoded",
      message: {
        kind: "subtitle",
        items: [
          {
            text: "您好",
            language: "zh-CN",
            userId: "bot_000001",
            sequence: 1,
            definite: true,
            paragraph: false,
            roundId: 7,
            firstCharPos: 0,
            lastCharPos: 1,
          },
        ],
      },
    });
  });

  it("decodes a conversation status without exposing raw bytes", () => {
    const result = decodeVolcengineRtcMessage(
      encodeTlv("conv", {
        TaskId: "tsk_000001",
        UserID: "bot_000001",
        RoundID: 7,
        EventTime: 1_765_789_500_000,
        Stage: { Code: 3, Description: "answering" },
      }),
    );

    expect(result).toMatchObject({
      status: "decoded",
      message: {
        kind: "conversation-status",
        taskId: "tsk_000001",
        stage: "speaking",
      },
    });
  });

  it("ignores unknown application messages", () => {
    expect(decodeVolcengineRtcMessage(encodeTlv("tool", {}))).toEqual({
      status: "ignored",
      reason: "unsupported_type",
    });
  });

  it("keeps an unknown future stage non-fatal", () => {
    const result = decodeVolcengineRtcMessage(
      encodeTlv("conv", {
        TaskId: "tsk_000001",
        UserID: "bot_000001",
        RoundID: 7,
        EventTime: 1_765_789_500_000,
        Stage: { Code: 99, Description: "future-stage" },
      }),
    );

    expect(result).toMatchObject({
      status: "decoded",
      message: { kind: "conversation-status", stage: "unknown", stageCode: 99 },
    });
  });

  it("rejects truncated frames and invalid provider payloads", () => {
    const truncated = encodeTlv("subv", { type: "subtitle", data: [] }).slice(0, -1);
    expect(decodeVolcengineRtcMessage(truncated)).toEqual({
      status: "rejected",
      reason: "invalid_frame",
    });
    expect(decodeVolcengineRtcMessage(encodeTlv("subv", { data: [] }))).toEqual({
      status: "rejected",
      reason: "invalid_payload",
    });
  });
});

function encodeTlv(type: string, value: unknown): ArrayBuffer {
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const buffer = new ArrayBuffer(8 + payload.byteLength);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode(type), 0);
  new DataView(buffer).setUint32(4, payload.byteLength, false);
  bytes.set(payload, 8);
  return buffer;
}
