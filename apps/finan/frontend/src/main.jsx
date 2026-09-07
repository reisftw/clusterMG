import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { FinanAuthProvider } from "./state/FinanAuthContext";
import { FinanPinLockProvider } from "./state/FinanPinLockContext";
import "./index.css";
import "./styles.css";

if ("serviceWorker" in navigator) {
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
					<App />
				</FinanPinLockProvider>
			</FinanAuthProvider>
		</BrowserRouter>
	</React.StrictMode>,
);
