import type {
  AgentSnapshot,
  AgentState,
  EndSessionResponse,
  HandoffResponse,
  HandoffTicket,
  RtcCredentials,
  SessionCommandResponse,
  SessionPrivacySummary,
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
import { classifyMicrophoneLevel, reconcileMicrophoneSelection } from "./audio-device-policy";
import { ConversationTranscript } from "./ConversationTranscript";
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
import {
  initialRealtimeConversationState,
  realtimeConversationReducer,
} from "./realtime-conversation-state";
import { replayEvents } from "./replay-events";
import { RtcSubtitleOrderer } from "./rtc-event-ordering";
import {
  initialRtcRecoveryState,
  rtcRecoveryReducer,
  rtcRecoveryRemainingMs,
} from "./rtc-recovery-state";
import {
  type AudioProcessingMode,
  type RtcConnectionPhase,
  rtcClientErrorMessage,
  VolcengineRtcRoomAdapter,
} from "./rtc-room-adapter";
import { TurnLifecyclePanel } from "./TurnLifecyclePanel";
import {
  domainEventToTurnSignal,
  endpointToFirstOutputMs,
  initialTurnLifecycleState,
  rtcStatusToTurnSignal,
  rtcSubtitleToTurnSignal,
  turnLifecycleReducer,
} from "./turn-lifecycle";
import { TurnRaceGuard } from "./turn-race-guard";
import { HttpVoiceClientAdapter, VoiceApiError } from "./voice-client";
import type { VolcengineRtcMessage } from "./volcengine-rtc-message";

const STATUS_LABELS: Record<ConversationUiState, string> = {
  idle: "准备开始",
  connecting: "正在建立会话",
  listening: "正在聆听",
  thinking: "AI 正在思考",
  speaking: "AI 正在说话",
  ending: "正在安全结束",
  ended: "会话已结束",
  failed: "会话失败",
};

type DevicePhase = "idle" | "checking" | "switching" | "ready" | "failed";
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

const CONVERSATION_STAGE_LABELS = {
  error: "状态异常",
  unknown: "未知新状态",
  listening: "聆听中",
  thinking: "思考中",
  speaking: "说话中",
  interrupted: "已被打断",
  finished: "回答完成",
} as const;

const MICROPHONE_LEVEL_LABELS = {
  unavailable: "入房后显示实时电平",
  silent: "近似无声，请确认未静音",
  low: "音量偏低，可靠近麦克风",
  healthy: "音量正常",
  high: "音量过高，可能出现削波",
} as const;

const AUDIO_PROCESSING_LABELS: Record<AudioProcessingMode, string> = {
  speech: "客服语音优化（推荐）",
  unprocessed: "原始音频（仅排障）",
};

const SUMMARY_TOPIC_LABELS = {
  general_support: "一般咨询",
  order_status: "订单与物流",
  human_handoff: "转人工",
} as const;

export function App() {
  const client = useMemo(() => new HttpVoiceClientAdapter(publicConfig.apiBaseUrl), []);
  const deviceManager = useMemo(() => new BrowserMediaDeviceManager(), []);
  const rtcRoom = useMemo(() => new VolcengineRtcRoomAdapter(), []);
  const subtitleOrderer = useMemo(() => new RtcSubtitleOrderer(), []);
  const turnRaceGuard = useMemo(() => new TurnRaceGuard(), []);
  const [state, dispatch] = useReducer(conversationReducer, initialConversationState);
  const [realtimeState, realtimeDispatch] = useReducer(
    realtimeConversationReducer,
    initialRealtimeConversationState,
  );
  const [turnState, turnDispatch] = useReducer(turnLifecycleReducer, initialTurnLifecycleState);
  const [recoveryState, recoveryDispatch] = useReducer(rtcRecoveryReducer, initialRtcRecoveryState);
  const [draft, setDraft] = useState("我的模拟订单什么时候到？");
  const [isBusy, setIsBusy] = useState(false);
  const [rtcCredentials, setRtcCredentials] = useState<RtcCredentials | null>(null);
  const [devicePhase, setDevicePhase] = useState<DevicePhase>("idle");
  const [deviceSnapshot, setDeviceSnapshot] = useState<AudioDeviceSnapshot>({
    permission: "unknown",
    microphones: [],
  });
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [audioProcessingMode, setAudioProcessingMode] = useState<AudioProcessingMode>("speech");
  const [microphoneLevel, setMicrophoneLevel] = useState<number | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);
  const [rtcPhase, setRtcPhase] = useState<RtcUiPhase>("idle");
  const [rtcError, setRtcError] = useState<string | null>(null);
  const [rtcNotice, setRtcNotice] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentSnapshot | null>(null);
  const [agentPresence, setAgentPresence] = useState<"absent" | "present">("absent");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionPrivacySummary | null>(null);
  const [handoffTicket, setHandoffTicket] = useState<HandoffTicket | null>(null);
  const activeRun = useRef<AbortController | null>(null);
  const sessionCreateKey = useRef<string | null>(null);
  const sessionEndKey = useRef<string | null>(null);
  const handoffKey = useRef<string | null>(null);
  const pendingTurnCommand = useRef<{
    readonly sessionId: string;
    readonly text: string;
    readonly idempotencyKey: string;
  } | null>(null);
  const tokenRefreshInFlight = useRef<Promise<void> | null>(null);
  const simulatedRecoveryTimer = useRef<number | null>(null);
  const recoveryCleanupStarted = useRef(false);
  const selectedMicrophoneIdRef = useRef("");
  const deviceSnapshotRef = useRef(deviceSnapshot);
  const rtcPhaseRef = useRef<RtcUiPhase>("idle");
  const deviceSwitchSequence = useRef(0);
  const deviceSwitchInProgress = useRef(false);
  const deviceFailureCleanupStarted = useRef(false);
  const lastRtcPhase = useRef<RtcUiPhase>("idle");
  const activeSession = useRef<SessionSnapshot | null>(null);
  const activeAgent = useRef<AgentSnapshot | null>(null);
  const agentStartKey = useRef<string | null>(null);
  const agentStopKey = useRef<string | null>(null);
  const remoteUserIds = useRef(new Set<string>());
  const agentStopInProgress = useRef(false);
  const reportedRealtimeObservations = useRef(new Set<string>());

  activeSession.current = state.session;
  activeAgent.current = agent;
  selectedMicrophoneIdRef.current = selectedMicrophoneId;
  deviceSnapshotRef.current = deviceSnapshot;
  rtcPhaseRef.current = rtcPhase;

  const applyDeviceSnapshot = useCallback((snapshot: AudioDeviceSnapshot) => {
    const decision = reconcileMicrophoneSelection(
      selectedMicrophoneIdRef.current,
      snapshot.microphones,
    );
    deviceSnapshotRef.current = snapshot;
    selectedMicrophoneIdRef.current = decision.deviceId;
    setDeviceSnapshot(snapshot);
    setSelectedMicrophoneId(decision.deviceId);
    return decision;
  }, []);

  const reportRealtimeObservation = useCallback(
    (
      dedupeKey: string,
      observation: {
        readonly sli: "rtc_join" | "turn_first_output" | "barge_in_stop";
        readonly source: "mock" | "rtc";
        readonly outcome: "success" | "failure";
        readonly durationMs: number | null;
      },
    ): void => {
      const session = activeSession.current;
      if (!session || reportedRealtimeObservations.current.has(dedupeKey)) {
        return;
      }
      reportedRealtimeObservations.current.add(dedupeKey);
      void client
        .recordRealtimeObservation(session.session_id, {
          observation_id: `obs_${crypto.randomUUID().replaceAll("-", "")}`,
          sli: observation.sli,
          source: observation.source,
          outcome: observation.outcome,
          duration_ms:
            observation.durationMs === null
              ? null
              : Math.min(60_000, Math.max(0, Math.round(observation.durationMs))),
        })
        .catch(() => {
          // Customer actions must not fail just because optional telemetry is unavailable.
        });
    },
    [client],
  );

  const stopAgentRequest = useCallback(
    async (updateUi: boolean): Promise<boolean> => {
      const currentSession = activeSession.current;
      const currentAgent = activeAgent.current;
      if (!currentSession || !currentAgent || currentAgent.state === "stopped") {
        return true;
      }

      agentStopKey.current ??= `web-agent-stop:${crypto.randomUUID()}`;
      agentStopInProgress.current = true;
      try {
        const result = await client.stopAgent(currentSession.session_id, agentStopKey.current);
        activeAgent.current = result.agent;
        if (updateUi) {
          setAgent(result.agent);
          setAgentPresence("absent");
          setAgentError(null);
        }
        return true;
      } catch (error) {
        if (updateUi) {
          setAgentError(toApiErrorMessage(error, "无法停止 AI Agent，后台回收器会继续重试。"));
        }
        return false;
      } finally {
        agentStopInProgress.current = false;
      }
    },
    [client],
  );

  const releaseRtcAfterDeviceFailure = useCallback(
    async (message: string): Promise<void> => {
      setDevicePhase("failed");
      setDeviceError(message);
      setMicrophoneLevel(null);
      const activePhases: readonly RtcUiPhase[] = [
        "joining",
        "connected",
        "reconnecting",
        "disconnected",
      ];
      if (!activePhases.includes(rtcPhaseRef.current) || deviceFailureCleanupStarted.current) {
        return;
      }

      deviceFailureCleanupStarted.current = true;
      setAgentBusy(true);
      await stopAgentRequest(true);
      try {
        await rtcRoom.leave();
      } catch (error) {
        setRtcError(rtcClientErrorMessage(error));
      } finally {
        remoteUserIds.current.clear();
        setAgentPresence("absent");
        setRtcPhase("failed");
        rtcPhaseRef.current = "failed";
        setAgentBusy(false);
      }
    },
    [rtcRoom, stopAgentRequest],
  );

  const switchActiveMicrophone = useCallback(
    async (
      nextDeviceId: string,
      rollbackDeviceId: string | null,
      successMessage: string,
    ): Promise<boolean> => {
      const operation = ++deviceSwitchSequence.current;
      deviceSwitchInProgress.current = true;
      setDevicePhase("switching");
      setDeviceError(null);
      try {
        await rtcRoom.switchMicrophone(nextDeviceId);
        if (operation !== deviceSwitchSequence.current) {
          return true;
        }
        setDevicePhase("ready");
        setDeviceNotice(successMessage);
        return true;
      } catch (error) {
        if (operation !== deviceSwitchSequence.current) {
          return true;
        }
        if (
          rollbackDeviceId &&
          deviceSnapshotRef.current.microphones.some(
            (device) => device.deviceId === rollbackDeviceId,
          )
        ) {
          selectedMicrophoneIdRef.current = rollbackDeviceId;
          setSelectedMicrophoneId(rollbackDeviceId);
        }
        setDevicePhase("failed");
        setDeviceError(rtcClientErrorMessage(error));
        return false;
      } finally {
        if (operation === deviceSwitchSequence.current) {
          deviceSwitchInProgress.current = false;
        }
      }
    },
    [rtcRoom],
  );

  const handleDeviceInventoryChange = useCallback(
    async (snapshot: AudioDeviceSnapshot): Promise<void> => {
      const previousDeviceId = selectedMicrophoneIdRef.current;
      const decision = applyDeviceSnapshot(snapshot);

      if (snapshot.permission === "denied") {
        await releaseRtcAfterDeviceFailure(
          "麦克风权限已被撤销。系统已停止 AI 并释放 RTC，请恢复权限后重新检查。",
        );
        return;
      }
      if (!previousDeviceId) {
        if (snapshot.permission === "granted" && decision.deviceId) {
          setDevicePhase("ready");
        }
        return;
      }
      if (decision.reason === "unavailable") {
        await releaseRtcAfterDeviceFailure(
          "当前麦克风已断开，且没有可用的备用设备。系统已停止 AI 并释放 RTC。",
        );
        return;
      }
      if (decision.reason !== "fallback") {
        return;
      }

      const fallback = snapshot.microphones.find((device) => device.deviceId === decision.deviceId);
      if (rtcPhaseRef.current === "joining") {
        await releaseRtcAfterDeviceFailure(
          "麦克风在加入房间时断开。系统已取消本次连接，请检查设备后重试。",
        );
        return;
      }
      if (["connected", "reconnecting", "disconnected"].includes(rtcPhaseRef.current)) {
        const switched = await switchActiveMicrophone(
          decision.deviceId,
          null,
          `原麦克风已断开，已自动切换到“${fallback?.label ?? "备用麦克风"}”。`,
        );
        if (!switched) {
          await releaseRtcAfterDeviceFailure(
            "原麦克风已断开，备用设备切换失败。系统已停止 AI 并释放 RTC。",
          );
        }
        return;
      }

      setDevicePhase("ready");
      setDeviceNotice(`原麦克风已断开，已选择“${fallback?.label ?? "备用麦克风"}”。`);
    },
    [applyDeviceSnapshot, releaseRtcAfterDeviceFailure, switchActiveMicrophone],
  );

  const handleRemoteUserJoined = useCallback((userId: string) => {
    remoteUserIds.current.add(userId);
    if (activeAgent.current?.bot_user_id === userId) {
      setAgentPresence("present");
      setAgentError(null);
    }
  }, []);

  const handleRemoteUserLeft = useCallback((userId: string) => {
    remoteUserIds.current.delete(userId);
    const current = activeAgent.current;
    if (current?.bot_user_id !== userId) {
      return;
    }

    setAgentPresence("absent");
    if (!agentStopInProgress.current && !["stopping", "stopped"].includes(current.state)) {
      setAgentError("AI Bot 已意外离开 RTC 房间，请停止任务后重新启动。");
    }
  }, []);

  const handleRtcConnectionPhase = useCallback((phase: RtcConnectionPhase) => {
    const previous = lastRtcPhase.current;
    lastRtcPhase.current = phase;
    rtcPhaseRef.current = phase;
    setRtcPhase(phase);
    recoveryDispatch({ type: "phase.observed", phase, observedAtMs: Date.now() });
    if (phase === "connected" && (previous === "reconnecting" || previous === "disconnected")) {
      setRtcNotice("RTC 网络已恢复；当前轮次仍以服务端事件为准。");
    }
  }, []);

  const acceptTurnSignal = useCallback(
    (signal: Parameters<TurnRaceGuard["accept"]>[0]): boolean => {
      const decision = turnRaceGuard.accept(signal);
      if (!decision.accepted) {
        return false;
      }
      if (decision.interruption) {
        dispatch({
          type: "round.interrupted",
          roundId: decision.interruption.interruptedRoundId,
        });
        realtimeDispatch({
          type: "round.interrupted",
          roundId: decision.interruption.interruptedRoundId,
        });
      }
      if (decision.supersededResponseId) {
        dispatch({
          type: "response.invalidated",
          responseId: decision.supersededResponseId,
        });
      }
      turnDispatch({ type: "signal.received", signal });
      return true;
    },
    [turnRaceGuard],
  );

  const handleVoiceMessage = useCallback(
    (message: VolcengineRtcMessage, senderUserId: string) => {
      const currentAgent = activeAgent.current;
      const currentSession = activeSession.current;

      // Only trust the Bot assigned by this Session; other room messages are ignored.
      if (!currentAgent || senderUserId !== currentAgent.bot_user_id) {
        return;
      }

      if (message.kind === "conversation-status") {
        if (
          message.taskId !== currentAgent.task_id ||
          message.userId !== currentAgent.bot_user_id
        ) {
          return;
        }
        const turnSignal = rtcStatusToTurnSignal(message, performance.now());
        if (turnSignal && !acceptTurnSignal(turnSignal)) {
          return;
        }
        realtimeDispatch({ type: "status.received", status: message });
        if (message.stage === "error") {
          setAgentError(
            message.errorCode === undefined
              ? "AI Agent 返回了未知状态。"
              : `AI Agent 运行异常（错误码 ${message.errorCode}）。`,
          );
        }
        return;
      }

      if (!currentSession) {
        return;
      }
      for (const subtitle of message.items) {
        const role =
          subtitle.userId === currentAgent.bot_user_id
            ? "assistant"
            : subtitle.userId === currentSession.rtc_user_id
              ? "user"
              : null;
        if (!role) {
          continue;
        }

        const ordered = subtitleOrderer.push(subtitle);
        if (ordered.gapDetected) {
          setRtcNotice(
            ordered.overflowed
              ? "字幕乱序缓冲已满，请停止 Agent 并重新加入房间。"
              : "检测到字幕序号缺口；正在等待缺失消息，必要时请重新加入房间。",
          );
        }
        for (const ready of ordered.ready) {
          const turnSignal = rtcSubtitleToTurnSignal(role, ready, performance.now());
          if (!acceptTurnSignal(turnSignal)) {
            continue;
          }
          realtimeDispatch({ type: "subtitle.received", role, subtitle: ready });
        }
      }
    },
    [acceptTurnSignal, subtitleOrderer],
  );

  useEffect(() => {
    let active = true;
    void deviceManager
      .inspect()
      .then((snapshot) => {
        if (active) {
          applyDeviceSnapshot(snapshot);
          if (snapshot.permission === "granted" && snapshot.microphones.length > 0) {
            setDevicePhase("ready");
          }
        }
      })
      .catch((error) => {
        if (active) {
          setDeviceError(mediaDeviceErrorMessage(error));
        }
      });

    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = deviceManager.subscribe(
        (snapshot) => {
          if (active) {
            void handleDeviceInventoryChange(snapshot);
          }
        },
        (error) => {
          if (active) {
            setDevicePhase("failed");
            setDeviceError(mediaDeviceErrorMessage(error));
          }
        },
      );
    } catch (error) {
      setDeviceError(mediaDeviceErrorMessage(error));
    }

    return () => {
      active = false;
      unsubscribe();
      activeRun.current?.abort();
      if (simulatedRecoveryTimer.current !== null) {
        window.clearTimeout(simulatedRecoveryTimer.current);
      }
      // Page teardown cannot await HTTP; IdleTimeout and the server reaper are the final safety net.
      void stopAgentRequest(false);
      void rtcRoom.leave();
    };
  }, [applyDeviceSnapshot, deviceManager, handleDeviceInventoryChange, rtcRoom, stopAgentRequest]);

  useEffect(() => {
    if (recoveryState.status !== "recovering" || recoveryState.deadlineAtMs === null) {
      return;
    }
    const remaining = rtcRecoveryRemainingMs(recoveryState, Date.now()) ?? 0;
    const timer = window.setTimeout(() => {
      recoveryDispatch({ type: "window.elapsed", observedAtMs: Date.now() });
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [recoveryState]);

  useEffect(() => {
    if (recoveryState.status === "stable") {
      recoveryCleanupStarted.current = false;
      return;
    }
    if (recoveryState.status !== "exhausted" || recoveryCleanupStarted.current) {
      return;
    }

    recoveryCleanupStarted.current = true;
    setRtcNotice("RTC 恢复窗口已耗尽，正在停止 AI 并释放本地连接。");
    setAgentBusy(true);
    void stopAgentRequest(true).finally(() => {
      void rtcRoom
        .leave()
        .catch((error) => setRtcError(rtcClientErrorMessage(error)))
        .finally(() => {
          remoteUserIds.current.clear();
          setAgentPresence("absent");
          lastRtcPhase.current = "failed";
          setRtcPhase("failed");
          setAgentBusy(false);
        });
    });
  }, [recoveryState.status, rtcRoom, stopAgentRequest]);

  useEffect(() => {
    const turn = turnState.turn;
    if (!turn || !["completed", "failed"].includes(turn.phase)) {
      return;
    }
    reportRealtimeObservation(`turn_first_output:${turn.roundId}`, {
      sli: "turn_first_output",
      source: turn.source,
      outcome: turn.phase === "completed" ? "success" : "failure",
      durationMs: endpointToFirstOutputMs(turn),
    });
  }, [reportRealtimeObservation, turnState.turn]);

  async function startSession() {
    const createKey =
      state.uiState === "failed" && !state.session && sessionCreateKey.current
        ? sessionCreateKey.current
        : `web-session-create:${crypto.randomUUID()}`;
    await stopAgentRequest(false);
    await leaveRtcRoom();
    dispatch({ type: "reset" });
    realtimeDispatch({ type: "reset" });
    turnDispatch({ type: "reset" });
    recoveryDispatch({ type: "reset" });
    turnRaceGuard.reset();
    subtitleOrderer.reset();
    remoteUserIds.current.clear();
    setRtcCredentials(null);
    setAgent(null);
    setAgentPresence("absent");
    setAgentError(null);
    agentStartKey.current = null;
    agentStopKey.current = null;
    sessionCreateKey.current = createKey;
    sessionEndKey.current = null;
    handoffKey.current = null;
    reportedRealtimeObservations.current.clear();
    setSessionSummary(null);
    setHandoffTicket(null);
    pendingTurnCommand.current = null;
    if (simulatedRecoveryTimer.current !== null) {
      window.clearTimeout(simulatedRecoveryTimer.current);
      simulatedRecoveryTimer.current = null;
    }
    dispatch({ type: "command.started", command: "create" });
    await runCommand(() => client.createSession(createKey));
  }

  async function submitTurn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!state.session || !text) {
      return;
    }

    dispatch({ type: "command.started", command: "turn" });
    const currentSessionId = state.session.session_id;
    const pending = pendingTurnCommand.current;
    const command =
      pending?.sessionId === currentSessionId && pending.text === text
        ? pending
        : {
            sessionId: currentSessionId,
            text,
            idempotencyKey: `web-mock-turn:${crypto.randomUUID()}`,
          };
    pendingTurnCommand.current = command;
    const succeeded = await runCommand(() =>
      client.submitMockTurn(command.sessionId, command.text, command.idempotencyKey),
    );
    if (succeeded && pendingTurnCommand.current?.idempotencyKey === command.idempotencyKey) {
      pendingTurnCommand.current = null;
      setDraft((current) => (current.trim() === text ? "" : current));
    }
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
    sessionEndKey.current ??= `web-session-end:${crypto.randomUUID()}`;
    await runCommand(() =>
      client.endSession(state.session?.session_id ?? "", sessionEndKey.current ?? ""),
    );
  }

  async function requestHumanHandoff() {
    if (!state.session) {
      return;
    }
    setAgentBusy(true);
    await stopAgentRequest(true);
    setAgentBusy(false);
    await leaveRtcRoom();
    dispatch({ type: "command.started", command: "end" });
    handoffKey.current ??= `web-handoff:${crypto.randomUUID()}`;
    await runCommand(() =>
      client.requestHandoff(
        state.session?.session_id ?? "",
        "user_request",
        handoffKey.current ?? "",
      ),
    );
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
      activeAgent.current = result.agent;
      setAgent(result.agent);
      setAgentPresence(remoteUserIds.current.has(result.agent.bot_user_id) ? "present" : "absent");
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
    setDeviceNotice(null);
    try {
      const snapshot = await deviceManager.requestMicrophoneAccess();
      applyDeviceSnapshot(snapshot);
      deviceFailureCleanupStarted.current = false;
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

    const joinStartedAt = performance.now();
    const observationKey = `rtc_join:${crypto.randomUUID()}`;
    setRtcPhase("joining");
    lastRtcPhase.current = "joining";
    rtcPhaseRef.current = "joining";
    recoveryDispatch({ type: "reset" });
    setRtcError(null);
    setRtcNotice(null);
    setMicrophoneLevel(null);
    deviceFailureCleanupStarted.current = false;
    try {
      await rtcRoom.join({
        credentials: rtcCredentials,
        microphoneId: selectedMicrophoneId,
        audioProcessingMode,
        onConnectionPhase: handleRtcConnectionPhase,
        onTokenWillExpire: () => {
          void renewRtcToken();
        },
        onFatalError: (code) => {
          setRtcError(`RTC 连接被服务端终止（错误码 ${code}）。`);
          void stopAgentRequest(true).finally(() =>
            rtcRoom.leave().finally(() => {
              rtcPhaseRef.current = "failed";
              setRtcPhase("failed");
            }),
          );
        },
        onRemoteUserJoined: handleRemoteUserJoined,
        onRemoteUserLeft: handleRemoteUserLeft,
        onVoiceMessage: handleVoiceMessage,
        onProtocolIssue: (reason) => {
          setRtcNotice(`收到无法解析的 RTC 消息（${reason}），原始内容已安全丢弃。`);
        },
        onMicrophoneLevel: (level) => setMicrophoneLevel(level),
        onMicrophoneDeviceState: (event) => {
          if (event.state !== "inactive" || event.deviceId !== selectedMicrophoneIdRef.current) {
            return;
          }
          void deviceManager
            .inspect()
            .then(handleDeviceInventoryChange)
            .catch((error) => releaseRtcAfterDeviceFailure(mediaDeviceErrorMessage(error)));
        },
        onMicrophoneTrackEnded: () => {
          if (!deviceSwitchInProgress.current) {
            void releaseRtcAfterDeviceFailure(
              "麦克风音轨意外中断，可能是权限被撤销或设备不可用。系统已停止 AI 并释放 RTC。",
            );
          }
        },
      });
      setRtcPhase("connected");
      lastRtcPhase.current = "connected";
      rtcPhaseRef.current = "connected";
      reportRealtimeObservation(observationKey, {
        sli: "rtc_join",
        source: "rtc",
        outcome: "success",
        durationMs: Math.round(performance.now() - joinStartedAt),
      });
    } catch (error) {
      setRtcPhase("failed");
      rtcPhaseRef.current = "failed";
      setRtcError(rtcClientErrorMessage(error));
      reportRealtimeObservation(observationKey, {
        sli: "rtc_join",
        source: "rtc",
        outcome: "failure",
        durationMs: Math.round(performance.now() - joinStartedAt),
      });
    }
  }

  async function leaveRtcRoom() {
    if (rtcPhase === "idle") {
      return;
    }
    setRtcPhase("leaving");
    rtcPhaseRef.current = "leaving";
    try {
      await rtcRoom.leave();
      remoteUserIds.current.clear();
      setAgentPresence("absent");
      setRtcPhase("idle");
      lastRtcPhase.current = "idle";
      rtcPhaseRef.current = "idle";
      setMicrophoneLevel(null);
      deviceFailureCleanupStarted.current = false;
      recoveryDispatch({ type: "reset" });
      setRtcNotice(null);
    } catch (error) {
      setRtcPhase("failed");
      rtcPhaseRef.current = "failed";
      setRtcError(rtcClientErrorMessage(error));
    }
  }

  async function renewRtcToken() {
    if (tokenRefreshInFlight.current) {
      return tokenRefreshInFlight.current;
    }
    const currentSession = activeSession.current;
    const createKey = sessionCreateKey.current;
    if (!currentSession || !createKey) {
      setRtcError("缺少原始 Session 幂等键，无法安全更新 RTC Token。");
      return;
    }

    const refresh = (async () => {
      const result = await client.createSession(createKey);
      if (
        result.session.session_id !== currentSession.session_id ||
        result.rtc_credentials.kind !== "volcengine"
      ) {
        throw new Error("The refreshed credential does not belong to the active Session.");
      }
      await rtcRoom.updateToken(result.rtc_credentials.token);
      setRtcCredentials(result.rtc_credentials);
      setRtcNotice("RTC Token 已在原 Session 内更新，没有重复创建房间或 Agent。");
    })()
      .catch((error) => {
        setRtcError(
          error instanceof VoiceApiError
            ? toApiErrorMessage(error, "RTC Token 更新失败。")
            : rtcClientErrorMessage(error),
        );
      })
      .finally(() => {
        if (tokenRefreshInFlight.current === refresh) {
          tokenRefreshInFlight.current = null;
        }
      });
    tokenRefreshInFlight.current = refresh;
    return refresh;
  }

  function simulateRtcRecovery(shouldRecover: boolean) {
    if (simulatedRecoveryTimer.current !== null) {
      window.clearTimeout(simulatedRecoveryTimer.current);
      simulatedRecoveryTimer.current = null;
    }
    recoveryCleanupStarted.current = false;
    const observedAtMs = Date.now();
    lastRtcPhase.current = "reconnecting";
    setRtcPhase("reconnecting");
    recoveryDispatch({ type: "reset" });
    recoveryDispatch({
      type: "phase.observed",
      phase: "reconnecting",
      observedAtMs,
      windowMs: shouldRecover ? 2_000 : 800,
    });
    setRtcNotice(
      shouldRecover
        ? "正在注入一次可恢复的 Mock 网络中断。"
        : "正在注入一次超过恢复窗口的 Mock 网络中断。",
    );

    if (shouldRecover) {
      simulatedRecoveryTimer.current = window.setTimeout(() => {
        recoveryDispatch({
          type: "phase.observed",
          phase: "connected",
          observedAtMs: Date.now(),
        });
        lastRtcPhase.current = "idle";
        setRtcPhase("idle");
        setRtcNotice("Mock 网络已在恢复窗口内恢复，没有重复创建 Session 或 Agent。");
        simulatedRecoveryTimer.current = null;
      }, 700);
    }
  }

  async function changeMicrophone(event: ChangeEvent<HTMLSelectElement>) {
    const previous = selectedMicrophoneId;
    const next = event.target.value;
    if (!next || next === previous) {
      return;
    }
    selectedMicrophoneIdRef.current = next;
    setSelectedMicrophoneId(next);
    setDeviceNotice(null);
    if (rtcPhase !== "connected" && rtcPhase !== "reconnecting") {
      setDevicePhase("ready");
      return;
    }

    const label = deviceSnapshot.microphones.find((device) => device.deviceId === next)?.label;
    await switchActiveMicrophone(next, previous, `已切换到“${label ?? "新麦克风"}”。`);
  }

  async function runCommand(
    command: () => Promise<
      | Awaited<ReturnType<HttpVoiceClientAdapter["createSession"]>>
      | SessionCommandResponse
      | EndSessionResponse
      | HandoffResponse
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
      if ("summary" in result) {
        setSessionSummary(result.summary);
      }
      if ("handoff" in result) {
        setHandoffTicket(result.handoff);
      }
      if (result.session.state === "ended") {
        setRtcCredentials(null);
      }
      dispatch({ type: "session.updated", session: result.session });
      await replayEvents(
        result.events,
        (domainEvent) => {
          const turnSignal = domainEventToTurnSignal(domainEvent, performance.now());
          if (turnSignal && !acceptTurnSignal(turnSignal)) {
            return;
          }
          dispatch({ type: "event.received", event: domainEvent });
        },
        controller.signal,
      );
      return true;
    } catch (error) {
      const message = toApiErrorMessage(error, "无法连接本地 API，请确认 API 已在 8000 端口运行。");
      dispatch({ type: "command.failed", message });
      return false;
    } finally {
      if (activeRun.current === controller) {
        setIsBusy(false);
      }
    }
  }

  const canInterruptMock = isBusy && (state.uiState === "thinking" || state.uiState === "speaking");
  const pendingTurn = pendingTurnCommand.current;
  const canRetryPendingTurn =
    !isBusy &&
    pendingTurn?.sessionId === state.session?.session_id &&
    pendingTurn?.text === draft.trim();
  const canTalk = state.session?.state === "active" && (!isBusy || canInterruptMock);
  const canStart = ["idle", "ended", "failed"].includes(state.uiState) && !isBusy && !agentBusy;
  const canJoinRtc =
    rtcCredentials?.kind === "volcengine" &&
    deviceSnapshot.permission === "granted" &&
    Boolean(selectedMicrophoneId) &&
    ["idle", "failed"].includes(rtcPhase) &&
    recoveryState.status === "stable" &&
    !isBusy;
  const canLeaveRtc = ["joining", "connected", "reconnecting", "disconnected"].includes(rtcPhase);
  const canStartAgent =
    rtcPhase === "connected" &&
    state.session?.state === "active" &&
    (!agent || ["stopped", "failed"].includes(agent.state)) &&
    !agentBusy;
  const canStopAgent =
    Boolean(agent) && !["stopped", "stopping"].includes(agent?.state ?? "stopped") && !agentBusy;
  const agentUiState: AgentState | null =
    agent && agentPresence === "present" && agent.state === "dispatched"
      ? "active"
      : (agent?.state ?? null);
  const realtimeUiState = mapConversationStage(realtimeState.stage);
  const displayedUiState =
    agentPresence === "present" && realtimeUiState ? realtimeUiState : state.uiState;
  const showRealtimeTranscript = realtimeState.transcript.length > 0;
  const displayedTranscript = showRealtimeTranscript ? realtimeState.transcript : state.transcript;
  const transcriptSource =
    agent?.provider === "volcengine" || showRealtimeTranscript ? "rtc" : "mock";
  const microphoneLevelState = classifyMicrophoneLevel(microphoneLevel);
  const selectedMicrophone = deviceSnapshot.microphones.find(
    (device) => device.deviceId === selectedMicrophoneId,
  );

  return (
    <>
      <a className="skip-link" href="#conversation-main">
        跳到客服对话
      </a>
      <main className="shell">
        <section className="app-card" aria-labelledby="page-title">
          <header className="hero">
            <div>
              <p className="eyebrow">VOICE CUSTOMER SERVICE LAB · LESSON 19</p>
              <h1 id="page-title">AI 实时语音客服</h1>
              <p className="disclosure" id="ai-disclosure">
                你正在与 AI 客服交互，回答可能有误。请勿提供密码、验证码或完整支付信息；
                麦克风只在你授权并加入房间后启用。
              </p>
            </div>
            <div
              className="status"
              data-state={displayedUiState}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="status-dot" aria-hidden="true" />
              {STATUS_LABELS[displayedUiState]}
            </div>
          </header>

          <section
            className="conversation-workspace"
            id="conversation-main"
            aria-labelledby="conversation-title"
            aria-describedby="ai-disclosure"
            tabIndex={-1}
          >
            <header className="workspace-heading">
              <div>
                <h2 id="conversation-title">客服对话</h2>
                <p>按顺序完成连接步骤；所有操作均支持键盘，状态不会只靠颜色表达。</p>
              </div>
              <span className="privacy-badge">默认不录音</span>
            </header>

            <div className="conversation-grid">
              <section className="call-controls" aria-labelledby="controls-title">
                <div className="section-heading">
                  <div>
                    <h2 id="controls-title">通话准备</h2>
                    <p>每一步都可以独立重试和退出。</p>
                  </div>
                </div>

                <ol className="readiness-list">
                  <li
                    data-state={state.session ? "complete" : "current"}
                    aria-current={state.session ? undefined : "step"}
                  >
                    <span className="step-number" aria-hidden="true">
                      1
                    </span>
                    <div className="step-content">
                      <strong>创建会话</strong>
                      <span>{state.session ? "短期会话已创建" : "尚未创建"}</span>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={startSession}
                        disabled={!canStart}
                      >
                        {state.uiState === "ended" ? "开始新会话" : "创建会话"}
                      </button>
                    </div>
                  </li>

                  <li
                    data-state={
                      deviceSnapshot.permission === "granted"
                        ? "complete"
                        : state.session
                          ? "current"
                          : "pending"
                    }
                    aria-current={
                      state.session && deviceSnapshot.permission !== "granted" ? "step" : undefined
                    }
                  >
                    <span className="step-number" aria-hidden="true">
                      2
                    </span>
                    <div className="step-content">
                      <strong>选择麦克风</strong>
                      <span id="microphone-help">
                        {devicePhase === "switching"
                          ? "正在切换，失败会自动回滚"
                          : deviceSnapshot.permission === "granted"
                            ? "已授权，通话中也可安全切换"
                            : "需要你的明确授权"}
                      </span>
                      <label className="field-label" htmlFor="microphone">
                        输入设备
                      </label>
                      <select
                        id="microphone"
                        value={selectedMicrophoneId}
                        onChange={changeMicrophone}
                        aria-describedby="microphone-help"
                        disabled={
                          deviceSnapshot.permission !== "granted" ||
                          devicePhase === "checking" ||
                          devicePhase === "switching"
                        }
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
                      <label className="field-label" htmlFor="audio-processing">
                        采集处理
                      </label>
                      <select
                        id="audio-processing"
                        value={audioProcessingMode}
                        aria-describedby="audio-processing-help"
                        disabled={!["idle", "failed"].includes(rtcPhase)}
                        onChange={(event) =>
                          setAudioProcessingMode(event.target.value as AudioProcessingMode)
                        }
                      >
                        {Object.entries(AUDIO_PROCESSING_LABELS).map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <span id="audio-processing-help">
                        推荐模式开启回声消除、基础降噪和自动增益；更改后下次入房生效。
                      </span>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={requestMicrophoneAccess}
                        disabled={
                          !state.session || devicePhase === "checking" || rtcPhase === "joining"
                        }
                      >
                        {devicePhase === "checking" ? "正在检查…" : "检查麦克风"}
                      </button>
                    </div>
                  </li>

                  <li
                    data-state={
                      rtcPhase === "connected"
                        ? "complete"
                        : deviceSnapshot.permission === "granted"
                          ? "current"
                          : "pending"
                    }
                    aria-current={
                      deviceSnapshot.permission === "granted" && rtcPhase !== "connected"
                        ? "step"
                        : undefined
                    }
                  >
                    <span className="step-number" aria-hidden="true">
                      3
                    </span>
                    <div className="step-content">
                      <strong>加入语音房间</strong>
                      <span>{RTC_STATUS_LABELS[rtcPhase]}</span>
                      {canLeaveRtc ? (
                        <button
                          className="danger-button"
                          type="button"
                          onClick={stopAgentAndLeaveRtc}
                        >
                          停止 AI 并退出房间
                        </button>
                      ) : (
                        <button
                          className="primary-button"
                          type="button"
                          onClick={joinRtcRoom}
                          disabled={!canJoinRtc}
                        >
                          加入语音房间
                        </button>
                      )}
                    </div>
                  </li>

                  <li
                    data-state={
                      agentUiState === "active"
                        ? "complete"
                        : rtcPhase === "connected"
                          ? "current"
                          : "pending"
                    }
                    aria-current={
                      rtcPhase === "connected" && agentUiState !== "active" ? "step" : undefined
                    }
                  >
                    <span className="step-number" aria-hidden="true">
                      4
                    </span>
                    <div className="step-content">
                      <strong>连接 AI 客服</strong>
                      <span>
                        {agentUiState ? AGENT_STATUS_LABELS[agentUiState] : "尚未启动"}
                        {realtimeState.stage
                          ? ` · ${CONVERSATION_STAGE_LABELS[realtimeState.stage]}`
                          : ""}
                      </span>
                      <div className="button-group">
                        <button
                          className="primary-button"
                          type="button"
                          onClick={startAiAgent}
                          aria-describedby="agent-cost-notice"
                          disabled={!canStartAgent}
                        >
                          {agentBusy && !agent ? "正在连接…" : "连接 AI 客服"}
                        </button>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={stopAiAgent}
                          disabled={!canStopAgent}
                        >
                          停止 AI
                        </button>
                      </div>
                    </div>
                  </li>
                </ol>

                <section className="audio-quality-panel" aria-labelledby="audio-quality-title">
                  <div>
                    <strong id="audio-quality-title">麦克风质量诊断</strong>
                    <span role="status" aria-live="polite">
                      {MICROPHONE_LEVEL_LABELS[microphoneLevelState]}
                    </span>
                  </div>
                  <meter
                    min={0}
                    max={255}
                    low={26}
                    high={205}
                    optimum={120}
                    value={microphoneLevel ?? 0}
                    aria-label="本地麦克风音量"
                  />
                  <small>
                    只显示 RTC SDK 的本地音量，不保存音频；该数值不能代替 VAD 或 ASR 质量指标。
                  </small>
                </section>

                <p className="cost-notice" id="agent-cost-notice">
                  加入 RTC 和启动真实 AI 可能产生云资源用量；完成练习后请立即结束。
                </p>
                {rtcCredentials?.kind === "mock" && (
                  <p className="inline-warning">
                    当前是 Mock RTC Token，不能加入真实房间；请检查服务端 Provider 配置。
                  </p>
                )}
                {agent?.provider === "mock" && (
                  <p className="inline-warning">
                    当前是 Mock Agent，只验证交互流程，不调用真实 AI。
                  </p>
                )}
                {deviceError && (
                  <p className="inline-error" role="alert">
                    {deviceError}
                  </p>
                )}
                {deviceNotice && (
                  <p className="inline-success" role="status">
                    {deviceNotice}
                  </p>
                )}
                {rtcError && (
                  <p className="inline-error" role="alert">
                    {rtcError}
                  </p>
                )}
                {agentError && (
                  <p className="inline-error" role="alert">
                    {agentError}
                  </p>
                )}
                {rtcNotice && (
                  <p className="inline-warning" role="status">
                    {rtcNotice}
                  </p>
                )}
                {recoveryState.status === "recovering" && (
                  <p className="recovery-notice" role="status">
                    RTC SDK 正在自动重连；恢复期间暂停新的实时操作，超过当前恢复窗口将自动清理。
                  </p>
                )}
                {recoveryState.status === "exhausted" && (
                  <p className="inline-error" role="alert">
                    网络恢复失败；系统正在回收 Agent 和 RTC 资源，可稍后重新加入。
                  </p>
                )}
                {state.session?.provider === "mock" && (
                  <fieldset className="fault-controls">
                    <legend>弱网故障注入（Mock）</legend>
                    <span>只改变本地状态，不连接云端。</span>
                    <div className="button-group">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => simulateRtcRecovery(true)}
                        disabled={recoveryState.status === "recovering" || agentBusy}
                      >
                        模拟短暂断线
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => simulateRtcRecovery(false)}
                        disabled={recoveryState.status === "recovering" || agentBusy}
                      >
                        模拟恢复超时
                      </button>
                    </div>
                  </fieldset>
                )}
              </section>

              <div className="conversation-column">
                <TurnLifecyclePanel state={turnState} />

                <ConversationTranscript
                  key={state.session?.session_id ?? "idle"}
                  messages={displayedTranscript}
                  source={transcriptSource}
                  isBusy={isBusy || agentBusy}
                />

                {state.session?.provider !== "volcengine" && (
                  <form className="composer" onSubmit={submitTurn}>
                    <label htmlFor="mock-text">Mock 文本输入（开发辅助）</label>
                    <p id="mock-text-help">
                      AI 思考或输出时可插话；失败后不修改文字再次提交会复用原幂等键。
                      只使用虚构测试数据。
                    </p>
                    <div>
                      <input
                        id="mock-text"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        aria-describedby="mock-text-help"
                        placeholder="例如：我的模拟订单什么时候到？"
                        maxLength={500}
                        disabled={!canTalk}
                      />
                      <button type="submit" disabled={!canTalk || !draft.trim()}>
                        {canInterruptMock
                          ? "发送并打断上一轮"
                          : canRetryPendingTurn
                            ? "重试上次 Mock 消息"
                            : "发送 Mock 消息"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </section>

          {state.errorMessage && (
            <p className="error-banner" role="alert">
              {state.errorMessage}
            </p>
          )}

          {(sessionSummary || handoffTicket) && (
            <section className="closure-result" aria-labelledby="closure-result-title">
              <div>
                <p className="eyebrow">SESSION CLOSED SAFELY</p>
                <h2 id="closure-result-title">
                  {handoffTicket ? "演示转人工工单已记录" : "会话摘要已生成"}
                </h2>
                <p>
                  {handoffTicket?.message ?? "仅保留结构化摘要；没有保存原始音频或完整对话字幕。"}
                </p>
              </div>
              <dl>
                {handoffTicket && (
                  <div>
                    <dt>工单号</dt>
                    <dd>{handoffTicket.ticket_id}</dd>
                  </div>
                )}
                <div>
                  <dt>真人状态</dt>
                  <dd>{handoffTicket ? "未接入真人坐席" : "未请求转人工"}</dd>
                </div>
                {sessionSummary && (
                  <>
                    <div>
                      <dt>对话轮次</dt>
                      <dd>{sessionSummary.turn_count}</dd>
                    </div>
                    <div>
                      <dt>主题</dt>
                      <dd>
                        {sessionSummary.topics.length > 0
                          ? sessionSummary.topics
                              .map((topic) => SUMMARY_TOPIC_LABELS[topic])
                              .join("、")
                          : "无"}
                      </dd>
                    </div>
                    <div>
                      <dt>敏感输入</dt>
                      <dd>
                        {sessionSummary.sensitive_input_detected
                          ? "检测到但未保留原值"
                          : "未检测到"}
                      </dd>
                    </div>
                    <div>
                      <dt>数据留存</dt>
                      <dd>不保留录音和完整字幕</dd>
                    </div>
                    <div>
                      <dt>摘要到期</dt>
                      <dd>{new Date(sessionSummary.retention_expires_at).toLocaleDateString()}</dd>
                    </div>
                  </>
                )}
              </dl>
            </section>
          )}

          <details className="technical-details">
            <summary>连接详情与调试信息</summary>
            <div className="technical-grid">
              <section aria-labelledby="session-details-title">
                <h2 id="session-details-title">业务会话</h2>
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
              </section>
              <section aria-labelledby="agent-details-title">
                <h2 id="agent-details-title">Agent 任务</h2>
                <dl>
                  <div>
                    <dt>Provider</dt>
                    <dd>{agent?.provider ?? "尚未选择"}</dd>
                  </div>
                  <div>
                    <dt>Prompt</dt>
                    <dd>{agent?.prompt_policy_version ?? "启动时绑定"}</dd>
                  </div>
                  <div>
                    <dt>Task</dt>
                    <dd>{agent?.task_id ?? "启动时生成"}</dd>
                  </div>
                  <div>
                    <dt>Bot User</dt>
                    <dd>{agent?.bot_user_id ?? "启动时生成"}</dd>
                  </div>
                  <div>
                    <dt>Deadline</dt>
                    <dd>{agent ? new Date(agent.deadline_at).toLocaleTimeString() : "尚未计算"}</dd>
                  </div>
                </dl>
              </section>
              <section aria-labelledby="audio-details-title">
                <h2 id="audio-details-title">音频诊断</h2>
                <dl>
                  <div>
                    <dt>权限</dt>
                    <dd>{deviceSnapshot.permission}</dd>
                  </div>
                  <div>
                    <dt>麦克风</dt>
                    <dd>{selectedMicrophone?.label ?? "尚未选择"}</dd>
                  </div>
                  <div>
                    <dt>处理</dt>
                    <dd>{AUDIO_PROCESSING_LABELS[audioProcessingMode]}</dd>
                  </div>
                  <div>
                    <dt>电平</dt>
                    <dd>{microphoneLevel === null ? "无数据" : `${microphoneLevel} / 255`}</dd>
                  </div>
                  <div>
                    <dt>AI 降噪</dt>
                    <dd>未接入插件；当前使用浏览器基础处理</dd>
                  </div>
                </dl>
              </section>
            </div>
          </details>

          <footer className="actions">
            <p id="cleanup-hint">
              结束会按 Stop Agent → 停止采集 → 退出房间 → 结束 Session 的顺序清理。
            </p>
            <div className="button-group">
              <button
                className="secondary-button"
                type="button"
                onClick={requestHumanHandoff}
                aria-describedby="cleanup-hint"
                disabled={state.session?.state !== "active" || isBusy || agentBusy}
              >
                转人工（演示工单）
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={endSession}
                aria-describedby="cleanup-hint"
                disabled={state.session?.state !== "active" || isBusy || agentBusy}
              >
                结束本次客服会话
              </button>
            </div>
          </footer>
        </section>
      </main>
    </>
  );
}

function toApiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof VoiceApiError)) {
    return fallback;
  }
  const attempts = error.attempts > 1 ? `，已尝试 ${error.attempts} 次` : "";
  return `${error.message}（${error.code}${attempts}）`;
}

function mapConversationStage(
  stage: keyof typeof CONVERSATION_STAGE_LABELS | null,
): ConversationUiState | null {
  switch (stage) {
    case "listening":
    case "finished":
    case "interrupted":
      return "listening";
    case "thinking":
      return "thinking";
    case "speaking":
      return "speaking";
    case "error":
      return "failed";
    case "unknown":
    case null:
      return null;
  }
}
