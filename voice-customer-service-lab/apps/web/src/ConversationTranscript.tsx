import { useEffect, useRef, useState } from "react";

export interface ConversationTranscriptMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly isFinal: boolean;
  readonly isInterrupted?: boolean;
}

export interface ConversationTranscriptProps {
  readonly messages: readonly ConversationTranscriptMessage[];
  readonly source: "mock" | "rtc";
  readonly isBusy: boolean;
}

const FOLLOW_THRESHOLD_PX = 48;

export function ConversationTranscript({ messages, source, isBusy }: ConversationTranscriptProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const announcedFinalIds = useRef(new Set<string>());
  const [followLatest, setFollowLatest] = useState(true);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && followLatest) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
    }

    const latestFinal = findLatestUnannouncedFinalMessage(messages, announcedFinalIds.current);
    if (latestFinal) {
      announcedFinalIds.current.add(latestFinal.id);
      setAnnouncement(`${latestFinal.role === "user" ? "你" : "AI 客服"}：${latestFinal.text}`);
    }
  }, [followLatest, messages]);

  function handleScroll() {
    const viewport = viewportRef.current;
    if (viewport) {
      setFollowLatest(shouldFollowLatest(viewport, FOLLOW_THRESHOLD_PX));
    }
  }

  function returnToLatest() {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
    setFollowLatest(true);
    viewport.focus({ preventScroll: true });
  }

  return (
    <section className="transcript-panel" aria-labelledby="transcript-title">
      <div className="section-heading transcript-heading">
        <div>
          <h2 id="transcript-title">实时对话字幕</h2>
          <p>临时字幕显示识别过程，整轮完成后再由读屏播报最终内容。</p>
        </div>
        <span className="source-badge">{source === "rtc" ? "RTC 实时" : "Mock 演示"}</span>
      </div>

      <div className="transcript-frame">
        <div
          className="transcript"
          ref={viewportRef}
          onScroll={handleScroll}
          role="log"
          aria-labelledby="transcript-title"
          aria-relevant="additions"
          aria-busy={isBusy}
          // A scrollable transcript must be reachable by keyboard users.
          // biome-ignore lint/a11y/noNoninteractiveTabindex: role=log is a keyboard-scrollable region.
          tabIndex={0}
        >
          {messages.length === 0 ? (
            <p className="empty-state">
              {source === "rtc"
                ? "连接 AI 客服后，双方的实时字幕会显示在这里。"
                : "创建 Mock 会话后，可用下方文本输入模拟一轮对话。"}
            </p>
          ) : (
            <ol className="message-list">
              {messages.map((message) => (
                <li
                  className={`message message-${message.role}`}
                  data-status={message.isInterrupted ? "interrupted" : undefined}
                  key={message.id}
                >
                  <article aria-label={message.role === "user" ? "你的消息" : "AI 客服消息"}>
                    <header>
                      <span>{message.role === "user" ? "你" : "AI 客服"}</span>
                      <small>
                        {message.isInterrupted ? "已打断" : message.isFinal ? "已完成" : "生成中"}
                      </small>
                    </header>
                    <p>{message.text}</p>
                    {!message.isFinal && (
                      <span className="streaming-indicator" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </article>
                </li>
              ))}
            </ol>
          )}
        </div>

        <button
          className="latest-button"
          type="button"
          onClick={returnToLatest}
          hidden={followLatest}
        >
          已暂停跟随，回到最新
        </button>
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}

export function shouldFollowLatest(
  metrics: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  threshold = FOLLOW_THRESHOLD_PX,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold;
}

export function findLatestUnannouncedFinalMessage(
  messages: readonly ConversationTranscriptMessage[],
  announcedIds: ReadonlySet<string>,
): ConversationTranscriptMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.isFinal && !message.isInterrupted && !announcedIds.has(message.id)) {
      return message;
    }
  }
  return null;
}
