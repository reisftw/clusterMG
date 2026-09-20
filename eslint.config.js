import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default defineConfig([
	globalIgnores([
		"dist",
		"**/dist/**",
		"coverage",
		"tmp/**",
		"tmp-*",
		"tmp-generateStaticData_ordens_abertas",
		// Backups locais nao versionados (recuperacao/sync da VPS, 18/09/2026)
		// — nao sao fonte real, so ficam no disco, nunca devem ser lintados.
		"apps/*/tmp/**",
	]),
	{
		// Frontend dos 4 apps (retiradas, finan, adm, operacao), incluindo
		// arquivos de teste (.test.jsx precisa de JSX habilitado aqui —
		// era a causa dos 14 erros de parsing do ADM: antes so
		// apps/retiradas/frontend tinha esse bloco).
		files: ["apps/*/frontend/**/*.{js,jsx}", "docs/**/*.js"],
		extends: [
			js.configs.recommended,
			reactHooks.configs.flat.recommended,
			reactRefresh.configs.vite,
		],
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
		},
	},
	{
		// jsx-a11y/no-autofocus e no-static-element-interactions: o plugin
		// nunca foi instalado neste repo (so existiam comentarios
		// eslint-disable-next-line presumindo que existia — "Definition for
		// rule not found"). Ativar como regra "error" pra todo apps/*/frontend
		// quebraria retiradas/adm/operacao, que usam autoFocus em dezenas de
		// lugares nunca revisados sob essa lente (auditoria de acessibilidade
		// ampla, fora do escopo desta etapa). Escopado só ao Finan, onde os 3
		// comentarios originais ja documentavam decisao consciente.
		files: ["apps/finan/frontend/**/*.{js,jsx}"],
		plugins: {
			"jsx-a11y": jsxA11y,
		},
		rules: {
			"jsx-a11y/no-autofocus": "error",
			"jsx-a11y/no-static-element-interactions": "error",
		},
	},
	{
		// Backend dos 4 apps — todos CommonJS, globals Node.
		files: ["apps/*/backend/**/*.js"],
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
		// Testes de frontend: Vitest/jsdom/Testing Library. Camada aditiva
		// sobre o bloco de frontend acima (so acrescenta globals, o parsing
		// JSX ja vem do bloco de frontend).
		files: [
			"apps/*/frontend/**/*.test.{js,jsx}",
			"apps/*/frontend/**/*.spec.{js,jsx}",
			"apps/retiradas/frontend/src/test/**/*.js",
		],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				...globals.vitest,
			},
		},
	},
	{
		// Testes de backend: parte usa Vitest (Retiradas/ADM, arquivos
		// legados sob */frontend/src/backend — testam codigo de backend
		// via createRequire, mas o arquivo de teste em si roda sob Vitest),
		// parte usa o Node Test Runner nativo (Operacao, `require("node:test")`
		// explicito). Os dois convivem: globals.vitest só é usado por quem
		// importa de "vitest"; quem usa node:test explicito nao referencia
		// globals nenhum, entao nao ha conflito.
		files: ["apps/*/backend/**/*.test.js", "apps/*/backend/**/*.spec.js"],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.vitest,
			},
		},
	},
	{
		// Testes de contrato entre sistemas — Node puro (node:test), ESM
		// (repositorio raiz é "type": "module").
		files: ["tests/contracts/**/*.js"],
		extends: [js.configs.recommended],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.node,
			},
		},
		rules: {
			"no-unused-vars": [
				"error",
				{ varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^[A-Z_]" },
			],
		},
	},
	{
		files: [
			"apps/retiradas/frontend/tests/e2e/**/*.js",
			"apps/retiradas/frontend/playwright.config.js",
		],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
	{
		files: ["apps/retiradas/frontend/src/context/**/*.jsx"],
		rules: {
			"react-refresh/only-export-components": "off",
		},
	},
]);
