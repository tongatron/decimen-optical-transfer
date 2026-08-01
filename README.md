# Decimen Optical Transfer: fountain-coded QR file transfer

Send a file between two devices using nothing but a **screen and a camera**.
One page displays the file as an endless stream of animated QR codes; another
device points its camera at it and reconstructs the file. **No network path
between the devices, no app, no pairing, no permissions beyond the camera.**
The payload travels as light.

This is a minimal proof of concept extracted from a larger
experiment that reached **128 KB/s phone-to-phone** with denser frames,
multi-code grids, and an error-corrected color channel. This version keeps
only the essential trick and can transmit any file up to 2 MB at a
comfortable rate. JPEG, PNG, and WebP images over 1 MB are optimized in the
browser before transmission, with a maximum side of 1920 pixels.

<p align="center">
  <img src="docs/receiving.jpg" width="420"
       alt="Phone receiving a 2 MB image over light: 129.2 KB/s goodput, decoding the sender's animated QR code" />
</p>
<p align="center"><em>Mid-transfer: a phone pulling a 2 MB image out of the air at 129 KB/s.</em></p>

## Try it

```bash
npm install
npm run dev
```

- On the **sending** device (a laptop is ideal): open
  `https://localhost:5173/send/`, choose a file, then select **Start
  transmission**. Max screen brightness helps. The selected file stays in
  the browser and is not uploaded to the server.
- On the **receiving** device (a phone): open the `Network` URL Vite prints
  (`https://<lan-ip>:5173/receive/`), accept the certificate warning once,
  tap **Start camera**, and point it at the code.
- When decoding completes: *Transfer Complete!* and a download link for the
  original filename and media type, verified by hash. Images also get an
  inline preview.

**Why the dev server is https-only:** the receiver uses `getUserMedia`, and
browsers remove that API entirely on insecure origins: a phone reaching
your dev server over plain http has no camera, full stop (`localhost` is
exempt, but your phone isn't localhost). That's a web platform rule, not a
choice. The dev server therefore ships with a self-signed certificate
(`@vitejs/plugin-basic-ssl`); the browser will warn on first visit. Tap
"Show Details" then "visit this website" (iOS) or "Advanced" then "Proceed"
(Android/desktop), and the page is still a secure context, so the camera
works. The odd-looking `lvh.me` hosts Vite prints are a public convenience
domain that resolves to 127.0.0.1 (same machine, nothing extra running).

Hold the phone steady, or better, prop it against something. Camera
autofocus hunting from hand tremor is the #1 throughput killer.

## How it works

**The one-way channel problem.** A screen-to-camera link has no back-channel:
the receiver can't ask for retransmission, and it will inevitably miss frames
(blur, refresh straddling, autofocus). Looping the frames and hoping is
miserable: miss one frame and you wait a full cycle for it to come around.

**Fountain codes fix this completely.** The sender never sends the file's
blocks directly. Each frame is the XOR of a pseudorandom *subset* of blocks;
the subset is derived deterministically from the frame's sequence number,
with subset sizes drawn from a robust-soliton distribution ([Luby transform
coding](https://en.wikipedia.org/wiki/Luby_transform_code)). The receiver
collects **any** ~K·1.15 distinct frames, in any order, and peels the file
out of them. Dropped frames cost a little time, never correctness. Sender
and receiver frame rates don't need to match at all.

**Every frame is self-describing.** A 20-byte header carries the session id,
sequence number, block count/size, file length, and a hash. There is no
handshake: the receiver locks onto a stream mid-flight, and restarting the
sender (new session id) automatically resets the receiver.

**Decoding.** Safari has never shipped `BarcodeDetector` (WebKit bug 281848),
so decoding is [zxing-cpp](https://github.com/zxing-cpp/zxing-cpp) compiled
to WASM, running in workers fed by `requestVideoFrameCallback`. Busy workers
mean dropped frames, which the fountain happily absorbs.

## Hard-won details baked into this PoC

- **JS engines disagree about `Math.log`** (it's implementation-approximated).
  Sender and receiver must build bit-identical soliton distributions, so
  `fountain.ts` includes a deterministic log built from exactly-specified
  IEEE-754 ops. V8 vs JavaScriptCore desync is a silent, total failure mode.
- **iOS lies about camera frame rate.** `frameRate: {ideal: 60}` silently
  delivers 30; you must demand `{exact: 60}` (works at 1280-wide capture)
  and fall back. Always read back `getSettings()`.
- **`requestVideoFrameCallback` chains outlive their stream** and resume on
  the next one; without a generation counter, every stop/start leaks a
  zombie capture loop.
- **Progress bars must track frames collected, not blocks solved.** LT
  peeling back-loads its solve cascade: block-count progress looks stalled
  for most of the transfer, then teleports to 100%.
- **QR error correction is set to the minimum (L).** In-frame ECC and the
  fountain layer solve different problems (corruption vs erasure), but at
  these frame sizes level L plus frame disposal is the better trade.

## Tuning

Both pages have a collapsed **Settings** panel. On the sender: tx fps, bytes
per frame, error-correction level, and display size. Changing anything while
transmitting restarts the stream, and the receiver resets automatically off
the new session id. On the receiver: capture width, capture fps, and decode
worker count, applied when the camera starts.

| setting | default | notes |
|---|---|---|
| tx fps | 24 | each frame must own at least 2 refresh cycles of the display |
| bytes / frame | 1465 (QR v27) | denser is faster if the receiver still decodes it; 2953 (v40) works phone-to-phone at close range |

The parent experiment's measured ceiling with this exact architecture plus
denser frames, a 120 fps ProMotion sender, and stacked codes: ~128 KB/s
handheld, ~186 KB/s propped.

## Similar projects

The concept here was arrived at independently. It turns out
several people have had similar ideas, and their takes are all
worth a look:

- [mohankumarelec/airgapped-qr-code-transfer](https://github.com/mohankumarelec/airgapped-qr-code-transfer):
  browser-based QR file transfer with compression and sequential chunking.
  Discovered after publicly demoing this project; convergent evolution in
  action.
- [divan/txqr](https://github.com/divan/txqr) (2018): animated QR plus
  fountain codes in Go, with two excellent write-ups on why fountain coding
  beats sequential looping.
- [sz3/libcimbar](https://github.com/sz3/libcimbar): goes past QR entirely
  with a custom high-density color code purpose-built for this channel.

Built with [node-qrcode](https://github.com/soldair/node-qrcode) and
[zxing-wasm](https://github.com/Sec-ant/zxing-wasm).

## License

MIT
