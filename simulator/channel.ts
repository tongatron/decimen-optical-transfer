import { performance } from "node:perf_hooks";
import { LTDecoder, LTEncoder } from "../shared/fountain";
import { fnv1a, HEADER_LEN, packFrame, parseFrame, splitmix32 } from "../shared/protocol";

export interface ChannelOptions {
  payloadBytes: number;
  blockLen: number;
  seed: number;
  maxSourceFrames: number;
  startAfterFrames: number;
  randomLossRate: number;
  burstStartRate: number;
  burstMinFrames: number;
  burstMaxFrames: number;
  duplicateRate: number;
  reorderWindow: number;
  corruptionRate: number;
  sessionSwitchAt: number | null;
  sessionSwitchFrames: number;
}

export interface SimulationResult {
  completed: boolean;
  integrityVerified: boolean;
  sourceFramesGenerated: number;
  framesDelivered: number;
  framesDropped: number;
  framesCorrupted: number;
  framesDuplicated: number;
  framesNeeded: number;
  sourceBlocks: number;
  overheadRatio: number | null;
  estimatedPeakDecoderMemoryBytes: number;
  encodeMilliseconds: number;
  decodeMilliseconds: number;
}

export interface SimulationSummary {
  trials: number;
  completionRate: number;
  integritySuccessRate: number;
  averageFramesNeeded: number | null;
  averageOverheadRatio: number | null;
  averageEncodeMilliseconds: number;
  averageDecodeMilliseconds: number;
  peakEstimatedDecoderMemoryBytes: number;
  options: ChannelOptions;
}

export const DEFAULT_CHANNEL_OPTIONS: ChannelOptions = {
  payloadBytes: 64 * 1024,
  blockLen: 1024,
  seed: 0xdec1_2026,
  maxSourceFrames: 4096,
  startAfterFrames: 0,
  randomLossRate: 0.15,
  burstStartRate: 0.01,
  burstMinFrames: 2,
  burstMaxFrames: 8,
  duplicateRate: 0.05,
  reorderWindow: 8,
  corruptionRate: 0,
  sessionSwitchAt: null,
  sessionSwitchFrames: 0,
};

interface ReceiverState {
  decoder: LTDecoder | null;
  sessionId: number | null;
  expectedHash: number;
  completed: boolean;
  integrityVerified: boolean;
  peakMemory: number;
}

function unit(random: () => number): number {
  return random() * 2 ** -32;
}

function integer(random: () => number, min: number, max: number): number {
  return min + (random() % (max - min + 1));
}

function makePayload(length: number, seed: number): Uint8Array {
  const random = splitmix32(seed ^ 0xa5a5_5a5a);
  return Uint8Array.from({ length }, () => random() & 0xff);
}

function validateOptions(options: ChannelOptions): void {
  if (!Number.isInteger(options.payloadBytes) || options.payloadBytes <= 0) {
    throw new Error("payloadBytes must be a positive integer");
  }
  if (!Number.isInteger(options.blockLen) || options.blockLen <= 0 || options.blockLen > 0xffff) {
    throw new Error("blockLen must be an integer between 1 and 65535");
  }
  if (!Number.isInteger(options.maxSourceFrames) || options.maxSourceFrames <= 0) {
    throw new Error("maxSourceFrames must be a positive integer");
  }
  for (const key of ["randomLossRate", "burstStartRate", "duplicateRate", "corruptionRate"] as const) {
    if (options[key] < 0 || options[key] > 1) throw new Error(`${key} must be between 0 and 1`);
  }
  if (options.burstMinFrames < 1 || options.burstMaxFrames < options.burstMinFrames) {
    throw new Error("burst frame bounds are invalid");
  }
  if (options.reorderWindow < 0 || !Number.isInteger(options.reorderWindow)) {
    throw new Error("reorderWindow must be a non-negative integer");
  }
}

