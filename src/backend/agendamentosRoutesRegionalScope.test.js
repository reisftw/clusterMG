// Testes de rota do IDOR/escopo regional (Fase A) e do DTO/validação
// centralizada (Fase C) — docs/TECHNICAL-AUDIT.md, achados #3 e #20 — em
// vps/api/src/agendamentos/routes/agendamentosRoutes.js: PUT/DELETE por
// :id verificam que o agendamento pertence à regional do usuário
// autenticado (quando o papel é escopado), e POST/PUT agora validam o
// corpo via AgendamentoWriteDTO (campos obrigatórios, enums, anti mass
// assignment).
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

// Payload válido mínimo, batendo com o formulário real
// (src/modules/agendamentos/components/AgendamentoModal.jsx).
function validPayload(overrides = {}) {
	return {
		tecnico_nome: "João Técnico",
		codigo_cliente: "12345",
		cliente_nome: "Cliente Teste",
		cidade: "Uberlândia",
		data: "2026-09-10",
		turno: "Manha",
		hora: "09:00",
		status: "Aguardando dia",
		observacao: "",
		...overrides,
	};
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
		const status = error.statusCode || 500;
		const body = { error: error.statusCode ? error.message : "Erro interno." };
		if (error.code === "VALIDATION_ERROR" && error.fields) {
			body.code = error.code;
			body.fields = error.fields;
		}
		res.status(status).json(body);
	});
	return app;
}

