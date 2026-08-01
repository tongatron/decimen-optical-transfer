import { describe, expect, it } from "vitest";
import {
  fountainFrameIndices,
  LTDecoder,
  LTEncoder,
  robustSolitonCdf,
} from "../shared/fountain";
import { FIXED_VECTORS } from "./fixed-vectors";
import { float64LittleEndianHex, fromHex, toHex } from "./helpers";

describe("fountain code", () => {
  it("matches fixed robust-soliton distributions", () => {
    for (const vector of FIXED_VECTORS.cdf) {
      expect(float64LittleEndianHex(robustSolitonCdf(vector.k))).toBe(
        vector.littleEndianFloat64Hex,
      );
    }
  });

  it("matches fixed frame index lists", () => {
    for (const vector of FIXED_VECTORS.indices) {
      expect(
        fountainFrameIndices(
          vector.k,
          robustSolitonCdf(vector.k),
          vector.sessionId,
          vector.seq,
        ),
      ).toEqual(vector.values);
    }
  });

  it("matches fixed encoded blocks", () => {
    const vector = FIXED_VECTORS.fountain;
    const encoder = new LTEncoder(fromHex(vector.payloadHex), vector.blockLen, vector.sessionId);
    expect(encoder.k).toBe(vector.k);
    for (const frame of vector.frames) {
      expect(toHex(encoder.encode(frame.seq))).toBe(frame.blockHex);
    }
  });

  it("reconstructs out-of-order data with missing and duplicate frames", () => {
    const payload = Uint8Array.from({ length: 8195 }, (_, index) => (index * 29 + 7) & 0xff);
    const blockLen = 257;
    const sessionId = 0x2345;
    const encoder = new LTEncoder(payload, blockLen, sessionId);
    const decoder = new LTDecoder(encoder.k, blockLen, sessionId, payload.length);
    const sequence = Array.from({ length: encoder.k * 4 }, (_, index) => index + 11)
      .filter((seq) => seq % 7 !== 0)
      .sort((a, b) => ((a * 2654435761) >>> 0) - ((b * 2654435761) >>> 0));

    for (const seq of sequence) {
      const block = encoder.encode(seq);
      decoder.addFrame(seq, block);
      if (seq % 5 === 0) decoder.addFrame(seq, block);
      if (decoder.isComplete) break;
    }

    expect(decoder.isComplete).toBe(true);
    expect(decoder.framesDup).toBeGreaterThan(0);
    expect(decoder.assemble()).toEqual(payload);
  });

  it("removes padding from the final source block", () => {
    const payload = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const encoder = new LTEncoder(payload, 8, 42);
    const decoder = new LTDecoder(encoder.k, 8, 42, payload.length);
    for (let seq = 0; seq < 100 && !decoder.isComplete; seq++) {
      decoder.addFrame(seq, encoder.encode(seq));
    }
    expect(decoder.assemble()).toEqual(payload);
    expect(decoder.assemble()?.length).toBe(9);
  });
});
