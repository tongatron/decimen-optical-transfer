import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function umamiAnalytics(websiteId: string, scriptUrl: string): Plugin {
  return {
    name: "decimen-umami-analytics",
    transformIndexHtml() {
      if (!websiteId) return [];

      return [
        {
          tag: "script",
          attrs: {
            defer: true,
            src: scriptUrl,
            "data-website-id": websiteId,
          },
          injectTo: "head",
        },
      ];
    },
  };
}

function pwaServiceWorker(): Plugin {
  return {
    name: "decimen-pwa-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const bundleFiles = Object.keys(bundle)
        .filter((file) => {
          const output = bundle[file]!;
          return output.type === "asset" || !(output.isEntry && output.name === "index");
        })
        .sort();
      const versionHash = createHash("sha256");
      for (const file of bundleFiles) {
        const output = bundle[file]!;
        versionHash.update(file);
        versionHash.update(output.type === "chunk" ? output.code : output.source);
      }
      for (const file of [
        "public/manifest.webmanifest",
        "public/icons/icon-192.png",
        "public/icons/icon-512.png",
        "public/icons/icon-maskable-512.png",
        "public/icons/apple-touch-icon.png",
      ]) {
        versionHash.update(readFileSync(resolve(__dirname, file)));
      }
      const version = versionHash.digest("hex").slice(0, 12);
      const precache = [
        "./",
        "./send/",
        "./receive/",
        "./manifest.webmanifest",
        "./icons/icon-192.png",
        "./icons/icon-512.png",
        "./icons/icon-maskable-512.png",
        "./icons/apple-touch-icon.png",
        ...bundleFiles.map((file) => `./${file}`),
      ];
      const source = `const CACHE_NAME = "decimen-${version}";
const CACHE_PREFIX = "decimen-";
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./"))),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })),
  );
});
`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

// HTTPS always: the receiver needs getUserMedia, and on insecure origins
// that API does not exist at all — a phone reaching this server over the LAN
// gets no camera on plain http (browser rule, localhost-only exemption).
// The generated cert is self-signed: tap through the warning once on the
// phone and the page is still a secure context, so the camera works.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "UMAMI_");

  return {
    base: "./",
    plugins: [
      basicSsl(),
      umamiAnalytics(
        env.UMAMI_WEBSITE_ID ?? "",
        env.UMAMI_SCRIPT_URL || "https://cloud.umami.is/script.js",
      ),
      pwaServiceWorker(),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html"),
          send: resolve(__dirname, "send/index.html"),
          receive: resolve(__dirname, "receive/index.html"),
        },
      },
    },
    server: { host: true },
  };
});
