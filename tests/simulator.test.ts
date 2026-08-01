import { describe, expect, it } from "vitest";
import { simulateTransfer, simulateTrials } from "../simulator/channel";

describe("optical channel simulator", () => {
  it("is reproducible for a fixed seed", () => {
    const options = { seed: 1234, payloadBytes: 4096, maxSourceFrames: 1000 };
    const first = simulateTransfer(options);
    const second = simulateTransfer(options);
    expect({ ...second, encodeMilliseconds: 0, decodeMilliseconds: 0 }).toEqual({
      ...first,
      encodeMilliseconds: 0,
      decodeMilliseconds: 0,
    });
  });

  it("completes with random loss, bursts, duplicates, reordering, and a late start", () => {
    const result = simulateTransfer({
      seed: 99,
      payloadBytes: 16 * 1024,
      blockLen: 512,
      randomLossRate: 0.2,
      burstStartRate: 0.02,
      duplicateRate: 0.1,
      reorderWindow: 16,
      startAfterFrames: 40,
      maxSourceFrames: 5000,
    });
    expect(result.completed).toBe(true);
    expect(result.integrityVerified).toBe(true);
    expect(result.framesDropped).toBeGreaterThan(0);
    expect(result.framesDuplicated).toBeGreaterThan(0);
    expect(result.overheadRatio).not.toBeNull();
  });

  it("recovers after a temporary foreign session", () => {
    const result = simulateTransfer({
      seed: 7,
      payloadBytes: 8192,
      blockLen: 256,
      sessionSwitchAt: 20,
      sessionSwitchFrames: 30,
      maxSourceFrames: 5000,
    });
    expect(result.completed).toBe(true);
    expect(result.integrityVerified).toBe(true);
  });

  it("reports integrity failures caused by corrupted fountain blocks", () => {
    const summary = simulateTrials(
      {
        payloadBytes: 4096,
        blockLen: 256,
        corruptionRate: 0.2,
        randomLossRate: 0,
        burstStartRate: 0,
        duplicateRate: 0,
        reorderWindow: 0,
        maxSourceFrames: 1000,
      },
      10,
    );
    expect(summary.completionRate).toBe(1);
    expect(summary.integritySuccessRate).toBeLessThan(1);
  });
});
