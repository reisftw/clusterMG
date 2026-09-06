import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rootDir = process.cwd();
const appPath = path.join(rootDir, "vps/api/src/app.js");
const appDir = path.dirname(appPath);
const require = createRequire(path.join(rootDir, "vps/package.json"));

const originalEnv = { ...process.env };
let mockedModules = [];
let currentMocks;

function resolveFromApp(relativePath) {
	return require.resolve(path.join(appDir, relativePath));
}

function setMock(relativePath, exports) {
	const resolved = resolveFromApp(relativePath);
	require.cache[resolved] = {
		id: resolved,
		filename: resolved,
		loaded: true,
		exports,
	};
	mockedModules.push(resolved);
}

function makeAuthMock(overrides = {}) {
	const auth = {
		TOKEN_TTL_SECONDS: 3600,
		loginWithPassword: vi.fn(async (email, password) => {
			if (email === "admin@example.com" && password === "secret") {
				return {
					token: "session-token",
					expiresIn: 3600,
					user: { uid: "admin-1", email, role: "admin", nome: "Admin" },
				};
			}
			throw new Error("Credenciais invalidas.");
		}),
		requireAuthenticated: vi.fn((req, res, next) => {
			const authorized =
				req.get("authorization") === "Bearer valid" ||
				req.get("x-test-auth") === "1" ||
				/retiradas_session=session-token/.test(req.get("cookie") || "");
			if (!authorized) {
				res.status(401).json({ error: "Autenticacao obrigatoria." });
				return;
			}
			const role = req.get("x-test-role") || "admin";
			req.authToken = "session-token";
			req.authPayload = {
				jti: "jti-1",
				exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 10,
			};
			req.user = {
				uid: "admin-1",
				email: "admin@example.com",
				role,
				jti: "jti-1",
				regional: "Metropolitana SUB2",
				profile: {
					uid: "admin-1",
					email: "admin@example.com",
					role,
					nome: "Admin",
				},
			};
			next();
		}),
		requireRoles: vi.fn((roles = []) => (req, res, next) => {
			if (!roles.includes(String(req.user?.role || "").toLowerCase())) {
				res.status(403).json({ error: "Permissao insuficiente." });
				return;
			}
			next();
		}),
		createCsrfToken: vi.fn(() => "valid-csrf"),
		verifyCsrfToken: vi.fn((req) => req.get("x-csrf-token") === "valid-csrf"),
		renewSessionFromPayload: vi.fn(async () => "renewed-token"),
		revokeSession: vi.fn(async () => undefined),
		changeOwnPassword: vi.fn(async () => undefined),
		getImportedUserProfile: vi.fn(async () => ({
			uid: "admin-1",
			email: "admin@example.com",
		})),
		createPasswordResetTokenByEmail: vi.fn(async (email) => ({
			resetUrl: `https://retiradas.tech/reset?email=${encodeURIComponent(email)}`,
			user: { email },
		})),
		resetPasswordWithToken: vi.fn(async (token) => {
			if (token === "reset-token") return { email: "admin@example.com" };
			throw new Error("Token invalido.");
		}),
		createPasswordResetToken: vi.fn(async () => ({
			resetUrl: "https://retiradas.tech/reset",
		})),
		createLocalUser: vi.fn(async () => ({ uid: "new-user" })),
		deleteLocalUser: vi.fn(async () => undefined),
		getLocalUserByEmail: vi.fn(async () => null),
		makeTemporaryPassword: vi.fn(() => "Temp1234!"),
		resetLocalUserPassword: vi.fn(async () => undefined),
		updateLocalUser: vi.fn(async () => ({ uid: "admin-1" })),
		...overrides,
	};
	return auth;
}

