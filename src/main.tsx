import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { registerServiceWorker } from "@/lib/pwa";
import "./index.css";

function renderStartupError(error: unknown) {
  const root = document.getElementById("root");
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : "";

  if (!root) {
    console.error("NewsFlow startup error before #root was available:", error);
    return;
  }

  root.innerHTML = `
    <main style="min-height:100vh;background:#0b0b10;color:#fff;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;">
      <section style="max-width:760px;width:100%;background:#17131b;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
        <p style="margin:0 0 8px;color:#f59e0b;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Falha ao iniciar o app</p>
        <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2">O NewsFlow carregou, mas encontrou um erro antes de abrir a tela.</h1>
        <p style="margin:0 0 16px;color:#d1d5db">Envie esta mensagem para o suporte técnico:</p>
        <pre style="white-space:pre-wrap;word-break:break-word;background:#07070a;border-radius:8px;padding:14px;color:#fca5a5;font-size:13px;line-height:1.5">${message}${stack ? `\n\n${stack}` : ""}</pre>
      </section>
    </main>
  `;
}

window.addEventListener("error", (event) => {
  if (!document.getElementById("root")?.children.length) {
    renderStartupError(event.error || event.message);
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (!document.getElementById("root")?.children.length) {
    renderStartupError(event.reason);
  }
});

import("./App.tsx")
  .then(({ default: App }) => {
    createRoot(document.getElementById("root")!).render(
      <HelmetProvider>
        <App />
      </HelmetProvider>
    );
    registerServiceWorker();
  })
  .catch(renderStartupError);
