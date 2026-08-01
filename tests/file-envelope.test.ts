import { describe, expect, it } from "vitest";
import { packFile, unpackFile } from "../shared/file-envelope";
import { FIXED_VECTORS } from "./fixed-vectors";
import { fromHex, toHex } from "./helpers";

describe("file envelope", () => {
  it("matches the fixed binary vector", () => {
    const packed = packFile({
      name: "a.txt",
      type: "text/plain",
      bytes: new Uint8Array([0, 0xff, 0x10]),
    });
    expect(toHex(packed)).toBe(FIXED_VECTORS.fileEnvelopeHex);
    expect(unpackFile(packed)).toEqual({
      name: "a.txt",
      type: "text/plain",
      bytes: new Uint8Array([0, 0xff, 0x10]),
    });
  });

  it("round-trips Unicode metadata and empty file contents", () => {
    const packed = packFile({
      name: "résumé-📷.txt",
      type: "text/plain;charset=utf-8",
      bytes: new Uint8Array(),
    });
    expect(unpackFile(packed)).toEqual({
      name: "résumé-📷.txt",
      type: "text/plain;charset=utf-8",
      bytes: new Uint8Array(),
    });
  });

  it("rejects truncated, unknown-version, and inconsistent envelopes", () => {
    const valid = fromHex(FIXED_VECTORS.fileEnvelopeHex);
    const unknownVersion = valid.slice();
    unknownVersion[4] = 2;
    const inconsistentLength = valid.slice();
    inconsistentLength[12] = 4;
    expect(unpackFile(valid.subarray(0, valid.length - 1))).toBeNull();
    expect(unpackFile(unknownVersion)).toBeNull();
    expect(unpackFile(inconsistentLength)).toBeNull();
    expect(unpackFile(new Uint8Array())).toBeNull();
  });
});
