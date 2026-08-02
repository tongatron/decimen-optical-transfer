import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { basename, extname, resolve } from "node:path";
import QRCode from "qrcode";
import { packFile } from "../shared/file-envelope";
import { TransferEncoder } from "../shared/transfer-encoder";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const BROWSER_DEFAULT_FPS = 24;
const BROWSER_DEFAULT_FRAME_BYTES = 1465;
const TERMINAL_DEFAULT_FPS = 6;
const TERMINAL_DEFAULT_FRAME_BYTES = 64;
const MARGIN = 4;
const CLEAR = "\x1b[2J\x1b[H";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const RESET = "\x1b[0m";
const WHITE_BG_BLACK_FG = "\x1b[47m\x1b[30m";

type Ecc = "L" | "M" | "Q" | "H";
declare const __DECIMEN_VERSION__: string;
const VERSION = typeof __DECIMEN_VERSION__ === "string" ? __DECIMEN_VERSION__ : "0.1.0-dev";

interface CliOptions {
  file?: string;
  fps?: number;
  frameBytes?: number;
  ecc: Ecc;
  frames?: number;
  terminal: boolean;
  noOpen: boolean;
  help: boolean;
  version: boolean;
}

interface QrMatrix {
  modules: { size: number; data: ArrayLike<number | boolean> };
  version: number;
}

function usage(): string {
  return `Usage: decimen send <file> [options]

Show a file as an animated, fountain-coded QR stream in a local browser page.
Open Decimen's Receive page on another device and point its camera here.

Options:
  --fps <n>           Frames per second (browser: ${BROWSER_DEFAULT_FPS}, terminal: ${TERMINAL_DEFAULT_FPS})
  --frame-bytes <n>   Bytes per QR frame (browser: ${BROWSER_DEFAULT_FRAME_BYTES}, terminal: ${TERMINAL_DEFAULT_FRAME_BYTES})
  --ecc <L|M|Q|H>     QR error correction (default: L)
  --terminal          Render with ANSI characters instead of a browser
  --no-open           Print the local URL without opening a browser
  --frames <n>        Stop terminal output after n frames
  -h, --help          Show this help
  -v, --version       Show the installed version

The browser renderer is recommended for reliable camera scanning.`;
}

function valueAfter(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${name} needs a value`);
  return value;
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    ecc: "L",
    terminal: false,
    noOpen: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < args.length; i++) {
    const argument = args[i]!;
    if (argument === "-h" || argument === "--help") {
      options.help = true;
    } else if (argument === "-v" || argument === "--version") {
      options.version = true;
    } else if (argument === "--fps") {
      options.fps = Number(valueAfter(args, i++, argument));
    } else if (argument === "--frame-bytes") {
      options.frameBytes = Number(valueAfter(args, i++, argument));
    } else if (argument === "--ecc") {
      options.ecc = valueAfter(args, i++, argument).toUpperCase() as Ecc;
    } else if (argument === "--frames") {
      options.frames = Number(valueAfter(args, i++, argument));
    } else if (argument === "--terminal") {
      options.terminal = true;
    } else if (argument === "--no-open") {
      options.noOpen = true;
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option: ${argument}`);
    } else if (options.file) {
      throw new Error("only one input file can be sent");
    } else {
      options.file = argument;
    }
  }

  if (options.fps !== undefined && (!Number.isFinite(options.fps) || options.fps <= 0 || options.fps > 30)) {
    throw new Error("fps must be greater than 0 and at most 30");
  }
  if (options.frameBytes !== undefined &&
      (!Number.isInteger(options.frameBytes) || options.frameBytes < 32 || options.frameBytes > 2953)) {
    throw new Error("frame-bytes must be an integer from 32 to 2953");
  }
  if (!(["L", "M", "Q", "H"] as string[]).includes(options.ecc)) {
    throw new Error("ecc must be L, M, Q, or H");
  }
  if (options.frames !== undefined && (!Number.isInteger(options.frames) || options.frames < 1)) {
    throw new Error("frames must be a positive integer");
  }
  if (options.frames !== undefined && !options.terminal) {
    throw new Error("frames can only be used with --terminal");
  }
  return options;
}