function baseMocks(overrides = {}) {
	const documents = {
		getDocument: vi.fn(async () => ({ data: {} })),
		upsertDocument: vi.fn(async () => ({ ok: true })),
		listDocuments: vi.fn(async () => []),
		deleteDocument: vi.fn(async () => undefined),
	};
	const agendamentosRepository = {
		deleteDocument: vi.fn(async () => 1),
		getDocument: vi.fn(async () => ({
			path: "agendamentos/ag-1",
			collectionPath: "agendamentos",
			documentId: "ag-1",
			data: {},
		})),
		listDocuments: vi.fn(async () => []),
		recordAppointmentLog: vi.fn(async () => ({ id: "log-1" })),
		saveAppointment: vi.fn(async () => ({ id: "ag-1" })),
		upsertDocument: vi.fn(async () => ({ ok: true })),
	};
	const evolutionMessaging = {
		registerCallback: vi.fn(async () => ({ ok: true, status: "received" })),
		getConfig: vi.fn(async () => ({
			officialWebhookVerifyToken: "verify-token",
		})),
		getEvolutionStatus: vi.fn(async () => ({ ok: true })),
		connectEvolution: vi.fn(async () => ({ ok: true })),
		disconnectEvolution: vi.fn(async () => ({ ok: true })),
		configureEvolutionWebhook: vi.fn(async () => ({ ok: true })),
		getEvolutionWebhook: vi.fn(async () => ({ ok: true })),
		runWorkerNow: vi.fn(async () => ({ ok: true })),
		sendTestMessage: vi.fn(async () => ({ ok: true })),
		pauseAutomation: vi.fn(async () => ({ ok: true })),
		resumeAutomation: vi.fn(async () => ({ ok: true })),
	};
	const agendamentoConfirmacao = {
		registerIncomingResponse: vi.fn(async () => null),
		getConfig: vi.fn(async () => ({ ok: true })),
		saveConfig: vi.fn(async () => ({ ok: true })),
		runNow: vi.fn(async () => ({ ok: true })),
		testFlow: vi.fn(async () => ({ ok: true })),
		getEvolutionStatus: vi.fn(async () => ({ ok: true })),
		connectEvolution: vi.fn(async () => ({ ok: true })),
		disconnectEvolution: vi.fn(async () => ({ ok: true })),
		configureEvolutionWebhook: vi.fn(async () => ({ ok: true })),
		updateEnvioResponsavel: vi.fn(async () => ({ ok: true })),
		listEnvios: vi.fn(async () => ({ items: [] })),
		listLogs: vi.fn(async () => ({ items: [] })),
		previewToday: vi.fn(async () => ({ items: [] })),
		getReport: vi.fn(async () => ({ items: [] })),
	};
	return {
		auth: makeAuthMock(overrides.auth),
		db: {
			healthcheck: vi.fn(async () => ({ now: "2026-08-16T00:00:00.000Z" })),
			query: vi.fn(),
		},
		auditLog: {
			calculateChangedFields: vi.fn(() => ["name"]),
			captureAuditRequestContext: vi.fn((_req, _res, next) => next()),
			getAuditLog: vi.fn(async () => null),
			listAuditLogOptions: vi.fn(async () => ({ modules: [], setores: [] })),
			listAuditLogs: vi.fn(async () => ({ items: [], limit: 50, offset: 0, total: 0 })),
			recordAuditLog: vi.fn(() => Promise.resolve()),
		},
		rolePermissions: {
			deleteRole: vi.fn(async () => ({
				id: "cargo_teste",
				name: "Cargo teste",
				systemRole: false,
				active: true,
				permissions: [],
			})),
			getRoleById: vi.fn(async () => null),
			getRolePermissions: vi.fn(async () => ["*"]),
			listPermissionCatalog: vi.fn(async () => []),
			listRoles: vi.fn(async () => [
				{
					id: "cargo_teste",
					name: "Cargo teste",
					systemRole: false,
					active: true,
					permissions: [],
				},
			]),
			saveRole: vi.fn(async () => undefined),
		},
		usersRepository: {
			deleteUserDocument: vi.fn(async () => true),
			getUserDocument: vi.fn(async () => ({
				path: "usuarios/admin-1",
				collectionPath: "usuarios",
				documentId: "admin-1",
				data: {
					uid: "admin-1",
					email: "admin@example.com",
					nome: "Admin",
					role: "admin",
				},
			})),
			listUserDocuments: vi.fn(async () => []),
			mapAppUserRowToProfile: vi.fn((row = {}) => ({
				id: row.uid,
				uid: row.uid,
				email: row.email || "",
				nome: row.display_name || row.email || "",
				role: row.role || "",
				regional: row.regional || "",
				disabled: Boolean(row.disabled),
				trocar_senha: Boolean(row.must_change_password),
				must_change_password: Boolean(row.must_change_password),
			})),
			updateUserProfileExtras: vi.fn(async (_uid, extras = {}) => ({
				path: "usuarios/admin-1",
				collectionPath: "usuarios",
				documentId: "admin-1",
				data: {
					uid: "admin-1",
					email: "admin@example.com",
					nome: "Admin",
					role: "admin",
					...extras,
				},
			})),
			upsertUserDocument: vi.fn(async ({ documentId, data = {} }) => ({
				path: `usuarios/${documentId}`,
				collectionPath: "usuarios",
				documentId,
				data,
			})),
		},
		documents,
		evolutionMessaging,
		agendamentoConfirmacao,
		cvortexIntegration: {
			verifyWebhookSecret: vi.fn(async (req) => {
				const provided =
					req.get("x-retiradas-webhook-secret") ||
					req.get("x-webhook-secret") ||
					req.get("x-api-key") ||
					req.query.secret ||
					req.body?.secret ||
					"";
				return { ok: provided === process.env.CVORTEX_WEBHOOK_SECRET };
			}),
		},
		emailService: {
			sendPasswordChangedEmail: vi.fn(() => Promise.resolve()),
			sendPasswordResetEmail: vi.fn(() => Promise.resolve()),
			sanitizeConfig: vi.fn((config) => config || {}),
			getConfig: vi.fn(async () => ({})),
			saveConfig: vi.fn(async () => ({})),
			sendTestEmail: vi.fn(async () => ({ ok: true })),
			listEmailLogs: vi.fn(async () => ({ items: [] })),
		},
		notificationsService: {
			listNotifications: vi.fn(async () => ({ items: [] })),
			getNotificationStats: vi.fn(async () => ({ total: 0 })),
			getPreferences: vi.fn(async () => ({})),
			savePreferences: vi.fn(async () => ({})),
			getCounters: vi.fn(async () => ({})),
			markAsRead: vi.fn(async () => ({ ok: true })),
			checkCriticalServices: vi.fn(async () => ({ created: 0 })),
			createNotification: vi.fn(() => Promise.resolve()),
		},
		createDocumentosRouter: vi.fn(() => require("express").Router()),
		apiStatus: { getStatus: vi.fn(async () => ({ ok: true })) },
		databaseBackups: {
			listBackups: vi.fn(async () => ({ items: [] })),
			createBackup: vi.fn(async () => ({ ok: true })),
			restoreBackup: vi.fn(async () => ({ ok: true })),
		},
		agendamentoEsteiraCommands: {
			runCommand: vi.fn(async () => ({ ok: true })),
		},
		operationalImports: {
			startMapaImport: vi.fn(async () => ({ jobId: "job-1" })),
			startMatchImport: vi.fn(async () => ({ jobId: "job-1" })),
			getImportJob: vi.fn(async () => ({ jobId: "job-1" })),
			startMetasImport: vi.fn(async () => ({ jobId: "job-1" })),
			startForcaTarefaImport: vi.fn(async () => ({ jobId: "job-1" })),
			getMatchConfig: vi.fn(async () => ({})),
			saveMatchConfig: vi.fn(async () => ({})),
		},
		sempreIntegration: {
			lookupEquipment: vi.fn(async () => ({ ok: true })),
			listMapaEquipment: vi.fn(async () => ({ items: [] })),
			listTreatments: vi.fn(async () => ({ items: [] })),
			saveTreatment: vi.fn(async () => ({ ok: true })),
			listHistory: vi.fn(async () => ({ items: [] })),
		},
		logisticaIntegration: {
			getConfig: vi.fn(async () => ({})),
			saveConfig: vi.fn(async () => ({})),
			quoteLalamove: vi.fn(async () => ({ ok: true })),
			geocodeAddress: vi.fn(async () => ({ ok: true })),
		},
		hubsoftIntegration: {
			getConfig: vi.fn(async () => ({})),
			saveConfig: vi.fn(async () => ({})),
			testConnection: vi.fn(async () => ({ ok: true })),
			associate: vi.fn(async () => ({ ok: true })),
			listOrdensServico: vi.fn(async () => ({ items: [] })),
			startSync: vi.fn(async () => ({ jobId: "job-1" })),
			getSyncJob: vi.fn(async () => ({ jobId: "job-1" })),
			listSyncRuns: vi.fn(async () => ({ items: [] })),
		},
		documentosService: {},
		agendamentosRepository,
		createAgendamentosRouter: vi.fn(() => require("express").Router()),
		createImoveisRouter: vi.fn(() => require("express").Router()),
		createMensageriaRouter: vi.fn(() => require("express").Router()),
		metrics: {
			initMetrics: vi.fn(async () => undefined),
			metricsMiddleware: vi.fn((_req, _res, next) => next()),
			metricsController: vi.fn((_req, res) => res.json({ ok: true })),
			resetMetricsController: vi.fn((_req, res) => res.json({ ok: true })),
		},
		vpnAccess: {
			createMiddleware: vi.fn(() => (_req, _res, next) => next()),
		},
		realtime: {
			attachRealtimeClient: vi.fn((req, res) => res.status(200).end()),
			broadcastRealtime: vi.fn(() => undefined),
		},
		publicDashboard: {
			buildPublicDashboard: vi.fn(async () => ({ ok: true })),
			buildSnapshotDomain: vi.fn(async () => ({ ok: true })),
			canReadSnapshotDomain: vi.fn(() => true),
		},
		...overrides,
	};
}

