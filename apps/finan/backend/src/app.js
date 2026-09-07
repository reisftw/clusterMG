const compression = require("compression");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const db = require("./db");
const { requireFinanAuth } = require("./auth/middleware");
const authRoutes = require("./auth/routes");
const pinAdminRoutes = require("./auth/pinAdminRoutes");
const calendarioRoutes = require("./calendario/routes");
const compatRoutes = require("./compat/routes");
const createFinanceiroRouter = require("./financeiro/routes/financeiroRoutes");
const healthRoutes = require("./health/routes");
const integrationsRoutes = require("./integrations/routes");
const budgetRoutes = require("./orcamento/routes");
const pushRoutes = require("./push/routes");
const settingsRoutes = require("./settings/routes");
const usersRoutes = require("./users/routes");
const { buildFinanCorsOptions } = require("./security/cors");
const { toClientResponse } = require("./security/errors");
const { sanitizeForLog } = require("./security/logSanitizer");

const FINAN_FINANCEIRO_VIEW_PERMISSIONS = [
	"financeiro.visao_geral.view",
	"financeiro.visao_geral.manage",
	"financeiro.gestao_orcamento.view",
	"financeiro.gestao_orcamento.manage",
	"financeiro.reports.view",
	"financeiro.reports.manage",
	"financeiro.equipe.view",
	"financeiro.equipe.manage",
	"financeiro.contas_pagar.view",
	"financeiro.contas_receber.view",
	"financeiro.faturamento.view",
	"financeiro.notas.view",
];

const FINAN_FINANCEIRO_MANAGE_PERMISSIONS = [
	"financeiro.visao_geral.manage",
	"financeiro.gestao_orcamento.manage",
	"financeiro.reports.manage",
	"financeiro.equipe.manage",
	"financeiro.contas_pagar.manage",
	"financeiro.contas_receber.manage",
	"financeiro.configuracoes.manage",
];

function finanPermissionMatches(user, permission) {
	if (!permission) return true;
	if (user?.is_admin) return true;
	const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
	if (permissions.includes("*") || permissions.includes(permission)) return true;
	if (String(permission).startsWith("financeiro.")) {
		const finanPermission = String(permission)
			.replace(/^financeiro\.visao_geral\.view$/, "finan.dashboard.view")
			.replace(/^financeiro\.visao_geral\.manage$/, "finan.dashboard.view")
			.replace(/^financeiro\.gestao_orcamento\./, "finan.gestao_orcamentaria.")
			.replace(/^financeiro\./, "finan.");
		return permissions.includes(finanPermission);
	}
	return false;
}

function requireAnyFinanPermission(permissions = []) {
	const required = Array.isArray(permissions) ? permissions : [permissions];
	return (req, res, next) => {
		if (required.some((permission) => finanPermissionMatches(req.finanUser, permission))) {
			next();
			return;
		}
		res.status(403).json({
			ok: false,
			error: "Você não tem permissão para acessar esta área do Finan.",
		});
	};
}

// Log leve de cada request: metodo, rota, status e duracao. Nunca loga
// body/headers (evita vazar Authorization, senha, etc. — ver
// security/logSanitizer.js para o caso em que precisamos logar um objeto).
function requestTimingLogger(req, res, next) {
	const startedAt = process.hrtime.bigint();
	res.on("finish", () => {
		const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
		console.log(`[finan-api] ${req.method} ${req.path} ${res.statusCode} ${durationMs.toFixed(0)}ms`);
	});
	next();
}

function auditMutations(req, res, next) {
	if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
		next();
		return;
	}
	const startedAt = Date.now();
	res.on("finish", () => {
		if (res.statusCode >= 400) return;
		db.query(
			`insert into finan_audit_logs (
				user_id, user_name, user_email, action, module, entity, entity_id,
				ip_address, user_agent, after_data, changed_fields
			)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, '[]'::jsonb)`,
			[
				req.finanUser?.id || null,
				req.finanUser?.name || req.finanUser?.email || null,
				req.finanUser?.email || null,
				normalizeAuditAction(req.method),
				resolveAuditModule(req.path),
				resolveAuditEntity(req.path),
				req.params?.id || req.body?.id || null,
				req.ip || "",
				req.get("user-agent") || "",
				JSON.stringify({
					method: req.method,
					path: req.originalUrl,
					statusCode: res.statusCode,
					durationMs: Date.now() - startedAt,
				}),
			],
		).catch((error) => console.error("[finan-audit]", sanitizeForLog(error)));
	});
	next();
}

