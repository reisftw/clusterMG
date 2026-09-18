// Utilitario compartilhado pelos testes do backend do Finan (apps/finan/backend).
//
// Segue o mesmo padrao ja usado em src/backend/imoveisRoutes.test.js para o
// vps/api: cria um `require` apontando pro package.json do workspace que
// queremos testar e injeta um modulo fake no require.cache ANTES de
// carregar o app, para que toda a arvore de rotas (que faz
// `require("../db")`/`require("../../db")` em varios arquivos) receba a
// mesma instancia mockada.
//
// Nenhuma credencial real e usada aqui — todo valor "secreto" abaixo e uma
// string obviamente fake, só para provar que o endpoint mascara/nao
// mascara o campo.
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { vi } from "vitest";

const finanRequire = createRequire(
	path.join(process.cwd(), "apps/finan/backend/package.json"),
);

const dbPath = finanRequire.resolve("./src/db.js");
const appPath = finanRequire.resolve("./src/app.js");

export const FAKE_SECRETS = {
	integrationToken: "fake-integration-token-do-not-use",
	integrationSecret: "fake-integration-secret-do-not-use",
	oauthClientSecret: "fake-oauth-client-secret-do-not-use",
};

function clearFinanModuleCache() {
	for (const key of Object.keys(finanRequire.cache)) {
		if (key.includes(`${path.sep}apps${path.sep}finan${path.sep}backend${path.sep}`)) {
			delete finanRequire.cache[key];
		}
	}
}

/**
 * Constroi um mock de `db.js` que responde de acordo com o texto da query.
 * `session` controla o que a checagem de autenticacao (`findUserByBearer`)
 * enxerga como usuario logado; passe `null` para simular "token invalido/
 * sessao inexistente" mesmo com um header Authorization presente.
 */
export function createFinanDbMock({ session = null } = {}) {
	let currentSession = session;

	const integrationRow = {
		config: {
			baseUrl: "https://fake-integration.example.com",
			clientId: "fake-client-id",
			token: FAKE_SECRETS.integrationToken,
			secret: FAKE_SECRETS.integrationSecret,
		},
		provider: "hubsoft",
		name: "Hubsoft",
		status: "ativo",
		updated_at: new Date("2026-01-01T00:00:00Z"),
	};

	const oauthRow = {
		clientId: "fake-oauth-client-id",
		clientSecret: FAKE_SECRETS.oauthClientSecret,
	};

	const auditLogRow = {
		id: "audit-1",
		user_id: "user-1",
		user_name: "Usuario Teste",
		user_email: "teste@example.com",
		setor_id: null,
		department_id: null,
		module: "configuracao",
		entity: "finan/admin/hubsoft",
		action: "update",
		record_id: null,
		ip_address: "127.0.0.1",
		user_agent: "vitest",
		before_data: {},
		after_data: {},
		changed_fields: [],
		created_at: new Date("2026-01-01T00:00:00Z"),
	};

	const emailLogRow = {
		id: "email-1",
		type: "mfa",
		to_email: "teste@example.com",
		subject: "Codigo de acesso",
		status: "enviado",
		error_message: null,
		provider_message_id: "msg-1",
		meta: {},
		created_at: new Date("2026-01-01T00:00:00Z"),
	};

	const query = vi.fn(async (text) => {
		const sql = String(typeof text === "string" ? text : text?.text || "");

		if (/from finan_sessions/i.test(sql)) {
			return { rows: currentSession ? [currentSession] : [] };
		}
		if (/count\(\*\)::int as total\s+from finan_email_logs/i.test(sql)) {
			return { rows: [{ total: 1 }] };
		}
		if (/from finan_email_logs/i.test(sql)) {
			return { rows: [emailLogRow] };
		}
		if (/count\(\*\)::int as total\s+from finan_audit_logs/i.test(sql)) {
			return { rows: [{ total: 1 }] };
		}
		if (/select distinct module from finan_audit_logs/i.test(sql)) {
			return { rows: [{ module: "configuracao" }] };
		}
		if (/select distinct setor_id from finan_audit_logs/i.test(sql)) {
			return { rows: [] };
		}
		if (/from finan_audit_logs/i.test(sql)) {
			return { rows: [auditLogRow] };
		}
		if (/from finan_integration_configs/i.test(sql)) {
			return { rows: [integrationRow] };
		}
		if (/from finan_settings/i.test(sql)) {
			return { rows: [{ value: oauthRow }] };
		}
		if (/pg_database_size|pg_stat_user_tables/i.test(sql)) {
			return { rows: [{ bytes: 1024, table_name: "finan_users", estimated_rows: 1 }] };
		}
		return { rows: [] };
	});

	return {
		query,
		connect: vi.fn(async () => ({ query, release: vi.fn() })),
		closePool: vi.fn(async () => {}),
		getPoolStats: vi.fn(() => ({ total: 1, idle: 1, waiting: 0 })),
		setSession(nextSession) {
			currentSession = nextSession;
		},
	};
}

/**
 * Carrega `apps/finan/backend/src/app.js` com `db.js` substituido pelo
 * mock informado. Retorna `{ app, dbMock }` prontos para uso com supertest.
 */
export function loadFinanApp(dbMock) {
	clearFinanModuleCache();
	finanRequire.cache[dbPath] = {
		id: dbPath,
		filename: dbPath,
		loaded: true,
		exports: dbMock,
	};
	// Evita que o rate limiter global conte requests entre testes distintos
	// e para nao precisarmos de FINAN_SESSION_SECRET/FINAN_DATABASE_URL reais.
	process.env.FINAN_RATE_LIMIT_PER_MINUTE = "100000";
	process.env.FINAN_BACKUP_DIR = process.env.FINAN_BACKUP_DIR || path.join(process.cwd(), ".tmp-finan-test-backups");
	const { createApp } = finanRequire(appPath);
	return createApp();
}

/** Sessao "sem permissao nenhuma" — autenticado, mas sem acesso a nada admin. */
export function sessionWithPermissions(permissions = [], overrides = {}) {
	return {
		id: "user-sem-permissao",
		name: "Usuario Sem Permissao",
		email: "sem-permissao@example.com",
		role_id: "analista_financeiro",
		status: "ativo",
		avatar_url: "",
		permissions,
		is_admin: false,
		...overrides,
	};
}

export function adminSession(overrides = {}) {
	return sessionWithPermissions([], { id: "admin-1", name: "Admin", email: "admin@example.com", is_admin: true, ...overrides });
}

export { clearFinanModuleCache };
