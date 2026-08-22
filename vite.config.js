import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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