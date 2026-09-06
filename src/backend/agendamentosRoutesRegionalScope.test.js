// Testes de rota do IDOR/escopo regional introduzido na Fase A
// (docs/TECHNICAL-AUDIT.md, achado #3) em
// vps/api/src/agendamentos/routes/agendamentosRoutes.js — PUT/DELETE por
// :id agora verificam que o agendamento pertence à regional do usuário
// autenticado (quando o papel é escopado), além da permissão funcional já
// existente.
//
// `createAgendamentosRouter` recebe os middlewares de auth/permissão/CSRF
// por injeção de dependência (fábrica) — não precisamos mockar `auth.js`
// inteiro, só o `agendamentosRepository` (required direto dentro do
// arquivo da rota).
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(path.join(process.cwd(), "vps/package.json"));
const express = require("express");
const routesDir = path.join(process.cwd(), "vps/api/src/agendamentos/routes");
const repoPath = require.resolve(
	path.join(process.cwd(), "vps/api/src/agendamentosRepository.js"),
);
const routesPath = require.resolve(path.join(routesDir, "agendamentosRoutes.js"));

let repoMock;

function setRepoMock() {
	repoMock = {
		listAppointments: vi.fn(async () => []),
		listAppointmentLogs: vi.fn(async () => []),
		createAppointment: vi.fn(async (payload) => ({ id: "novo-1", ...payload })),
		getAppointment: vi.fn(async () => null),
		updateAppointment: vi.fn(async (id, patch) => ({ id, ...patch })),
		deleteAppointment: vi.fn(async () => 1),
	};
	require.cache[repoPath] = {
		id: repoPath,
		filename: repoPath,
		loaded: true,
		exports: repoMock,
	};
	delete require.cache[routesPath];
}

function fakeUser(role, regional) {
	return { role, regional, profile: { role, regional } };
}

function buildApp(user) {
	const createAgendamentosRouter = require(routesPath);
	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => {
		req.user = user;
		next();
	});
	const router = createAgendamentosRouter({
		requireAuthenticated: (_req, _res, next) => next(),
		requireAnyPermission: () => (_req, _res, next) => next(),
		requireCsrfToken: (_req, _res, next) => next(),
	});
	app.use("/api/agendamentos", router);
	app.use((error, _req, res, _next) => {
		res.status(error.statusCode || 500).json({ error: error.message });
	});
	return app;
}

