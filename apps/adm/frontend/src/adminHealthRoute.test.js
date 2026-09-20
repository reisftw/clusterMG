// Etapa 8, Fase 5: cobre apps/adm/backend/src/health/routes.js — um
// modulo pequeno e sem dependencia de banco, por isso testado direto
// (sem precisar mockar db/auth como os testes maiores de app.js) e sem
// depender de supertest (nao instalado no node_modules isolado do
// ADM) — sobe o Express num socket local (porta efemera, so
// 127.0.0.1) e usa fetch real. Fica fora de src/backend/ de proposito:
// essa pasta e excluida da coleta do Vitest do ADM (24 arquivos orfaos
// do path antigo vps/, ver apps/adm/frontend/vitest.config.js).
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// process.cwd() aqui e apps/adm/frontend (npm test --prefix roda com
// esse cwd), nao a raiz do monorepo — diferente do padrao usado nos
// testes do Retiradas (que rodam a partir da raiz).
const admBackendDir = path.join(process.cwd(), "..", "backend");
const require = createRequire(path.join(admBackendDir, "package.json"));
const express = require("express");
const healthRoutes = require(path.join(admBackendDir, "src/health/routes.js"));

let server;
let baseUrl;

beforeEach(async () => {
	const app = express();
	app.use("/api/health", healthRoutes);

	await new Promise((resolve) => {
		server = app.listen(0, "127.0.0.1", resolve);
	});
	const { port } = server.address();
	baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
	await new Promise((resolve) => server.close(resolve));
});

describe("GET /api/health (ADM)", () => {
	it("responde 200 sem nenhum header de autenticacao ou cookie de sessao", async () => {
		const response = await fetch(`${baseUrl}/api/health`);
		expect(response.status).toBe(200);
	});

	it("retorna exatamente o corpo minimo esperado", async () => {
		const response = await fetch(`${baseUrl}/api/health`);
		const body = await response.json();
		expect(body).toEqual({ ok: true, service: "adm-api" });
	});

	it("nao expoe variaveis de ambiente, credenciais, host de banco ou stack trace", async () => {
		const response = await fetch(`${baseUrl}/api/health`);
		const body = await response.json();
		expect(Object.keys(body)).toEqual(["ok", "service"]);
		expect(JSON.stringify(body)).not.toMatch(/env|password|secret|token|stack|postgres|database/i);
	});

	it("metodo nao suportado (POST) nao retorna 200", async () => {
		const response = await fetch(`${baseUrl}/api/health`, { method: "POST" });
		expect(response.status).not.toBe(200);
	});
});
