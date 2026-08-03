import { describe, expect, it, vi } from "vitest";

import { BrowserMediaDeviceManager } from "./media-device-manager";

describe("BrowserMediaDeviceManager", () => {
  it("requests permission, stops the preflight track and returns microphones", async () => {
    const stop = vi.fn();
    const manager = new BrowserMediaDeviceManager({
      isSecureContext: true,
      mediaDevices: {
        enumerateDevices: async () => [
          device("audioinput", "default", "Mac 麦克风"),
          device("audiooutput", "speaker", "Mac 扬声器"),
        ],
        getUserMedia: async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    const snapshot = await manager.requestMicrophoneAccess();

    expect(stop).toHaveBeenCalledOnce();
    expect(snapshot.permission).toBe("granted");
    expect(snapshot.microphones).toEqual([{ deviceId: "default", label: "Mac 麦克风" }]);
  });

  it("refuses microphone access outside a secure context", async () => {
    const manager = new BrowserMediaDeviceManager({
      isSecureContext: false,
      mediaDevices: undefined,
    });

    await expect(manager.requestMicrophoneAccess()).rejects.toMatchObject({
      code: "INSECURE_CONTEXT",
    });
  });

  it("maps a browser permission rejection to a stable error", async () => {
    const manager = new BrowserMediaDeviceManager({
      isSecureContext: true,
      mediaDevices: {
        enumerateDevices: async () => [],
        getUserMedia: async () => {
          throw new DOMException("denied", "NotAllowedError");
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    await expect(manager.requestMicrophoneAccess()).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });

  it("reads an existing browser permission without opening the microphone", async () => {
    const getUserMedia = vi.fn();
    const manager = new BrowserMediaDeviceManager({
      isSecureContext: true,
      mediaDevices: {
        enumerateDevices: async () => [device("audioinput", "mic-1", "Desk mic")],
        getUserMedia,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      queryMicrophonePermission: async () => "granted",
    });

    await expect(manager.inspect()).resolves.toMatchObject({ permission: "granted" });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("rejects a microphone blocked by the page Permissions Policy", async () => {
    const manager = new BrowserMediaDeviceManager({
      isSecureContext: true,
      mediaDevices: {
        enumerateDevices: async () => [],
        getUserMedia: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      microphoneAllowed: false,
    });

    await expect(manager.inspect()).rejects.toMatchObject({
      code: "PERMISSION_POLICY_BLOCKED",
    });
  });

  it("forwards devicechange enumeration failures to diagnostics", async () => {
    let deviceChange: EventListener | undefined;
    const onError = vi.fn();
    const manager = new BrowserMediaDeviceManager({
      isSecureContext: true,
      mediaDevices: {
        enumerateDevices: async () => {
          throw new DOMException("hardware", "NotReadableError");
        },
        getUserMedia: vi.fn(),
        addEventListener: vi.fn((_type, listener) => {
          deviceChange = listener;
        }),
        removeEventListener: vi.fn(),
      },
    });

    manager.subscribe(vi.fn(), onError);
    deviceChange?.(new Event("devicechange"));

    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "MICROPHONE_BUSY",
        }),
      ),
    );
  });
});

function device(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return {
    kind,
    deviceId,
    label,
    groupId: "test-group",
    toJSON: () => ({}),
  };
}
