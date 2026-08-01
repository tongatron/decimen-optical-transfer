import { describe, expect, it } from "vitest";
import { fnv1a, packFrame, parseFrame, splitmix32 } from "../shared/protocol";
import { FIXED_VECTORS } from "./fixed-vectors";
import { fromHex, toHex } from "./helpers";

describe("frame protocol", () => {
  it("matches the fixed binary frame vector", () => {
    const block = fromHex(FIXED_VECTORS.fountain.frames[4].blockHex);
    const packed = packFrame(
      {
        sessionId: 0x1234,
        seq: 0x89abcdef,
        k: 3,
        blockLen: 8,
        totalLen: 23,
        payloadFnv: 0x10203040,
      },
      block,
    );
    expect(toHex(packed)).toBe(FIXED_VECTORS.packedFrameHex);
    expect(parseFrame(packed)).toEqual({
      header: {
        sessionId: 0x1234,
        seq: 0x89abcdef,
        k: 3,
        blockLen: 8,
        totalLen: 23,
        payloadFnv: 0x10203040,
      },
      block,
    });
  });

  it("round-trips numeric limits supported by the wire format", () => {
    const block = new Uint8Array(0xffff);
    const packed = packFrame(
      {
        sessionId: 0xffff,
        seq: 0xffffffff,
        k: 0xffff,
        blockLen: 0xffff,
        totalLen: 0xffffffff,
        payloadFnv: 0xffffffff,
      },
      block,
    );
    const parsed = parseFrame(packed);
    expect(parsed?.header).toEqual({
      sessionId: 0xffff,
      seq: 0xffffffff,
      k: 0xffff,
      blockLen: 0xffff,
      totalLen: 0xffffffff,
      payloadFnv: 0xffffffff,
    });
  });

  it("rejects bad magic, empty values, and inconsistent frame lengths", () => {
    const valid = fromHex(FIXED_VECTORS.packedFrameHex);
    const badMagic = valid.slice();
    badMagic[0] = 0;
    const zeroK = valid.slice();
    zeroK[8] = 0;
    zeroK[9] = 0;
    expect(parseFrame(badMagic)).toBeNull();
    expect(parseFrame(zeroK)).toBeNull();
    expect(parseFrame(valid.subarray(0, valid.length - 1))).toBeNull();
    expect(parseFrame(new Uint8Array(20))).toBeNull();
  });

  it("matches fixed splitmix32 sequences", () => {
    for (const vector of FIXED_VECTORS.splitmix32) {
      const random = splitmix32(vector.seed);
      expect(vector.values.map(() => random())).toEqual(vector.values);
    }
  });

  it("detects a one-bit payload change with the frame checksum", () => {
    const payload = fromHex(FIXED_VECTORS.fountain.payloadHex);
    const changed = payload.slice();
    changed[7]! ^= 1;
    expect(fnv1a(changed)).not.toBe(fnv1a(payload));
  });
});
