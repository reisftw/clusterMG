import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: currentDir,
	plugins: [react()],
	server: {
		port: 5175,
		proxy: {
			"/api": {
				target: "http://127.0.0.1:3201",
				changeOrigin: true,
			},
		},
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
});