describe("IDOR + DTO: PUT/DELETE/POST /api/agendamentos — escopo regional e validação", () => {
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
			.send(validPayload({ status: "Concluido" }));
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
			.send(validPayload());
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
		const own = await request(app)
			.put("/api/agendamentos/ag-propria")
			.send(validPayload());
		expect(own.status).toBe(200);
		// ...mas trocando o ID na URL pra um de outra regional, é bloqueado.
		const other = await request(app)
			.put("/api/agendamentos/ag-de-outra-regional")
			.send(validPayload());
		expect(other.status).toBe(403);
	});

	it("admin acessa/altera agendamento de qualquer regional → 200", async () => {
		repoMock.getAppointment.mockResolvedValue({
			id: "ag-1",
			regional: "Interior SUB1",
		});
		const app = buildApp(fakeUser("admin", "Metropolitana SUB2"));
		const response = await request(app)
			.put("/api/agendamentos/ag-1")
			.send(validPayload());
		expect(response.status).toBe(200);
	});

	it("papel de gestão global (backoffice_retirada) não é restringido por regional", async () => {
		repoMock.getAppointment.mockResolvedValue({
			id: "ag-1",
			regional: "Interior SUB1",
		});
		const app = buildApp(fakeUser("backoffice_retirada", "Metropolitana SUB2"));
		const response = await request(app)
			.put("/api/agendamentos/ag-1")
			.send(validPayload());
		expect(response.status).toBe(200);
	});

	it("agendamento inexistente → 404 (antes de checar escopo)", async () => {
		repoMock.getAppointment.mockResolvedValue(null);
		const app = buildApp(fakeUser("supervisor", "Metropolitana SUB2"));
		const response = await request(app)
			.put("/api/agendamentos/nao-existe")
			.send(validPayload());
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

	it("DELETE com :id de formato inválido → 400 (nunca chega a buscar/deletar)", async () => {
		const app = buildApp(fakeUser("supervisor", "Metropolitana SUB2"));
		const response = await request(app).delete(
			"/api/agendamentos/" + encodeURIComponent("id; drop table x;"),
		);
		expect(response.status).toBe(400);
		expect(repoMock.getAppointment).not.toHaveBeenCalled();
	});

	it("POST cria agendamento — regional do body é ignorada e forçada para a do supervisor", async () => {
		const app = buildApp(fakeUser("supervisor", "Metropolitana SUB2"));
		const response = await request(app)
			.post("/api/agendamentos")
			.send(validPayload({ regional: "Interior SUB1" }));
		expect(response.status).toBe(200);
		expect(repoMock.createAppointment).toHaveBeenCalledWith(
			expect.objectContaining({ regional: "Metropolitana SUB2" }),
		);
	});

	it("POST cria agendamento — admin mantém a regional enviada no body", async () => {
		const app = buildApp(fakeUser("admin", "Metropolitana SUB2"));
		const response = await request(app)
			.post("/api/agendamentos")
			.send(validPayload({ regional: "Interior SUB1" }));
		expect(response.status).toBe(200);
		expect(repoMock.createAppointment).toHaveBeenCalledWith(
			expect.objectContaining({ regional: "Interior SUB1" }),
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
		const response = await request(app)
			.put("/api/agendamentos/ag-1")
			.send(validPayload());
		expect(response.status).toBe(403);
		expect(repoMock.getAppointment).not.toHaveBeenCalled();
	});
});

describe("DTO: AgendamentoWriteDTO aplicado em POST/PUT /api/agendamentos", () => {
	beforeEach(() => {
		setRepoMock();
	});

	afterEach(() => {
		delete require.cache[repoPath];
		delete require.cache[routesPath];
	});

	it("payload válido é aceito", async () => {
		const app = buildApp(fakeUser("admin", "Metropolitana SUB2"));
		const response = await request(app).post("/api/agendamentos").send(validPayload());
		expect(response.status).toBe(200);
	});

	it("campo obrigatório ausente (tecnico_nome) → 400 VALIDATION_ERROR", async () => {
		const app = buildApp(fakeUser("admin", "Metropolitana SUB2"));
		const payload = validPayload();
		delete payload.tecnico_nome;
		const response = await request(app).post("/api/agendamentos").send(payload);
		expect(response.status).toBe(400);
		expect(response.body.code).toBe("VALIDATION_ERROR");
		expect(response.body.fields.tecnico_nome).toBeTruthy();
	});

	it("codigo_cliente com letras (deve ser só números) → 400", async () => {
		const app = buildApp(fakeUser("admin", "Metropolitana SUB2"));
		const response = await request(app)
			.post("/api/agendamentos")
			.send(validPayload({ codigo_cliente: "abc123" }));
		expect(response.status).toBe(400);
		expect(response.body.fields.codigo_cliente).toBeTruthy();
	});

	it("data em formato errado (não AAAA-MM-DD) → 400", async () => {
		const app = buildApp(fakeUser("admin", "Metropolitana SUB2"));
		const response = await request(app)
			.post("/api/agendamentos")
			.send(validPayload({ data: "10/09/2026" }));
		expect(response.status).toBe(400);
		expect(response.body.fields.data).toBeTruthy();
	});

	it("status fora do enum → 400", async () => {
		const app = buildApp(fakeUser("admin", "Metropolitana SUB2"));
		const response = await request(app)
			.post("/api/agendamentos")
			.send(validPayload({ status: "Status Inventado" }));
		expect(response.status).toBe(400);
		expect(response.body.fields.status).toBeTruthy();
	});

	it("campo desconhecido no corpo (tentativa de mass assignment) → 400, nunca chega ao repository", async () => {
		const app = buildApp(fakeUser("admin", "Metropolitana SUB2"));
		const response = await request(app)
			.post("/api/agendamentos")
			.send(validPayload({ isAdmin: true, empresaId: "outra-empresa" }));
		expect(response.status).toBe(400);
		expect(response.body.fields.isAdmin).toBeTruthy();
		expect(response.body.fields.empresaId).toBeTruthy();
		expect(repoMock.createAppointment).not.toHaveBeenCalled();
	});

	it("criado_em/atualizado_em (ISO datetime, mandados pelo frontend) são aceitos", async () => {
		const app = buildApp(fakeUser("admin", "Metropolitana SUB2"));
		const response = await request(app)
			.post("/api/agendamentos")
			.send(validPayload({ criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }));
		expect(response.status).toBe(200);
	});

	it("PUT com :id de formato inválido → 400 (nunca chega a buscar o agendamento)", async () => {
		const app = buildApp(fakeUser("admin", "Metropolitana SUB2"));
		const response = await request(app)
			.put("/api/agendamentos/" + encodeURIComponent("id com espaço"))
			.send(validPayload());
		expect(response.status).toBe(400);
		expect(repoMock.getAppointment).not.toHaveBeenCalled();
	});
});
