import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AppRouter from "./router/AppRouter";
import AppErrorBoundary from "./components/ui/AppErrorBoundary";
import { ThemeProvider } from "./context/ThemeContext";
import { LayoutModeProvider } from "./context/LayoutModeContext";
import { SystemProvider } from "./context/SystemContext";
import { registerAppServiceWorker } from "./services/appServiceWorker";

const PUBLIC_PWA_PATHS = new Set([
  "/painel",
  "/painel/relatorios",
  "/painel/mapa",
  "/painel/match",
  "/aa-sempre",
  "/duvidas",
  "/devolucao",
]);

const PUBLIC_PWA_PREFIXES = ["/painel", "/aa-sempre", "/duvidas", "/devolucao"];

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator?.standalone === true
  );
}

if (typeof window !== "undefined" && isStandaloneMode()) {
  const currentPath = window.location.pathname;
  const isPublicPwaPath = PUBLIC_PWA_PREFIXES.some(
    (prefix) => currentPath === prefix || currentPath.startsWith(`${prefix}/`),
  );

  if (isPublicPwaPath && !PUBLIC_PWA_PATHS.has(currentPath)) {
    window.location.replace("/painel");
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    registerAppServiceWorker();
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <ThemeProvider>
      <LayoutModeProvider>
        <SystemProvider>
          <AppErrorBoundary>
            <AppRouter />
          </AppErrorBoundary>
        </SystemProvider>
      </LayoutModeProvider>
    </ThemeProvider>
  </React.StrictMode>,
);

if (typeof window !== "undefined") {
  window.requestAnimationFrame(() => {
    const preload = document.getElementById("app-preload");
    if (!preload) return;

    preload.classList.add("is-hidden");
    window.setTimeout(() => {
      preload.remove();
    }, 380);
  });
}

