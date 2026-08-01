// Sender: turn a file into an endless fountain-coded QR stream.
//
// Tuning notes from the experiments this PoC is distilled from:
// - Frame payload sets the QR version; denser wins on goodput as long as the
//   receiver can still decode it. 1465 bytes ≈ V27 is a safe middle ground
//   for arbitrary monitors; 2953 (V40) is the ceiling and works phone-to-
//   phone at close range.
// - The mask pattern is pinned (any declared mask is valid to a decoder);
//   this skips the spec's 8-way mask evaluation and speeds generation ~4×.
// - Displays need each frame shown for ≥2 refresh cycles or captures catch
//   the transition; 24 fps on a 60 Hz screen is comfortable.
// - Error correction stays at L by default: the fountain layer already
//   handles erasures, and a frame is either decoded whole or discarded.

import QRCode from "qrcode";
import { packFile } from "../shared/file-envelope";
import { TransferEncoder } from "../shared/transfer-encoder";

const MARGIN = 4; // quiet-zone modules
const LOOKAHEAD = 3;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_SOURCE_BYTES = 32 * 1024 * 1024;
const IMAGE_TARGET_BYTES = 1024 * 1024;
const IMAGE_MAX_SIDE = 1920;
const OPTIMIZABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const canvas = document.getElementById("qr") as HTMLCanvasElement;
const stage = document.getElementById("stage")!;
const specs = document.getElementById("specs")!;
const fileInput = document.getElementById("payload-file") as HTMLInputElement;
const fileName = document.getElementById("file-name")!;
const senderPreview = document.getElementById("sender-preview")!;
const selectedImage = document.getElementById("selected-image") as HTMLImageElement;
const optimizationSummary = document.getElementById("optimization-summary")!;
const startBtn = document.getElementById("start-transfer") as HTMLButtonElement;
const streamControls = document.getElementById("stream-controls")!;
const pauseBtn = document.getElementById("pause-transfer") as HTMLButtonElement;
const cfgFps = document.getElementById("cfg-fps") as HTMLSelectElement;
const cfgBytes = document.getElementById("cfg-bytes") as HTMLSelectElement;
const cfgEcc = document.getElementById("cfg-ecc") as HTMLSelectElement;
const cfgSize = document.getElementById("cfg-size") as HTMLInputElement;

let generation = 0; // bumped on every restart; stale loops see it and die
let selectedPayload: Uint8Array | null = null;
let selectedFile: File | null = null;
let streaming = false;
let streamPaused = false;
let previewUrl: string | null = null;

async function main() {
  fileInput.addEventListener("change", () => void selectFile(fileInput.files?.[0]));
  document.addEventListener("paste", (event) => void pasteImage(event));
  startBtn.addEventListener("click", () => void startStream());
  pauseBtn.addEventListener("click", toggleStreamPause);
  for (const el of [cfgFps, cfgBytes, cfgEcc, cfgSize]) {
    el.addEventListener("change", () => {
      if (streaming) void startStream();
    });
  }
  try {
    await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<unknown> } })
      .wakeLock?.request("screen");
  } catch {
    /* fine without it */
  }
}

async function pasteImage(event: ClipboardEvent) {
  const image = Array.from(event.clipboardData?.items ?? [])
    .find((item) => item.kind === "file" && item.type.startsWith("image/"))
    ?.getAsFile();
  if (!image) return;

  event.preventDefault();
  fileInput.value = "";
  const name = image.name && image.name !== "image.png" ? image.name : screenshotFileName(image.type);
  const pastedImage = new File([image], name, {
    type: image.type || "image/png",
    lastModified: Date.now(),
  });
  await selectFile(pastedImage);
}

function screenshotFileName(type: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `screenshot-${timestamp}.${extensionForType(type)}`;
}

