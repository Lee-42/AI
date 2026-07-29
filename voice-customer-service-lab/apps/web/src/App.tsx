import type {
  AgentSnapshot,
  AgentState,
  RtcCredentials,
  SessionCommandResponse,
  SessionSnapshot,
} from "@voice/contracts";
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { publicConfig } from "./config";
import {
  type ConversationUiState,
  conversationReducer,
  initialConversationState,
} from "./conversation-state";
import {
  type AudioDeviceSnapshot,
  BrowserMediaDeviceManager,
  mediaDeviceErrorMessage,
} from "./media-device-manager";
import { replayEvents } from "./replay-events";
import {
  type RtcConnectionPhase,
  rtcClientErrorMessage,
  VolcengineRtcRoomAdapter,
} from "./rtc-room-adapter";
import { HttpVoiceClientAdapter, VoiceApiError } from "./voice-client";

const STATUS_LABELS: Record<ConversationUiState, string> = {
  idle: "准备开始",
  connecting: "正在建立会话",
  listening: "正在聆听",
  thinking: "AI 正在思考",
  speaking: "AI 正在模拟播放",
  ending: "正在安全结束",
  ended: "会话已结束",
  failed: "会话失败",
};

type DevicePhase = "idle" | "checking" | "ready" | "failed";
type RtcUiPhase = RtcConnectionPhase | "leaving" | "failed";

const RTC_STATUS_LABELS: Record<RtcUiPhase, string> = {
  idle: "尚未加入",
  joining: "正在加入",
  connected: "已加入 RTC",
  reconnecting: "网络重连中",
  disconnected: "连接已断开",
  leaving: "正在退出",
  failed: "RTC 失败",
};

const AGENT_STATUS_LABELS: Record<AgentState, string> = {
  starting: "正在请求启动",
  dispatched: "启动请求已受理",
  active: "已确认进房",
  stopping: "正在停止",
  stopped: "已停止",
  failed: "启动失败",
  orphaned: "待后台回收",
};

