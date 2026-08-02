import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const outputDirectory = resolve(root, "dist-cli");
const output = resolve(outputDirectory, "decimen.cjs");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(dirname(output), { recursive: true });
await build({
  entryPoints: [resolve(root, "cli/decimen.ts")],
  outfile: output,
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: true,
  define: { __DECIMEN_VERSION__: JSON.stringify(packageJson.version) },
});
const bundled = await readFile(output, "utf8");
await writeFile(output, bundled.replace(/^#![^\n]*\n/, "#!/usr/bin/env node\n"));
await chmod(output, 0o755);
