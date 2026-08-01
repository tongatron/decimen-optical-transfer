# Decimen Optical Transfer

Transfer files directly from one device's screen to another device's camera
with an animated, fountain-coded QR stream. The transfer needs no network path
between the devices, account, pairing, native app, or intermediary server: the
payload travels as light.

**[Open the live app](https://optical-transfer.tongatron.org/)**

> This repository is a maintained fork of
> [bashalarmistalt/decimen-optical-transfer](https://github.com/bashalarmistalt/decimen-optical-transfer).
> It preserves the original MIT license and credits.

<p align="center">
  <img src="docs/decimen-app-overview.png" width="100%"
       alt="Decimen home, sender, and receiver screens showing a fountain-coded QR file transfer in progress" />
</p>

## Highlights

- Transfers any file up to 2 MB while preserving its name and media type.
- Optimizes JPEG, PNG, and WebP images larger than 1 MB in the browser.
- Accepts files from the system picker or screenshots pasted from the clipboard.
- Uses fountain coding, so missed or out-of-order frames do not require a restart.
- Verifies the reconstructed payload before offering it for download.
- Works on Safari/iOS through `zxing-wasm`; it does not depend on
  `BarcodeDetector`.
- Installs as a PWA with an offline app shell and Send/Receive shortcuts.
- Keeps file contents on the two devices. The web server only delivers the app.

## Changes from the original project

The upstream proof of concept sends a bundled sample image. This fork adds:

- arbitrary file selection, metadata preservation, and a 2 MB payload limit;
- automatic browser-side optimization for large supported images;
- clipboard image and screenshot pasting on the sender;
- explicit sender start/pause controls and automatic restart after setting
  changes;
- a dedicated home screen, persistent navigation, responsive styling, and
  clearer transfer status;
- an installable PWA, generated service worker, offline app shell, icons, and
  update-safe cache handling;
- optional, environment-configured Umami analytics that never receives file
  contents;
- production-ready static hosting support.

For the exact code-level delta, compare this repository with
[`upstream/main`](https://github.com/bashalarmistalt/decimen-optical-transfer/compare/main...tongatron:main).

## Use the hosted app

1. Open [optical-transfer.tongatron.org](https://optical-transfer.tongatron.org/)
   on both devices.
2. Choose **Sender** on the device displaying the QR stream (a laptop or tablet
   works best).
3. Select a file, or paste an image with <kbd>Ctrl</kbd>/<kbd>⌘</kbd> +
   <kbd>V</kbd>, then choose **Start transmission**.
4. Choose **Receiver** on the camera device, allow camera access, and point it
   at the animated QR code.
5. When verification completes, download the reconstructed file.

For best throughput, maximize the QR code, increase the sender's screen
brightness, and keep the receiving device steady.

## Install locally

### Requirements

- Node.js 18 or newer (a current LTS release is recommended)
- npm
- two devices on the same local network for a realistic screen-to-camera test

### Development server

```bash
git clone https://github.com/tongatron/decimen-optical-transfer.git
cd decimen-optical-transfer
npm install
npm run dev
```

Then:

1. On the sending device, open `https://localhost:5173/send/`.
2. On the receiving device, open the `Network` URL printed by Vite, ending in
   `/receive/`.
3. Accept the self-signed certificate warning once on each device.
4. Allow camera access on the receiver and start a transfer.

HTTPS is required because browsers expose `getUserMedia()` only in secure
contexts (except on `localhost`). The development server uses a self-signed
certificate through `@vitejs/plugin-basic-ssl`, so a first-visit warning is
expected.

### Production build

```bash
npm run build
npm run preview
```

The deployable static site is generated in `dist/`. Host that directory at the
root of an HTTPS origin. A reusable Nginx example is available at
[`deploy/nginx-optical-transfer.conf`](deploy/nginx-optical-transfer.conf).

## Install as an app

- **Android and desktop Chromium:** open the hosted site and choose the browser's
  **Install app** action.
- **iPhone and iPad:** open the site in Safari, choose **Share**, then
  **Add to Home Screen**.
- **Any supported browser:** installation is optional; the web app works
  directly from its URL.

The installed PWA still needs camera permission on the receiving device.

## Optional analytics

Analytics are disabled unless a Website ID is provided at build time. Copy the
example configuration and edit the local copy:

```bash
cp .env.example .env.local
```

```dotenv
UMAMI_WEBSITE_ID=00000000-0000-0000-0000-000000000000
UMAMI_SCRIPT_URL=https://cloud.umami.is/script.js
```

`UMAMI_SCRIPT_URL` is optional and only needs to change for a self-hosted Umami
instance. Environment files other than `.env.example` are ignored by Git.

## How it works

A screen-to-camera channel has no back-channel: the receiver cannot request a
missing frame, and blur, autofocus, or refresh timing will inevitably drop
some frames. Sequentially looping chunks means one missed chunk can force the
receiver to wait for an entire cycle.

Decimen instead uses an LT fountain code. Each QR frame contains the XOR of a
deterministically selected subset of source blocks. The receiver can reconstruct
the payload from roughly `K × 1.15` distinct frames in any order, so dropped
frames cost time rather than correctness. A compact header identifies the
session and carries the parameters required to join a stream already in
progress.

The receiver decodes QR frames with
[`zxing-wasm`](https://github.com/Sec-ant/zxing-wasm) in web workers, feeds the
result into the fountain decoder, verifies the completed payload, and restores
the original filename and media type.

## Tuning

Both Sender and Receiver expose an optional **Settings** panel.

| Setting | Default | Guidance |
|---|---:|---|
| Sender frame rate | 24 fps | Each QR frame should remain visible for at least two display refresh cycles. |
| Bytes per frame | 1465 (QR v27) | Higher density can be faster if the camera still decodes reliably. |
| QR error correction | L | Fountain coding handles lost frames; QR ECC handles corruption within a frame. |
| Receiver workers | Device-dependent | More workers can help until camera decoding becomes the bottleneck. |

## Privacy and limitations

- File contents are processed locally in the browser and are not uploaded by
  this application.
- Camera access is used only on the Receiver page and requires explicit browser
  permission.
- The current payload limit is 2 MB.
- Optical performance depends on screen brightness, camera focus, distance,
  reflections, motion, and device refresh/capture rates.
- Optional Umami analytics, when configured by a deployer, measure site usage;
  they do not receive the transferred file or its contents.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the HTTPS development server on the local network. |
| `npm run build` | Type-check and create the production bundle in `dist/`. |
| `npm run preview` | Preview the production bundle locally. |

## Acknowledgements

This project is based on the original work by
[BashAlarmist](https://github.com/bashalarmistalt). It uses
[`qrcode`](https://github.com/soldair/node-qrcode) for QR generation and
[`zxing-wasm`](https://github.com/Sec-ant/zxing-wasm) for decoding.

Related projects worth exploring include
[`divan/txqr`](https://github.com/divan/txqr),
[`sz3/libcimbar`](https://github.com/sz3/libcimbar), and
[`mohankumarelec/airgapped-qr-code-transfer`](https://github.com/mohankumarelec/airgapped-qr-code-transfer).

## License

Distributed under the same [MIT License](LICENSE) as the original repository.
The original copyright notice is retained.
