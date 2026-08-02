#!/usr/bin/env -S npx tsx

import { main } from "./send";

main().catch((error: unknown) => {
  process.stderr.write(`decimen: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
