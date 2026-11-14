import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AppErrorBoundary from "./components/ui/AppErrorBoundary";
import MobileAppUpdateGate from "./components/layout/MobileAppUpdateGate";
import { LayoutModeProvider } from "./context/LayoutModeContext";
import { SystemProvider } from "./context/SystemContext";
import { ThemeProvider } from "./context/ThemeContext";
import AppRouter from "./router/AppRouter";
import {
	confirmPwaUpdate,
	consumePwaUpdateConfirmation,
	PWA_UPDATE_AVAILABLE_EVENT,
	registerAppServiceWorker,
} from "./services/appServiceWorker";
import { initErrorTracking } from "./services/errorTracking";
import {
	isStaleAssetError,
	reloadOnceForFreshAssets,
} from "./utils/staleAssetRecovery";

initErrorTracking();

const PUBLIC_PWA_PATHS = new Set([
	"/painel",
	"/painel/agentes",
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
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		if (!consumePwaUpdateConfirmation(window.sessionStorage)) return;
		window.location.reload();
	});

	window.addEventListener("load", () => {
		registerAppServiceWorker();
	});
}

// eslint-disable-next-line react-refresh/only-export-components
function PwaUpdateNotice() {
	const [registration, setRegistration] = React.useState(null);

	React.useEffect(() => {
		const showUpdate = (event) => setRegistration(event.detail.registration);
		window.addEventListener(PWA_UPDATE_AVAILABLE_EVENT, showUpdate);
		return () => window.removeEventListener(PWA_UPDATE_AVAILABLE_EVENT, showUpdate);
	}, []);

	if (!registration) return null;
	return (
		<div role="status" aria-live="polite" style={{ position: "fixed", right: 16, bottom: 16, zIndex: 10000, display: "flex", maxWidth: 380, alignItems: "center", gap: 12, padding: 14, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", boxShadow: "0 12px 32px rgba(15, 23, 42, .22)", color: "#0f172a" }}>
			<span style={{ flex: 1, fontSize: 14 }}><strong>Nova versão disponível</strong><br />Atualize quando puder para usar as melhorias mais recentes.</span>
			<button type="button" onClick={() => setRegistration(null)} style={{ border: 0, background: "transparent", color: "#475569", cursor: "pointer" }}>Depois</button>
			<button type="button" onClick={() => confirmPwaUpdate(registration, window.sessionStorage)} style={{ border: 0, borderRadius: 6, padding: "9px 12px", background: "#0877e8", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Atualizar agora</button>
		</div>
	);
}

if (typeof window !== "undefined") {
	window.addEventListener("error", (event) => {
		if (isStaleAssetError(event.error || event.message)) {
			reloadOnceForFreshAssets();
		}
	});
	window.addEventListener("unhandledrejection", (event) => {
		if (isStaleAssetError(event.reason)) {
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
						<PwaUpdateNotice />
						<MobileAppUpdateGate />
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
