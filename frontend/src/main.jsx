import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { FinanAuthProvider } from "./state/FinanAuthContext";
import { FinanPinLockProvider } from "./state/FinanPinLockContext";
import { FinanToastProvider } from "./state/FinanToastContext";
import "./index.css";
import "./styles.css";

if ("serviceWorker" in navigator) {
	// Sem isso, uma aba/PWA ja aberta nunca pega deploys novos: o novo
	// service worker assume controle (skipWaiting + clients.claim em
	// sw.js), mas a pagina ja carregada continua rodando o JS/CSS antigos
	// ate o usuario fechar a aba manualmente — bugs corrigidos continuavam
	// "quebrados" pra quem ja estava com o Finan aberto durante um deploy.
	// Recarrega uma unica vez quando o controlador muda.
	let refreshingAfterUpdate = false;
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		if (refreshingAfterUpdate) return;
		refreshingAfterUpdate = true;
		window.location.reload();
	});

	window.addEventListener("load", () => {
		navigator.serviceWorker
			.register("/sw.js")
			.catch((error) => console.warn("[PWA] Falha ao registrar service worker:", error));
	});
}

ReactDOM.createRoot(document.getElementById("root")).render(
	<React.StrictMode>
		<BrowserRouter>
			<FinanAuthProvider>
				<FinanPinLockProvider>
					<FinanToastProvider>
						<App />
					</FinanToastProvider>
				</FinanPinLockProvider>
			</FinanAuthProvider>
		</BrowserRouter>
	</React.StrictMode>,
);