export function App() {
  const client = useMemo(() => new HttpVoiceClientAdapter(publicConfig.apiBaseUrl), []);
  const deviceManager = useMemo(() => new BrowserMediaDeviceManager(), []);
  const rtcRoom = useMemo(() => new VolcengineRtcRoomAdapter(), []);
  const [state, dispatch] = useReducer(conversationReducer, initialConversationState);
  const [draft, setDraft] = useState("我的模拟订单什么时候到？");
  const [isBusy, setIsBusy] = useState(false);
  const [rtcCredentials, setRtcCredentials] = useState<RtcCredentials | null>(null);
  const [devicePhase, setDevicePhase] = useState<DevicePhase>("idle");
  const [deviceSnapshot, setDeviceSnapshot] = useState<AudioDeviceSnapshot>({
    permission: "unknown",
    microphones: [],
  });
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [rtcPhase, setRtcPhase] = useState<RtcUiPhase>("idle");
  const [rtcError, setRtcError] = useState<string | null>(null);
  const [rtcNotice, setRtcNotice] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentSnapshot | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const activeRun = useRef<AbortController | null>(null);
  const activeSession = useRef<SessionSnapshot | null>(null);
  const activeAgent = useRef<AgentSnapshot | null>(null);
  const agentStartKey = useRef<string | null>(null);
  const agentStopKey = useRef<string | null>(null);

  activeSession.current = state.session;
  activeAgent.current = agent;

  const applyDeviceSnapshot = useCallback((snapshot: AudioDeviceSnapshot) => {
    setDeviceSnapshot(snapshot);
    setSelectedMicrophoneId((current) => {
      if (snapshot.microphones.some((device) => device.deviceId === current)) {
        return current;
      }
      return snapshot.microphones[0]?.deviceId ?? "";
    });
  }, []);

  const stopAgentRequest = useCallback(
    async (updateUi: boolean): Promise<boolean> => {
      const currentSession = activeSession.current;
      const currentAgent = activeAgent.current;
      if (!currentSession || !currentAgent || currentAgent.state === "stopped") {
        return true;
      }

      agentStopKey.current ??= `web-agent-stop:${crypto.randomUUID()}`;
      try {
        const result = await client.stopAgent(currentSession.session_id, agentStopKey.current);
        activeAgent.current = result.agent;
        if (updateUi) {
          setAgent(result.agent);
          setAgentError(null);
        }
        return true;
      } catch (error) {
        if (updateUi) {
          setAgentError(toApiErrorMessage(error, "无法停止 AI Agent，后台回收器会继续重试。"));
        }
        return false;
      }
    },
    [client],
  );

  useEffect(() => {
    let active = true;
    void deviceManager
      .inspect()
      .then((snapshot) => {
        if (active) {
          applyDeviceSnapshot(snapshot);
        }
      })
      .catch((error) => {
        if (active) {
          setDeviceError(mediaDeviceErrorMessage(error));
        }
      });

    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = deviceManager.subscribe((snapshot) => {
        if (active) {
          applyDeviceSnapshot(snapshot);
        }
      });
    } catch (error) {
      setDeviceError(mediaDeviceErrorMessage(error));
    }

    return () => {
      active = false;
      unsubscribe();
      activeRun.current?.abort();
      // Page teardown cannot await HTTP; IdleTimeout and the server reaper are the final safety net.
      void stopAgentRequest(false);
      void rtcRoom.leave();
    };
  }, [applyDeviceSnapshot, deviceManager, rtcRoom, stopAgentRequest]);

  async function startSession() {
    await stopAgentRequest(false);
    await leaveRtcRoom();
    dispatch({ type: "reset" });
    setRtcCredentials(null);
    setAgent(null);
    setAgentError(null);
    agentStartKey.current = null;
    agentStopKey.current = null;
    dispatch({ type: "command.started", command: "create" });
    await runCommand(() => client.createSession(`web:${crypto.randomUUID()}`));
  }

  async function submitTurn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!state.session || !text) {
      return;
    }

    dispatch({ type: "command.started", command: "turn" });
    await runCommand(() => client.submitMockTurn(state.session?.session_id ?? "", text));
    setDraft("");
  }

  async function endSession() {
    if (!state.session) {
      return;
    }
    setAgentBusy(true);
    await stopAgentRequest(true);
    setAgentBusy(false);
    await leaveRtcRoom();
    dispatch({ type: "command.started", command: "end" });
    await runCommand(() => client.endSession(state.session?.session_id ?? ""));
  }

  async function startAiAgent() {
    if (!state.session || rtcPhase !== "connected") {
      return;
    }

    if (!agentStartKey.current || agent?.state === "stopped") {
      agentStartKey.current = `web-agent-start:${crypto.randomUUID()}`;
      agentStopKey.current = null;
    }
    setAgentBusy(true);
    setAgentError(null);
    try {
      const result = await client.startAgent(state.session.session_id, agentStartKey.current);
      setAgent(result.agent);
    } catch (error) {
      setAgentError(toApiErrorMessage(error, "无法启动 AI Agent。"));
    } finally {
      setAgentBusy(false);
    }
  }

  async function stopAiAgent() {
    setAgentBusy(true);
    await stopAgentRequest(true);
    setAgentBusy(false);
  }

  async function stopAgentAndLeaveRtc() {
    setAgentBusy(true);
    await stopAgentRequest(true);
    setAgentBusy(false);
    await leaveRtcRoom();
  }

  async function requestMicrophoneAccess() {
    setDevicePhase("checking");
    setDeviceError(null);
    try {
      const snapshot = await deviceManager.requestMicrophoneAccess();
      applyDeviceSnapshot(snapshot);
      setDevicePhase("ready");
    } catch (error) {
      setDevicePhase("failed");
      setDeviceError(mediaDeviceErrorMessage(error));
    }
  }

  async function joinRtcRoom() {
    if (!rtcCredentials || !selectedMicrophoneId) {
      return;
    }

    setRtcPhase("joining");
    setRtcError(null);
    setRtcNotice(null);
    try {
      await rtcRoom.join({
        credentials: rtcCredentials,
        microphoneId: selectedMicrophoneId,
        onConnectionPhase: setRtcPhase,
        onTokenWillExpire: () => {
          setRtcNotice("RTC Token 即将在 30 秒内过期，请结束本次学习会话。");
        },
        onFatalError: (code) => {
          setRtcError(`RTC 连接被服务端终止（错误码 ${code}）。`);
          void stopAgentRequest(true).finally(() =>
            rtcRoom.leave().finally(() => setRtcPhase("failed")),
          );
        },
      });
      setRtcPhase("connected");
    } catch (error) {
      setRtcPhase("failed");
      setRtcError(rtcClientErrorMessage(error));
    }
  }

  async function leaveRtcRoom() {
    if (rtcPhase === "idle") {
      return;
    }
    setRtcPhase("leaving");
    try {
      await rtcRoom.leave();
      setRtcPhase("idle");
      setRtcNotice(null);
    } catch (error) {
      setRtcPhase("failed");
      setRtcError(rtcClientErrorMessage(error));
    }
  }

  async function changeMicrophone(event: ChangeEvent<HTMLSelectElement>) {
    const previous = selectedMicrophoneId;
    const next = event.target.value;
    setSelectedMicrophoneId(next);
    if (rtcPhase !== "connected" && rtcPhase !== "reconnecting") {
      return;
    }

    try {
      await rtcRoom.switchMicrophone(next);
      setDeviceError(null);
    } catch (error) {
      setSelectedMicrophoneId(previous);
      setDeviceError(rtcClientErrorMessage(error));
    }
  }

  async function runCommand(
    command: () => Promise<
      Awaited<ReturnType<HttpVoiceClientAdapter["createSession"]>> | SessionCommandResponse
    >,
  ) {
    activeRun.current?.abort();
    const controller = new AbortController();
    activeRun.current = controller;
    setIsBusy(true);

    try {
      const result = await command();
      if ("rtc_credentials" in result) {
        // Keep the session token in memory; never persist it in localStorage.
        setRtcCredentials(result.rtc_credentials);
      }
      if (result.session.state === "ended") {
        setRtcCredentials(null);
      }
      dispatch({ type: "session.updated", session: result.session });
      await replayEvents(
        result.events,
        (domainEvent) => dispatch({ type: "event.received", event: domainEvent }),
        controller.signal,
      );
    } catch (error) {
      const message =
        error instanceof VoiceApiError
          ? `${error.message}（${error.code}）`
          : "无法连接本地 API，请确认 API 已在 8000 端口运行。";
      dispatch({ type: "command.failed", message });
    } finally {
      if (activeRun.current === controller) {
        setIsBusy(false);
      }
    }
  }

  const canTalk = state.session?.state === "active" && !isBusy;
  const canStart = ["idle", "ended", "failed"].includes(state.uiState) && !isBusy;
  const canJoinRtc =
    rtcCredentials?.kind === "volcengine" &&
    deviceSnapshot.permission === "granted" &&
    Boolean(selectedMicrophoneId) &&
    ["idle", "failed"].includes(rtcPhase) &&
    !isBusy;
  const canLeaveRtc = ["joining", "connected", "reconnecting", "disconnected"].includes(rtcPhase);
  const canStartAgent =
    rtcPhase === "connected" &&
    state.session?.state === "active" &&
    (!agent || ["stopped", "failed"].includes(agent.state)) &&
    !agentBusy;
  const canStopAgent =
    Boolean(agent) && !["stopped", "stopping"].includes(agent?.state ?? "stopped") && !agentBusy;

  return (
    <main className="shell">
      <section className="app-card" aria-labelledby="page-title">
        <header className="hero">
          <div>
            <p className="eyebrow">VOICE CUSTOMER SERVICE LAB · LESSON 09</p>
            <h1 id="page-title">AI 实时语音客服</h1>
            <p className="disclosure">
              入房后仍需明确点击才启动 AI Agent；停止、异常和超时都进入统一回收链路。
            </p>
          </div>
          <div className="status" data-state={state.uiState} role="status" aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            {STATUS_LABELS[state.uiState]}
          </div>
        </header>

        <section className="session-panel" aria-label="会话信息">
          <dl>
            <div>
              <dt>Provider</dt>
              <dd>{state.session?.provider ?? "mock"}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{state.session?.session_id ?? "尚未创建"}</dd>
            </div>
            <div>
              <dt>Room</dt>
              <dd>{state.session?.room_id ?? "尚未分配"}</dd>
            </div>
            <div>
              <dt>RTC User</dt>
              <dd>{state.session?.rtc_user_id ?? "尚未分配"}</dd>
            </div>
            <div>
              <dt>Token</dt>
              <dd>{rtcCredentials ? `${rtcCredentials.kind} · 已签发` : "尚未签发"}</dd>
            </div>
          </dl>
          <button
            className="primary-button"
            type="button"
            onClick={startSession}
            disabled={!canStart}
          >
            {state.uiState === "ended" ? "开始新会话" : "创建会话"}
          </button>
        </section>

        <section className="device-panel" aria-labelledby="device-title">
          <div className="section-heading device-heading">
            <div>
              <h2 id="device-title">设备与 RTC 房间</h2>
              <p className="device-description">
                授权和入房分成两步，便于定位是设备问题还是网络/Token 问题。
              </p>
            </div>
            <span className="rtc-badge" data-state={rtcPhase}>
              {RTC_STATUS_LABELS[rtcPhase]}
            </span>
          </div>

          <div className="device-controls">
            <label htmlFor="microphone">麦克风</label>
            <select
              id="microphone"
              value={selectedMicrophoneId}
              onChange={changeMicrophone}
              disabled={deviceSnapshot.permission !== "granted" || devicePhase === "checking"}
            >
              {deviceSnapshot.microphones.length === 0 ? (
                <option value="">授权后显示设备</option>
              ) : (
                deviceSnapshot.microphones.map((device) => (
                  <option value={device.deviceId} key={device.deviceId}>
                    {device.label}
                  </option>
                ))
              )}
            </select>
            <button
              className="secondary-button"
              type="button"
              onClick={requestMicrophoneAccess}
              disabled={devicePhase === "checking" || rtcPhase === "joining"}
            >
              {devicePhase === "checking" ? "正在检查…" : "检查麦克风"}
            </button>
            {canLeaveRtc ? (
              <button className="danger-button" type="button" onClick={stopAgentAndLeaveRtc}>
                退出 RTC
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                onClick={joinRtcRoom}
                disabled={!canJoinRtc}
              >
                加入 RTC 房间
              </button>
            )}
          </div>

          <p className="cost-notice">
            加入 RTC 和启动 AI 是两次独立操作；真实 Agent 启动后可能产生 AI Tokens 费用。
          </p>
          {rtcCredentials?.kind === "mock" && (
            <p className="inline-warning">
              当前 API 返回 Mock Token，请把服务端 `RTC_TOKEN_PROVIDER` 设为 `volcengine` 后重启。
            </p>
          )}
          {deviceError && (
            <p className="inline-error" role="alert">
              {deviceError}
            </p>
          )}
          {rtcError && (
            <p className="inline-error" role="alert">
              {rtcError}
            </p>
          )}
          {rtcNotice && (
            <p className="inline-warning" role="status">
              {rtcNotice}
            </p>
          )}
        </section>

        <section className="agent-panel" aria-labelledby="agent-title">
          <div className="section-heading agent-heading">
            <div>
              <h2 id="agent-title">AI Agent 生命周期</h2>
              <p className="device-description">
                “请求已受理”不等于 Bot 已进房；第 10 节再用回调和 RTC 事件确认 active。
              </p>
            </div>
            <span className="agent-badge" data-state={agent?.state ?? "idle"}>
              {agent ? AGENT_STATUS_LABELS[agent.state] : "尚未启动"}
            </span>
          </div>

          <dl className="agent-details">
            <div>
              <dt>Provider</dt>
              <dd>{agent?.provider ?? "尚未选择"}</dd>
            </div>
            <div>
              <dt>Task</dt>
              <dd>{agent?.task_id ?? "启动时由服务端生成"}</dd>
            </div>
            <div>
              <dt>Bot User</dt>
              <dd>{agent?.bot_user_id ?? "启动时由服务端生成"}</dd>
            </div>
            <div>
              <dt>Deadline</dt>
              <dd>{agent ? new Date(agent.deadline_at).toLocaleTimeString() : "尚未计算"}</dd>
            </div>
          </dl>

          <div className="agent-actions">
            <button
              className="primary-button"
              type="button"
              onClick={startAiAgent}
              disabled={!canStartAgent}
            >
              {agentBusy && !agent ? "正在启动…" : "启动 AI Agent（可能计费）"}
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={stopAiAgent}
              disabled={!canStopAgent}
            >
              停止并回收 Agent
            </button>
          </div>
          {agent?.provider === "mock" && (
            <p className="inline-warning">当前是 Mock Agent，只验证生命周期，不调用云端或计费。</p>
          )}
          {agentError && (
            <p className="inline-error" role="alert">
              {agentError}
            </p>
          )}
        </section>

        <section className="transcript-panel" aria-label="对话字幕">
          <div className="section-heading">
            <h2>Mock 事件回放</h2>
            <span>与 RTC 空房间独立</span>
          </div>
          <div className="transcript" role="log" aria-live="polite">
            {state.transcript.length === 0 ? (
              <p className="empty-state">开始会话后，输入一句模拟用户话语。</p>
            ) : (
              state.transcript.map((message) => (
                <article className={`message message-${message.role}`} key={message.id}>
                  <span>{message.role === "user" ? "你" : "Mock AI"}</span>
                  <p>{message.text}</p>
                  {!message.isFinal && <small>流式生成中…</small>}
                </article>
              ))
            )}
          </div>
        </section>

        <form className="composer" onSubmit={submitTurn}>
          <label htmlFor="mock-text">模拟用户话语</label>
          <div>
            <input
              id="mock-text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="例如：我的模拟订单什么时候到？"
              maxLength={500}
              disabled={!canTalk}
            />
            <button type="submit" disabled={!canTalk || !draft.trim()}>
              发送
            </button>
          </div>
        </form>

        {state.errorMessage && (
          <p className="error-banner" role="alert">
            {state.errorMessage}
          </p>
        )}

        <footer className="actions">
          <p>结束顺序：Stop Agent → 停止采集 → 退出房间 → 结束业务 Session。</p>
          <button
            className="secondary-button"
            type="button"
            onClick={endSession}
            disabled={state.session?.state !== "active" || isBusy || agentBusy}
          >
            结束会话
          </button>
        </footer>
      </section>
    </main>
  );
}

function toApiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof VoiceApiError ? `${error.message}（${error.code}）` : fallback;
}
