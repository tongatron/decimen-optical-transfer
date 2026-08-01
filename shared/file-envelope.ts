// Small self-describing envelope carried inside the fountain payload.
// The outer frame protocol remains unchanged; this adds the information the
// receiver needs to restore an arbitrary file rather than assuming a PNG.

const HEADER_LEN = 16;
const MAGIC = [0x44, 0x4f, 0x54, 0x46] as const; // "DOTF"
const VERSION = 1;

export interface TransferredFile {
  name: string;
  type: string;
  bytes: Uint8Array;
}

export function packFile(file: TransferredFile): Uint8Array {
  const encoder = new TextEncoder();
  const name = encoder.encode(file.name || "received-file");
  const type = encoder.encode(file.type || "application/octet-stream");
  if (name.length > 0xffff) throw new Error("file name is too long");
  if (type.length > 0xffff) throw new Error("file type is too long");
  if (file.bytes.length > 0xffffffff) throw new Error("file is too large");

  const out = new Uint8Array(HEADER_LEN + name.length + type.length + file.bytes.length);
  out.set(MAGIC, 0);
  const view = new DataView(out.buffer);
  view.setUint8(4, VERSION);
  view.setUint16(6, name.length, true);
  view.setUint16(8, type.length, true);
  view.setUint32(12, file.bytes.length, true);
  out.set(name, HEADER_LEN);
  out.set(type, HEADER_LEN + name.length);
  out.set(file.bytes, HEADER_LEN + name.length + type.length);
  return out;
}

export function unpackFile(payload: Uint8Array): TransferredFile | null {
  if (payload.length < HEADER_LEN) return null;
  for (let i = 0; i < MAGIC.length; i++) {
    if (payload[i] !== MAGIC[i]) return null;
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (view.getUint8(4) !== VERSION) return null;
  const nameLen = view.getUint16(6, true);
  const typeLen = view.getUint16(8, true);
  const fileLen = view.getUint32(12, true);
  const dataStart = HEADER_LEN + nameLen + typeLen;
  if (dataStart + fileLen !== payload.length) return null;

  const decoder = new TextDecoder();
  const name = decoder.decode(payload.subarray(HEADER_LEN, HEADER_LEN + nameLen));
  const type = decoder.decode(payload.subarray(HEADER_LEN + nameLen, dataStart));
  return {
    name: name || "received-file",
    type: type || "application/octet-stream",
    bytes: payload.subarray(dataStart),
  };
}
