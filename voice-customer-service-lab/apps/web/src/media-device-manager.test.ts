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
