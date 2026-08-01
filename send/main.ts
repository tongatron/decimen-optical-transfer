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
import { LTEncoder } from "../shared/fountain";
import { HEADER_LEN, fnv1a, packFrame, type FrameHeader } from "../shared/protocol";

const MARGIN = 4; // quiet-zone modules
const LOOKAHEAD = 3;
const MAX_FILE_BYTES = 32 * 1024 * 1024;

const canvas = document.getElementById("qr") as HTMLCanvasElement;
const stage = document.getElementById("stage")!;
const specs = document.getElementById("specs")!;
const fileInput = document.getElementById("payload-file") as HTMLInputElement;
const fileName = document.getElementById("file-name")!;
const startBtn = document.getElementById("start-transfer") as HTMLButtonElement;
const cfgFps = document.getElementById("cfg-fps") as HTMLSelectElement;
const cfgBytes = document.getElementById("cfg-bytes") as HTMLSelectElement;
const cfgEcc = document.getElementById("cfg-ecc") as HTMLSelectElement;
const cfgSize = document.getElementById("cfg-size") as HTMLInputElement;

let generation = 0; // bumped on every restart; stale loops see it and die
let selectedPayload: Uint8Array | null = null;
let selectedFile: File | null = null;
let streaming = false;

async function main() {
  fileInput.addEventListener("change", () => void selectFile());
  startBtn.addEventListener("click", () => void startStream());
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

async function selectFile() {
  const gen = ++generation;
  streaming = false;
  selectedPayload = null;
  selectedFile = null;
  startBtn.disabled = true;
  stage.hidden = true;
  const file = fileInput.files?.[0];
  fileName.textContent = file?.name ?? "No file selected";
  if (!file) {
    specs.textContent = "No file selected · maximum 32 MB";
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    specs.textContent = `✗ ${file.name} is larger than the 32 MB limit`;
    return;
  }
  specs.textContent = `Reading ${file.name}…`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (gen !== generation) return;
  selectedPayload = packFile({ name: file.name, type: file.type, bytes });
  selectedFile = file;
  startBtn.disabled = false;
  specs.textContent = `${file.name} · ${formatBytes(file.size)} · ready to transmit`;
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
  const blockLen = frameBytes - HEADER_LEN;
  const encoder = new LTEncoder(payload, blockLen, sessionId);
  if (encoder.k > 0xffff) {
    specs.textContent = "✗ file needs too many fountain blocks; select a smaller file";
    return;
  }
  streaming = true;
  stage.hidden = false;
  const header: FrameHeader = {
    sessionId,
    seq: 0,
    k: encoder.k,
    blockLen,
    totalLen: payload.length,
    payloadFnv: fnv1a(payload),
  };

  let version: number | undefined; // locked after the first frame
  let modules = 0;
  let scale = 1;
  const staging = document.createElement("canvas");
  const queue: ImageData[] = [];
  let nextSeq = 0;

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
    const bytes = packFrame({ ...header, seq: nextSeq }, encoder.encode(nextSeq));
    nextSeq++;
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

void main();
