import { describe, expect, it } from "vitest";

import {
  initialRealtimeConversationState,
  realtimeConversationReducer,
} from "./realtime-conversation-state";
import type {
  VolcengineConversationStatusMessage,
  VolcengineSubtitle,
} from "./volcengine-rtc-message";

describe("realtimeConversationReducer", () => {
  it("replaces user partials and appends assistant chunks within one round", () => {
    let state = realtimeConversationReducer(initialRealtimeConversationState, {
      type: "subtitle.received",
      role: "user",
      subtitle: subtitle("我的订", 1),
    });
    state = realtimeConversationReducer(state, {
      type: "subtitle.received",
      role: "user",
      subtitle: subtitle("我的订单", 2, true),
    });
    state = realtimeConversationReducer(state, {
      type: "subtitle.received",
      role: "assistant",
      subtitle: subtitle("正在", 1),
    });
    state = realtimeConversationReducer(state, {
      type: "subtitle.received",
      role: "assistant",
      subtitle: subtitle("查询。", 2, true),
    });

    expect(state.transcript).toEqual([
      {
        id: "rtc:user:9",
        roundId: "rtc:9",
        role: "user",
        text: "我的订单",
        isFinal: true,
      },
      {
        id: "rtc:assistant:9",
        roundId: "rtc:9",
        role: "assistant",
        text: "正在查询。",
        isFinal: true,
      },
    ]);
  });

  it("marks only the interrupted assistant Round as terminal", () => {
    const speaking = realtimeConversationReducer(initialRealtimeConversationState, {
      type: "subtitle.received",
      role: "assistant",
      subtitle: subtitle("旧回答", 1),
    });
    const interrupted = realtimeConversationReducer(speaking, {
      type: "round.interrupted",
      roundId: "rtc:9",
    });

    expect(interrupted.transcript[0]).toMatchObject({
      isFinal: true,
      isInterrupted: true,
    });
    expect(interrupted.stage).toBe("listening");
  });

  it("does not let an older status event overwrite the current stage", () => {
    const speaking = realtimeConversationReducer(initialRealtimeConversationState, {
      type: "status.received",
      status: status(200, "speaking"),
    });
    const result = realtimeConversationReducer(speaking, {
      type: "status.received",
      status: status(100, "thinking"),
    });

    expect(result).toBe(speaking);
  });
});

function subtitle(text: string, sequence: number, paragraph = false): VolcengineSubtitle {
  return {
    text,
    language: "zh-CN",
    userId: "usr_000001",
    sequence,
    definite: paragraph,
    paragraph,
    roundId: 9,
  };
}

function status(
  eventTime: number,
  stage: VolcengineConversationStatusMessage["stage"],
): VolcengineConversationStatusMessage {
  return {
    kind: "conversation-status",
    taskId: "tsk_000001",
    userId: "bot_000001",
    roundId: 9,
    eventTime,
    stage,
    stageCode: stage === "thinking" ? 2 : 3,
    description: stage,
  };
}
