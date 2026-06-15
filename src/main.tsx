import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { registerServiceWorker } from "@/lib/pwa";
import "./index.css";

function renderStartupError(error: unknown) {
  const root = document.getElementById("root");
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : "";

  if (!root) {
    console.error("Flux & Feed startup error before #root was available:", error);
    return;
  }

  root.innerHTML = "";

  const main = document.createElement("main");
  main.setAttribute(
    "style",
    "min-height:100vh;background:#0b0b10;color:#fff;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;"
  );

  const section = document.createElement("section");
  section.setAttribute(
    "style",
    "max-width:760px;width:100%;background:#17131b;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35)"
  );

  const kicker = document.createElement("p");
  kicker.setAttribute(
    "style",
    "margin:0 0 8px;color:#f59e0b;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em"
  );
  kicker.textContent = "Falha ao iniciar o app";

  const h1 = document.createElement("h1");
  h1.setAttribute("style", "margin:0 0 12px;font-size:24px;line-height:1.2");
  h1.textContent = "O Flux & Feed carregou, mas encontrou um erro antes de abrir a tela.";

  const help = document.createElement("p");
  help.setAttribute("style", "margin:0 0 16px;color:#d1d5db");
  help.textContent = "Envie esta mensagem para o suporte técnico:";

  const pre = document.createElement("pre");
  pre.setAttribute(
    "style",
    "white-space:pre-wrap;word-break:break-word;background:#07070a;border-radius:8px;padding:14px;color:#fca5a5;font-size:13px;line-height:1.5"
  );
  pre.textContent = stack ? `${message}\n\n${stack}` : message;

  section.append(kicker, h1, help, pre);
  main.appendChild(section);
  root.appendChild(main);

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
