import type { RtcCredentials } from "@voice/contracts";
import type { IRTCEngine } from "@volcengine/rtc";
import { describe, expect, it, vi } from "vitest";

import { VolcengineRtcRoomAdapter } from "./rtc-room-adapter";

describe("VolcengineRtcRoomAdapter", () => {
  it("joins with the exact server credentials and releases in order", async () => {
    const calls: string[] = [];
    const engine = fakeEngine(calls);
    const sdk = fakeSdk(engine, calls);
    const adapter = new VolcengineRtcRoomAdapter(async () => sdk);

    await adapter.join({
      credentials: credentials(),
      microphoneId: "mic_001",
    });
    await adapter.leave();

    expect(engine.joinRoom).toHaveBeenCalledWith(
      "001-test-token",
      "ses_000001",
      { userId: "usr_000001" },
      {
        isAutoPublish: true,
        isAutoSubscribeAudio: true,
        isAutoSubscribeVideo: false,
      },
    );
    expect(engine.startAudioCapture).toHaveBeenCalledWith("mic_001");
    expect(engine.setAudioCaptureConfig).toHaveBeenCalledWith({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    expect(engine.enableAudioPropertiesReport).toHaveBeenNthCalledWith(1, {
      interval: 500,
      enableInBackground: false,
    });
    expect(engine.enableAudioPropertiesReport).toHaveBeenLastCalledWith({ interval: 0 });
    expect(
      vi.mocked(engine.setAudioCaptureConfig).mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    ).toBeLessThan(
      vi.mocked(engine.joinRoom).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(calls).toEqual(["join", "capture.start", "capture.stop", "leave", "destroy"]);
  });

  it("rejects mock credentials before loading the cloud SDK", async () => {
    const loadSdk = vi.fn();
    const adapter = new VolcengineRtcRoomAdapter(loadSdk);

    await expect(
      adapter.join({
        credentials: { ...credentials(), kind: "mock", app_id: "mock" },
        microphoneId: undefined,
      }),
    ).rejects.toMatchObject({ code: "REAL_TOKEN_REQUIRED" });
    expect(loadSdk).not.toHaveBeenCalled();
  });

  it("rejects an expired credential before loading the cloud SDK", async () => {
    const loadSdk = vi.fn();
    const adapter = new VolcengineRtcRoomAdapter(loadSdk);

    await expect(
      adapter.join({
        credentials: { ...credentials(), expires_at: "2020-01-01T00:00:00.000Z" },
        microphoneId: "mic_001",
      }),
    ).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    expect(loadSdk).not.toHaveBeenCalled();
  });

  it("destroys the engine when audio capture fails after joining", async () => {
    const calls: string[] = [];
    const engine = fakeEngine(calls);
    vi.mocked(engine.startAudioCapture).mockImplementation(async () => {
      calls.push("capture.failed");
      throw new Error("device busy");
    });
    const adapter = new VolcengineRtcRoomAdapter(async () => fakeSdk(engine, calls));

    await expect(
      adapter.join({ credentials: credentials(), microphoneId: "mic_001" }),
    ).rejects.toMatchObject({ code: "JOIN_FAILED" });
    expect(calls).toEqual(["join", "capture.failed", "leave", "destroy"]);
  });

  it("does not start the microphone when a pending join is cancelled", async () => {
    const calls: string[] = [];
    let completeJoin: (() => void) | undefined;
    const engine = fakeEngine(calls);
    vi.mocked(engine.joinRoom).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          completeJoin = () => {
            calls.push("join.completed");
            resolve();
          };
        }),
    );
    const adapter = new VolcengineRtcRoomAdapter(async () => fakeSdk(engine, calls));

    const joining = adapter.join({ credentials: credentials(), microphoneId: "mic_001" });
    await vi.waitFor(() => expect(engine.joinRoom).toHaveBeenCalledOnce());
    await adapter.leave();
    completeJoin?.();

    await expect(joining).rejects.toMatchObject({ code: "JOIN_FAILED" });
    expect(engine.startAudioCapture).not.toHaveBeenCalled();
    expect(calls).toEqual(["destroy", "join.completed"]);
  });

  it("reports remote presence and decodes VoiceChat messages", async () => {
    const calls: string[] = [];
    const listeners = new Map<string, (event: never) => void>();
    const engine = fakeEngine(calls, listeners);
    const sdk = fakeSdk(engine, calls);
    const onRemoteUserJoined = vi.fn();
    const onVoiceMessage = vi.fn();
    const adapter = new VolcengineRtcRoomAdapter(async () => sdk);

    await adapter.join({
      credentials: credentials(),
      microphoneId: "mic_001",
      onRemoteUserJoined,
      onVoiceMessage,
    });
    listeners.get("onUserJoined")?.({
      userInfo: { userId: "bot_000001" },
      publishState: {},
    } as never);
    listeners.get("onRoomBinaryMessageReceived")?.({
      userId: "bot_000001",
      message: encodeTlv("conv", {
        TaskId: "tsk_000001",
        UserID: "bot_000001",
        RoundID: 1,
        EventTime: 100,
        Stage: { Code: 1, Description: "listening" },
      }),
    } as never);

    expect(onRemoteUserJoined).toHaveBeenCalledWith("bot_000001");
    expect(onVoiceMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "conversation-status", stage: "listening" }),
      "bot_000001",
    );
  });

  it("updates an expiring Token without joining the room twice", async () => {
    const calls: string[] = [];
    const engine = fakeEngine(calls);
    const adapter = new VolcengineRtcRoomAdapter(async () => fakeSdk(engine, calls));

    await adapter.join({ credentials: credentials(), microphoneId: "mic_001" });
    await adapter.updateToken("001-refreshed-token");

    expect(engine.updateToken).toHaveBeenCalledWith("001-refreshed-token");
    expect(engine.joinRoom).toHaveBeenCalledOnce();
  });

  it("can disable browser speech processing for an explicit diagnostic join", async () => {
    const calls: string[] = [];
    const engine = fakeEngine(calls);
    const adapter = new VolcengineRtcRoomAdapter(async () => fakeSdk(engine, calls));

    await adapter.join({
      credentials: credentials(),
      microphoneId: "mic_001",
      audioProcessingMode: "unprocessed",
    });

    expect(engine.setAudioCaptureConfig).toHaveBeenCalledWith({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });

  it("reports local microphone level and device removal without exposing raw audio", async () => {
    const calls: string[] = [];
    const listeners = new Map<string, (event: never) => void>();
    const engine = fakeEngine(calls, listeners);
    const onMicrophoneLevel = vi.fn();
    const onMicrophoneDeviceState = vi.fn();
    const adapter = new VolcengineRtcRoomAdapter(async () => fakeSdk(engine, calls));

    await adapter.join({
      credentials: credentials(),
      microphoneId: "mic_001",
      onMicrophoneLevel,
      onMicrophoneDeviceState,
    });
    listeners.get("onLocalAudioPropertiesReport")?.([
      { audioPropertiesInfo: { linearVolume: 42, nonlinearVolume: -45 } },
    ] as never);
    listeners.get("onAudioDeviceStateChanged")?.({
      mediaDeviceInfo: device("audioinput", "mic_001", "USB Mic"),
      deviceState: "inactive",
    } as never);

    expect(onMicrophoneLevel).toHaveBeenCalledWith(42);
    expect(onMicrophoneDeviceState).toHaveBeenCalledWith({
      deviceId: "mic_001",
      label: "USB Mic",
      state: "inactive",
    });
  });

  it("maps a live microphone switch failure to a stable error", async () => {
    const calls: string[] = [];
    const engine = fakeEngine(calls);
    vi.mocked(engine.setAudioCaptureDevice).mockRejectedValue(new Error("device busy"));
    const adapter = new VolcengineRtcRoomAdapter(async () => fakeSdk(engine, calls));

    await adapter.join({ credentials: credentials(), microphoneId: "mic_001" });

    await expect(adapter.switchMicrophone("mic_002")).rejects.toMatchObject({
      code: "DEVICE_SWITCH_FAILED",
    });
  });
});

