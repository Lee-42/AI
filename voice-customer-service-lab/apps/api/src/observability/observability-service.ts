import type {
  RealtimeSliName,
  RealtimeSliObservationRequest,
  SloIndicator,
  SloIndicatorName,
  SloSnapshot,
} from "@voice/contracts";

const HTTP_DURATION_BUCKETS_SECONDS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10] as const;
const REALTIME_DURATION_BUCKETS_SECONDS = [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 10, 30, 60] as const;
const CRITICAL_OPERATIONS = new Set([
  "createVoiceSession",
  "startVoiceAgent",
  "stopVoiceAgent",
  "endVoiceSession",
  "requestHumanHandoff",
]);

interface HttpWindowObservation {
  readonly observedAtMs: number;
  readonly operation: string;
  readonly statusCode: number;
}

interface RealtimeWindowObservation {
  readonly observedAtMs: number;
  readonly sli: RealtimeSliName;
  readonly outcome: "success" | "failure";
  readonly durationSeconds: number | null;
}

interface AgentCleanupWindowObservation {
  readonly observedAtMs: number;
  readonly outcome: "success" | "failure";
  readonly durationSeconds: number;
}

interface HistogramSeries {
  readonly labels: Readonly<Record<string, string>>;
  count: number;
  sum: number;
  readonly buckets: number[];
}

interface CounterSeries {
  readonly labels: Readonly<Record<string, string>>;
  count: number;
}

export interface HttpMetricObservation {
  readonly operation: string;
  readonly method: string;
  readonly statusCode: number;
  readonly durationSeconds: number;
}

export interface AgentCleanupObservation {
  readonly provider: "mock" | "volcengine";
  readonly outcome: "success" | "failure";
  readonly durationMs: number;
}

export interface ObservabilityServiceOptions {
  readonly windowSeconds: number;
  readonly clock?: () => Date;
}

/** Keeps local learning metrics bounded and free of Session IDs or transcript text. */
export class ObservabilityService {
  readonly #windowSeconds: number;
  readonly #clock: () => Date;
  readonly #httpWindow: HttpWindowObservation[] = [];
  readonly #realtimeWindow: RealtimeWindowObservation[] = [];
  readonly #cleanupWindow: AgentCleanupWindowObservation[] = [];
  readonly #observationIds = new Map<string, number>();
  readonly #httpCounters = new Map<string, CounterSeries>();
  readonly #httpDurations = new Map<string, HistogramSeries>();
  readonly #realtimeCounters = new Map<string, CounterSeries>();
  readonly #realtimeDurations = new Map<string, HistogramSeries>();
  readonly #cleanupCounters = new Map<string, CounterSeries>();
  readonly #cleanupDurations = new Map<string, HistogramSeries>();

  constructor(options: ObservabilityServiceOptions) {
    this.#windowSeconds = options.windowSeconds;
    this.#clock = options.clock ?? (() => new Date());
  }

  recordHttp(observation: HttpMetricObservation): void {
    const operation = boundedLabel(observation.operation, "unmatched");
    const method = boundedLabel(observation.method.toUpperCase(), "OTHER");
    const statusClass = httpStatusClass(observation.statusCode);
    const durationSeconds = nonNegativeFinite(observation.durationSeconds);
    const labels = { operation, method, status_class: statusClass };

    incrementCounter(this.#httpCounters, labels);
    observeHistogram(this.#httpDurations, labels, durationSeconds, HTTP_DURATION_BUCKETS_SECONDS);
    this.#httpWindow.push({
      observedAtMs: this.#clock().getTime(),
      operation,
      statusCode: observation.statusCode,
    });
    this.#purgeWindow();
  }

