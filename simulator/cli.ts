import { DEFAULT_CHANNEL_OPTIONS, simulateTrials, type ChannelOptions } from "./channel";

function numericFlag(name: string): number | undefined {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be numeric`);
  return parsed;
}

const trials = numericFlag("trials") ?? 100;
const overrides: Partial<ChannelOptions> = {
  payloadBytes: numericFlag("payload-bytes"),
  randomLossRate: numericFlag("loss"),
  duplicateRate: numericFlag("duplicates"),
  corruptionRate: numericFlag("corruption"),
  reorderWindow: numericFlag("reorder-window"),
  startAfterFrames: numericFlag("start-after"),
};
for (const key of Object.keys(overrides) as (keyof ChannelOptions)[]) {
  if (overrides[key] === undefined) delete overrides[key];
}

const summary = simulateTrials({ ...DEFAULT_CHANNEL_OPTIONS, ...overrides }, trials);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
