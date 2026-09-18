// Config dedicada para os testes de integracao do Finan (Postgres real).
// Separada de vite.config.js de proposito: esses testes precisam rodar
// sequencialmente (compartilham um unico banco de teste — TRUNCATE
// concorrente entre arquivos paralelos causa deadlock) e nao devem entrar
// no `npm test` padrao, que roda em paralelo e nao depende de Docker.
//
// Uso: npm run finan:test:integration
// (ou finan:test:all, que sobe o Postgres + roda migrations antes)
import { defineConfig } from "vite";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/backend/finan/integration/**/*.test.js"],
		fileParallelism: false,
	},
});
