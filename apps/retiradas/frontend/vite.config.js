import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Config vive em apps/retiradas/frontend, mas node_modules e o dist de
// deploy continuam na raiz do monorepo (Retiradas ainda compartilha
// dependencias com o Finan — ver Fase 3 da reorganizacao). root/outDir/
// cacheDir sao resolvidos via import.meta.url pra funcionar tanto
// invocado direto daqui quanto via `--config` a partir da raiz.
const frontendDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	root: frontendDir,
	cacheDir: "../../../node_modules/.vite",
	build: {
		outDir: "../../../dist",
		emptyOutDir: true,
	},
	plugins: [react()],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: "./src/test/setup.js",
		css: true,
		include: ["src/**/*.{test,spec}.{js,jsx}"],
		exclude: ["node_modules/**", "dist/**"],
		coverage: {
			provider: "istanbul",
			all: true,
			reporter: ["text", "html", "lcov"], // 'lcov' adicionado para gerar o arquivo do SonarQube
			include: ["src/**/*.{js,jsx}"],
			exclude: ["src/test/**", "**/*.test.{js,jsx}"],
		},
	},
});
