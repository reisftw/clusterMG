import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));

// Sem isso, o Vite gera o mesmo nome de arquivo (hash de conteudo) pra
// chunks que nao mudaram entre deploys. Nosso deploy manual na VPS nao e
// atomico (rm -rf dist/* seguido de extrair o tar novo): existe uma janela
// onde um chunk pode responder 404, e o location /assets/ do nginx marca
// a resposta como "Cache-Control: immutable" — um navegador que pegou
// esse 404 nunca mais tenta de novo aquele nome de arquivo, mesmo depois
// do deploy terminar (bug real visto em producao, varios usuarios com
// "pagina em branco" apos deploy). Incluir um id unico por build no nome
// de cada arquivo garante que TODO deploy novo usa nomes que ninguem tem
// cacheado ainda, mesmo quando o conteudo do chunk nao mudou.
const buildId = Date.now().toString(36);

export default defineConfig({
	root: currentDir,
	plugins: [react()],
	server: {
		port: 5174,
		proxy: {
			"/api/finan": {
				target: "http://127.0.0.1:3101",
				changeOrigin: true,
			},
		},
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		rollupOptions: {
			output: {
				entryFileNames: `assets/[name]-${buildId}-[hash].js`,
				chunkFileNames: `assets/[name]-${buildId}-[hash].js`,
				assetFileNames: `assets/[name]-${buildId}-[hash][extname]`,
			},
		},
	},
});
