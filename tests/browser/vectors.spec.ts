import { expect, test } from "@playwright/test";
import { FIXED_VECTORS } from "../fixed-vectors";

test("protocol and fountain vectors are byte-identical", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async (vectors) => {
    const protocolPath = "/shared/protocol.ts";
    const fountainPath = "/shared/fountain.ts";
    const fileEnvelopePath = "/shared/file-envelope.ts";
    const protocol = await import(protocolPath);
    const fountain = await import(fountainPath);
    const fileEnvelope = await import(fileEnvelopePath);
    const toHex = (bytes: Uint8Array) =>
      Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const fromHex = (hex: string) =>
      Uint8Array.from({ length: hex.length / 2 }, (_, index) =>
        Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
      );
    const floatHex = (values: Float64Array) => {
      const buffer = new ArrayBuffer(values.length * 8);
      const view = new DataView(buffer);
      values.forEach((value, index) => view.setFloat64(index * 8, value, true));
      return toHex(new Uint8Array(buffer));
    };

    const randomVectors = vectors.splitmix32.map((vector) => {
      const random = protocol.splitmix32(vector.seed);
      return vector.values.map(() => random());
    });
    const cdfVectors = vectors.cdf.map((vector) =>
      floatHex(fountain.robustSolitonCdf(vector.k)),
    );
    const indexVectors = vectors.indices.map((vector) =>
      fountain.fountainFrameIndices(
        vector.k,
        fountain.robustSolitonCdf(vector.k),
        vector.sessionId,
        vector.seq,
      ),
    );
    const encoder = new fountain.LTEncoder(
      fromHex(vectors.fountain.payloadHex),
      vectors.fountain.blockLen,
      vectors.fountain.sessionId,
    );
    const fountainVectors = vectors.fountain.frames.map((frame) => toHex(encoder.encode(frame.seq)));
    const packedFrame = toHex(
      protocol.packFrame(
        {
          sessionId: 0x1234,
          seq: 0x89abcdef,
          k: 3,
          blockLen: 8,
          totalLen: 23,
          payloadFnv: 0x10203040,
        },
        fromHex(vectors.fountain.frames[4].blockHex),
      ),
    );
    const fileEnvelopeVector = toHex(
      fileEnvelope.packFile({
        name: "a.txt",
        type: "text/plain",
        bytes: new Uint8Array([0, 0xff, 0x10]),
      }),
    );
    return {
      randomVectors,
      cdfVectors,
      indexVectors,
      fountainVectors,
      packedFrame,
      fileEnvelopeVector,
    };
  }, FIXED_VECTORS);

  expect(result.randomVectors).toEqual(FIXED_VECTORS.splitmix32.map((vector) => vector.values));
  expect(result.cdfVectors).toEqual(
    FIXED_VECTORS.cdf.map((vector) => vector.littleEndianFloat64Hex),
  );
  expect(result.indexVectors).toEqual(FIXED_VECTORS.indices.map((vector) => vector.values));
  expect(result.fountainVectors).toEqual(
    FIXED_VECTORS.fountain.frames.map((frame) => frame.blockHex),
  );
  expect(result.packedFrame).toBe(FIXED_VECTORS.packedFrameHex);
  expect(result.fileEnvelopeVector).toBe(FIXED_VECTORS.fileEnvelopeHex);
});
