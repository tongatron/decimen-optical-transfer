#!/usr/bin/env -S npx tsx

import { main as send } from "./send";
import { runConfig, runSetup } from "./setup";

function usage(): string {
  return `Usage: decimen <command> [options]

Commands:
  send <file>          Send a file as an animated QR stream
  setup                Choose a public, custom, or self-hosted Receiver
  config show          Show the configured Receiver host
  config host <url>    Set a custom Receiver host
  config use-public    Use the public Decimen Receiver

Run decimen <command> --help for command-specific help.`;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = args;
  if (command === "setup") return runSetup(rest);
  if (command === "config") return runConfig(rest);
  if (command === "help" || command === "--help" || command === "-h" || !command) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  await send(args);
}

main().catch((error: unknown) => {
  process.stderr.write(`decimen: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
