export const FIXED_VECTORS = {
  splitmix32: [
    {
      seed: 0,
      values: [1684164658, 3653269916, 2939563536, 2141751570, 3295091513],
    },
    {
      seed: 0x12345678,
      values: [2986037511, 744488920, 2204577711, 2810942300, 1174022055],
    },
  ],
  cdf: [
    { k: 1, littleEndianFloat64Hex: "000000000000f03f" },
    {
      k: 4,
      littleEndianFloat64Hex:
        "f923c9c8c69cd33f7848e2a15f10e63f7691145491f7ea3f000000000000f03f",
    },
    {
      k: 16,
      littleEndianFloat64Hex:
        "346145392448bc3f201adb4df369e03f1ad8190a8e0ce53f14d93aa5ab89e73f" +
        "106e1c5a3a22e93f0cf02afc1f44ea3f760dc85cb61feb3faa6107a0cacdeb3f" +
        "7c9363177d5cec3f7a597af67cd4ec3f1b1b22fe723bed3f40f9f8c69481ef3f" +
        "2c8522b17aa8ef3f658f210cd2c9ef3f4098fe5ab7e6ef3f000000000000f03f",
    },
  ],
  indices: [
    { k: 4, sessionId: 1, seq: 0, values: [1, 3, 2] },
    { k: 4, sessionId: 1, seq: 7, values: [0, 2, 3] },
    { k: 16, sessionId: 0x1234, seq: 99, values: [6, 11, 2, 3, 0, 1] },
    { k: 128, sessionId: 0xffff, seq: 0xffffffff, values: [26, 31] },
  ],
  fountain: {
    payloadHex: "031425364758697a8b9cadbecfe0f10213243546576879",
    blockLen: 8,
    sessionId: 0x1234,
    k: 3,
    frames: [
      { seq: 0, blockHex: "103010701030107a" },
      { seq: 1, blockHex: "8b9cadbecfe0f102" },
      { seq: 2, blockHex: "8888888888b89878" },
      { seq: 3, blockHex: "98b898f898888802" },
      { seq: 7, blockHex: "8888888888b89878" },
      { seq: 99, blockHex: "9bacbdcedfd0e178" },
    ],
  },
  packedFrameHex:
    "d10c3412efcdab890300080017000000403020108888888888b89878",
  fileEnvelopeHex:
    "444f5446010005000a00000003000000612e747874746578742f706c61696e00ff10",
} as const;
