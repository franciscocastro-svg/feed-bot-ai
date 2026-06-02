export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      registration.update().catch(() => {});

      window.setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 60 * 1000);
    }).catch((error) => {
      console.warn("[pwa] service worker registration failed", error);
    });
  });
}
