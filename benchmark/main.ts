import QRCode from "qrcode";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { LTDecoder, LTEncoder } from "../shared/fountain";
import { fnv1a, packFrame } from "../shared/protocol";

interface StageMetric {
  iterations: number;
  totalMilliseconds: number;
  millisecondsPerIteration: number;
}

interface CameraMetric {
  status: "not_requested" | "measured" | "unavailable";
  captureFps?: number;
  copyMillisecondsPerFrame?: number;
  error?: string;
}

interface BenchmarkResult {
  schemaVersion: 1;
  input: { payloadBytes: number; blockBytes: number; sourceBlocks: number };
  stages: {
    fountainGeneration: StageMetric;
    qrGeneration: StageMetric;
    canvasRendering: StageMetric;
    syntheticCapture: StageMetric;
    qrDecode: StageMetric;
    fountainPeeling: StageMetric;
    cameraCapture: CameraMetric;
  };
  outcome: {
    framesNeeded: number;
    overheadRatio: number;
    verified: boolean;
    estimatedGoodputKiBps: number;
    estimatedPeakDecoderMemoryBytes: number;
  };
}

const runButton = document.getElementById("run") as HTMLButtonElement;
const exportButton = document.getElementById("export") as HTMLButtonElement;
const includeCamera = document.getElementById("include-camera") as HTMLInputElement;
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

async function measureCamera(): Promise<CameraMetric> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { status: "unavailable", error: "getUserMedia is unavailable" };
  }
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "environment", width: { ideal: 1280 } },
    });
    video.srcObject = stream;
    video.hidden = false;
    await video.play();
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const context = captureCanvas.getContext("2d", { willReadFrequently: true })!;
    let frames = 0;
    let copyMilliseconds = 0;
    const started = performance.now();
    while (performance.now() - started < 2000) {
      await new Promise<void>((resolve) => {
        const callback = () => resolve();
        const withRvfc = video as HTMLVideoElement & {
          requestVideoFrameCallback?: (cb: () => void) => number;
        };
        if (withRvfc.requestVideoFrameCallback) withRvfc.requestVideoFrameCallback(callback);
        else requestAnimationFrame(callback);
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
      captureFps: frames / elapsedSeconds,
      copyMillisecondsPerFrame: frames > 0 ? copyMilliseconds / frames : 0,
    };
  } catch (error) {
    return {
      status: "unavailable",
      error: error instanceof DOMException ? error.name : "camera_error",
    };
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    video.hidden = true;
  }
}

function renderResults(result: BenchmarkResult): void {
  const rows: [string, string][] = [
    ["Fountain generation", `${result.stages.fountainGeneration.millisecondsPerIteration.toFixed(3)} ms/frame`],
    ["QR generation", `${result.stages.qrGeneration.millisecondsPerIteration.toFixed(3)} ms/frame`],
    ["Canvas rendering", `${result.stages.canvasRendering.millisecondsPerIteration.toFixed(3)} ms/frame`],
    ["Synthetic capture", `${result.stages.syntheticCapture.millisecondsPerIteration.toFixed(3)} ms/frame`],
    ["QR decode", `${result.stages.qrDecode.millisecondsPerIteration.toFixed(3)} ms/frame`],
    ["Fountain peeling", `${result.stages.fountainPeeling.totalMilliseconds.toFixed(3)} ms total`],
    ["Frames needed", `${result.outcome.framesNeeded} (${result.outcome.overheadRatio.toFixed(3)}× K)`],
    ["Estimated goodput", `${result.outcome.estimatedGoodputKiBps.toFixed(1)} KiB/s`],
    ["Integrity", result.outcome.verified ? "verified" : "failed"],
  ];
  const camera = result.stages.cameraCapture;
  rows.push([
    "Camera capture",
    camera.status === "measured"
      ? `${camera.captureFps?.toFixed(1)} fps · ${camera.copyMillisecondsPerFrame?.toFixed(2)} ms copy`
      : camera.status.replace("_", " "),
  ]);
  const table = document.createElement("table");
  const body = document.createElement("tbody");
  for (const [name, value] of rows) {
    const row = document.createElement("tr");
    const heading = document.createElement("th");
    const cell = document.createElement("td");
    heading.scope = "row";
    heading.textContent = name;
    cell.textContent = value;
    row.append(heading, cell);
    body.append(row);
  }
  table.append(body);
  results.replaceChildren(table);
  results.hidden = false;
}

async function runBenchmark(): Promise<BenchmarkResult> {
  const payload = Uint8Array.from({ length: 64 * 1024 }, (_, index) => (index * 31 + 17) & 0xff);
  const blockLen = 384;
  const sessionId = 0x4040;
  const encoder = new LTEncoder(payload, blockLen, sessionId);
  const checksum = fnv1a(payload);
  const encoded: { seq: number; block: Uint8Array; frame: Uint8Array }[] = [];

  status.textContent = "Measuring fountain generation…";
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

  status.textContent = "Measuring QR generation…";
  const qrIterations = 20;
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

  status.textContent = "Measuring canvas rendering and capture…";
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

  status.textContent = "Loading WASM and measuring QR decode…";
  await readBarcodes(new ImageData(8, 8), { formats: ["QRCode"] }).catch(() => []);
  const decodeIterations = 5;
  const decodeStarted = performance.now();
  for (let index = 0; index < decodeIterations; index++) {
    const decoded = await readBarcodes(imageData, { formats: ["QRCode"], maxNumberOfSymbols: 1 });
    if (!decoded.some((item) => item.isValid && item.bytes.length > 0)) {
      throw new Error("the synthetic QR frame could not be decoded");
    }
  }
  const qrDecode = metric(performance.now() - decodeStarted, decodeIterations);

  status.textContent = "Measuring fountain peeling…";
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

  status.textContent = includeCamera.checked ? "Measuring camera capture…" : "Finalizing…";
  const cameraCapture = includeCamera.checked
    ? await measureCamera()
    : ({ status: "not_requested" } satisfies CameraMetric);
  const pipelineMsPerFrame = Math.max(
    qrGeneration.millisecondsPerIteration + canvasRendering.millisecondsPerIteration,
    syntheticCapture.millisecondsPerIteration + qrDecode.millisecondsPerIteration,
  );
  const estimatedSeconds =
    (pipelineMsPerFrame * framesNeeded + fountainPeeling.totalMilliseconds) / 1000;

  return {
    schemaVersion: 1,
    input: { payloadBytes: payload.length, blockBytes: blockLen, sourceBlocks: encoder.k },
    stages: {
      fountainGeneration,
      qrGeneration,
      canvasRendering,
      syntheticCapture,
      qrDecode,
      fountainPeeling,
      cameraCapture,
    },
    outcome: {
      framesNeeded,
      overheadRatio: framesNeeded / encoder.k,
      verified,
      estimatedGoodputKiBps: payload.length / 1024 / Math.max(estimatedSeconds, 0.001),
      estimatedPeakDecoderMemoryBytes: decoder.estimatedMemoryBytes,
    },
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