function normalizeAuditAction(method) {
	if (method === "POST") return "create";
	if (method === "PUT" || method === "PATCH") return "update";
	if (method === "DELETE") return "delete";
	return method.toLowerCase();
}

function resolveAuditModule(pathname = "") {
	if (pathname.includes("/financeiro")) return "financeiro";
	if (pathname.includes("/admin")) return "configuracao";
	if (pathname.includes("/notifications")) return "notificacoes";
	if (pathname.includes("/finan/orcamento")) return "orcamento";
	if (pathname.includes("/finan/integracoes")) return "integracoes";
	return "finan";
}

function resolveAuditEntity(pathname = "") {
	const clean = String(pathname || "").replace(/^\/api\/?/, "");
	return clean.split("/").filter(Boolean).slice(0, 3).join("/") || "finan";
}

function createApp() {
	const app = express();

	app.disable("x-powered-by");
	app.set("trust proxy", 1);
	app.use(
		helmet({
			contentSecurityPolicy: {
				directives: {
					imgSrc: ["'self'", "data:", "https://retiradas.tech"],
				},
			},
		}),
	);
	// Helmet nao define Permissions-Policy por padrao. O Finan nao usa
	// camera/microfone/geolocalizacao/etc., entao desabilita tudo isso
	// explicitamente (reduz superficie caso algum script de terceiro
	// injetado tente usar essas APIs do navegador).
	app.use((_req, res, next) => {
		res.setHeader(
			"Permissions-Policy",
			"camera=(), microphone=(), geolocation=(), payment=(), usb=()",
		);
		next();
	});
	app.use(compression());
	app.use(cors(buildFinanCorsOptions()));
	app.use(express.json({ limit: "10mb" }));
	app.use(requestTimingLogger);
	app.use(
		rateLimit({
			windowMs: 60 * 1000,
			limit: Number(process.env.FINAN_RATE_LIMIT_PER_MINUTE || 600),
			standardHeaders: true,
			legacyHeaders: false,
		}),
	);

	app.use("/api/finan/health", healthRoutes);
	app.use("/api/finan/auth", authRoutes);
	app.use("/api/auth", authRoutes);
	app.use(requireFinanAuth);
	app.use(auditMutations);
	app.use("/api", compatRoutes);
	app.use(
		"/api/financeiro",
		createFinanceiroRouter({
			financeiroManagePermissions: FINAN_FINANCEIRO_MANAGE_PERMISSIONS,
			financeiroRoles: ["admin"],
			financeiroViewPermissions: FINAN_FINANCEIRO_VIEW_PERMISSIONS,
			requireAnyPermission: requireAnyFinanPermission,
			requireAuthenticated: (_req, _res, next) => next(),
			requireCsrfToken: (_req, _res, next) => next(),
		}),
	);
	app.use("/api/finan/orcamento", budgetRoutes);
	app.use("/api/finan/integracoes", integrationsRoutes);
	app.use("/api/finan/configuracoes", settingsRoutes);
	app.use("/api/finan/usuarios", usersRoutes);
	app.use("/api/finan/pin-admin", pinAdminRoutes);
	app.use("/api/finan/calendario-financeiro", calendarioRoutes);
	app.use("/api/finan/push", pushRoutes);

	app.use((req, res) => {
		res.status(404).json({ ok: false, error: "Rota do Finan não encontrada." });
	});

	app.use((error, _req, res, _next) => {
		// Log completo (sanitizado) sempre fica no backend. O que volta pro
		// cliente passa por toClientResponse, que esconde a mensagem quando o
		// erro tem a forma de um erro cru do driver `pg` (ver
		// security/errors.js) — evita vazar nome de tabela/constraint/coluna.
		console.error("[finan-api]", sanitizeForLog(error));
		const { status, body } = toClientResponse(error);
		res.status(status).json(body);
	});

	return app;
}

module.exports = { createApp };