function credentials(): RtcCredentials {
  return {
    kind: "volcengine",
    app_id: "123456781234567812345678",
    room_id: "ses_000001",
    user_id: "usr_000001",
    token: "001-test-token",
    expires_at: "2099-07-29T08:20:00.000Z",
  };
}

function fakeEngine(calls: string[], listeners?: Map<string, (event: never) => void>): IRTCEngine {
  return {
    on: vi.fn((event: string, listener: (event: never) => void) => {
      listeners?.set(event, listener);
    }),
    joinRoom: vi.fn(async () => {
      calls.push("join");
    }),
    startAudioCapture: vi.fn(async () => {
      calls.push("capture.start");
      return {};
    }),
    stopAudioCapture: vi.fn(async () => {
      calls.push("capture.stop");
    }),
    leaveRoom: vi.fn(async () => {
      calls.push("leave");
    }),
    setAudioCaptureDevice: vi.fn(async () => undefined),
    setAudioCaptureConfig: vi.fn(async () => undefined),
    enableAudioPropertiesReport: vi.fn(),
    updateToken: vi.fn(async () => undefined),
  } as unknown as IRTCEngine;
}

function fakeSdk(engine: IRTCEngine, calls: string[]) {
  return {
    ConnectionState: {
      CONNECTION_START: 0,
      CONNECTION_STATE_DISCONNECTED: 1,
      CONNECTION_STATE_CONNECTING: 2,
      CONNECTION_STATE_CONNECTED: 3,
      CONNECTION_STATE_RECONNECTING: 4,
      CONNECTION_STATE_RECONNECTED: 5,
      CONNECTION_STATE_LOST: 6,
    },
    default: {
      isSupported: vi.fn(async () => true),
      createEngine: vi.fn(() => engine),
      destroyEngine: vi.fn(() => calls.push("destroy")),
      events: {
        onConnectionStateChanged: "onConnectionStateChanged",
        onTokenWillExpire: "onTokenWillExpire",
        onError: "onError",
        onUserJoined: "onUserJoined",
        onUserLeave: "onUserLeave",
        onRoomBinaryMessageReceived: "onRoomBinaryMessageReceived",
        onLocalAudioPropertiesReport: "onLocalAudioPropertiesReport",
        onAudioDeviceStateChanged: "onAudioDeviceStateChanged",
        onTrackEnded: "onTrackEnded",
      },
    },
  } as unknown as typeof import("@volcengine/rtc");
}

function device(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return {
    kind,
    deviceId,
    label,
    groupId: "test-group",
    toJSON: () => ({}),
  };
}

function encodeTlv(type: string, value: unknown): ArrayBuffer {
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const buffer = new ArrayBuffer(8 + payload.byteLength);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode(type), 0);
  new DataView(buffer).setUint32(4, payload.byteLength, false);
  bytes.set(payload, 8);
  return buffer;
}
