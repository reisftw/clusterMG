import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: "./src/test/setup.js",
		css: true,
		include: ["src/**/*.{test,spec}.{js,jsx}"],
		// Os testes de integracao do Finan (src/backend/finan/integration/**)
		// precisam de um Postgres real e rodar sem paralelismo entre arquivos
		// (compartilham o mesmo banco de teste, TRUNCATE concorrente causa
		// deadlock). Ficam fora do `npm test` padrao — tem config propria em
		// vitest.finan-integration.config.js, rodada via
		// `npm run finan:test:integration`.
		exclude: ["node_modules/**", "dist/**", "src/backend/finan/integration/**"],
		coverage: {
			provider: "istanbul",
			all: true,
			reporter: ["text", "html", "lcov"], // 'lcov' adicionado para gerar o arquivo do SonarQube
			include: ["src/**/*.{js,jsx}"],
			exclude: ["src/test/**", "**/*.test.{js,jsx}"],
		},
	},
});
