import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: currentDir,
	plugins: [react()],
	test: {
		// environment "node" (nao jsdom) de proposito: os testes atuais
		// (acertoEstoqueUtils, RompimentosPage.buildPayload) sao funcoes
		// puras, sem render de componente — jsdom/testing-library so
		// seriam necessarios (e precisariam de devDependency propria, como
		// no ADM) se um teste futuro passar a renderizar algo.
		environment: "node",
		globals: true,
		include: ["src/**/*.{test,spec}.{js,jsx}"],
		// rotApiSessionCookie.test.js usa node:test (require("node:test")) de
		// proposito, nao Vitest — roda via `node --test` (ver test:operacao
		// na raiz), nao aqui.
		exclude: ["node_modules/**", "dist/**", "src/api/rotApiSessionCookie.test.js"],
	},
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
