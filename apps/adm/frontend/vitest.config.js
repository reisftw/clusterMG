import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Ambiente de teste isolado do ADM: vitest/jsdom/testing-library sao
// devDependencies proprias (apps/adm/frontend/package.json), nao
// herdadas da raiz — o ADM tem sua propria versao de React (19.3.0,
// diferente da raiz em 19.2.8) e compartilhar o Vitest da raiz causava
// duas instancias de React no mesmo grafo de modulos ("Cannot read
// properties of null (reading 'useState')" em qualquer teste que
// renderiza componente). Rodar via `npm test` dentro desta pasta usa o
// vitest instalado aqui, resolvendo tudo (react, react-dom,
// testing-library) a partir deste node_modules.
const frontendDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	root: frontendDir,
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
			// 24 arquivos importam vps/api (agora apps/retiradas/backend/api)
			// via createRequire — nao sao testes do ADM de verdade, sao
			// residuo da recuperacao via SSH de 18/09/2026. Ver
			// docs/REORGANIZACAO-MONOREPO-ETAPA4-RELATORIO.md.
			"src/backend/**",
			"src/frontend/**",
		],
	},
});
