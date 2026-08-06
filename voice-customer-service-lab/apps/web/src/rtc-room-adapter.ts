import type { RtcCredentials } from "@voice/contracts";
import type { ConnectionState, IRTCEngine } from "@volcengine/rtc";

import { decodeVolcengineRtcMessage, type VolcengineRtcMessage } from "./volcengine-rtc-message";

type RtcSdkModule = typeof import("@volcengine/rtc");
type RtcSdkLoader = () => Promise<RtcSdkModule>;

export type RtcConnectionPhase = "idle" | "joining" | "connected" | "reconnecting" | "disconnected";
export type AudioProcessingMode = "speech" | "unprocessed";

export interface RtcMicrophoneDeviceEvent {
  readonly deviceId: string;
  readonly label: string;
  readonly state: "active" | "inactive";
}

export interface JoinRtcRoomOptions {
  readonly credentials: RtcCredentials;
  readonly microphoneId: string | undefined;
  readonly audioProcessingMode?: AudioProcessingMode;
  readonly onConnectionPhase?: (phase: RtcConnectionPhase) => void;
  readonly onTokenWillExpire?: () => void;
  readonly onFatalError?: (code: string) => void;
  readonly onRemoteUserJoined?: (userId: string) => void;
  readonly onRemoteUserLeft?: (userId: string) => void;
  readonly onVoiceMessage?: (message: VolcengineRtcMessage, senderUserId: string) => void;
  readonly onProtocolIssue?: (reason: string) => void;
  readonly onMicrophoneLevel?: (linearVolume: number) => void;
  readonly onMicrophoneDeviceState?: (event: RtcMicrophoneDeviceEvent) => void;
  readonly onMicrophoneTrackEnded?: () => void;
}

export class RtcClientError extends Error {
  constructor(
    readonly code:
      | "REAL_TOKEN_REQUIRED"
      | "TOKEN_EXPIRED"
      | "UNSUPPORTED_BROWSER"
      | "ALREADY_JOINED"
      | "NOT_JOINED"
      | "AUDIO_CONFIGURATION_FAILED"
      | "DEVICE_SWITCH_FAILED"
      | "JOIN_FAILED"
      | "TOKEN_REFRESH_FAILED"
      | "CLEANUP_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "RtcClientError";
  }
}

export class VolcengineRtcRoomAdapter {
  readonly #loadSdk: RtcSdkLoader;
  #sdk: RtcSdkModule | null = null;
  #engine: IRTCEngine | null = null;
  #joined = false;
  #capturing = false;
  #operationId = 0;

  constructor(loadSdk: RtcSdkLoader = () => import("@volcengine/rtc")) {
    this.#loadSdk = loadSdk;
  }

  async join(options: JoinRtcRoomOptions): Promise<void> {
    if (options.credentials.kind !== "volcengine") {
      throw new RtcClientError("REAL_TOKEN_REQUIRED", "A real Volcengine RTC Token is required.");
    }
    if (Date.parse(options.credentials.expires_at) <= Date.now() + 30_000) {
      throw new RtcClientError("TOKEN_EXPIRED", "The RTC Token is expired or about to expire.");
    }
    if (this.#engine) {
      throw new RtcClientError("ALREADY_JOINED", "An RTC engine already exists.");
    }

    const operationId = ++this.#operationId;
    options.onConnectionPhase?.("joining");
    const sdk = await this.#loadSdk();
    this.#assertCurrent(operationId);
    if (!(await sdk.default.isSupported())) {
      throw new RtcClientError("UNSUPPORTED_BROWSER", "This browser is not supported by RTC.");
    }
    this.#assertCurrent(operationId);

    const engine = sdk.default.createEngine(options.credentials.app_id);
    this.#sdk = sdk;
    this.#engine = engine;
    this.#bindEvents(engine, sdk, options);

    try {
      try {
        await engine.setAudioCaptureConfig(
          audioCaptureConfig(options.audioProcessingMode ?? "speech"),
        );
      } catch (error) {
        throw new RtcClientError(
          "AUDIO_CONFIGURATION_FAILED",
          error instanceof Error ? error.message : "Audio configuration failed.",
        );
      }
      engine.enableAudioPropertiesReport({ interval: 500, enableInBackground: false });
      await engine.joinRoom(
        options.credentials.token,
        options.credentials.room_id,
        { userId: options.credentials.user_id },
        {
          isAutoPublish: true,
          isAutoSubscribeAudio: true,
          isAutoSubscribeVideo: false,
        },
      );
      this.#assertCurrent(operationId);
      this.#joined = true;

      await engine.startAudioCapture(options.microphoneId);
      this.#assertCurrent(operationId);
      this.#capturing = true;
      options.onConnectionPhase?.("connected");
    } catch (error) {
      await this.#release().catch(() => undefined);
      throw toRtcClientError(error, "JOIN_FAILED");
    }
  }

