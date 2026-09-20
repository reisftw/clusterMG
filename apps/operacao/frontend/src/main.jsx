import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { RotAuthProvider } from "./state/RotAuthContext";
import "./index.css";
import "./styles.css";

if ("serviceWorker" in navigator) {
	// Sem isso, um PWA ja aberto no celular (deixado em segundo plano) nunca
	// pega deploys novos: o novo service worker assume controle
	// (skipWaiting + clients.claim), mas a pagina ja carregada continua
	// rodando o JS/CSS antigos ate o usuario fechar o app manualmente. Isso
	// fazia bugs corrigidos continuarem "quebrados" no PWA mesmo depois do
	// deploy. Recarrega uma unica vez quando o controlador muda.
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
			<RotAuthProvider>
				<App />
			</RotAuthProvider>
		</BrowserRouter>
	</React.StrictMode>,
);
