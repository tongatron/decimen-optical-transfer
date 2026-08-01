export type ThroughputLimiter =
  | "configured_sender_fps"
  | "camera_capture"
  | "sender_compute"
  | "receiver_compute";

export interface OpticalEstimateInput {
  blockBytes: number;
  overheadRatio: number;
  configuredSenderFps: number;
  senderComputeMillisecondsPerFrame: number;
  receiverComputeMillisecondsPerFrame: number;
  cameraCaptureFps?: number;
}

export interface OpticalEstimate {
  senderComputeCapacityFps: number;
  receiverComputeCapacityFps: number;
  effectiveFps: number;
  estimatedOpticalGoodputKiBps: number;
  limitingStage: ThroughputLimiter;
  cameraIncluded: boolean;
}

export function calculateOpticalEstimate(input: OpticalEstimateInput): OpticalEstimate {
  const senderComputeCapacityFps = 1000 / Math.max(input.senderComputeMillisecondsPerFrame, 0.001);
  const receiverComputeCapacityFps = 1000 / Math.max(input.receiverComputeMillisecondsPerFrame, 0.001);
  const candidates: { name: ThroughputLimiter; fps: number }[] = [
    { name: "configured_sender_fps", fps: input.configuredSenderFps },
    { name: "sender_compute", fps: senderComputeCapacityFps },
    { name: "receiver_compute", fps: receiverComputeCapacityFps },
  ];
  if (input.cameraCaptureFps !== undefined) {
    candidates.push({ name: "camera_capture", fps: input.cameraCaptureFps });
  }
  const limiting = candidates.reduce((lowest, candidate) =>
    candidate.fps < lowest.fps ? candidate : lowest,
  );
  const estimatedOpticalGoodputKiBps =
    (input.blockBytes * limiting.fps) / Math.max(input.overheadRatio, 1) / 1024;

  return {
    senderComputeCapacityFps,
    receiverComputeCapacityFps,
    effectiveFps: limiting.fps,
    estimatedOpticalGoodputKiBps,
    limitingStage: limiting.name,
    cameraIncluded: input.cameraCaptureFps !== undefined,
  };
}
