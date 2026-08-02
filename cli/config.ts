import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const PUBLIC_RECEIVER_URL = "https://optical-transfer.tongatron.org/";

export type HostMode = "public" | "custom";

export interface DecimenConfig {
  hostMode: HostMode;
  receiverUrl: string;
}

export const DEFAULT_CONFIG: DecimenConfig = {
  hostMode: "public",
  receiverUrl: PUBLIC_RECEIVER_URL,
};

export function configPath(environment: NodeJS.ProcessEnv = process.env): string {
  if (environment.DECIMEN_CONFIG_HOME) {
    return resolve(environment.DECIMEN_CONFIG_HOME, "config.json");
  }
  if (process.platform === "win32") {
    return join(environment.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Decimen", "config.json");
  }
  return join(environment.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "decimen", "config.json");
}

export function normalizeReceiverUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("receiver host must be a valid absolute URL");
  }
  const localHttp = url.protocol === "http:" &&
    (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("receiver host must use HTTPS (HTTP is allowed only for localhost)");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("receiver host cannot contain credentials, a query, or a fragment");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

export async function loadConfig(path = configPath()): Promise<DecimenConfig> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_CONFIG };
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`invalid Decimen configuration: ${path}`);
  }
  if (!value || typeof value !== "object" || !("receiverUrl" in value)) {
    throw new Error(`invalid Decimen configuration: ${path}`);
  }
  const receiverUrl = normalizeReceiverUrl(String(value.receiverUrl));
  return {
    hostMode: receiverUrl === PUBLIC_RECEIVER_URL ? "public" : "custom",
    receiverUrl,
  };
}

export async function saveConfig(config: DecimenConfig, path = configPath()): Promise<void> {
  const receiverUrl = normalizeReceiverUrl(config.receiverUrl);
  const normalized: DecimenConfig = {
    hostMode: receiverUrl === PUBLIC_RECEIVER_URL ? "public" : "custom",
    receiverUrl,
  };
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
}
