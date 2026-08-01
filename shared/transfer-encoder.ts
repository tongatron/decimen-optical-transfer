import { LTEncoder } from "./fountain";
import { HEADER_LEN, fnv1a, packFrame, type FrameHeader } from "./protocol";

export interface EncodedTransferFrame {
  seq: number;
  bytes: Uint8Array;
}

/** Shared stateful sender used by browser and command-line renderers. */
export class TransferEncoder {
  readonly blockLen: number;
  readonly k: number;
  readonly header: Readonly<FrameHeader>;
  private readonly fountain: LTEncoder;
  private nextSeq = 0;

  constructor(payload: Uint8Array, frameBytes: number, sessionId: number) {
    if (!Number.isInteger(frameBytes) || frameBytes <= HEADER_LEN) {
      throw new Error(`frame bytes must be an integer greater than ${HEADER_LEN}`);
    }
    if (!Number.isInteger(sessionId) || sessionId < 1 || sessionId > 0xffff) {
      throw new Error("session id must be an integer from 1 to 65535");
    }

    this.blockLen = frameBytes - HEADER_LEN;
    this.fountain = new LTEncoder(payload, this.blockLen, sessionId);
    this.k = this.fountain.k;
    if (this.k > 0xffff) {
      throw new Error("payload needs too many fountain blocks; use larger frames or a smaller file");
    }
    this.header = {
      sessionId,
      seq: 0,
      k: this.k,
      blockLen: this.blockLen,
      totalLen: payload.length,
      payloadFnv: fnv1a(payload),
    };
  }

  encodeNext(): EncodedTransferFrame {
    const seq = this.nextSeq;
    if (seq > 0xffffffff) throw new Error("frame sequence exhausted");
    this.nextSeq++;
    return {
      seq,
      bytes: packFrame({ ...this.header, seq }, this.fountain.encode(seq)),
    };
  }
}
