# Use in Finder on macOS

The macOS integration adds a **Send with Decimen** action to Finder. Select a
file, choose the action, and macOS opens a Terminal session running
`decimen send` with that file, including paths containing spaces or Unicode
characters.

Node.js 18 or newer is required on the Mac. Nothing here needs administrator
privileges or an Apple Developer account.

## Option 1 — the packaged installer

The macOS package bundles the Decimen CLI, the web app build, and the Finder
action:

**[Download Decimen 0.2.0 for macOS](https://github.com/tongatron/decimen-optical-transfer/releases/download/v0.2.0/Decimen-0.2.0.dmg)**

Open the DMG, double-click **Install Decimen.app**, and follow the macOS
prompts. The package is currently unsigned and not notarized, so Gatekeeper
will ask for confirmation on first launch.

## Option 2 — install from the repository

Install the CLI and the Finder integration together:

```bash
git clone https://github.com/tongatron/decimen-optical-transfer.git
cd decimen-optical-transfer
./macos/install-decimen.sh
```

The installer builds the web app and the bundled CLI, installs both under
`~/.local/share/decimen`, and adds the action under `~/Library/Services`.

If the CLI is already linked with `npm link`, install only the Finder
integration:

```bash
./macos/install-finder-action.sh
```

An existing workflow with the same name is backed up rather than overwritten.

## Use the action

1. In Finder, select **exactly one** file.
2. Open the **Action** menu — the three-dot button in the Finder toolbar.
3. Choose **Send with Decimen**, listed near the bottom of that menu.
4. A Terminal window opens and a browser page shows the animated QR stream.
5. Open Decimen's **Receiver** on the camera device, point it at the stream, and
   save the file once verification completes.
6. Press `Ctrl`+`C` in the Terminal window to stop the local server.

The action is an Automator service rather than a Finder extension, which is why
macOS places it in the Action menu instead of the top-level context menu.

## Choose the Receiver host

Point the CLI at the app the receiving device should open:

```bash
decimen setup
```

The public Receiver at `https://optical-transfer.tongatron.org/` is the default.
macOS stores the choice in
`${XDG_CONFIG_HOME:-$HOME/.config}/decimen/config.json`. File contents are
still served only from `127.0.0.1`.

## Build a distributable disk image

To produce a DMG containing the prebuilt app, CLI, and Finder workflow:

```bash
./macos/build-dmg.sh
```

The result is written to `release/Decimen-<version>.dmg`. Pushing a version tag
such as `v0.2.0` makes the macOS GitHub Actions workflow build the DMG on a
macOS runner and attach it to the release automatically.

## Remove the integration

```bash
./macos/uninstall-finder-action.sh
```

The uninstaller moves the workflow to the Trash instead of deleting it
permanently.

## Troubleshooting

If the action does not appear, close and reopen Finder, then confirm the CLI
itself works:

```bash
command -v decimen
decimen --version
decimen config show
decimen send "$HOME/Downloads/example.pdf"
```

The terminal must print both a local `Decimen sender` URL and the configured
`Receiver app` URL, and the browser must show the animated QR stream.

Windows File Explorer and Linux file-manager integrations are documented in the
[repository README](https://github.com/tongatron/decimen-optical-transfer#install-the-file-explorer-action-on-windows).
