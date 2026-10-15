import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AppErrorBoundary from "./components/ui/AppErrorBoundary";
import { LayoutModeProvider } from "./context/LayoutModeContext";
import { SystemProvider } from "./context/SystemContext";
import { ThemeProvider } from "./context/ThemeContext";
import AppRouter from "./router/AppRouter";
import { registerAppServiceWorker } from "./services/appServiceWorker";
import { initErrorTracking } from "./services/errorTracking";

initErrorTracking();

if (typeof window !== "undefined" && window.location.hostname === "mercado.retiradas.tech") {
	document.title = "Mercado de Retiradas | Cluster MG";
	const favicon = document.querySelector("link[rel='icon']");
	if (favicon) favicon.setAttribute("href", "/logo-clustermg.png");
}

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
	let refreshingAfterUpdate = false;
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		if (refreshingAfterUpdate) return;
		refreshingAfterUpdate = true;
		window.location.reload();
	});

	window.addEventListener("load", () => {
		registerAppServiceWorker();
	});
}

function isStaleChunkError(error) {
	const message = String(error?.message || error || "");
	return (
		message.includes("Failed to fetch dynamically imported module") ||
		message.includes("Importing a module script failed") ||
		message.includes("Expected a JavaScript-or-Wasm module script") ||
		message.includes("error loading dynamically imported module")
	);
}

function reloadOnceForFreshAssets() {
	if (typeof window === "undefined") return;
	const marker = "retiradas:asset-refresh-at";
	const lastRefresh = Number(window.sessionStorage.getItem(marker) || 0);
	const now = Date.now();
	if (now - lastRefresh < 30000) return;
	window.sessionStorage.setItem(marker, String(now));
	window.location.reload();
}

if (typeof window !== "undefined") {
	window.addEventListener("error", (event) => {
		if (isStaleChunkError(event.error || event.message)) {
			reloadOnceForFreshAssets();
		}
	});
	window.addEventListener("unhandledrejection", (event) => {
		if (isStaleChunkError(event.reason)) {
			reloadOnceForFreshAssets();
		}
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
