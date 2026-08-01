import { describe, expect, it } from "vitest";
import { calculateOpticalEstimate } from "../benchmark/metrics";

const base = {
  blockBytes: 1445,
  overheadRatio: 1.2,
  configuredSenderFps: 24,
  senderComputeMillisecondsPerFrame: 4,
  receiverComputeMillisecondsPerFrame: 5,
};

describe("benchmark optical estimate", () => {
  it("uses configured sender FPS when compute and camera are faster", () => {
    const estimate = calculateOpticalEstimate({ ...base, cameraCaptureFps: 30 });
    expect(estimate.limitingStage).toBe("configured_sender_fps");
    expect(estimate.effectiveFps).toBe(24);
    expect(estimate.estimatedOpticalGoodputKiBps).toBeCloseTo(28.2227, 3);
  });

  it("uses measured camera FPS when it is the bottleneck", () => {
    const estimate = calculateOpticalEstimate({ ...base, cameraCaptureFps: 15 });
    expect(estimate.limitingStage).toBe("camera_capture");
    expect(estimate.effectiveFps).toBe(15);
  });

  it("detects a receiver compute bottleneck", () => {
    const estimate = calculateOpticalEstimate({
      ...base,
      configuredSenderFps: 60,
      cameraCaptureFps: 60,
      receiverComputeMillisecondsPerFrame: 25,
    });
    expect(estimate.limitingStage).toBe("receiver_compute");
    expect(estimate.effectiveFps).toBe(40);
  });

  it("marks projections that do not include a camera measurement", () => {
    const estimate = calculateOpticalEstimate(base);
    expect(estimate.cameraIncluded).toBe(false);
    expect(estimate.limitingStage).toBe("configured_sender_fps");
  });
});