export function simulateTransfer(overrides: Partial<ChannelOptions> = {}): SimulationResult {
  const options = { ...DEFAULT_CHANNEL_OPTIONS, ...overrides };
  validateOptions(options);
  const random = splitmix32(options.seed);
  const primaryPayload = makePayload(options.payloadBytes, options.seed);
  const secondaryPayload = makePayload(options.payloadBytes, options.seed ^ 0x1357_9bdf);
  const primarySession = ((options.seed >>> 0) % 0xfffe) + 1;
  const secondarySession = primarySession === 0xffff ? 1 : primarySession + 1;
  const primary = new LTEncoder(primaryPayload, options.blockLen, primarySession);
  const secondary = new LTEncoder(secondaryPayload, options.blockLen, secondarySession);
  const primaryHash = fnv1a(primaryPayload);
  const secondaryHash = fnv1a(secondaryPayload);
  const state: ReceiverState = {
    decoder: null,
    sessionId: null,
    expectedHash: 0,
    completed: false,
    integrityVerified: false,
    peakMemory: 0,
  };
  const reorderBuffer: Uint8Array[] = [];
  let burstRemaining = 0;
  let framesDelivered = 0;
  let framesDropped = 0;
  let framesCorrupted = 0;
  let framesDuplicated = 0;
  let encodeMilliseconds = 0;
  let decodeMilliseconds = 0;
  let sourceFramesGenerated = 0;

  const receive = (frame: Uint8Array) => {
    const started = performance.now();
    const parsed = parseFrame(frame);
    if (!parsed) {
      decodeMilliseconds += performance.now() - started;
      return;
    }
    const { header, block } = parsed;
    if (!state.decoder || state.sessionId !== header.sessionId) {
      state.decoder = new LTDecoder(header.k, header.blockLen, header.sessionId, header.totalLen);
      state.sessionId = header.sessionId;
      state.expectedHash = header.payloadFnv;
    }
    state.decoder.addFrame(header.seq, block);
    state.peakMemory = Math.max(state.peakMemory, state.decoder.estimatedMemoryBytes);
    if (state.decoder.isComplete) {
      const assembled = state.decoder.assemble();
      state.completed = assembled !== null;
      state.integrityVerified = assembled !== null && fnv1a(assembled) === state.expectedHash;
    }
    decodeMilliseconds += performance.now() - started;
  };

  const flushOne = () => {
    if (reorderBuffer.length === 0 || state.completed) return;
    const index = integer(random, 0, reorderBuffer.length - 1);
    const [frame] = reorderBuffer.splice(index, 1);
    if (frame) receive(frame);
  };

  for (let seq = 0; seq < options.maxSourceFrames && !state.completed; seq++) {
    sourceFramesGenerated++;
    const switched =
      options.sessionSwitchAt !== null &&
      seq >= options.sessionSwitchAt &&
      seq < options.sessionSwitchAt + options.sessionSwitchFrames;
    const encoder = switched ? secondary : primary;
    const payload = switched ? secondaryPayload : primaryPayload;
    const sessionId = switched ? secondarySession : primarySession;
    const started = performance.now();
    const block = encoder.encode(seq);
    let frame = packFrame(
      {
        sessionId,
        seq,
        k: encoder.k,
        blockLen: options.blockLen,
        totalLen: payload.length,
        payloadFnv: switched ? secondaryHash : primaryHash,
      },
      block,
    );
    encodeMilliseconds += performance.now() - started;

    if (seq < options.startAfterFrames) continue;
    if (burstRemaining > 0) {
      burstRemaining--;
      framesDropped++;
      continue;
    }
    if (unit(random) < options.burstStartRate) {
      burstRemaining = integer(random, options.burstMinFrames, options.burstMaxFrames) - 1;
      framesDropped++;
      continue;
    }
    if (unit(random) < options.randomLossRate) {
      framesDropped++;
      continue;
    }
    if (unit(random) < options.corruptionRate) {
      frame = frame.slice();
      const byteIndex = integer(random, HEADER_LEN, frame.length - 1);
      frame[byteIndex]! ^= 1 << (random() % 8);
      framesCorrupted++;
    }

    reorderBuffer.push(frame);
    framesDelivered++;
    if (unit(random) < options.duplicateRate) {
      reorderBuffer.push(frame.slice());
      framesDelivered++;
      framesDuplicated++;
    }
    if (reorderBuffer.length > options.reorderWindow) flushOne();
  }

  while (reorderBuffer.length > 0 && !state.completed) flushOne();
  const activeDecoder = state.decoder;
  const framesNeeded = activeDecoder?.framesNew ?? 0;
  const sourceBlocks = primary.k;
  return {
    completed: state.completed,
    integrityVerified: state.integrityVerified,
    sourceFramesGenerated,
    framesDelivered,
    framesDropped,
    framesCorrupted,
    framesDuplicated,
    framesNeeded,
    sourceBlocks,
    overheadRatio: state.completed ? framesNeeded / (activeDecoder?.k ?? sourceBlocks) : null,
    estimatedPeakDecoderMemoryBytes: state.peakMemory,
    encodeMilliseconds,
    decodeMilliseconds,
  };
}

export function simulateTrials(
  overrides: Partial<ChannelOptions> = {},
  trials = 100,
): SimulationSummary {
  if (!Number.isInteger(trials) || trials <= 0) throw new Error("trials must be a positive integer");
  const options = { ...DEFAULT_CHANNEL_OPTIONS, ...overrides };
  const results = Array.from({ length: trials }, (_, index) =>
    simulateTransfer({ ...options, seed: (options.seed + index) >>> 0 }),
  );
  const completed = results.filter((result) => result.completed);
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    trials,
    completionRate: completed.length / trials,
    integritySuccessRate: results.filter((result) => result.integrityVerified).length / trials,
    averageFramesNeeded:
      completed.length > 0 ? average(completed.map((result) => result.framesNeeded)) : null,
    averageOverheadRatio:
      completed.length > 0
        ? average(completed.flatMap((result) => result.overheadRatio ?? []))
        : null,
    averageEncodeMilliseconds: average(results.map((result) => result.encodeMilliseconds)),
    averageDecodeMilliseconds: average(results.map((result) => result.decodeMilliseconds)),
    peakEstimatedDecoderMemoryBytes: Math.max(
      ...results.map((result) => result.estimatedPeakDecoderMemoryBytes),
    ),
    options,
  };
}