function installMocks(overrides = {}) {
	currentMocks = baseMocks(overrides);
	setMock("./db", currentMocks.db);
	setMock("./auditLog", currentMocks.auditLog);
	setMock("./apiStatus", currentMocks.apiStatus);
	setMock("./databaseBackups", currentMocks.databaseBackups);
	setMock("./documents", currentMocks.documents);
	setMock("./agendamentosRepository", currentMocks.agendamentosRepository);
	setMock("./notificationsService", currentMocks.notificationsService);
	setMock(
		"./agendamentoEsteiraCommands",
		currentMocks.agendamentoEsteiraCommands,
	);
	setMock("./evolutionMessaging", currentMocks.evolutionMessaging);
	setMock("./agendamentoConfirmacao", currentMocks.agendamentoConfirmacao);
	setMock("./emailService", currentMocks.emailService);
	setMock("./operationalImports", currentMocks.operationalImports);
	setMock("./sempreIntegration", currentMocks.sempreIntegration);
	setMock("./logisticaIntegration", currentMocks.logisticaIntegration);
	setMock("./hubsoftIntegration", currentMocks.hubsoftIntegration);
	setMock("./cvortexIntegration", currentMocks.cvortexIntegration);
	setMock("./metrics", currentMocks.metrics);
	setMock("./vpnAccess", currentMocks.vpnAccess);
	setMock("./imoveis", {
		createImoveisRouter: currentMocks.createImoveisRouter,
	});
	setMock(
		"./agendamentos/routes/agendamentosRoutes",
		currentMocks.createAgendamentosRouter,
	);
	setMock(
		"./mensageria/routes/mensageriaRoutes",
		currentMocks.createMensageriaRouter,
	);
	setMock(
		"./documentos/routes/documentosRoutes",
		currentMocks.createDocumentosRouter,
	);
	setMock(
		"./documentos/services/documentosService",
		currentMocks.documentosService,
	);
	setMock("./realtime", currentMocks.realtime);
	setMock("./publicDashboard", currentMocks.publicDashboard);
	setMock("./auth", currentMocks.auth);
	setMock("./usersRepository", currentMocks.usersRepository);
	setMock("./rolePermissions", currentMocks.rolePermissions);
	delete require.cache[appPath];
	return currentMocks;
}

function loadApp(overrides = {}) {
	installMocks(overrides);
	return require(appPath).createApp();
}

function loadTestables(overrides = {}) {
	const mocks = installMocks(overrides);
	const source = `${fs.readFileSync(appPath, "utf8")}
const { verifyWebhookSecret } = require("./webhooks/utils/webhookSecrets");
module.exports.__testables = {
  canReadCollection,
  canWriteCollection,
  canAccessRegionalRecord,
  canAccessEmpresaRecord,
  requireCsrfToken,
  requireInternalToken,
  rejectLargePublicVisit,
  verifyWebhookSecret,
};`;
	const module = { exports: {} };
	const sandboxRequire = (id) => {
		if (id.startsWith(".")) {
			const resolved = require.resolve(path.join(appDir, id));
			return require.cache[resolved]?.exports || require(resolved);
		}
		return require(id);
	};
	const sandbox = {
		module,
		exports: module.exports,
		require: sandboxRequire,
		process,
		console,
		Buffer,
		__dirname: appDir,
		__filename: appPath,
		setTimeout,
		clearTimeout,
	};
	vm.runInNewContext(source, sandbox, { filename: appPath });
	return { helpers: module.exports.__testables, mocks };
}

