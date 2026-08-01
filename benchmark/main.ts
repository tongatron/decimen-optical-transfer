import QRCode from "qrcode";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { LTDecoder, LTEncoder } from "../shared/fountain";
import { fnv1a, HEADER_LEN, packFrame } from "../shared/protocol";
import { calculateOpticalEstimate, type OpticalEstimate } from "./metrics";

interface StageMetric {
  iterations: number;
  totalMilliseconds: number;
  millisecondsPerIteration: number;
}

interface CameraMetric {
  status: "not_requested" | "measured" | "unavailable";
  requestedFps: number;
  constraintMode?: string;
  width?: number;
  height?: number;
  reportedFps?: number;
  measuredCaptureFps?: number;
  copyMillisecondsPerFrame?: number;
  error?: string;
}

interface ProfileResult {
  input: {
    frameBytes: number;
    blockBytes: number;
    sourceBlocks: number;
    qrVersion: number;
    qrModules: number;
  };
  stages: {
    fountainGeneration: StageMetric;
    qrGeneration: StageMetric;
    canvasRendering: StageMetric;
    syntheticCapture: StageMetric;
    qrDecode: StageMetric;
    fountainPeeling: StageMetric;
  };
  outcome: {
    framesNeeded: number;
    overheadRatio: number;
    verified: boolean;
    estimatedPeakDecoderMemoryBytes: number;
    throughput: OpticalEstimate;
  };
}

interface BenchmarkResult {
  schemaVersion: 2;
  input: {
    payloadBytes: number;
    configuredSenderFps: number;
    selectedFrameBytes: "all" | number;
  };
  cameraCapture: CameraMetric;
  profiles: ProfileResult[];
}

const FRAME_PROFILES = [500, 1000, 1465, 1850, 2331, 2953] as const;
const runButton = document.getElementById("run") as HTMLButtonElement;
const exportButton = document.getElementById("export") as HTMLButtonElement;
const includeCamera = document.getElementById("include-camera") as HTMLInputElement;
const densitySelect = document.getElementById("frame-density") as HTMLSelectElement;
const senderFpsSelect = document.getElementById("sender-fps") as HTMLSelectElement;
const cameraFpsSelect = document.getElementById("camera-fps") as HTMLSelectElement;
const status = document.getElementById("status")!;
const results = document.getElementById("results")!;
const canvas = document.getElementById("benchmark-canvas") as HTMLCanvasElement;
const video = document.getElementById("camera-preview") as HTMLVideoElement;
let lastResult: BenchmarkResult | null = null;

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
  },
});

function metric(totalMilliseconds: number, iterations: number): StageMetric {
  return {
    iterations,
    totalMilliseconds,
    millisecondsPerIteration: totalMilliseconds / iterations,
  };
}

function renderQr(qr: ReturnType<typeof QRCode.create>, target: HTMLCanvasElement): ImageData {
  const margin = 4;
  const scale = 4;
  const size = qr.modules.size;
  const total = size + margin * 2;
  target.width = total * scale;
  target.height = total * scale;
  const context = target.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingEnabled = false;
  context.fillStyle = "white";
  context.fillRect(0, 0, target.width, target.height);
  context.fillStyle = "black";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.modules.data[y * size + x]) {
        context.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
      }
    }
  }
  return context.getImageData(0, 0, target.width, target.height);
}

async function measureCamera(requestedFps: number): Promise<CameraMetric> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { status: "unavailable", requestedFps, error: "getUserMedia_unavailable" };
  }
  const attempts = [
    { mode: `exact_${requestedFps}`, frameRate: { exact: requestedFps } },
    ...(requestedFps === 60 ? [{ mode: "exact_30", frameRate: { exact: 30 } }] : []),
    { mode: `ideal_${requestedFps}`, frameRate: { ideal: requestedFps } },
  ];
  let stream: MediaStream | null = null;
  let constraintMode: string | undefined;
  let lastError = "camera_error";
  for (const attempt of attempts) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          frameRate: attempt.frameRate,
        },
      });
      constraintMode = attempt.mode;
      break;
    } catch (error) {
      lastError = error instanceof DOMException ? error.name : "camera_error";
    }
  }
  if (!stream) return { status: "unavailable", requestedFps, error: lastError };

  try {
    video.srcObject = stream;
    video.hidden = false;
    await video.play();
    const trackSettings = stream.getVideoTracks()[0]?.getSettings();
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const context = captureCanvas.getContext("2d", { willReadFrequently: true })!;
    let frames = 0;
    let copyMilliseconds = 0;
    const started = performance.now();
    while (performance.now() - started < 2000) {
      await new Promise<void>((resolve) => {
        const withRvfc = video as HTMLVideoElement & {
          requestVideoFrameCallback?: (callback: () => void) => number;
        };
        if (withRvfc.requestVideoFrameCallback) withRvfc.requestVideoFrameCallback(() => resolve());
        else requestAnimationFrame(() => resolve());
      });
      const copyStarted = performance.now();
      context.drawImage(video, 0, 0);
      context.getImageData(0, 0, captureCanvas.width, captureCanvas.height);
      copyMilliseconds += performance.now() - copyStarted;
      frames++;
    }
    const elapsedSeconds = (performance.now() - started) / 1000;
    return {
      status: "measured",
      requestedFps,
      constraintMode,
      width: trackSettings?.width ?? video.videoWidth,
      height: trackSettings?.height ?? video.videoHeight,
      reportedFps: trackSettings?.frameRate,
      measuredCaptureFps: frames / elapsedSeconds,
      copyMillisecondsPerFrame: frames > 0 ? copyMilliseconds / frames : 0,
    };
  } catch (error) {
    return {
      status: "unavailable",
      requestedFps,
      constraintMode,
      error: error instanceof DOMException ? error.name : "camera_error",
    };
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    video.hidden = true;
  }
}