  async switchMicrophone(deviceId: string): Promise<void> {
    if (!this.#engine || !this.#capturing) {
      throw new RtcClientError("NOT_JOINED", "Join the RTC room before switching devices.");
    }
    try {
      await this.#engine.setAudioCaptureDevice(deviceId);
    } catch (error) {
      throw new RtcClientError(
        "DEVICE_SWITCH_FAILED",
        error instanceof Error ? error.message : "Microphone switch failed.",
      );
    }
  }

  async updateToken(token: string): Promise<void> {
    if (!this.#engine || !this.#joined) {
      throw new RtcClientError("NOT_JOINED", "Join the RTC room before refreshing its Token.");
    }
    try {
      await this.#engine.updateToken(token);
    } catch (error) {
      throw toRtcClientError(error, "TOKEN_REFRESH_FAILED");
    }
  }

  async leave(): Promise<void> {
    try {
      await this.#release();
    } catch (error) {
      throw toRtcClientError(error, "CLEANUP_FAILED");
    }
  }

  #bindEvents(engine: IRTCEngine, sdk: RtcSdkModule, options: JoinRtcRoomOptions): void {
    engine.on(sdk.default.events.onConnectionStateChanged, ({ state }) => {
      options.onConnectionPhase?.(mapConnectionState(state, sdk));
    });
    engine.on(sdk.default.events.onTokenWillExpire, () => options.onTokenWillExpire?.());
    engine.on(sdk.default.events.onError, ({ errorCode }) => {
      options.onFatalError?.(String(errorCode));
    });
    engine.on(sdk.default.events.onUserJoined, ({ userInfo }) => {
      options.onRemoteUserJoined?.(userInfo.userId);
    });
    engine.on(sdk.default.events.onUserLeave, ({ userInfo }) => {
      options.onRemoteUserLeft?.(userInfo.userId);
    });
    engine.on(sdk.default.events.onRoomBinaryMessageReceived, ({ userId, message }) => {
      const result = decodeVolcengineRtcMessage(message);
      if (result.status === "decoded") {
        options.onVoiceMessage?.(result.message, userId);
      } else if (result.status === "rejected") {
        // Do not log raw transcript bytes; only expose a stable diagnostic reason.
        options.onProtocolIssue?.(result.reason);
      }
    });
    engine.on(sdk.default.events.onLocalAudioPropertiesReport, (reports) => {
      const levels = reports.map((report) => report.audioPropertiesInfo.linearVolume);
      if (levels.length > 0) {
        options.onMicrophoneLevel?.(Math.max(...levels));
      }
    });
    engine.on(sdk.default.events.onAudioDeviceStateChanged, ({ mediaDeviceInfo, deviceState }) => {
      if (mediaDeviceInfo.kind === "audioinput") {
        options.onMicrophoneDeviceState?.({
          deviceId: mediaDeviceInfo.deviceId,
          label: mediaDeviceInfo.label,
          state: deviceState,
        });
      }
    });
    engine.on(sdk.default.events.onTrackEnded, ({ kind, isScreen }) => {
      if (this.#capturing && kind === "audio" && !isScreen) {
        options.onMicrophoneTrackEnded?.();
      }
    });
  }

  async #release(): Promise<void> {
    this.#operationId += 1;
    const engine = this.#engine;
    const sdk = this.#sdk;
    const wasCapturing = this.#capturing;
    const wasJoined = this.#joined;

    this.#engine = null;
    this.#sdk = null;
    this.#capturing = false;
    this.#joined = false;

    if (!engine || !sdk) {
      return;
    }

    let firstError: unknown;
    try {
      engine.enableAudioPropertiesReport({ interval: 0 });
    } catch (error) {
      firstError = error;
    }
    if (wasCapturing) {
      try {
        await engine.stopAudioCapture();
      } catch (error) {
        firstError = error;
      }
    }
    if (wasJoined) {
      try {
        await engine.leaveRoom();
      } catch (error) {
        firstError ??= error;
      }
    }

    sdk.default.destroyEngine(engine);
    if (firstError) {
      throw firstError;
    }
  }

  #assertCurrent(operationId: number): void {
    if (operationId !== this.#operationId) {
      throw new RtcClientError("JOIN_FAILED", "RTC join was cancelled.");
    }
  }
}

