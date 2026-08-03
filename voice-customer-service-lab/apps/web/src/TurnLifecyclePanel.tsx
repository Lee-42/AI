import {
  endpointToFirstOutputMs,
  type TurnLifecycleState,
  type TurnPhase,
  type TurnSnapshot,
} from "./turn-lifecycle";

export interface TurnLifecyclePanelProps {
  readonly state: TurnLifecycleState;
}

const PHASE_LABELS: Record<TurnPhase, string> = {
  capturing: "检测到用户正在说话",
  endpointed: "已判定用户本轮说完",
  thinking: "AI 正在组织回答",
  speaking: "AI 已开始输出",
  completed: "本轮对话已完成",
  interrupted: "本轮已被打断",
  failed: "本轮处理失败",
};

const ENDPOINT_EVIDENCE_LABELS = {
  speech_end: "Mock VAD 判停事件",
  final_transcript: "最终 ASR 字幕",
  provider_state: "Provider 思考状态",
} as const;

const OUTPUT_EVIDENCE_LABELS = {
  audio_event: "Mock 音频开始事件",
  assistant_subtitle: "AI 首条字幕",
  provider_state: "Provider 说话状态",
} as const;

const STEPS = ["用户说话", "判停确认", "AI 思考", "AI 输出"] as const;

export function TurnLifecyclePanel({ state }: TurnLifecyclePanelProps) {
  const { turn } = state;
  const latency = endpointToFirstOutputMs(turn);
  const statusText = turn ? PHASE_LABELS[turn.phase] : "等待用户开始说话";

  return (
    <section className="turn-panel" aria-labelledby="turn-title">
      <header className="turn-heading">
        <div>
          <h2 id="turn-title">对话轮次</h2>
          <p role="status" aria-live="polite" aria-atomic="true">
            {statusText}
          </p>
        </div>
        <span className="turn-badge">{turn ? `第 ${turn.ordinal} 轮` : "尚未开始"}</span>
      </header>

      {state.lastInterruption && (
        <p className="interruption-notice" role="status" aria-live="polite">
          已打断上一轮；旧回复的迟到字幕、状态和异步结果将被忽略。累计 {state.interruptionCount}{" "}
          次。
        </p>
      )}

      <ol className="turn-steps" aria-label="当前轮次进度">
        {STEPS.map((label, index) => (
          <li key={label} data-state={stepState(turn, index)}>
            <span aria-hidden="true">{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <dl className="turn-metrics">
        <div>
          <dt>判停依据</dt>
          <dd>
            {turn?.endpointEvidence
              ? ENDPOINT_EVIDENCE_LABELS[turn.endpointEvidence]
              : "等待权威事件"}
          </dd>
        </div>
        <div>
          <dt>首个输出</dt>
          <dd>
            {turn?.outputEvidence ? OUTPUT_EVIDENCE_LABELS[turn.outputEvidence] : "尚未观察到"}
          </dd>
        </div>
        <div>
          <dt>观察延迟</dt>
          <dd>{latency === null ? "样本不足" : `${latency} ms`}</dd>
        </div>
      </dl>

      <p className="metric-disclaimer">
        {turn?.source === "rtc"
          ? "RTC 数值来自浏览器收到的状态或字幕，只是近似观察值，不等同于真实音频首帧。"
          : "Mock 数值只用于理解事件顺序，不代表云端性能。"}
      </p>
    </section>
  );
}

export function stepState(
  turn: TurnSnapshot | null,
  stepIndex: number,
): "complete" | "current" | "pending" | "error" {
  if (!turn) {
    return "pending";
  }
  const { phase } = turn;
  if (phase === "failed" || phase === "interrupted") {
    const failedStep = turn.firstOutputAtMs !== null ? 3 : turn.endpointedAtMs !== null ? 2 : 0;
    if (stepIndex < failedStep) {
      return "complete";
    }
    return stepIndex === failedStep ? "error" : "pending";
  }
  const progress = phase === "completed" ? STEPS.length : phaseProgress(phase);
  if (stepIndex < progress) {
    return "complete";
  }
  return stepIndex === progress ? "current" : "pending";
}

function phaseProgress(phase: Exclude<TurnPhase, "completed" | "interrupted" | "failed">): number {
  switch (phase) {
    case "capturing":
      return 0;
    case "endpointed":
      return 1;
    case "thinking":
      return 2;
    case "speaking":
      return 3;
  }
}
