import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  configPath,
  DEFAULT_CONFIG,
  loadConfig,
  normalizeReceiverUrl,
  PUBLIC_RECEIVER_URL,
  saveConfig,
} from "../cli/config";
import { selfHostingInstructions } from "../cli/setup";

describe("CLI Receiver host configuration", () => {
  it("normalizes safe public and local Receiver URLs", () => {
    expect(normalizeReceiverUrl("https://example.com/decimen")).toBe("https://example.com/decimen/");
    expect(normalizeReceiverUrl("http://localhost:5173")).toBe("http://localhost:5173/");
    expect(() => normalizeReceiverUrl("http://example.com")).toThrow("HTTPS");
    expect(() => normalizeReceiverUrl("https://example.com/?token=secret")).toThrow("query");
  });

  it("uses an isolated config directory override", () => {
    expect(configPath({ DECIMEN_CONFIG_HOME: "/tmp/decimen-test" })).toBe(
      "/tmp/decimen-test/config.json",
    );
  });

  it("defaults to the public host and persists a custom host", async () => {
    const directory = await mkdtemp(join(tmpdir(), "decimen-config-test-"));
    const path = join(directory, "config.json");
    try {
      expect(await loadConfig(path)).toEqual(DEFAULT_CONFIG);
      await saveConfig({ hostMode: "custom", receiverUrl: "https://private.example/receiver" }, path);
      expect(await loadConfig(path)).toEqual({
        hostMode: "custom",
        receiverUrl: "https://private.example/receiver/",
      });
      await saveConfig({ hostMode: "public", receiverUrl: PUBLIC_RECEIVER_URL }, path);
      expect(await loadConfig(path)).toEqual(DEFAULT_CONFIG);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("provides build and configuration steps for self-hosting", () => {
    const instructions = selfHostingInstructions();
    expect(instructions).toContain("npm run build");
    expect(instructions).toContain("decimen config host");
    expect(instructions).toContain("HTTPS");
  });
});
