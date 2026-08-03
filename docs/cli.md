# Use in your CLI

The `decimen` command sends a file from a terminal. It opens a local browser
page containing the animated QR stream and uses the same file envelope,
fountain encoder, and frame protocol as the web sender.

The CLI is optional: the hosted web app and the PWA do not need it.

## Requirements

- Node.js 18 or newer, and npm
- A second device running Decimen's **Receiver**

## Install

```bash
git clone https://github.com/tongatron/decimen-optical-transfer.git
cd decimen-optical-transfer
npm install
npm run build:cli
npm link
```

The command then works from any directory:

```bash
decimen --version
decimen --help
```

## Choose the Receiver host

Run the guided setup once:

```bash
decimen setup
```

It offers three choices: the recommended public Receiver at
`https://optical-transfer.tongatron.org/`, a custom private or public HTTPS
deployment, or local self-hosting instructions. The public host is the default
even if setup has never been run.

For unattended installations:

```bash
decimen setup --public
decimen setup --host https://decimen.example/
decimen setup --self-hosted
```

Inspect or change the selection later:

```bash
decimen config show
decimen config host https://decimen.example/
decimen config use-public
```

Custom hosts must use HTTPS; plain HTTP is accepted only for `localhost`. The
choice is stored in the user's configuration directory:

| Platform | Location |
|---|---|
| macOS and Linux | `${XDG_CONFIG_HOME:-$HOME/.config}/decimen/config.json` |
| Windows | `%APPDATA%\Decimen\config.json` |

The host only identifies the app to open on the receiving device. File contents
are still served exclusively from `127.0.0.1` and transferred through the
animated QR stream.

## Send a file

```bash
decimen send ./document.pdf
decimen send /absolute/path/to/document.pdf
```

The command binds a temporary HTTP server to `127.0.0.1`, prints its URL, and
opens it in the default browser. The server is reachable only from the sending
computer.

To receive the file:

1. Keep the CLI process and its browser page open.
2. Open Decimen's **Receiver** on the camera device and start the camera.
3. Point the camera at the animated QR code, using **Fullscreen** if needed.
4. Wait for verification, then save the reconstructed file.
5. Press `Ctrl`+`C` in the sending terminal to stop the local server.

## Options

| Option | Default | Purpose |
|---|---:|---|
| `--fps <n>` | 24 | Frame rate, from greater than 0 through 30 FPS. |
| `--frame-bytes <n>` | 1465 | QR density, from 32 through 2953 bytes per frame. |
| `--ecc <L\|M\|Q\|H>` | L | QR error correction; higher levels may require smaller frames. |
| `--no-open` | Off | Print the local URL without opening the browser. |
| `--terminal` | Off | Use experimental ANSI rendering instead of the browser page. |
| `--frames <n>` | Unlimited | Stop ANSI output after a fixed number of frames; requires `--terminal`. |

A slower, less dense stream:

```bash
decimen send ./document.pdf --fps 8 --frame-bytes 300 --ecc L
```

ANSI mode defaults to 64-byte frames at 6 FPS so it fits a standard 80×24
terminal. Terminal font metrics and line spacing deform the QR modules, so the
browser renderer is strongly recommended for real camera transfers.

## Limits and troubleshooting

The CLI has the same 2 MB input limit as the web sender. If the Receiver cannot
decode the stream, maximize the browser page, raise screen brightness, or lower
`--fps` and `--frame-bytes`.

If the command is not found, check the link and configuration:

```bash
command -v decimen
decimen --version
decimen config show
```

On Windows, `decimen.cmd` is a useful fallback when the PowerShell execution
policy blocks npm's generated `decimen.ps1` shim:

```powershell
Get-Command decimen
decimen.cmd --version
decimen.cmd config show
```

Reopen the terminal after `npm link` if the command is still missing from
`PATH`.

## Development and removal

During development, `npm run send -- ./document.pdf` is an equivalent
repository-local command. Remove the globally linked command with:

```bash
npm unlink -g decimen-optical-transfer
```