async function selectFile(file: File | undefined) {
  const gen = ++generation;
  streaming = false;
  selectedPayload = null;
  selectedFile = null;
  startBtn.disabled = true;
  stage.hidden = true;
  streamControls.hidden = true;
  setStreamPaused(false);
  clearPreview();
  fileName.textContent = file?.name ?? "No file selected";
  if (!file) {
    specs.textContent = "Maximum 2 MB · images over 1 MB are optimized";
    return;
  }
  try {
    const originalFile = file;
    let transferFile = file;
    let previewNote = `${formatBytes(file.size)} · original`;
    if (OPTIMIZABLE_IMAGE_TYPES.has(file.type)) {
      if (file.size > MAX_IMAGE_SOURCE_BYTES) {
        throw new Error("source image is larger than 32 MB");
      }
      if (file.size > IMAGE_TARGET_BYTES) {
        specs.textContent = `Optimizing ${file.name}…`;
        const optimized = await optimizeImage(file);
        if (gen !== generation) return;
        transferFile = optimized.file;
        previewNote =
          `${formatBytes(originalFile.size)} → ${formatBytes(transferFile.size)} · ` +
          `${optimized.width}×${optimized.height} · optimized`;
      }
      showPreview(transferFile, previewNote);
    }
    if (transferFile.size > MAX_FILE_BYTES) {
      throw new Error(`${transferFile.name} is larger than the 2 MB limit`);
    }
    specs.textContent = `Reading ${transferFile.name}…`;
    const bytes = new Uint8Array(await transferFile.arrayBuffer());
    if (gen !== generation) return;
    selectedPayload = packFile({
      name: transferFile.name,
      type: transferFile.type,
      bytes,
    });
    selectedFile = transferFile;
    fileName.textContent = transferFile.name;
    startBtn.disabled = false;
    specs.textContent =
      `${transferFile.name} · ${formatBytes(transferFile.size)} · ready to transmit`;
  } catch (error) {
    if (gen !== generation) return;
    clearPreview();
    specs.textContent = `✗ ${error instanceof Error ? error.message : String(error)}`;
  }
}

interface OptimizedImage {
  file: File;
  width: number;
  height: number;
}

async function optimizeImage(file: File): Promise<OptimizedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const initialScale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    let working = document.createElement("canvas");
    working.width = Math.max(1, Math.round(bitmap.width * initialScale));
    working.height = Math.max(1, Math.round(bitmap.height * initialScale));
    working.getContext("2d")!.drawImage(bitmap, 0, 0, working.width, working.height);

    let blob = await encodeImage(working);
    for (let attempt = 0; blob.size > IMAGE_TARGET_BYTES && attempt < 5; attempt++) {
      const ratio = Math.min(0.9, Math.sqrt(IMAGE_TARGET_BYTES / blob.size) * 0.92);
      const smaller = document.createElement("canvas");
      smaller.width = Math.max(1, Math.round(working.width * ratio));
      smaller.height = Math.max(1, Math.round(working.height * ratio));
      smaller.getContext("2d")!.drawImage(working, 0, 0, smaller.width, smaller.height);
      working = smaller;
      blob = await encodeImage(working);
    }
    if (blob.size > IMAGE_TARGET_BYTES) {
      throw new Error("image could not be reduced below 1 MB");
    }
    const type = blob.type || "image/png";
    const optimizedName = replaceExtension(file.name, extensionForType(type));
    return {
      file: new File([blob], optimizedName, { type, lastModified: file.lastModified }),
      width: working.width,
      height: working.height,
    };
  } finally {
    bitmap.close();
  }
}

async function encodeImage(canvas: HTMLCanvasElement): Promise<Blob> {
  const minQuality = 0.4;
  let low = minQuality;
  let high = 0.92;
  let smallest = await canvasToBlob(canvas, "image/webp", minQuality);
  let best: Blob | null = smallest.size <= IMAGE_TARGET_BYTES ? smallest : null;
  for (let i = 0; i < 7 && best; i++) {
    const quality = (low + high) / 2;
    const candidate = await canvasToBlob(canvas, "image/webp", quality);
    if (candidate.size <= IMAGE_TARGET_BYTES) {
      best = candidate;
      low = quality;
    } else {
      high = quality;
      if (candidate.size < smallest.size) smallest = candidate;
    }
  }
  return best ?? smallest;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("browser cannot encode this image"))),
      type,
      quality,
    );
  });
}

function replaceExtension(name: string, extension: string): string {
  const base = name.replace(/\.[^./]+$/, "") || "image";
  return `${base}.${extension}`;
}

function extensionForType(type: string): string {
  if (type === "image/webp") return "webp";
  if (type === "image/jpeg") return "jpg";
  return "png";
}

function showPreview(file: File, note: string) {
  clearPreview();
  previewUrl = URL.createObjectURL(file);
  selectedImage.src = previewUrl;
  selectedImage.alt = file.name;
  optimizationSummary.textContent = note;
  senderPreview.hidden = false;
}

function clearPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  selectedImage.removeAttribute("src");
  optimizationSummary.textContent = "";
  senderPreview.hidden = true;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function startStream() {
  if (!selectedPayload || !selectedFile) return;
  const gen = ++generation;
  const payload = selectedPayload;
  const file = selectedFile;
  const txFps = Number(cfgFps.value);
  const frameBytes = Number(cfgBytes.value);
  const ecc = cfgEcc.value as "L" | "M" | "Q" | "H";
  const displayPx = Number(cfgSize.value);

  const sessionId = (Math.floor(Math.random() * 0xffff) + 1) & 0xffff;
  let encoder: TransferEncoder;
  try {
    encoder = new TransferEncoder(payload, frameBytes, sessionId);
  } catch (error) {
    specs.textContent = `✗ ${error instanceof Error ? error.message : String(error)}`;
    return;
  }
  streaming = true;
  setStreamPaused(false);
  stage.hidden = false;
  streamControls.hidden = false;
  let version: number | undefined; // locked after the first frame
  let modules = 0;
  let scale = 1;
  const staging = document.createElement("canvas");
  const queue: ImageData[] = [];

  const sizeCanvas = () => {
    const dpr = window.devicePixelRatio || 1;
    const total = modules + 2 * MARGIN;
    const cssBudget = Math.min(0.9 * Math.min(window.innerWidth, window.innerHeight), displayPx);
    scale = Math.max(1, Math.floor((cssBudget * dpr) / total));
    staging.width = total;
    staging.height = total;
    canvas.width = total * scale;
    canvas.height = total * scale;
    canvas.style.width = `${(total * scale) / dpr}px`;
    canvas.style.height = `${(total * scale) / dpr}px`;
  };

  const makeFrame = (): ImageData => {
    const { bytes } = encoder.encodeNext();
    const qr = QRCode.create([{ data: bytes, mode: "byte" } as unknown as QRCode.QRCodeSegment], {
      errorCorrectionLevel: ecc,
      version,
      maskPattern: 4,
    });
    if (version === undefined) {
      version = qr.version;
      modules = qr.modules.size;
      sizeCanvas();
      specs.textContent =
        `${txFps} FPS · ${frameBytes} bytes per frame · V${version} · ECC ${ecc} · ` +
        `${file.name} · ${formatBytes(file.size)} · K=${encoder.k}`;
    }
    const size = qr.modules.size;
    const data = qr.modules.data;
    const total = size + 2 * MARGIN;
    const img = new ImageData(total, total);
    const px = new Uint32Array(img.data.buffer);
    px.fill(0xffffffff);
    for (let y = 0; y < size; y++) {
      const row = (y + MARGIN) * total + MARGIN;
      const src = y * size;
      for (let x = 0; x < size; x++) {
        if (data[src + x]) px[row + x] = 0xff000000;
      }
    }
    return img;
  };

  const pump = () => {
    if (gen !== generation) return; // superseded by a settings change
    if (streamPaused) {
      setTimeout(pump, 100);
      return;
    }
    try {
      while (queue.length < LOOKAHEAD) queue.push(makeFrame());
    } catch (err) {
      // e.g. frame bytes over capacity for the chosen ECC level
      specs.textContent = `✗ ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    setTimeout(pump, 0);
  };
  pump();

  const interval = 1000 / txFps;
  let nextAt = performance.now();
  const tick = (now: number) => {
    if (gen !== generation) return;
    requestAnimationFrame(tick);
    if (streamPaused) {
      nextAt = now + interval;
      return;
    }
    if (now < nextAt) return;
    const img = queue.shift();
    if (!img) {
      nextAt = now + interval;
      return;
    }
    staging.getContext("2d")!.putImageData(img, 0, 0);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(staging, 0, 0, canvas.width, canvas.height);
    nextAt += interval;
    if (now - nextAt > 3 * interval) nextAt = now + interval; // fell behind — don't burst
  };
  requestAnimationFrame(tick);
}

function toggleStreamPause() {
  if (!streaming) return;
  setStreamPaused(!streamPaused);
}

function setStreamPaused(paused: boolean) {
  streamPaused = paused;
  pauseBtn.textContent = paused ? "Resume" : "Stop";
  pauseBtn.setAttribute("aria-pressed", String(paused));
}

void main();