export function rtcClientErrorMessage(error: unknown): string {
  if (!(error instanceof RtcClientError)) {
    return "RTC 操作失败，请检查网络、设备和 Token 后重试。";
  }

  switch (error.code) {
    case "REAL_TOKEN_REQUIRED":
      return "当前是 Mock Token，不能加入真实 RTC 房间。";
    case "TOKEN_EXPIRED":
      return "RTC Token 已过期或即将过期，请重新创建会话。";
    case "UNSUPPORTED_BROWSER":
      return "当前浏览器不受 RTC SDK 支持，请使用最新版 Chrome。";
    case "ALREADY_JOINED":
      return "已经创建 RTC 连接，请先退出当前房间。";
    case "NOT_JOINED":
      return "尚未加入 RTC 房间。";
    case "AUDIO_CONFIGURATION_FAILED":
      return "音频处理配置失败，请恢复推荐设置后重新加入房间。";
    case "DEVICE_SWITCH_FAILED":
      return "麦克风切换失败，已保留原设备；请检查新设备是否可用。";
    case "JOIN_FAILED":
      return "加入 RTC 房间失败，请检查 Token 是否过期以及 Room/User 是否一致。";
    case "TOKEN_REFRESH_FAILED":
      return "RTC Token 更新失败，请结束当前会话后重新创建。";
    case "CLEANUP_FAILED":
      return "RTC 资源清理出现异常，请刷新页面并检查控制台会话状态。";
  }
}

function mapConnectionState(state: ConnectionState, sdk: RtcSdkModule): RtcConnectionPhase {
  switch (state) {
    case sdk.ConnectionState.CONNECTION_STATE_CONNECTING:
    case sdk.ConnectionState.CONNECTION_START:
      return "joining";
    case sdk.ConnectionState.CONNECTION_STATE_CONNECTED:
    case sdk.ConnectionState.CONNECTION_STATE_RECONNECTED:
      return "connected";
    case sdk.ConnectionState.CONNECTION_STATE_RECONNECTING:
      return "reconnecting";
    case sdk.ConnectionState.CONNECTION_STATE_DISCONNECTED:
    case sdk.ConnectionState.CONNECTION_STATE_LOST:
      return "disconnected";
  }
}

function toRtcClientError(
  error: unknown,
  code: "JOIN_FAILED" | "TOKEN_REFRESH_FAILED" | "CLEANUP_FAILED",
): RtcClientError {
  if (error instanceof RtcClientError) {
    return error;
  }
  return new RtcClientError(code, error instanceof Error ? error.message : "RTC operation failed.");
}

function audioCaptureConfig(mode: AudioProcessingMode): MediaTrackConstraints {
  const enabled = mode === "speech";
  return {
    echoCancellation: enabled,
    noiseSuppression: enabled,
    autoGainControl: enabled,
  };
}