  recordRealtime(
    sessionId: string,
    observation: RealtimeSliObservationRequest,
  ): { replayed: boolean } {
    this.#purgeWindow();
    const dedupeKey = `${sessionId}:${observation.observation_id}`;
    if (this.#observationIds.has(dedupeKey)) {
      return { replayed: true };
    }

    const durationSeconds =
      observation.duration_ms === null ? null : observation.duration_ms / 1_000;
    const labels = {
      sli: observation.sli,
      source: observation.source,
      outcome: observation.outcome,
    };
    const observedAtMs = this.#clock().getTime();
    this.#observationIds.set(dedupeKey, observedAtMs);
    incrementCounter(this.#realtimeCounters, labels);
    if (durationSeconds !== null) {
      observeHistogram(
        this.#realtimeDurations,
        { sli: observation.sli, source: observation.source },
        durationSeconds,
        REALTIME_DURATION_BUCKETS_SECONDS,
      );
    }
    this.#realtimeWindow.push({
      observedAtMs,
      sli: observation.sli,
      outcome: observation.outcome,
      durationSeconds,
    });
    return { replayed: false };
  }

  recordAgentCleanup(observation: AgentCleanupObservation): void {
    const durationSeconds = nonNegativeFinite(observation.durationMs / 1_000);
    const observedAtMs = this.#clock().getTime();
    incrementCounter(this.#cleanupCounters, {
      provider: observation.provider,
      outcome: observation.outcome,
    });
    observeHistogram(
      this.#cleanupDurations,
      { provider: observation.provider },
      durationSeconds,
      REALTIME_DURATION_BUCKETS_SECONDS,
    );
    this.#cleanupWindow.push({
      observedAtMs,
      outcome: observation.outcome,
      durationSeconds,
    });
    this.#purgeWindow();
  }

  snapshot(): SloSnapshot {
    this.#purgeWindow();
    const indicators = [
      ratioIndicator(
        "control_plane_availability",
        0.999,
        "authoritative",
        this.#httpWindow.filter((item) => CRITICAL_OPERATIONS.has(item.operation)),
        (item) => item.statusCode < 500,
      ),
      ratioIndicator(
        "rtc_join_success",
        0.99,
        "proxy",
        this.#realtimeWindow.filter((item) => item.sli === "rtc_join"),
        (item) => item.outcome === "success",
      ),
      latencyIndicator(
        "turn_first_output",
        0.95,
        2,
        this.#realtimeWindow.filter((item) => item.sli === "turn_first_output"),
      ),
      latencyIndicator(
        "barge_in_stop",
        0.95,
        0.5,
        this.#realtimeWindow.filter((item) => item.sli === "barge_in_stop"),
      ),
      latencyIndicator("agent_cleanup", 0.95, 60, this.#cleanupWindow),
    ];
    return {
      generated_at: this.#clock().toISOString(),
      window_seconds: this.#windowSeconds,
      sample_warning: indicators.some(
        (indicator) => indicator.eligible_events > 0 && indicator.eligible_events < 100,
      ),
      indicators,
    };
  }

  renderPrometheus(): string {
    const lines = [
      "# HELP voice_api_http_requests_total Completed API requests.",
      "# TYPE voice_api_http_requests_total counter",
      ...renderCounters("voice_api_http_requests_total", this.#httpCounters),
      "# HELP voice_api_http_request_duration_seconds API request duration.",
      "# TYPE voice_api_http_request_duration_seconds histogram",
      ...renderHistograms(
        "voice_api_http_request_duration_seconds",
        this.#httpDurations,
        HTTP_DURATION_BUCKETS_SECONDS,
      ),
      "# HELP voice_realtime_sli_observations_total Browser realtime SLI observations.",
      "# TYPE voice_realtime_sli_observations_total counter",
      ...renderCounters("voice_realtime_sli_observations_total", this.#realtimeCounters),
      "# HELP voice_realtime_sli_duration_seconds Browser realtime SLI duration.",
      "# TYPE voice_realtime_sli_duration_seconds histogram",
      ...renderHistograms(
        "voice_realtime_sli_duration_seconds",
        this.#realtimeDurations,
        REALTIME_DURATION_BUCKETS_SECONDS,
      ),
      "# HELP voice_agent_cleanup_total Agent cleanup attempts.",
      "# TYPE voice_agent_cleanup_total counter",
      ...renderCounters("voice_agent_cleanup_total", this.#cleanupCounters),
      "# HELP voice_agent_cleanup_duration_seconds Agent cleanup acknowledgement duration.",
      "# TYPE voice_agent_cleanup_duration_seconds histogram",
      ...renderHistograms(
        "voice_agent_cleanup_duration_seconds",
        this.#cleanupDurations,
        REALTIME_DURATION_BUCKETS_SECONDS,
      ),
    ];
    return `${lines.join("\n")}\n`;
  }

  #purgeWindow(): void {
    const cutoff = this.#clock().getTime() - this.#windowSeconds * 1_000;
    removeBefore(this.#httpWindow, cutoff);
    removeBefore(this.#realtimeWindow, cutoff);
    removeBefore(this.#cleanupWindow, cutoff);
    for (const [key, observedAtMs] of this.#observationIds) {
      if (observedAtMs < cutoff) {
        this.#observationIds.delete(key);
      }
    }
  }
}

function ratioIndicator<T>(
  name: SloIndicatorName,
  objectiveRatio: number,
  measurementQuality: SloIndicator["measurement_quality"],
  observations: readonly T[],
  isGood: (observation: T) => boolean,
): SloIndicator {
  const goodEvents = observations.filter(isGood).length;
  return indicatorResult(
    name,
    objectiveRatio,
    null,
    measurementQuality,
    observations.length,
    goodEvents,
  );
}

function latencyIndicator<
  T extends { outcome: "success" | "failure"; durationSeconds: number | null },
>(
  name: SloIndicatorName,
  objectiveRatio: number,
  thresholdSeconds: number,
  observations: readonly T[],
): SloIndicator {
  const goodEvents = observations.filter(
    (item) =>
      item.outcome === "success" &&
      item.durationSeconds !== null &&
      item.durationSeconds <= thresholdSeconds,
  ).length;
  return indicatorResult(
    name,
    objectiveRatio,
    thresholdSeconds,
    "proxy",
    observations.length,
    goodEvents,
  );
}

function indicatorResult(
  name: SloIndicatorName,
  objectiveRatio: number,
  thresholdSeconds: number | null,
  measurementQuality: SloIndicator["measurement_quality"],
  eligibleEvents: number,
  goodEvents: number,
): SloIndicator {
  const achievedRatio = eligibleEvents === 0 ? null : goodEvents / eligibleEvents;
  const badEvents = eligibleEvents - goodEvents;
  const errorBudgetEvents = Math.floor(eligibleEvents * (1 - objectiveRatio));
  return {
    name,
    objective_ratio: objectiveRatio,
    threshold_seconds: thresholdSeconds,
    measurement_quality: measurementQuality,
    eligible_events: eligibleEvents,
    good_events: goodEvents,
    achieved_ratio: achievedRatio,
    error_budget_events: errorBudgetEvents,
    error_budget_remaining_events: errorBudgetEvents - badEvents,
    status:
      achievedRatio === null ? "no_data" : achievedRatio >= objectiveRatio ? "meeting" : "breached",
  };
}

function incrementCounter(
  collection: Map<string, CounterSeries>,
  labels: Readonly<Record<string, string>>,
): void {
  const key = labelKey(labels);
  const series = collection.get(key) ?? { labels, count: 0 };
  series.count += 1;
  collection.set(key, series);
}

function observeHistogram(
  collection: Map<string, HistogramSeries>,
  labels: Readonly<Record<string, string>>,
  value: number,
  buckets: readonly number[],
): void {
  const key = labelKey(labels);
  const series = collection.get(key) ?? {
    labels,
    count: 0,
    sum: 0,
    buckets: buckets.map(() => 0),
  };
  series.count += 1;
  series.sum += value;
  for (const [index, boundary] of buckets.entries()) {
    if (value <= boundary) {
      series.buckets[index] = (series.buckets[index] ?? 0) + 1;
    }
  }
  collection.set(key, series);
}

function renderCounters(name: string, collection: ReadonlyMap<string, CounterSeries>): string[] {
  return [...collection.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, series]) => `${name}${renderLabels(series.labels)} ${series.count}`);
}

function renderHistograms(
  name: string,
  collection: ReadonlyMap<string, HistogramSeries>,
  buckets: readonly number[],
): string[] {
  return [...collection.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, series]) => [
      ...buckets.map(
        (boundary, index) =>
          `${name}_bucket${renderLabels({ ...series.labels, le: String(boundary) })} ${series.buckets[index] ?? 0}`,
      ),
      `${name}_bucket${renderLabels({ ...series.labels, le: "+Inf" })} ${series.count}`,
      `${name}_sum${renderLabels(series.labels)} ${series.sum}`,
      `${name}_count${renderLabels(series.labels)} ${series.count}`,
    ]);
}

function labelKey(labels: Readonly<Record<string, string>>): string {
  return Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
}

function renderLabels(labels: Readonly<Record<string, string>>): string {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return "";
  }
  return `{${entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(",")}}`;
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

function removeBefore<T extends { observedAtMs: number }>(items: T[], cutoff: number): void {
  const firstRetained = items.findIndex((item) => item.observedAtMs >= cutoff);
  if (firstRetained === -1) {
    items.length = 0;
  } else if (firstRetained > 0) {
    items.splice(0, firstRetained);
  }
}

function boundedLabel(value: string, fallback: string): string {
  return /^[A-Za-z0-9_.-]{1,80}$/u.test(value) ? value : fallback;
}

function httpStatusClass(statusCode: number): string {
  return statusCode >= 100 && statusCode <= 599 ? `${Math.floor(statusCode / 100)}xx` : "other";
}

function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
