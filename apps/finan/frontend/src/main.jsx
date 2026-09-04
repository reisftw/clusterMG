import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { FinanAuthProvider } from "./state/FinanAuthContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
	<React.StrictMode>
		<BrowserRouter>
			<FinanAuthProvider>
				<App />
			</FinanAuthProvider>
		</BrowserRouter>
	</React.StrictMode>,
);
