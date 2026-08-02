import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { normalizeArgs, parseArgs, renderQr, renderQrSvg } from "../cli/send";
import { LTDecoder } from "../shared/fountain";
import { parseFrame } from "../shared/protocol";
import { TransferEncoder } from "../shared/transfer-encoder";

describe("shared transfer encoder", () => {
  it("emits self-describing fountain frames that reconstruct the payload", () => {
    const payload = new TextEncoder().encode("CLI and browser share this transfer engine.");
    const sender = new TransferEncoder(payload, 32, 1234);
    const decoder = new LTDecoder(sender.k, sender.blockLen, 1234, payload.length);

    for (let attempts = 0; !decoder.isComplete && attempts < 1_000; attempts++) {
      const encoded = sender.encodeNext();
      const parsed = parseFrame(encoded.bytes);
      expect(parsed?.header.seq).toBe(encoded.seq);
      decoder.addFrame(parsed!.header.seq, parsed!.block);
    }

    expect(decoder.assemble()).toEqual(payload);
  });

  it("renders a terminal QR with its quiet zone", () => {
    const qr = QRCode.create("hello") as unknown as Parameters<typeof renderQr>[0];
    const rendered = renderQr(qr);
    expect(rendered).toContain("\x1b[47m\x1b[30m");
    expect(rendered.split("\n")).toHaveLength(Math.ceil((qr.modules.size + 8) / 2));
    const svg = renderQrSvg(qr);
    expect(svg).toContain(`viewBox="0 0 ${qr.modules.size + 8} ${qr.modules.size + 8}"`);
    expect(svg).toContain("shape-rendering=\"crispEdges\"");
  });

  it("parses and validates CLI options", () => {
    expect(normalizeArgs(["send", "photo.png"])).toEqual(["photo.png"]);
    expect(normalizeArgs(["photo.png"])).toEqual(["photo.png"]);
    expect(parseArgs(["photo.png", "--fps", "8", "--frame-bytes", "180", "--ecc", "m"]))
      .toMatchObject({ file: "photo.png", fps: 8, frameBytes: 180, ecc: "M", terminal: false });
    expect(() => parseArgs(["file.bin", "--fps", "0"])).toThrow("fps");
    expect(() => parseArgs(["file.bin", "--unknown"])).toThrow("unknown option");
    expect(() => parseArgs(["file.bin", "--frames", "1"])).toThrow("--terminal");
  });
});
