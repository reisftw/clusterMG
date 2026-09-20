import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
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
	]),
	{
		files: [
			"apps/retiradas/frontend/src/**/*.{js,jsx}",
			"apps/retiradas/frontend/public/**/*.js",
			"docs/**/*.js",
		],
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
		files: ["apps/retiradas/backend/**/*.js"],
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
		files: ["**/*.test.{js,jsx}", "apps/retiradas/frontend/src/test/**/*.js"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				...globals.vitest,
			},
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
