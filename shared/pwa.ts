interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const installPanel = document.querySelector<HTMLElement>("[data-pwa-panel]");
const installButton = document.querySelector<HTMLButtonElement>("[data-install-pwa]");
const installHelp = document.querySelector<HTMLElement>("[data-install-help]");
let deferredPrompt: BeforeInstallPromptEvent | null = null;

const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
const standalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  navigatorWithStandalone.standalone === true;
const ios =
  /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

if (!standalone && ios && installPanel && installHelp) {
  installPanel.hidden = false;
  installHelp.hidden = false;
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  if (installPanel) installPanel.hidden = false;
  if (installButton) installButton.hidden = false;
});

installButton?.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  await deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  if (installPanel) installPanel.hidden = true;
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  if (installPanel) installPanel.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifest) return;
    const workerUrl = new URL("sw.js", manifest.href);
    void navigator.serviceWorker.register(workerUrl.href, {
      scope: new URL("./", workerUrl).pathname,
      updateViaCache: "none",
    });
  });
}