function createReq({ headers = {}, query = {}, body = {} } = {}) {
	const normalized = Object.fromEntries(
		Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
	);
	return {
		query,
		body,
		get(name) {
			return normalized[String(name || "").toLowerCase()] || "";
		},
	};
}

function createRes() {
	const res = {
		statusCode: 200,
		body: null,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(payload) {
			this.body = payload;
			return this;
		},
	};
	return res;
}

beforeEach(() => {
	vi.restoreAllMocks();
	process.env = {
		...originalEnv,
		NODE_ENV: "test",
		CORS_ORIGIN: "",
		LOGIN_RATE_LIMIT_WINDOW_MS: "60000",
		LOGIN_RATE_LIMIT_MAX: "2",
		PUBLIC_WRITE_RATE_LIMIT_MAX: "100",
		REALTIME_RATE_LIMIT_MAX: "100",
		INTERNAL_API_TOKEN: "test-internal-token-for-suite",
		EVOLUTION_WEBHOOK_SECRET: "test-evolution-secret-for-suite",
		CVORTEX_WEBHOOK_SECRET: "test-cvortex-secret-for-suite",
		WHATSAPP_OFFICIAL_WEBHOOK_SECRET: "test-official-secret-for-suite",
	};
	mockedModules = [];
});

afterEach(() => {
	delete require.cache[appPath];
	for (const resolved of mockedModules) delete require.cache[resolved];
	mockedModules = [];
	currentMocks = null;
	process.env = { ...originalEnv };
});

describe("vps api app characterization - health/realtime", () => {
	it("GET /api/health retorna sucesso basico", async () => {
		const app = loadApp();

		const response = await request(app).get("/api/health");

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			ok: true,
			service: "retiradas-vps-api",
			databaseTime: "2026-08-16T00:00:00.000Z",
		});
	}, 15000);
});

describe("vps api app characterization - audit logs", () => {
	it("GET /api/admin/audit-logs lista logs para usuario autenticado com permissao", async () => {
		const app = loadApp({
			auditLog: {
				...baseMocks().auditLog,
				listAuditLogs: vi.fn(async () => ({
					items: [{ id: "audit-1", action: "update" }],
					limit: 50,
					offset: 0,
					total: 1,
				})),
			},
		});

		const response = await request(app)
			.get("/api/admin/audit-logs")
			.set("Authorization", "Bearer valid");

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			items: [{ id: "audit-1", action: "update" }],
			total: 1,
		});
		expect(currentMocks.auditLog.listAuditLogs).toHaveBeenCalled();
	});

	it("GET /api/admin/audit-logs/options lista filtros existentes", async () => {
		const app = loadApp({
			auditLog: {
				...baseMocks().auditLog,
				listAuditLogOptions: vi.fn(async () => ({
					modules: ["app_documents"],
					setores: ["financeiro"],
				})),
			},
		});

		const response = await request(app)
			.get("/api/admin/audit-logs/options")
			.set("Authorization", "Bearer valid");

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			modules: ["app_documents"],
			setores: ["financeiro"],
		});
		expect(currentMocks.auditLog.listAuditLogOptions).toHaveBeenCalled();
	});

	it("GET /api/admin/audit-logs/:id retorna 404 quando log nao existe", async () => {
		const app = loadApp();

		const response = await request(app)
			.get("/api/admin/audit-logs/inexistente")
			.set("Authorization", "Bearer valid");

		expect(response.status).toBe(404);
		expect(response.body).toMatchObject({
			error: "Log de auditoria nao encontrado.",
		});
	});
});

describe("vps api app characterization - roles", () => {
	it("DELETE /api/admin/roles/:roleId exclui cargo customizado", async () => {
		const app = loadApp();

		const response = await request(app)
			.delete("/api/admin/roles/cargo_teste")
			.set("Authorization", "Bearer valid")
			.set("x-csrf-token", "valid-csrf");

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ ok: true, role: "cargo_teste" });
		expect(currentMocks.rolePermissions.deleteRole).toHaveBeenCalledWith(
			"cargo_teste",
		);
		expect(currentMocks.auditLog.recordAuditLog).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "delete",
				entity: "app_roles",
				recordId: "cargo_teste",
			}),
		);
	});

	it("DELETE /api/admin/roles/:roleId bloqueia cargo vinculado a usuario", async () => {
		const linkedRoleError = new Error(
			"Nao e possivel excluir cargo vinculado a usuarios.",
		);
		linkedRoleError.statusCode = 409;
		const app = loadApp({
			rolePermissions: {
				...baseMocks().rolePermissions,
				deleteRole: vi.fn(async () => {
					throw linkedRoleError;
				}),
			},
		});

		const response = await request(app)
			.delete("/api/admin/roles/cargo_teste")
			.set("Authorization", "Bearer valid")
			.set("x-csrf-token", "valid-csrf");

		expect(response.status).toBe(409);
		expect(response.body).toMatchObject({
			error: "Nao e possivel excluir cargo vinculado a usuarios.",
		});
	});
});

