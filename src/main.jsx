import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AppRouter from "./router/AppRouter";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { SystemProvider } from "./context/SystemContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <SystemProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </SystemProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
