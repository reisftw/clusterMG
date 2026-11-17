import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/liliane/",
  plugins: [react()],
  css: { postcss: { plugins: [] } },
  build: { outDir: "dist", sourcemap: false },
  server: { proxy: { "/liliane/api": { target: "http://127.0.0.1:3401", rewrite: (path) => path.replace(/^\/liliane\/api/, "") } } },
});