describe("vps api app characterization - scoped finance users", () => {
	it("POST /api/admin/users permite gestor financeiro criar usuario em cargo financeiro", async () => {
		const financialManager = {
			uid: "financeiro-1",
			email: "financeiro@example.com",
			role: "coordenador_financeiro",
			regional: "",
			profile: {
				uid: "financeiro-1",
				email: "financeiro@example.com",
				role: "coordenador_financeiro",
				nome: "Coordenador Financeiro",
				permissions: [
					"financeiro.visao_geral.view",
					"financeiro.reports.view",
					"financeiro.reports.manage",
					"configuracao.usuarios.manage",
					"manage_users",
				],
			},
			permissions: [
				"financeiro.visao_geral.view",
				"financeiro.reports.view",
				"financeiro.reports.manage",
				"configuracao.usuarios.manage",
				"manage_users",
			],
		};
		const financeiroRole = {
			id: "analista_reports_financeiro",
			name: "Analista Reports Financeiro",
			systemRole: false,
			active: true,
			permissions: [
				"financeiro.reports.view",
				"financeiro.reports.manage",
				"configuracao.usuarios.manage",
			],
		};
		const app = loadApp({
			auth: {
				...makeAuthMock(),
				requireAuthenticated: vi.fn((req, _res, next) => {
					req.user = financialManager;
					next();
				}),
				createLocalUser: vi.fn(async () => ({
					uid: "novo-financeiro",
					email: "novo.financeiro@example.com",
					role: financeiroRole.id,
				})),
			},
			db: {
				...baseMocks().db,
				query: vi.fn(async (sql) => {
					const text = String(sql).replace(/\s+/g, " ").toLowerCase();
					if (text.includes("from app_users") && text.includes("lower")) {
						return { rows: [] };
					}
					if (text.includes("from app_users") && text.includes("where au.uid")) {
						return {
							rows: [
								{
									uid: "novo-financeiro",
									email: "novo.financeiro@example.com",
									display_name: "Novo Financeiro",
									role: financeiroRole.id,
									regional: "",
									disabled: false,
									must_change_password: true,
									profile_data: {},
								},
							],
						};
					}
					return { rows: [] };
				}),
			},
			rolePermissions: {
				...baseMocks().rolePermissions,
				listPermissionCatalog: vi.fn(async () => [
					{
						id: "financeiro.reports.view",
						sectionId: "financeiro",
						sectionLabel: "Financeiro",
					},
					{
						id: "financeiro.reports.manage",
						sectionId: "financeiro",
						sectionLabel: "Financeiro",
					},
					{
						id: "configuracao.usuarios.manage",
						sectionId: "configuracao",
						sectionLabel: "Configuração",
					},
				]),
				listRoles: vi.fn(async () => [financeiroRole]),
			},
		});

		const response = await request(app)
			.post("/api/admin/users")
			.set("Authorization", "Bearer valid")
			.set("x-csrf-token", "valid-csrf")
			.send({
				email: "novo.financeiro@example.com",
				nome: "Novo Financeiro",
				role: financeiroRole.id,
			});

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			ok: true,
			uid: "novo-financeiro",
		});
		expect(currentMocks.auth.createLocalUser).toHaveBeenCalledWith(
			expect.objectContaining({
				email: "novo.financeiro@example.com",
				nome: "Novo Financeiro",
				role: financeiroRole.id,
			}),
		);
	});
});

describe("vps api app characterization - domain route only collections", () => {
	it("POST /api/admin/documents bloqueia colecoes de imoveis migradas", async () => {
		const app = loadApp();

		const response = await request(app)
			.post("/api/admin/documents")
			.set("Authorization", "Bearer valid")
			.set("x-csrf-token", "valid-csrf")
			.send({
				collectionPath: "imoveis_administrativos",
				documentId: "imovel-1",
				data: { nome: "Loja Centro" },
			});

		expect(response.status).toBe(410);
		expect(response.body.error).toContain("/api/imoveis");
		expect(currentMocks.documents.upsertDocument).not.toHaveBeenCalled();
	});

	it("POST /api/admin/documents bloqueia colecoes de mensageria migradas", async () => {
		const app = loadApp();

		const response = await request(app)
			.post("/api/admin/documents")
			.set("Authorization", "Bearer valid")
			.set("x-csrf-token", "valid-csrf")
			.send({
				collectionPath: "mensageria_fila",
				documentId: "fila-1",
				data: { cliente: "Cliente" },
			});

		expect(response.status).toBe(410);
		expect(response.body.error).toContain("/api/mensageria");
		expect(currentMocks.documents.upsertDocument).not.toHaveBeenCalled();
	});

	it("POST /api/admin/documents salva agendamentos legados pelo repositorio de dominio", async () => {
		const app = loadApp();

		const response = await request(app)
			.post("/api/admin/documents")
			.set("Authorization", "Bearer valid")
			.set("x-csrf-token", "valid-csrf")
			.send({
				collectionPath: "agendamentos",
				documentId: "ag-1",
				data: { cliente_nome: "Cliente" },
			});

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			ok: true,
			path: "agendamentos/ag-1",
			documentId: "ag-1",
		});
		expect(currentMocks.agendamentosRepository.saveAppointment).toHaveBeenCalledWith(
			"ag-1",
			expect.objectContaining({ cliente_nome: "Cliente" }),
		);
		expect(currentMocks.documents.upsertDocument).not.toHaveBeenCalled();
	});

	it("POST /api/admin/documents bloqueia colecoes financeiras migradas", async () => {
		const app = loadApp();

		const response = await request(app)
			.post("/api/admin/documents")
			.set("Authorization", "Bearer valid")
			.set("x-csrf-token", "valid-csrf")
			.send({
				collectionPath: "financeiro_reports",
				documentId: "serasa",
				data: { rows: [] },
			});

		expect(response.status).toBe(410);
		expect(response.body.error).toContain("/api/financeiro");
		expect(currentMocks.documents.upsertDocument).not.toHaveBeenCalled();
	});

	it("POST /api/admin/documents bloqueia eventos operacionais migrados", async () => {
		const app = loadApp();

		const response = await request(app)
			.post("/api/admin/documents")
			.set("Authorization", "Bearer valid")
			.set("x-csrf-token", "valid-csrf")
			.send({
				collectionPath: "api_runtime_events",
				documentId: "runtime-1",
				data: { type: "startup" },
			});

		expect(response.status).toBe(410);
		expect(response.body.error).toContain("tabelas operacionais");
		expect(currentMocks.documents.upsertDocument).not.toHaveBeenCalled();
	});

	it("POST /api/admin/documents bloqueia auxiliares de documentos migrados", async () => {
		const app = loadApp();

		const response = await request(app)
			.post("/api/admin/documents")
			.set("Authorization", "Bearer valid")
			.set("x-csrf-token", "valid-csrf")
			.send({
				collectionPath: "documentos_config",
				documentId: "cobranca",
				data: { enabled: true },
			});

		expect(response.status).toBe(410);
		expect(response.body.error).toContain("/api/documentos");
		expect(currentMocks.documents.upsertDocument).not.toHaveBeenCalled();
	});
});

