import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  configPath,
  loadConfig,
  normalizeReceiverUrl,
  PUBLIC_RECEIVER_URL,
  saveConfig,
} from "./config";

const PROJECT_URL = "https://github.com/tongatron/decimen-optical-transfer";

function openProjectPage(): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", PROJECT_URL] : [PROJECT_URL];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
}

export function selfHostingInstructions(): string {
  return `Self-host Decimen

1. Install and build the static app:
   npm install
   npm run build
2. Publish the generated dist/ directory from an HTTPS origin.
3. Configure its URL with:
   decimen config host https://your-decimen.example/

For local development, run npm run dev and use the HTTPS Network URL printed by Vite.`;
}

function setupUsage(): string {
  return `Usage: decimen setup [--public | --host <url> | --self-hosted]

With no option, setup interactively chooses the Receiver host.`;
}

export async function runSetup(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    output.write(`${setupUsage()}\n`);
    return;
  }
  if (args.length > 0) {
    if (args.length === 1 && args[0] === "--public") {
      await saveConfig({ hostMode: "public", receiverUrl: PUBLIC_RECEIVER_URL });
      output.write(`Receiver host: ${PUBLIC_RECEIVER_URL}\nConfiguration: ${configPath()}\n`);
      return;
    }
    if (args.length === 2 && args[0] === "--host") {
      const receiverUrl = normalizeReceiverUrl(args[1]!);
      await saveConfig({ hostMode: "custom", receiverUrl });
      output.write(`Receiver host: ${receiverUrl}\nConfiguration: ${configPath()}\n`);
      return;
    }
    if (args.length === 1 && args[0] === "--self-hosted") {
      output.write(`${selfHostingInstructions()}\n`);
      return;
    }
    throw new Error(setupUsage());
  }
  if (!input.isTTY || !output.isTTY) {
    throw new Error(`interactive setup requires a terminal\n\n${setupUsage()}`);
  }

  const current = await loadConfig();
  const prompt = createInterface({ input, output });
  try {
    output.write(`Decimen Receiver host setup

1. Public Decimen host (recommended)
   ${PUBLIC_RECEIVER_URL}
2. Custom private or public HTTPS host
3. Show local/self-hosted installation instructions

Current host: ${current.receiverUrl}\n`);
    const choice = (await prompt.question("Choose 1, 2, or 3: ")).trim();
    if (choice === "1") {
      await saveConfig({ hostMode: "public", receiverUrl: PUBLIC_RECEIVER_URL });
      output.write(`Receiver host saved: ${PUBLIC_RECEIVER_URL}\n`);
    } else if (choice === "2") {
      const receiverUrl = normalizeReceiverUrl(await prompt.question("Receiver HTTPS URL: "));
      await saveConfig({ hostMode: "custom", receiverUrl });
      output.write(`Receiver host saved: ${receiverUrl}\n`);
    } else if (choice === "3") {
      output.write(`\n${selfHostingInstructions()}\n`);
      const receiverInput = (await prompt.question(
        "Deployed URL (leave blank to keep the current host): ",
      )).trim();
      if (receiverInput) {
        const receiverUrl = normalizeReceiverUrl(receiverInput);
        await saveConfig({ hostMode: "custom", receiverUrl });
        output.write(`Receiver host saved: ${receiverUrl}\n`);
      }
    } else {
      throw new Error("setup cancelled: choose 1, 2, or 3");
    }

    const star = (await prompt.question(
      "If Decimen is useful, open the GitHub project so you can leave a star? [y/N] ",
    )).trim().toLowerCase();
    if (star === "y" || star === "yes") openProjectPage();
  } finally {
    prompt.close();
  }
}

function configUsage(): string {
  return `Usage: decimen config <command>

Commands:
  show                 Show the configured Receiver host and config path
  host <url>           Use a custom private or public Receiver host
  use-public           Use ${PUBLIC_RECEIVER_URL}`;
}

export async function runConfig(args: string[]): Promise<void> {
  const [command, value, ...extra] = args;
  if (command === "show" && !value) {
    const config = await loadConfig();
    output.write(`Mode: ${config.hostMode}\nReceiver host: ${config.receiverUrl}\nConfiguration: ${configPath()}\n`);
    return;
  }
  if (command === "host" && value && extra.length === 0) {
    const receiverUrl = normalizeReceiverUrl(value);
    await saveConfig({ hostMode: "custom", receiverUrl });
    output.write(`Receiver host: ${receiverUrl}\n`);
    return;
  }
  if (command === "use-public" && !value) {
    await saveConfig({ hostMode: "public", receiverUrl: PUBLIC_RECEIVER_URL });
    output.write(`Receiver host: ${PUBLIC_RECEIVER_URL}\n`);
    return;
  }
  if (command === "--help" || command === "-h" || !command) {
    output.write(`${configUsage()}\n`);
    return;
  }
  throw new Error(configUsage());
}