export function normalizeArgs(args: string[]): string[] {
  return args[0] === "send" ? args.slice(1) : args;
}

function mediaType(fileName: string): string {
  const types: Record<string, string> = {
    ".css": "text/css",
    ".csv": "text/csv",
    ".gif": "image/gif",
    ".htm": "text/html",
    ".html": "text/html",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".json": "application/json",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain",
    ".webp": "image/webp",
    ".zip": "application/zip",
  };
  return types[extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

/** Render two QR module rows per terminal row using Unicode half blocks. */
export function renderQr(qr: QrMatrix, margin = MARGIN): string {
  const { size, data } = qr.modules;
  const isDark = (x: number, y: number) =>
    x >= 0 && x < size && y >= 0 && y < size && Boolean(data[y * size + x]);
  const lines: string[] = [];
  for (let y = -margin; y < size + margin; y += 2) {
    let line = WHITE_BG_BLACK_FG;
    for (let x = -margin; x < size + margin; x++) {
      const top = isDark(x, y);
      const bottom = isDark(x, y + 1);
      line += top ? (bottom ? "█" : "▀") : bottom ? "▄" : " ";
    }
    lines.push(`${line}${RESET}`);
  }
  return lines.join("\n");
}

/** Render a module matrix without font metrics or antialiasing. */
export function renderQrSvg(qr: QrMatrix, margin = MARGIN): string {
  const { size, data } = qr.modules;
  const total = size + 2 * margin;
  const runs: string[] = [];
  for (let y = 0; y < size; y++) {
    let start = -1;
    for (let x = 0; x <= size; x++) {
      const dark = x < size && Boolean(data[y * size + x]);
      if (dark && start < 0) start = x;
      if (!dark && start >= 0) {
        runs.push(`M${start + margin} ${y + margin}h${x - start}v1h-${x - start}z`);
        start = -1;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ` +
    `shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${total}v${total}H0z"/>` +
    `<path fill="#000" d="${runs.join("")}"/></svg>`;
}

function browserPage(fileName: string, fileBytes: number, fps: number, frameBytes: number): string {
  const safeName = JSON.stringify(fileName).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Decimen CLI sender</title><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#17191b;color:#f1f3f4;
font:14px ui-monospace,SFMono-Regular,Menlo,monospace}body{display:grid;grid-template-rows:1fr auto}
main{min-height:0;display:grid;place-items:center;padding:2vmin}img{width:min(92vw,calc(100vh - 70px));
height:min(92vw,calc(100vh - 70px));display:block;background:#fff;image-rendering:pixelated}
footer{display:flex;gap:16px;align-items:center;justify-content:center;padding:10px 16px;background:#202326}
button{font:inherit;padding:5px 10px}span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style></head><body><main><img id="qr" alt="Animated QR transfer"></main><footer>
<button id="fullscreen">Fullscreen</button><span id="status"></span></footer><script>
const fileName=${safeName};const fps=${fps};const frameBytes=${frameBytes};let seq=0;
const qr=document.getElementById("qr");const status=document.getElementById("status");
document.getElementById("fullscreen").onclick=()=>document.documentElement.requestFullscreen?.();
function load(){qr.src="/frame.svg?n="+seq}qr.onload=()=>{
status.textContent=fileName+" · ${fileBytes} bytes · frame "+seq+" · "+frameBytes+" B/frame · "+fps+" FPS";
seq++;setTimeout(load,1000/fps)};qr.onerror=()=>setTimeout(load,250);load();
</script></body></html>`;
}

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
}

async function runBrowser(
  encoder: TransferEncoder,
  fileName: string,
  fileBytes: number,
  fps: number,
  frameBytes: number,
  ecc: Ecc,
  shouldOpen: boolean,
): Promise<void> {
  const page = browserPage(fileName, fileBytes, fps, frameBytes);
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(page);
      return;
    }
    if (pathname === "/frame.svg") {
      try {
        const frame = encoder.encodeNext();
        const qr = QRCode.create(
          [{ data: frame.bytes, mode: "byte" } as unknown as QRCode.QRCodeSegment],
          { errorCorrectionLevel: ecc, maskPattern: 4 },
        ) as QrMatrix;
        response.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
        response.end(renderQrSvg(qr));
      } catch (error) {
        response.writeHead(500, { "content-type": "text/plain" });
        response.end(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/`;
  process.stdout.write(`Decimen sender: ${url}\nPress Ctrl+C to stop.\n`);
  if (shouldOpen) openBrowser(url);

  await new Promise<void>((resolveStop) => {
    const stop = () => resolveStop();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  const closed = new Promise<void>((resolveClose, rejectClose) =>
    server.close((error) => error ? rejectClose(error) : resolveClose()),
  );
  server.closeAllConnections();
  await closed;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(normalizeArgs(args));
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!options.file) throw new Error(`missing input file\n\n${usage()}`);
  if (options.terminal && !process.stdout.isTTY) {
    throw new Error("terminal rendering requires an interactive terminal");
  }

  const filePath = resolve(options.file);
  const fileInfo = await stat(filePath);
  if (!fileInfo.isFile()) throw new Error(`${options.file} is not a regular file`);
  if (fileInfo.size > MAX_FILE_BYTES) throw new Error("file is larger than the 2 MB limit");
  const fileName = basename(filePath);
  const fileBytes = new Uint8Array(await readFile(filePath));
  const payload = packFile({ name: fileName, type: mediaType(fileName), bytes: fileBytes });
  const sessionId = Math.floor(Math.random() * 0xffff) + 1;
  const fps = options.fps ?? (options.terminal ? TERMINAL_DEFAULT_FPS : BROWSER_DEFAULT_FPS);
  const frameBytes = options.frameBytes ??
    (options.terminal ? TERMINAL_DEFAULT_FRAME_BYTES : BROWSER_DEFAULT_FRAME_BYTES);
  const encoder = new TransferEncoder(payload, frameBytes, sessionId);

  if (!options.terminal) {
    await runBrowser(encoder, fileName, fileInfo.size, fps, frameBytes, options.ecc, !options.noOpen);
    return;
  }

  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.stdout.write(HIDE_CURSOR);
  try {
    let sent = 0;
    while (!stopped && (options.frames === undefined || sent < options.frames)) {
      const frame = encoder.encodeNext();
      const qr = QRCode.create(
        [{ data: frame.bytes, mode: "byte" } as unknown as QRCode.QRCodeSegment],
        { errorCorrectionLevel: options.ecc, maskPattern: 4 },
      ) as QrMatrix;
      const width = qr.modules.size + 2 * MARGIN;
      const height = Math.ceil(width / 2) + 2;
      const terminalColumns = process.stdout.columns ?? width;
      if (terminalColumns < width || (process.stdout.rows ?? height) < height) {
        throw new Error(
          `QR needs ${width} columns × ${height} rows; enlarge the terminal or lower --frame-bytes`,
        );
      }
      const status =
        `${fileName} · ${fileInfo.size} bytes · frame ${frame.seq} · ` +
        `K=${encoder.k} · V${qr.version} · ${frameBytes} B/frame · ` +
        `${fps} FPS · Ctrl+C to stop`;
      const visibleStatus =
        status.length <= terminalColumns ? status : `${status.slice(0, terminalColumns - 1)}…`;
      process.stdout.write(`${CLEAR}${renderQr(qr)}\n${visibleStatus}\n`);
      sent++;
      if (!stopped && (options.frames === undefined || sent < options.frames)) {
        await sleep(1000 / fps);
      }
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    process.stdout.write(`${RESET}${SHOW_CURSOR}\n`);
  }
}
