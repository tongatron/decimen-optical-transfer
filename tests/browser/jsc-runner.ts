// Standalone entry point for running the deterministic vectors in a JavaScriptCore
// shell. Bundle it for the browser platform, then execute the bundle with `jsc`.
import {
  fountainFrameIndices,
  LTEncoder,
  robustSolitonCdf,
} from "../../shared/fountain";
import { packFrame, splitmix32 } from "../../shared/protocol";
import { FIXED_VECTORS } from "../fixed-vectors";
import { float64LittleEndianHex, fromHex, toHex } from "../helpers";

function check(condition: boolean, label: string): void {
  if (!condition) throw new Error(`vector mismatch: ${label}`);
}

for (const vector of FIXED_VECTORS.splitmix32) {
  const random = splitmix32(vector.seed);
  check(
    vector.values.every((expected) => random() === expected),
    `splitmix32 seed ${vector.seed}`,
  );
}
for (const vector of FIXED_VECTORS.cdf) {
  check(
    float64LittleEndianHex(robustSolitonCdf(vector.k)) === vector.littleEndianFloat64Hex,
    `robust soliton K=${vector.k}`,
  );
}
for (const vector of FIXED_VECTORS.indices) {
  check(
    JSON.stringify(
      fountainFrameIndices(
        vector.k,
        robustSolitonCdf(vector.k),
        vector.sessionId,
        vector.seq,
      ),
    ) === JSON.stringify(vector.values),
    `frame indices K=${vector.k} session=${vector.sessionId} seq=${vector.seq}`,
  );
}
const fountain = FIXED_VECTORS.fountain;
const encoder = new LTEncoder(fromHex(fountain.payloadHex), fountain.blockLen, fountain.sessionId);
for (const frame of fountain.frames) {
  check(toHex(encoder.encode(frame.seq)) === frame.blockHex, `fountain frame ${frame.seq}`);
}
check(
  toHex(
    packFrame(
      {
        sessionId: 0x1234,
        seq: 0x89abcdef,
        k: 3,
        blockLen: 8,
        totalLen: 23,
        payloadFnv: 0x10203040,
      },
      fromHex(fountain.frames[4].blockHex),
    ),
  ) === FIXED_VECTORS.packedFrameHex,
  "packed frame",
);
declare const print: ((message: string) => void) | undefined;
if (typeof print === "function") print("All deterministic vectors passed in JavaScriptCore.");
