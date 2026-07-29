import type { RtcCredentials } from "@voice/contracts";
import type { ConnectionState, IRTCEngine } from "@volcengine/rtc";

type RtcSdkModule = typeof import("@volcengine/rtc");
type RtcSdkLoader = () => Promise<RtcSdkModule>;

export type RtcConnectionPhase = "idle" | "joining" | "connected" | "reconnecting" | "disconnected";

export interface JoinRtcRoomOptions {
  readonly credentials: RtcCredentials;
  readonly microphoneId: string | undefined;
  readonly onConnectionPhase?: (phase: RtcConnectionPhase) => void;
  readonly onTokenWillExpire?: () => void;
  readonly onFatalError?: (code: string) => void;
}

export class RtcClientError extends Error {
  constructor(
    readonly code:
      | "REAL_TOKEN_REQUIRED"
      | "TOKEN_EXPIRED"
      | "UNSUPPORTED_BROWSER"
      | "ALREADY_JOINED"
      | "NOT_JOINED"
      | "JOIN_FAILED"
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
    await this.#engine.setAudioCaptureDevice(deviceId);
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
    case "JOIN_FAILED":
      return "加入 RTC 房间失败，请检查 Token 是否过期以及 Room/User 是否一致。";
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

function toRtcClientError(error: unknown, code: "JOIN_FAILED" | "CLEANUP_FAILED"): RtcClientError {
  if (error instanceof RtcClientError) {
    return error;
  }
  return new RtcClientError(code, error instanceof Error ? error.message : "RTC operation failed.");
}
