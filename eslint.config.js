import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import finanRules from "./eslint-rules/finan-require-try-catch.js";

// So a regra jsx-no-undef, nao o plugin `react` inteiro via
// `recommended` — o objetivo e so fechar a lacuna que deixou passar um
// bug real em producao (componente JSX referenciado sem import, ver
// apps/finan/UX_AUDIT.md secao 20): no-undef do proprio eslint nao
// enxerga JSXIdentifier, so identificador comum. As demais regras do
// plugin `react` (prop-types, no-array-index-key etc.) nao foram
// pedidas e teriam risco de volume desconhecido de violacoes
// pre-existentes no app principal — mesma cautela ja registrada pro
// jsx-a11y (linhas abaixo).
const jsxNoUndefRule = { "react/jsx-no-undef": "error" };

export default defineConfig([
	globalIgnores([
		"dist",
		"**/dist/**",
		"coverage",
		"tmp/**",
		"tmp-*",
		"tmp-generateStaticData_ordens_abertas",
	]),
	{
		files: ["src/**/*.{js,jsx}", "public/**/*.js", "docs/**/*.js"],
		extends: [
			js.configs.recommended,
			reactHooks.configs.flat.recommended,
			reactRefresh.configs.vite,
		],
		plugins: { react },
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser,
			parserOptions: {
				ecmaVersion: "latest",
				ecmaFeatures: { jsx: true },
				sourceType: "module",
			},
		},
		rules: {
			"no-unused-vars": [
				"error",
				{ varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^[A-Z_]" },
			],
			...jsxNoUndefRule,
		},
	},
	{
		files: ["vps/**/*.js"],
		extends: [js.configs.recommended],
		languageOptions: {
			ecmaVersion: 2020,
			globals: {
				...globals.node,
				...globals.commonjs,
			},
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "commonjs",
			},
		},
		rules: {
			"no-unused-vars": [
				"error",
				{ varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^[A-Z_]" },
			],
		},
	},
	// apps/finan e um workspace separado (frontend + backend proprios, ver
	// CLAUDE.md secao 11) que nunca tinha entrado no eslint.config.js raiz —
	// nenhum `files:` acima cobria `apps/finan/**`, entao `npm run lint`
	// nunca de fato analisava esse codigo (confirmado: eslint aplicado
	// direto num arquivo .jsx de la retornava "File ignored because no
	// matching configuration was supplied"). Os dois blocos abaixo espelham
	// os blocos de frontend (raiz, acima) e backend (vps/**, acima) mas
	// apontando pro workspace do Finan, que tem seu proprio package.json
	// com "type": "module" (frontend) e "type": "commonjs" (backend).
	{
		// Checklist de acessibilidade minima do UX_AUDIT.md (Fase 5) —
		// escopo so no Finan de proposito: ligar isso na raiz do Retiradas
		// junto arrisca travar o CI do app principal com um volume
		// desconhecido de violacoes pre-existentes fora do escopo desta
		// auditoria (mesma cautela que o proprio UX_AUDIT.md ja registrou
		// na secao 16 ao adiar essa decisao).
		files: ["apps/finan/frontend/src/**/*.{js,jsx}"],
		extends: [
			js.configs.recommended,
			reactHooks.configs.flat.recommended,
			reactRefresh.configs.vite,
			jsxA11y.flatConfigs.recommended,
		],
		plugins: { react },
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser,
			parserOptions: {
				ecmaVersion: "latest",
				ecmaFeatures: { jsx: true },
				sourceType: "module",
			},
		},
		rules: {
			"no-unused-vars": [
				"error",
				{ varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^[A-Z_]" },
			],
			...jsxNoUndefRule,
			// `react-hooks/set-state-in-effect` (recommended) e novo e se
			// mostrou inconsistente neste repo ao ligar a cobertura do Finan:
			// flagra o padrao "reset de estado no inicio do effect, antes de
			// um fetch assincrono" (usado deliberadamente em varios pontos —
			// FinanModulePage, FinanLayout, FinanFinanceiroPage,
			// FinanAuditLogsSection — pra evitar mostrar dado velho enquanto
			// a nova busca nao chega) mesmo quando o mesmo padrao, byte a
			// byte, existe em componentes da raiz (ex.: FinanceiroPage.jsx
			// tem `load` como useCallback assincrono chamando setLoading(true)
			// como primeira linha, chamado via `useEffect(() => { load(); },
			// [load])`) que passam limpo hoje — a analise da regra parece
			// depender do tamanho/complexidade do componente, nao so do
			// formato do codigo (confirmado testando o mesmo trecho isolado:
			// falha; dentro do componente grande da raiz: passa). Reescrever
			// esses efeitos as cegas pra satisfazer uma regra que nem se
			// comporta de forma previsivel aqui e mais risco (telas sem
			// cobertura de teste) do que beneficio real — desligada so aqui,
			// mantendo o resto do arquivo (no-unused-vars, hooks/deps etc.)
			// ativo.
			"react-hooks/set-state-in-effect": "off",
		},
	},
	{
		// Mesmo motivo do carve-out de `src/context/**/*.jsx` na raiz: arquivo
		// de contexto exporta o Provider (componente) e o hook `useFinanXxx`
		// juntos — combinacao normal desse padrao, so incompativel com fast
		// refresh (nao afeta producao, so obriga reload completo no dev).
		files: ["apps/finan/frontend/src/state/**/*.jsx"],
		rules: {
			"react-refresh/only-export-components": "off",
		},
	},
	{
		// navigationConfig.jsx exporta principalmente dados (NAV_SECTIONS) e
		// tem 1 componente-wrapper de icone minusculo junto — mesma razao do
		// carve-out acima, mas so pra esse arquivo especifico (nao e um
		// diretorio inteiro de contexto).
		files: ["apps/finan/frontend/src/navigationConfig.jsx"],
		rules: {
			"react-refresh/only-export-components": "off",
		},
	},
	{
		// UX_AUDIT.md (Fase 5, extracao incremental de FinanceiroPage.jsx):
		// primitivas de UI compartilhadas (ChartCard, FinancePanel,
		// EmptyState) junto com `barOptions`, o helper de grafico usado por
		// quase todo ChartCard — mesma razao dos dois carve-outs acima.
		files: ["apps/finan/frontend/src/modules/financeiro/components/shared/**/*.jsx"],
		rules: {
			"react-refresh/only-export-components": "off",
		},
	},
	{
		files: ["apps/finan/backend/**/*.js"],
		extends: [js.configs.recommended],
		plugins: { finan: finanRules },
		languageOptions: {
			ecmaVersion: 2020,
			globals: {
				...globals.node,
				...globals.commonjs,
			},
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "commonjs",
			},
		},
		rules: {
			"no-unused-vars": [
				"error",
				{ varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^[A-Z_]" },
			],
			// Rede de seguranca automatica pro padrao que ja causou um crash
			// loop real de producao (2026-09-05) e que a auditoria de
			// 2026-09-09 achou de novo em 22 rotas — ver
			// eslint-rules/finan-require-try-catch.js e CLAUDE.md secao 11.
			"finan/require-try-catch": "error",
		},
	},
	{
		files: ["functions/**/*.js"],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.commonjs,
			},
		},
	},
	{
		files: ["**/*.test.{js,jsx}", "src/test/**/*.js"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				...globals.vitest,
			},
		},
	},
	{
		files: ["tests/e2e/**/*.js", "playwright.config.js"],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
	{
		files: ["src/context/**/*.jsx"],
		rules: {
			"react-refresh/only-export-components": "off",
		},
	},
]);
