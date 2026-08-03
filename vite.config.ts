import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { marked } from "marked";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The three guide pages linked from the home menu. Each is an HTML shell
// containing a `<!--decimen:doc-->` marker; the Markdown file is the single
// source of truth for its content and is rendered into that marker for both
// the dev server and the production build.
const GUIDE_PAGES = [
  { route: "guide/project", markdown: "docs/project.md" },
  { route: "guide/cli", markdown: "docs/cli.md" },
  { route: "guide/finder-macos", markdown: "docs/finder-macos.md" },
] as const;

const DOC_MARKER = "<!--decimen:doc-->";

function markdownPages(): Plugin {
  return {
    name: "decimen-markdown-pages",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        // Windows reports backslash-separated paths; the routes use "/".
        const filename = ctx.filename.replace(/\\/g, "/");
        const page = GUIDE_PAGES.find((candidate) =>
          filename.endsWith(`${candidate.route}/index.html`),
        );
        if (!page || !html.includes(DOC_MARKER)) return html;

        const source = readFileSync(resolve(__dirname, page.markdown), "utf8");
        const rendered = marked
          .parse(source, { async: false, gfm: true })
          // Wide tables scroll inside their own box instead of widening the page.
          .replace(/<table>/g, '<div class="doc-table"><table>')
          .replace(/<\/table>/g, "</table></div>");
        // A replacer function keeps "$" sequences in the Markdown literal.
        return html.replace(DOC_MARKER, () => rendered);
      },
    },
    configureServer(server) {
      // Editing a guide's Markdown reloads its page during development.
      const sources = GUIDE_PAGES.map((page) => resolve(__dirname, page.markdown));
      server.watcher.add(sources);
      server.watcher.on("change", (file) => {
        if (sources.includes(file)) server.ws.send({ type: "full-reload", path: "*" });
      });
    },
  };
}

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
    // Runs after Vite's HTML plugin, which drops the placeholder entry chunks of
    // pages whose only script is a module shared with another page (the home and
    // guide pages all just load shared/pwa.ts). Precaching those never-written
    // file names would make cache.addAll() reject and the install fail.
    enforce: "post",
    generateBundle(_options, bundle) {
      const bundleFiles = Object.keys(bundle).sort();
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
        "./benchmark/",
        ...GUIDE_PAGES.map((page) => `./${page.route}/`),
        "./manifest.webmanifest",
        "./icons/icon-192.png",
        "./icons/icon-512.png",
        "./icons/icon-maskable-512.png",
        "./icons/apple-touch-icon.png",
        // The pages themselves are precached above as directory routes, so their
        // .html files are only hashed for versioning, not fetched a second time.
        ...bundleFiles.filter((file) => !file.endsWith(".html")).map((file) => `./${file}`),
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
      markdownPages(),
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
          benchmark: resolve(__dirname, "benchmark/index.html"),
          ...Object.fromEntries(
            GUIDE_PAGES.map((page) => [
              page.route.replace("/", "-"),
              resolve(__dirname, `${page.route}/index.html`),
            ]),
          ),
        },
      },
    },
    server: { host: true },
  };
});