async function benchmarkProfile(
  payload: Uint8Array,
  frameBytes: number,
  configuredSenderFps: number,
  cameraCapture: CameraMetric,
  profileNumber: number,
  profileCount: number,
): Promise<ProfileResult> {
  const blockLen = frameBytes - HEADER_LEN;
  const sessionId = 0x4040;
  const encoder = new LTEncoder(payload, blockLen, sessionId);
  const checksum = fnv1a(payload);
  const encoded: { seq: number; block: Uint8Array; frame: Uint8Array }[] = [];
  const prefix = `Profile ${profileNumber}/${profileCount} (${frameBytes} B)`;

  status.textContent = `${prefix}: fountain generation…`;
  const fountainStarted = performance.now();
  for (let seq = 0; seq < encoder.k * 4; seq++) {
    const block = encoder.encode(seq);
    encoded.push({
      seq,
      block,
      frame: packFrame(
        { sessionId, seq, k: encoder.k, blockLen, totalLen: payload.length, payloadFnv: checksum },
        block,
      ),
    });
  }
  const fountainGeneration = metric(performance.now() - fountainStarted, encoded.length);

  status.textContent = `${prefix}: QR generation…`;
  const qrIterations = Math.min(20, encoded.length);
  let qr = QRCode.create([{ data: encoded[0]!.frame, mode: "byte" } as unknown as QRCode.QRCodeSegment], {
    errorCorrectionLevel: "L",
    maskPattern: 4,
  });
  const qrStarted = performance.now();
  for (let index = 0; index < qrIterations; index++) {
    qr = QRCode.create(
      [{ data: encoded[index]!.frame, mode: "byte" } as unknown as QRCode.QRCodeSegment],
      { errorCorrectionLevel: "L", version: qr.version, maskPattern: 4 },
    );
  }
  const qrGeneration = metric(performance.now() - qrStarted, qrIterations);

  status.textContent = `${prefix}: rendering and synthetic capture…`;
  const renderIterations = 20;
  const renderStarted = performance.now();
  let imageData = renderQr(qr, canvas);
  for (let index = 1; index < renderIterations; index++) imageData = renderQr(qr, canvas);
  const canvasRendering = metric(performance.now() - renderStarted, renderIterations);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const captureStarted = performance.now();
  for (let index = 0; index < renderIterations; index++) {
    imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  }
  const syntheticCapture = metric(performance.now() - captureStarted, renderIterations);

  status.textContent = `${prefix}: QR decode…`;
  await readBarcodes(new ImageData(8, 8), { formats: ["QRCode"] }).catch(() => []);
  const decodeIterations = 5;
  const decodeStarted = performance.now();
  for (let index = 0; index < decodeIterations; index++) {
    const decoded = await readBarcodes(imageData, { formats: ["QRCode"], maxNumberOfSymbols: 1 });
    if (!decoded.some((item) => item.isValid && item.bytes.length > 0)) {
      throw new Error(`the ${frameBytes}-byte synthetic QR frame could not be decoded`);
    }
  }
  const qrDecode = metric(performance.now() - decodeStarted, decodeIterations);

  status.textContent = `${prefix}: fountain peeling…`;
  const decoder = new LTDecoder(encoder.k, blockLen, sessionId, payload.length);
  const peelingStarted = performance.now();
  let framesNeeded = 0;
  for (const frame of encoded) {
    decoder.addFrame(frame.seq, frame.block);
    framesNeeded++;
    if (decoder.isComplete) break;
  }
  const fountainPeeling = metric(performance.now() - peelingStarted, framesNeeded);
  const assembled = decoder.assemble();
  const verified = assembled !== null && fnv1a(assembled) === checksum;
  const overheadRatio = framesNeeded / encoder.k;
  const throughput = calculateOpticalEstimate({
    blockBytes: blockLen,
    overheadRatio,
    configuredSenderFps,
    senderComputeMillisecondsPerFrame:
      fountainGeneration.millisecondsPerIteration +
      qrGeneration.millisecondsPerIteration +
      canvasRendering.millisecondsPerIteration,
    receiverComputeMillisecondsPerFrame:
      syntheticCapture.millisecondsPerIteration +
      qrDecode.millisecondsPerIteration +
      fountainPeeling.millisecondsPerIteration,
    cameraCaptureFps:
      cameraCapture.status === "measured" ? cameraCapture.measuredCaptureFps : undefined,
  });

  return {
    input: {
      frameBytes,
      blockBytes: blockLen,
      sourceBlocks: encoder.k,
      qrVersion: qr.version,
      qrModules: qr.modules.size,
    },
    stages: {
      fountainGeneration,
      qrGeneration,
      canvasRendering,
      syntheticCapture,
      qrDecode,
      fountainPeeling,
    },
    outcome: {
      framesNeeded,
      overheadRatio,
      verified,
      estimatedPeakDecoderMemoryBytes: decoder.estimatedMemoryBytes,
      throughput,
    },
  };
}

