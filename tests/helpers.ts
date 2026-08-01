export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("hex input must have an even length");
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function float64LittleEndianHex(values: Float64Array): string {
  const buffer = new ArrayBuffer(values.length * 8);
  const view = new DataView(buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return toHex(new Uint8Array(buffer));
}
