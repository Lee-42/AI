import { describe, expect, it } from "vitest";

import { RtcSubtitleOrderer } from "./rtc-event-ordering";
import type { VolcengineSubtitle } from "./volcengine-rtc-message";

describe("RtcSubtitleOrderer", () => {
  it("buffers a gap and releases events in sequence order", () => {
    const orderer = new RtcSubtitleOrderer();

    expect(orderer.push(subtitle(1)).ready.map(({ sequence }) => sequence)).toEqual([1]);
    expect(orderer.push(subtitle(3))).toMatchObject({ ready: [], gapDetected: true });
    expect(orderer.push(subtitle(2)).ready.map(({ sequence }) => sequence)).toEqual([2, 3]);
  });

  it("drops duplicates and orders each round independently", () => {
    const orderer = new RtcSubtitleOrderer();

    orderer.push(subtitle(1));
    expect(orderer.push(subtitle(1))).toMatchObject({ ready: [], duplicate: true });
    expect(orderer.push(subtitle(8, 2)).ready.map(({ sequence }) => sequence)).toEqual([8]);
  });

  it("bounds unresolved gaps instead of growing memory forever", () => {
    const orderer = new RtcSubtitleOrderer();
    orderer.push(subtitle(1));
    for (let sequence = 3; sequence <= 34; sequence += 1) {
      expect(orderer.push(subtitle(sequence)).overflowed).toBe(false);
    }

    expect(orderer.push(subtitle(35))).toMatchObject({
      ready: [],
      gapDetected: true,
      overflowed: true,
    });
  });
});

function subtitle(sequence: number, roundId = 1): VolcengineSubtitle {
  return {
    text: `text-${sequence}`,
    language: "zh-CN",
    userId: "usr_000001",
    sequence,
    definite: false,
    paragraph: false,
    roundId,
  };
}
