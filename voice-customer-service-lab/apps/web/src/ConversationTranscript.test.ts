import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ConversationTranscript,
  findLatestUnannouncedFinalMessage,
  shouldFollowLatest,
} from "./ConversationTranscript";

describe("ConversationTranscript accessibility helpers", () => {
  it("follows only when the reader remains near the bottom", () => {
    expect(shouldFollowLatest({ scrollHeight: 1_000, scrollTop: 552, clientHeight: 400 })).toBe(
      true,
    );
    expect(shouldFollowLatest({ scrollHeight: 1_000, scrollTop: 300, clientHeight: 400 })).toBe(
      false,
    );
  });

  it("announces a final message once and ignores streaming revisions", () => {
    const messages = [
      { id: "user-1", role: "user" as const, text: "订单", isFinal: true },
      { id: "ai-1", role: "assistant" as const, text: "正在查询", isFinal: false },
    ];

    expect(findLatestUnannouncedFinalMessage(messages, new Set())).toEqual(messages[0]);
    expect(findLatestUnannouncedFinalMessage(messages, new Set(["user-1"]))).toBeNull();
  });

  it("renders an ordered and labelled conversation log", () => {
    const markup = renderToStaticMarkup(
      createElement(ConversationTranscript, {
        messages: [
          { id: "user-1", role: "user", text: "查询订单", isFinal: true },
          { id: "ai-1", role: "assistant", text: "正在查询", isFinal: false },
        ],
        source: "mock",
        isBusy: true,
      }),
    );

    expect(markup).toContain('role="log"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("<ol");
    expect(markup).toContain("你的消息");
    expect(markup).toContain("AI 客服消息");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("shows an interrupted answer without announcing it as a completed answer", () => {
    const interrupted = {
      id: "ai-1",
      role: "assistant" as const,
      text: "尚未说完",
      isFinal: true,
      isInterrupted: true,
    };
    const markup = renderToStaticMarkup(
      createElement(ConversationTranscript, {
        messages: [interrupted],
        source: "mock",
        isBusy: false,
      }),
    );

    expect(findLatestUnannouncedFinalMessage([interrupted], new Set())).toBeNull();
    expect(markup).toContain('data-status="interrupted"');
    expect(markup).toContain("已打断");
  });
});