function renderResults(result: BenchmarkResult): void {
  const camera = result.cameraCapture;
  const cameraSummary = document.createElement("p");
  cameraSummary.className = "camera-summary";
  cameraSummary.textContent =
    camera.status === "measured"
      ? `Camera: ${camera.width}×${camera.height} · ${camera.measuredCaptureFps?.toFixed(1)} measured fps (${camera.reportedFps?.toFixed(1) ?? "unknown"} reported) · ${camera.constraintMode}`
      : `Camera: ${camera.status.replace("_", " ")}`;

  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const label of ["Frame", "QR", "K", "Frames", "Decode", "Effective FPS", "Goodput", "Limit", "Integrity"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headerRow.append(cell);
  }
  head.append(headerRow);
  const body = document.createElement("tbody");
  for (const profile of result.profiles) {
    const values = [
      `${profile.input.frameBytes} B (${profile.input.blockBytes} payload)`,
      `v${profile.input.qrVersion} · ${profile.input.qrModules}²`,
      String(profile.input.sourceBlocks),
      `${profile.outcome.framesNeeded} (${profile.outcome.overheadRatio.toFixed(3)}×)`,
      `${profile.stages.qrDecode.millisecondsPerIteration.toFixed(2)} ms`,
      profile.outcome.throughput.effectiveFps.toFixed(1),
      `${profile.outcome.throughput.estimatedOpticalGoodputKiBps.toFixed(1)} KiB/s${profile.outcome.throughput.cameraIncluded ? "" : "*"}`,
      profile.outcome.throughput.limitingStage.replaceAll("_", " "),
      profile.outcome.verified ? "verified" : "failed",
    ];
    const row = document.createElement("tr");
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
  table.append(head, body);
  const note = document.createElement("p");
  note.className = "hint";
  note.textContent = camera.status === "measured"
    ? "Goodput includes measured camera FPS and the configured sender FPS."
    : "* Projected goodput excludes camera capture; enable the camera test for an optical estimate.";
  results.replaceChildren(cameraSummary, table, note);
  results.hidden = false;
}

async function runBenchmark(): Promise<BenchmarkResult> {
  const payload = Uint8Array.from({ length: 64 * 1024 }, (_, index) => (index * 31 + 17) & 0xff);
  const configuredSenderFps = Number(senderFpsSelect.value);
  const selectedFrameBytes = densitySelect.value === "all" ? "all" : Number(densitySelect.value);
  const frameProfiles = selectedFrameBytes === "all" ? [...FRAME_PROFILES] : [selectedFrameBytes];
  status.textContent = includeCamera.checked ? "Measuring camera capture…" : "Preparing profiles…";
  const cameraCapture = includeCamera.checked
    ? await measureCamera(Number(cameraFpsSelect.value))
    : ({ status: "not_requested", requestedFps: Number(cameraFpsSelect.value) } satisfies CameraMetric);
  const profiles: ProfileResult[] = [];
  for (const [index, frameBytes] of frameProfiles.entries()) {
    profiles.push(
      await benchmarkProfile(
        payload,
        frameBytes,
        configuredSenderFps,
        cameraCapture,
        index + 1,
        frameProfiles.length,
      ),
    );
  }
  return {
    schemaVersion: 2,
    input: { payloadBytes: payload.length, configuredSenderFps, selectedFrameBytes },
    cameraCapture,
    profiles,
  };
}

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  exportButton.disabled = true;
  results.hidden = true;
  try {
    lastResult = await runBenchmark();
    renderResults(lastResult);
    exportButton.disabled = false;
    status.textContent = "Benchmark complete.";
  } catch (error) {
    lastResult = null;
    status.textContent = `Benchmark failed: ${error instanceof Error ? error.message : "unknown error"}`;
  } finally {
    runButton.disabled = false;
  }
});

exportButton.addEventListener("click", () => {
  if (!lastResult) return;
  const blob = new Blob([`${JSON.stringify(lastResult, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "decimen-benchmark.json";
  anchor.click();
  URL.revokeObjectURL(url);
});
