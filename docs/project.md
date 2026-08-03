# The project

Decimen Optical Transfer moves a file from one device's screen to another
device's camera as an animated, fountain-coded QR stream. There is no account,
no pairing, no native app, and no intermediary server: the payload travels as
light.

The web app is a maintained fork of
[bashalarmistalt/decimen-optical-transfer](https://github.com/bashalarmistalt/decimen-optical-transfer),
released under the same MIT license.

## Use the hosted app

1. Open [optical-transfer.tongatron.org](https://optical-transfer.tongatron.org/)
   on both devices.
2. Choose **Sender** on the device that will display the QR stream. A laptop or
   tablet works best.
3. Select a file, or paste an image with `Ctrl`/`⌘` + `V`, then choose
   **Start transmission**.
4. Choose **Receiver** on the camera device, allow camera access, and point it
   at the animated QR code.
5. When verification completes, download the reconstructed file. On mobile
   browsers, use the share sheet and choose **Save to Files** to preserve the
   transferred bytes exactly.

For best throughput, maximize the QR code, raise the sender's screen
brightness, and keep the receiving device steady.

## Install as a PWA

- **Android and desktop Chromium:** open the site and choose the browser's
  **Install app** action.
- **iPhone and iPad:** open the site in Safari, choose **Share**, then
  **Add to Home Screen**.
- **Any supported browser:** installation is optional; the app works directly
  from its URL.

The installed app keeps working offline, but the receiving device still needs
camera permission.

## How it works

A screen-to-camera channel has no back-channel. The receiver cannot ask for a
missing frame, and blur, autofocus, or refresh timing will inevitably drop
some. Looping chunks sequentially means one missed chunk can force the receiver
to wait for a full cycle.

Decimen uses an LT fountain code instead. Each QR frame carries the XOR of a
deterministically selected subset of source blocks, so the receiver can
reconstruct the payload from roughly `K × 1.15` distinct frames in any order.
Dropped frames cost time rather than correctness. A compact header identifies
the session and carries the parameters needed to join a stream already in
progress.

The receiver decodes frames with
[`zxing-wasm`](https://github.com/Sec-ant/zxing-wasm) in web workers, feeds them
into the fountain decoder, verifies the completed payload, and restores the
original filename and media type. Because it does not depend on
`BarcodeDetector`, it also works on Safari and iOS.

## Tuning

Both Sender and Receiver expose an optional **Settings** panel.

| Setting | Default | Guidance |
|---|---:|---|
| Sender frame rate | 24 fps | Each QR frame should stay visible for at least two display refresh cycles. |
| Bytes per frame | 1465 (QR v27) | Higher density can be faster if the camera still decodes reliably. |
| QR error correction | L | Fountain coding handles lost frames; QR ECC handles corruption inside a frame. |
| Receiver workers | Device-dependent | More workers help until camera decoding becomes the bottleneck. |

## Privacy and limitations

- File contents are processed locally in the browser and are not uploaded by
  this application.
- Camera access is used only on the Receiver page and requires explicit browser
  permission.
- The current payload limit is 2 MB per file.
- Optical performance depends on screen brightness, camera focus, distance,
  reflections, motion, and device refresh and capture rates.
- Umami analytics on the published site, hosted on a self-run instance, measure
  site usage. They never receive the transferred file or its contents.

## Status

Maintained prototype. The web app is usable today, the payload limit is 2 MB,
and the macOS package is unsigned and not notarized.

## Self-hosting

The deployable static site is produced by `npm run build` into `dist/`. Host
that directory at the root of an HTTPS origin; a reusable Nginx example ships
in [`deploy/nginx-optical-transfer.conf`](https://github.com/tongatron/decimen-optical-transfer/blob/main/deploy/nginx-optical-transfer.conf).

HTTPS is required because browsers expose `getUserMedia()` only in secure
contexts, with a `localhost` exemption.

## Source and license

- [Tongatron fork](https://github.com/tongatron/decimen-optical-transfer/) —
  this version
- [Original project](https://github.com/bashalarmistalt/decimen-optical-transfer)
  by BashAlarmist
- Distributed under the [MIT License](https://github.com/tongatron/decimen-optical-transfer/blob/main/LICENSE)

It uses [`qrcode`](https://github.com/soldair/node-qrcode) for QR generation and
[`zxing-wasm`](https://github.com/Sec-ant/zxing-wasm) for decoding.
