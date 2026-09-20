import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// O ADM ainda nao tem vite.config.js proprio nem vitest como
// devDependency (fora do escopo desta etapa adicionar dependencia nova
// ou build config) — este arquivo só dá um runner real pros ~60 testes
// que já existem em apps/adm/frontend/src, reaproveitando vitest/jsdom/
// testing-library já instalados na raiz (rodar com
// `npx vitest --config apps/adm/frontend/vitest.config.js`).
// 24 arquivos em src/backend/*.test.js importam vps/api (agora
// apps/retiradas/backend/api) e nao sao testes do ADM de verdade — ver
// docs/REORGANIZACAO-MONOREPO-ETAPA4-RELATORIO.md. Excluídos aqui pra
// não quebrar a suíte legítima por causa de import quebrado alheio.
const frontendDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	root: frontendDir,
	cacheDir: "../../../node_modules/.vite-adm",
	// ADM tem sua propria copia de react/react-dom instalada (diferente do
	// Finan, que roda sem essas deps de proposito). Sem isso, Vitest mistura
	// a instancia de react daqui (apps/adm/frontend/node_modules) com a
	// usada por @testing-library/react (resolvida a partir da raiz), e todo
	// hook quebra com "Cannot read properties of null (reading 'useState')".
	resolve: {
		dedupe: ["react", "react-dom"],
	},
	plugins: [react()],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: "./src/test/setup.js",
		css: true,
		include: ["src/**/*.{test,spec}.{js,jsx}"],
		exclude: [
			"node_modules/**",
			"dist/**",
			"src/backend/**",
			"src/frontend/**",
		],
	},
});
