# Decimen CLI and desktop integration roadmap

This roadmap turns the current repository script into a small, installable
desktop tool while keeping the optical protocol shared with the web app.

## Product principles

- One memorable command: `decimen send <file>`.
- No file upload, account, pairing, or network path between devices.
- Browser-rendered QR is the reliable default; ANSI rendering remains optional.
- Desktop integrations call the public CLI instead of duplicating transfer logic.
- Received links and other active content must always require explicit user
  confirmation before opening.

## Phase 1 — Installable CLI

Deliverables:

- bundle the TypeScript entry point into a portable Node.js executable;
- expose it through the npm `bin` field as `decimen`;
- support `send`, `--help`, and `--version`;
- document local development installation with `npm link`;
- verify the bundle independently from `tsx` and the source tree.

Completion criteria:

- `decimen send ./photo.jpg` works from any directory;
- paths containing spaces are accepted;
- the command starts and stops its localhost server cleanly;
- tests, type checking, web build, and CLI build all pass.

## Phase 2 — Finder Quick Action

Deliverables:

- provide **Send with Decimen** in Finder's Quick Actions menu;
- accept exactly one regular file and preserve its full path;
- open a visible Terminal session running `decimen send <file>`;
- include reversible installer and uninstaller scripts;
- show a useful message when the CLI is not installed.

Completion criteria:

- filenames containing spaces and Unicode characters work;
- selecting zero or multiple files produces a clear message;
- uninstalling moves the workflow to Trash rather than deleting it permanently.

## Phase 3 — Distribution

- add a reproducible package/tarball check in CI;
- choose a release channel: npm, Homebrew tap, or signed macOS installer;
- publish checksums and release notes;
- add upgrade and uninstall documentation;
- test current Node.js LTS versions on macOS, Linux, and Windows.

## Phase 4 — Link sharing and Chrome extension

- add a typed `url` payload to the shared envelope;
- display the complete URL and highlighted hostname on the Receiver;
- require an explicit **Open link** action and reject dangerous schemes;
- add a private Chrome extension with an **Send link with Decimen** context menu;
- use a static QR for short URLs and the fountain stream for larger payloads;
- reuse the shared protocol package rather than calling a permanent local daemon.

## Phase 5 — Native desktop polish

- optional menu-bar controller for active transfers;
- drag-and-drop sender;
- automatic but bounded tuning based on display size and decode rate;
- signed/notarized macOS distribution if adoption justifies it.

## Current scope

The first implementation covers Phases 1 and 2. Distribution and URL payloads
remain separate changes so they can be reviewed without altering the existing
file-transfer protocol.