describe("IDOR: PUT/DELETE /api/agendamentos/:id — escopo regional", () => {
	beforeEach(() => {
		setRepoMock();
	});

	afterEach(() => {
		delete require.cache[repoPath];
		delete require.cache[routesPath];
	});

	it("supervisor autorizado + agendamento da própria regional → 200 OK", async () => {
		repoMock.getAppointment.mockResolvedValue({
			id: "ag-1",
			regional: "Metropolitana SUB2",
		});
		const app = buildApp(fakeUser("supervisor", "Metropolitana SUB2"));
		const response = await request(app)
			.put("/api/agendamentos/ag-1")
			.send({ status: "confirmado" });
		expect(response.status).toBe(200);
		expect(repoMock.updateAppointment).toHaveBeenCalled();
	});

	it("supervisor autorizado + agendamento de OUTRA regional → 403", async () => {
		repoMock.getAppointment.mockResolvedValue({
			id: "ag-1",
			regional: "Interior SUB1",
		});
		const app = buildApp(fakeUser("supervisor", "Metropolitana SUB2"));
		const response = await request(app)
			.put("/api/agendamentos/ag-1")
			.send({ status: "confirmado" });
		expect(response.status).toBe(403);
		expect(repoMock.updateAppointment).not.toHaveBeenCalled();
	});

	it("troca manual do :id na URL para um agendamento de outra regional → 403 (não 200)", async () => {
		repoMock.getAppointment.mockImplementation(async (id) =>
			id === "ag-de-outra-regional"
				? { id, regional: "Interior SUB1" }
				: { id, regional: "Metropolitana SUB2" },
		);
		const app = buildApp(fakeUser("supervisor", "Metropolitana SUB2"));
		// o supervisor teria acesso ao "seu" agendamento...
		const own = await request(app).put("/api/agendamentos/ag-propria").send({});
		expect(own.status).toBe(200);
		// ...mas trocando o ID na URL pra um de outra regional, é bloqueado.
		const other = await request(app)
			.put("/api/agendamentos/ag-de-outra-regional")
			.send({});
		expect(other.status).toBe(403);
	});

	it("admin acessa/altera agendamento de qualquer regional → 200", async () => {
		repoMock.getAppointment.mockResolvedValue({
			id: "ag-1",
			regional: "Interior SUB1",
		});
		const app = buildApp(fakeUser("admin", "Metropolitana SUB2"));
		const response = await request(app).put("/api/agendamentos/ag-1").send({});
		expect(response.status).toBe(200);
	});

	it("papel de gestão global (backoffice_retirada) não é restringido por regional", async () => {
		repoMock.getAppointment.mockResolvedValue({
			id: "ag-1",
			regional: "Interior SUB1",
		});
		const app = buildApp(fakeUser("backoffice_retirada", "Metropolitana SUB2"));
		const response = await request(app).put("/api/agendamentos/ag-1").send({});
		expect(response.status).toBe(200);
	});

	it("agendamento inexistente → 404 (antes de checar escopo)", async () => {
		repoMock.getAppointment.mockResolvedValue(null);
		const app = buildApp(fakeUser("supervisor", "Metropolitana SUB2"));
		const response = await request(app)
			.put("/api/agendamentos/nao-existe")
			.send({});
		expect(response.status).toBe(404);
	});

	it("DELETE de agendamento de outra regional → 403, nunca chega a deletar", async () => {
		repoMock.getAppointment.mockResolvedValue({
			id: "ag-1",
			regional: "Interior SUB1",
		});
		const app = buildApp(fakeUser("supervisor", "Metropolitana SUB2"));
		const response = await request(app).delete("/api/agendamentos/ag-1");
		expect(response.status).toBe(403);
		expect(repoMock.deleteAppointment).not.toHaveBeenCalled();
	});

	it("DELETE de agendamento inexistente → 404", async () => {
		repoMock.getAppointment.mockResolvedValue(null);
		const app = buildApp(fakeUser("supervisor", "Metropolitana SUB2"));
		const response = await request(app).delete("/api/agendamentos/nao-existe");
		expect(response.status).toBe(404);
	});

	it("POST cria agendamento — regional do body é ignorada e forçada para a do supervisor", async () => {
		const app = buildApp(fakeUser("supervisor", "Metropolitana SUB2"));
		await request(app)
			.post("/api/agendamentos")
			.send({ codigo_cliente: "123", regional: "Interior SUB1" });
		expect(repoMock.createAppointment).toHaveBeenCalledWith(
			expect.objectContaining({ regional: "Metropolitana SUB2" }),
		);
	});

	it("usuário sem a permissão de manage → 403 (middleware de permissão, antes de qualquer checagem de escopo)", async () => {
		const createAgendamentosRouter = require(routesPath);
		const app = express();
		app.use(express.json());
		app.use((req, _res, next) => {
			req.user = fakeUser("supervisor", "Metropolitana SUB2");
			next();
		});
		const router = createAgendamentosRouter({
			requireAuthenticated: (_req, _res, next) => next(),
			requireAnyPermission: () => (_req, res) =>
				res.status(403).json({ error: "Permissao insuficiente." }),
			requireCsrfToken: (_req, _res, next) => next(),
		});
		app.use("/api/agendamentos", router);
		app.use((error, _req, res, _next) => {
			res.status(error.statusCode || 500).json({ error: error.message });
		});
		const response = await request(app).put("/api/agendamentos/ag-1").send({});
		expect(response.status).toBe(403);
		expect(repoMock.getAppointment).not.toHaveBeenCalled();
	});

	it("POST cria agendamento — admin mantém a regional enviada no body", async () => {
		const app = buildApp(fakeUser("admin", "Metropolitana SUB2"));
		await request(app)
			.post("/api/agendamentos")
			.send({ codigo_cliente: "123", regional: "Interior SUB1" });
		expect(repoMock.createAppointment).toHaveBeenCalledWith(
			expect.objectContaining({ regional: "Interior SUB1" }),
		);
	});
});