describe("vps api app characterization - users audit", () => {
	it("PUT /api/admin/users/:uid registra auditoria quando usuario e alterado", async () => {
		const app = loadApp({
			db: {
				...baseMocks().db,
				query: vi
					.fn()
					.mockResolvedValueOnce({
						rows: [
							{
								uid: "user-1",
								email: "user@example.com",
								display_name: "Joao",
								role: "backoffice",
								regional: "Regional A",
								disabled: false,
								must_change_password: false,
								profile_data: {},
							},
						],
					})
					.mockResolvedValueOnce({
						rows: [
							{
								uid: "user-1",
								email: "user@example.com",
								display_name: "Joao Silva",
								role: "backoffice",
								regional: "Regional A",
								disabled: false,
								must_change_password: false,
								profile_data: {},
							},
						],
					}),
			},
			auditLog: {
				...baseMocks().auditLog,
				calculateChangedFields: vi.fn(() => ["nome"]),
			},
		});

		const response = await request(app)
			.put("/api/admin/users/user-1")
			.set("Authorization", "Bearer valid")
			.set("x-csrf-token", "valid-csrf")
			.send({ nome: "Joao Silva" });

		expect(response.status).toBe(200);
		expect(currentMocks.auditLog.recordAuditLog).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "update",
				entity: "app_users",
				recordId: "user-1",
				changedFields: ["nome"],
			}),
		);
	});
});

describe("vps api app characterization - auth", () => {
	it("POST /api/auth/login autentica credenciais validas e define cookies", async () => {
		const app = loadApp();

		const response = await request(app)
			.post("/api/auth/login")
			.send({ email: "admin@example.com", password: "secret" });

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			ok: true,
			csrfToken: "valid-csrf",
			expiresIn: 3600,
		});
		expect(response.body.user).toMatchObject({
			uid: "admin-1",
			email: "admin@example.com",
		});
		expect(response.headers["set-cookie"].join(";")).toContain(
			"retiradas_session=session-token",
		);
	});

	it("POST /api/auth/login rejeita credenciais invalidas com 401 (Fase G — docs/TECHNICAL-AUDIT.md)", async () => {
		// Ate a Fase G da otimizacao tecnica, esta rota respondia 200 pra
		// credencial invalida (achado real, exposto pelo E2E de login
		// passando a rodar de verdade no CI — tests/e2e/critical-flows.spec.js
		// ja esperava 4xx desde antes, so nunca tinha rodado contra o
		// endpoint real). Corrigido em app.js/auth.js#verifyPasswordCredentials
		// pra responder 401 — o frontend ja trata `data.ok === false`
		// independente do status (authService.js#requestPublicAuth), entao a
		// correcao nao muda nada visivel pro usuario.
		const app = loadApp();

		const response = await request(app)
			.post("/api/auth/login")
			.send({ email: "admin@example.com", password: "wrong" });

		expect(response.status).toBe(401);
		expect(response.body).toMatchObject({
			ok: false,
			error: "Credenciais invalidas.",
		});
	});

	it("POST /api/auth/login aplica loginLimiter em excesso de tentativas", async () => {
		process.env.LOGIN_RATE_LIMIT_MAX = "1";
		const app = loadApp();

		await request(app)
			.post("/api/auth/login")
			.send({ email: "admin@example.com", password: "wrong" });
		const response = await request(app)
			.post("/api/auth/login")
			.send({ email: "admin@example.com", password: "wrong" });

		expect(response.status).toBe(429);
		expect(response.body).toMatchObject({
			ok: false,
			error: "Muitas tentativas. Aguarde alguns minutos.",
		});
	});

	it("GET /api/auth/me exige autenticacao e retorna perfil quando autenticado", async () => {
		const app = loadApp();

		const unauthenticated = await request(app).get("/api/auth/me");
		const authenticated = await request(app)
			.get("/api/auth/me")
			.set("Authorization", "Bearer valid");

		expect(unauthenticated.status).toBe(401);
		expect(authenticated.status).toBe(200);
		expect(authenticated.body).toMatchObject({
			csrfToken: "valid-csrf",
			renewed: false,
			user: { uid: "admin-1", email: "admin@example.com" },
		});
	});

	it("POST /api/auth/logout limpa cookie de sessao", async () => {
		const app = loadApp();

		const response = await request(app)
			.post("/api/auth/logout")
			.set("Authorization", "Bearer valid")
			.set("x-csrf-token", "valid-csrf");

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ ok: true });
		expect(response.headers["set-cookie"].join(";")).toContain(
			"retiradas_session=;",
		);
		expect(currentMocks.auth.revokeSession).toHaveBeenCalledWith("jti-1");
	});

	it("PUT /api/auth/avatar exige CSRF e aceita imagem valida com CSRF", async () => {
		const app = loadApp();
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

		const withoutCsrf = await request(app)
			.put("/api/auth/avatar")
			.set("Authorization", "Bearer valid")
			.attach("avatar", png, {
				filename: "avatar.png",
				contentType: "image/png",
			});
		const withCsrf = await request(app)
			.put("/api/auth/avatar")
			.set("Authorization", "Bearer valid")
			.set("x-csrf-token", "valid-csrf")
			.attach("avatar", png, {
				filename: "avatar.png",
				contentType: "image/png",
			});

		expect(withoutCsrf.status).toBe(403);
		expect(withoutCsrf.body).toMatchObject({
			error: "Token CSRF invalido ou ausente.",
		});
		expect(withCsrf.status).toBe(200);
		expect(withCsrf.body).toMatchObject({ ok: true });
		expect(withCsrf.body.avatarUrl).toMatch(
			/^\/api\/uploads\/avatars\/user-admin-1-/,
		);
	});

	it("POST /api/auth/change-password exige CSRF e sucede com CSRF valido", async () => {
		const app = loadApp();

		const withoutCsrf = await request(app)
			.post("/api/auth/change-password")
			.set("Authorization", "Bearer valid")
			.send({ currentPassword: "old", nextPassword: "new" });
		const withCsrf = await request(app)
			.post("/api/auth/change-password")
			.set("Authorization", "Bearer valid")
			.set("x-csrf-token", "valid-csrf")
			.send({ currentPassword: "old", nextPassword: "new" });

		expect(withoutCsrf.status).toBe(403);
		expect(withCsrf.status).toBe(200);
		expect(withCsrf.body).toMatchObject({ ok: true, user: { uid: "admin-1" } });
	});

	it("POST /api/auth/forgot-password sempre retorna sucesso generico", async () => {
		const app = loadApp();

		const response = await request(app)
			.post("/api/auth/forgot-password")
			.send({ email: "admin@example.com" });

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ ok: true });
		expect(currentMocks.emailService.sendPasswordResetEmail).toHaveBeenCalled();
	});

	it("POST /api/auth/reset-password retorna sucesso para token valido e erro para token invalido", async () => {
		const app = loadApp();

		const success = await request(app)
			.post("/api/auth/reset-password")
			.send({ token: "reset-token", password: "new" });
		const failure = await request(app)
			.post("/api/auth/reset-password")
			.send({ token: "bad-token", password: "new" });

		expect(success.status).toBe(200);
		expect(success.body).toMatchObject({ ok: true });
		expect(failure.status).toBe(400);
		expect(failure.body).toMatchObject({ ok: false, error: "Token invalido." });
	});
});

