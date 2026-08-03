export type MicrophonePermission = "unknown" | PermissionState;

export interface AudioInputDevice {
  readonly deviceId: string;
  readonly label: string;
}

export interface AudioDeviceSnapshot {
  readonly permission: MicrophonePermission;
  readonly microphones: readonly AudioInputDevice[];
}

interface MediaDevicesPort {
  enumerateDevices(): Promise<readonly MediaDeviceInfo[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  addEventListener(type: "devicechange", listener: EventListener): void;
  removeEventListener(type: "devicechange", listener: EventListener): void;
}

interface DeviceEnvironment {
  readonly isSecureContext: boolean;
  readonly mediaDevices: MediaDevicesPort | undefined;
  readonly microphoneAllowed?: boolean;
  readonly queryMicrophonePermission?: () => Promise<PermissionState>;
}

export type MediaDeviceErrorCode =
  | "INSECURE_CONTEXT"
  | "UNSUPPORTED_BROWSER"
  | "PERMISSION_POLICY_BLOCKED"
  | "PERMISSION_DENIED"
  | "NO_MICROPHONE"
  | "MICROPHONE_BUSY"
  | "DEVICE_ERROR";

export class MediaDeviceError extends Error {
  constructor(
    readonly code: MediaDeviceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MediaDeviceError";
  }
}

export class BrowserMediaDeviceManager {
  readonly #environment: DeviceEnvironment;
  #permission: MicrophonePermission = "unknown";

  constructor(environment: DeviceEnvironment = browserEnvironment()) {
    this.#environment = environment;
  }

  async inspect(): Promise<AudioDeviceSnapshot> {
    const mediaDevices = this.#requireMediaDevices();
    await this.#refreshPermission();
    const devices = await mediaDevices.enumerateDevices();
    return {
      permission: this.#permission,
      microphones: toMicrophones(devices),
    };
  }

  async requestMicrophoneAccess(): Promise<AudioDeviceSnapshot> {
    const mediaDevices = this.#requireMediaDevices();
    let stream: MediaStream | undefined;

    try {
      stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      this.#permission = "granted";
    } catch (error) {
      const deviceError = toMediaDeviceError(error);
      if (deviceError.code === "PERMISSION_DENIED") {
        this.#permission = "denied";
      }
      throw deviceError;
    } finally {
      // Permission preflight must not leave a hidden microphone capture running.
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    }

    const snapshot = await this.inspect();
    if (snapshot.microphones.length === 0) {
      throw new MediaDeviceError("NO_MICROPHONE", "No microphone is available.");
    }
    return snapshot;
  }

  subscribe(
    listener: (snapshot: AudioDeviceSnapshot) => void,
    onError: (error: MediaDeviceError) => void = () => undefined,
  ): () => void {
    const mediaDevices = this.#requireMediaDevices();
    const handleDeviceChange: EventListener = () => {
      void this.inspect()
        .then(listener)
        .catch((error) => onError(toMediaDeviceError(error)));
    };

    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => mediaDevices.removeEventListener("devicechange", handleDeviceChange);
  }

  #requireMediaDevices(): MediaDevicesPort {
    if (!this.#environment.isSecureContext) {
      throw new MediaDeviceError(
        "INSECURE_CONTEXT",
        "Microphone access requires HTTPS or localhost.",
      );
    }
    if (!this.#environment.mediaDevices) {
      throw new MediaDeviceError("UNSUPPORTED_BROWSER", "MediaDevices is not supported.");
    }
    if (this.#environment.microphoneAllowed === false) {
      throw new MediaDeviceError(
        "PERMISSION_POLICY_BLOCKED",
        "Microphone access is blocked by Permissions Policy.",
      );
    }
    return this.#environment.mediaDevices;
  }

  async #refreshPermission(): Promise<void> {
    if (!this.#environment.queryMicrophonePermission) {
      return;
    }
    try {
      this.#permission = await this.#environment.queryMicrophonePermission();
    } catch {
      // Firefox and older Safari may not support querying the microphone permission.
    }
  }
}

export function mediaDeviceErrorMessage(error: unknown): string {
  if (!(error instanceof MediaDeviceError)) {
    return "无法读取麦克风，请检查浏览器和系统设备设置。";
  }

  switch (error.code) {
    case "INSECURE_CONTEXT":
      return "麦克风只能在 HTTPS 或 localhost 中使用。";
    case "UNSUPPORTED_BROWSER":
      return "当前浏览器不支持所需的音频设备 API，请使用最新版 Chrome。";
    case "PERMISSION_POLICY_BLOCKED":
      return "当前页面被 Permissions-Policy 禁止使用麦克风，请检查站点或 iframe 配置。";
    case "PERMISSION_DENIED":
      return "麦克风权限被拒绝。请检查浏览器网站设置和系统隐私设置，允许后重新检查。";
    case "NO_MICROPHONE":
      return "没有检测到可用麦克风，请连接设备后重试。";
    case "MICROPHONE_BUSY":
      return "麦克风可能正被其他应用占用，请关闭占用程序后重试。";
    case "DEVICE_ERROR":
      return "麦克风启动失败，请检查浏览器和系统设备设置。";
  }
}

function browserEnvironment(): DeviceEnvironment {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { isSecureContext: false, mediaDevices: undefined };
  }
  const policyDocument = document as Document & {
    permissionsPolicy?: { allowsFeature(feature: string): boolean };
    featurePolicy?: { allowsFeature(feature: string): boolean };
  };
  const policy = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy;
  const queryMicrophonePermission = navigator.permissions
    ? () =>
        navigator.permissions.query({ name: "microphone" as PermissionName }).then((p) => p.state)
    : null;
  return {
    isSecureContext: window.isSecureContext,
    mediaDevices: navigator.mediaDevices,
    microphoneAllowed: policy?.allowsFeature("microphone") ?? true,
    ...(queryMicrophonePermission ? { queryMicrophonePermission } : {}),
  };
}

function toMicrophones(devices: readonly MediaDeviceInfo[]): AudioInputDevice[] {
  return devices
    .filter((device) => device.kind === "audioinput" && device.deviceId)
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `麦克风 ${index + 1}`,
    }));
}

function toMediaDeviceError(error: unknown): MediaDeviceError {
  const name = error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new MediaDeviceError("PERMISSION_DENIED", "Microphone permission was denied.");
    case "NotFoundError":
    case "OverconstrainedError":
      return new MediaDeviceError("NO_MICROPHONE", "No microphone is available.");
    case "NotReadableError":
    case "AbortError":
      return new MediaDeviceError("MICROPHONE_BUSY", "The microphone could not be opened.");
    default:
      return new MediaDeviceError("DEVICE_ERROR", "The microphone could not be opened.");
  }
}
