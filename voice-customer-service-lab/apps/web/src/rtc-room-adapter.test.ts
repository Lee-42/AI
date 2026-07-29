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

function fakeEngine(calls: string[]): IRTCEngine {
  return {
    on: vi.fn(),
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
      },
    },
  } as unknown as typeof import("@volcengine/rtc");
}