describe("vps api app characterization - permission and middleware helpers", () => {
	it("canReadCollection cobre sem permissao, permitido e admin", () => {
		const { helpers } = loadTestables();

		expect(
			helpers.canReadCollection({ role: "lider_empresa" }, "ordens_abertas"),
		).toBe(false);
		expect(
			helpers.canReadCollection(
				{ role: "backoffice_retirada" },
				"ordens_abertas",
			),
		).toBe(true);
		expect(
			helpers.canReadCollection({ role: "admin" }, "api_integrations"),
		).toBe(true);
		expect(
			helpers.canReadCollection(
				{ role: "user", permissions: ["destaque.metas.view"] },
				"agentes",
			),
		).toBe(true);
		expect(
			helpers.canReadCollection(
				{ role: "user", permissions: ["destaque.metas.view"] },
				"regionais",
			),
		).toBe(true);
	});

	it("canWriteCollection cobre sem permissao, permitido e admin", () => {
		const { helpers } = loadTestables();

		expect(
			helpers.canWriteCollection({ role: "lider_empresa" }, "ordens_abertas"),
		).toBe(false);
		expect(
			helpers.canWriteCollection({ role: "supervisor" }, "ordens_abertas"),
		).toBe(true);
		expect(
			helpers.canWriteCollection({ role: "admin" }, "api_integrations"),
		).toBe(true);
	});

	it("canAccessRegionalRecord limita supervisor a propria regional", () => {
		const { helpers } = loadTestables();

		expect(
			helpers.canAccessRegionalRecord({ role: "admin" }, { regional: "Outra" }),
		).toBe(true);
		expect(
			helpers.canAccessRegionalRecord(
				{ role: "supervisor", regional: "Metropolitana SUB2" },
				{ regional: "Metropolitana SUB2" },
			),
		).toBe(true);
		expect(
			helpers.canAccessRegionalRecord(
				{ role: "supervisor", regional: "Metropolitana SUB2" },
				{ regional: "Alto Paranaiba" },
			),
		).toBe(false);
	});

	it("canAccessEmpresaRecord limita lider de empresa e supervisor", () => {
		const { helpers } = loadTestables();

		expect(
			helpers.canAccessEmpresaRecord({ role: "admin" }, "empresa-1", {
				nome: "Outra",
			}),
		).toBe(true);
		expect(
			helpers.canAccessEmpresaRecord(
				{ role: "lider_empresa", empresaId: "empresa-1" },
				"empresa-1",
				{ nome: "Empresa" },
			),
		).toBe(true);
		expect(
			helpers.canAccessEmpresaRecord(
				{ role: "lider_empresa", empresaId: "empresa-1" },
				"empresa-2",
				{ nome: "Empresa" },
			),
		).toBe(false);
		expect(
			helpers.canAccessEmpresaRecord(
				{ role: "supervisor", regional: "Metropolitana SUB2" },
				"empresa-2",
				{ regional: "Metropolitana SUB2" },
			),
		).toBe(true);
	});

	it("requireCsrfToken rejeita sem token e passa com token valido", () => {
		const { helpers } = loadTestables({
			auth: makeAuthMock({
				verifyCsrfToken: vi.fn(
					(req) => req.get("x-csrf-token") === "valid-csrf",
				),
			}),
		});
		const res = createRes();
		const next = vi.fn();

		helpers.requireCsrfToken(createReq(), res, next);
		expect(res.statusCode).toBe(403);
		expect(next).not.toHaveBeenCalled();

		helpers.requireCsrfToken(
			createReq({ headers: { "x-csrf-token": "valid-csrf" } }),
			createRes(),
			next,
		);
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("requireInternalToken rejeita sem token e passa com token valido", () => {
		const { helpers } = loadTestables();
		const res = createRes();
		const next = vi.fn();

		helpers.requireInternalToken(createReq(), res, next);
		expect(res.statusCode).toBe(401);
		expect(next).not.toHaveBeenCalled();

		helpers.requireInternalToken(
			createReq({
				headers: { "x-internal-api-token": process.env.INTERNAL_API_TOKEN },
			}),
			createRes(),
			next,
		);
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("rejectLargePublicVisit rejeita payload acima do limite e passa payload pequeno", () => {
		process.env.PUBLIC_VISIT_MAX_BYTES = "10";
		const { helpers } = loadTestables();
		const next = vi.fn();

		const largeRes = createRes();
		helpers.rejectLargePublicVisit(
			createReq({ headers: { "content-length": "11" } }),
			largeRes,
			next,
		);
		expect(largeRes.statusCode).toBe(413);
		expect(largeRes.body).toMatchObject({ error: "Payload muito grande." });
		expect(next).not.toHaveBeenCalled();

		helpers.rejectLargePublicVisit(
			createReq({ headers: { "content-length": "10" } }),
			createRes(),
			next,
		);
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("verifyWebhookSecret rejeita segredo invalido e aceita query, header e body validos", () => {
		const { helpers } = loadTestables();

		const invalidRes = createRes();
		expect(
			helpers.verifyWebhookSecret(
				createReq(),
				invalidRes,
				"EVOLUTION_WEBHOOK_SECRET",
				"Evolution",
			),
		).toBe(false);
		expect(invalidRes.statusCode).toBe(401);

		expect(
			helpers.verifyWebhookSecret(
				createReq({ query: { secret: process.env.EVOLUTION_WEBHOOK_SECRET } }),
				createRes(),
				"EVOLUTION_WEBHOOK_SECRET",
				"Evolution",
			),
		).toBe(true);
		expect(
			helpers.verifyWebhookSecret(
				createReq({
					headers: { "x-webhook-secret": process.env.EVOLUTION_WEBHOOK_SECRET },
				}),
				createRes(),
				"EVOLUTION_WEBHOOK_SECRET",
				"Evolution",
			),
		).toBe(true);
		expect(
			helpers.verifyWebhookSecret(
				createReq({ body: { secret: process.env.EVOLUTION_WEBHOOK_SECRET } }),
				createRes(),
				"EVOLUTION_WEBHOOK_SECRET",
				"Evolution",
			),
		).toBe(true);
	});
});

describe("vps api app characterization - public webhooks secret gate", () => {
	it("POST /api/webhooks/evolution rejeita sem segredo e aceita segredo via query/header/body", async () => {
		const app = loadApp();
		const path = "/api/webhooks/evolution";

		const rejected = await request(app)
			.post(path)
			.send({ event: "messages.upsert" });
		const viaQuery = await request(app)
			.post(`${path}?secret=${process.env.EVOLUTION_WEBHOOK_SECRET}`)
			.send({ event: "messages.upsert" });
		const viaHeader = await request(app)
			.post(path)
			.set("x-webhook-secret", process.env.EVOLUTION_WEBHOOK_SECRET)
			.send({ event: "messages.upsert" });
		const viaBody = await request(app)
			.post(path)
			.send({
				secret: process.env.EVOLUTION_WEBHOOK_SECRET,
				event: "messages.upsert",
			});

		expect(rejected.status).toBe(401);
		expect(viaQuery.status).toBe(200);
		expect(viaHeader.status).toBe(200);
		expect(viaBody.status).toBe(200);
	});

	it("POST /api/webhooks/cvortex rejeita sem segredo e aceita com segredo valido", async () => {
		const app = loadApp();

		const rejected = await request(app)
			.post("/api/webhooks/cvortex")
			.send({ event: "message" });
		const accepted = await request(app)
			.post("/api/webhooks/cvortex")
			.set("x-retiradas-webhook-secret", process.env.CVORTEX_WEBHOOK_SECRET)
			.send({ event: "message" });

		expect(rejected.status).toBe(401);
		expect(accepted.status).toBe(200);
	});

	it("POST /api/webhooks/whatsapp-official rejeita sem segredo e aceita com segredo valido", async () => {
		const app = loadApp();

		const rejected = await request(app)
			.post("/api/webhooks/whatsapp-official")
			.send({ object: "whatsapp_business_account" });
		const accepted = await request(app)
			.post("/api/webhooks/whatsapp-official")
			.send({
				secret: process.env.WHATSAPP_OFFICIAL_WEBHOOK_SECRET,
				object: "whatsapp_business_account",
			});

		expect(rejected.status).toBe(401);
		expect(accepted.status).toBe(200);
	});
});
