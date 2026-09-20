const compression = require("compression");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const prometheusMetrics = require("./observabilidade/prometheusMetrics");
const absencesRoutes = require("./absences/routes");
const agentsRoutes = require("./agents/routes");
const aprRoutes = require("./apr/routes");
const activitiesRoutes = require("./activities/routes");
const assetsSecurityPublicRoutes = require("./assetsSecurity/publicRoutes");
const assetsSecurityRoutes = require("./assetsSecurity/routes");
const attachmentsRoutes = require("./attachments/routes");
const notificationsRoutes = require("./notifications/routes");
const sstRoutes = require("./sst/routes");
const dssRoutes = require("./dss/routes");
const auditRoutes = require("./audit/routes");
const authRoutes = require("./auth/routes");
const companiesRoutes = require("./companies/routes");
const dashboardRoutes = require("./dashboard/routes");
const documentsAdminRoutes = require("./documents/adminRoutes");
const documentsRoutes = require("./documents/routes");
const equipmentsRoutes = require("./equipments/routes");
const fleetRoutes = require("./fleet/routes");
const healthRoutes = require("./health/routes");
const holidaysRoutes = require("./holidays/routes");
const integrationsRoutes = require("./integrations/routes");
const keysRoutes = require("./keys/routes");
const legacySyncRoutes = require("./legacySync/routes");
const materialsRoutes = require("./materials/routes");
const noticesRoutes = require("./notices/routes");
const operationFlowsRoutes = require("./operationFlows/routes");
const operationalIntelligenceRoutes = require("./operationalIntelligence/routes");
const oauthRoutes = require("./oauth/routes");
const publicQrRoutes = require("./qrcodes/publicRoutes");
const qrcodesRoutes = require("./qrcodes/routes");
const rainRoutes = require("./rain/routes");
const rankingRoutes = require("./ranking/routes");
const regionalsRoutes = require("./regionals/routes");
const rolesRoutes = require("./roles/routes");
const rompimentosRoutes = require("./rompimentos/routes");
const serviceTypesRoutes = require("./serviceTypes/routes");
const settingsRoutes = require("./settings/routes");
const shiftsRoutes = require("./shifts/routes");
const ticketsRoutes = require("./tickets/routes");
const techniciansRoutes = require("./technicians/routes");
const tecnicosBolsaAuditoriaRoutes = require("./tecnicosBolsaAuditoria/routes");
const usersRoutes = require("./users/routes");
const warlinhoRoutes = require("./warlinho/routes");
const { buildRotCorsOptions } = require("./security/cors");
const { toClientResponse } = require("./security/errors");
const { sameSiteOriginGuard } = require("./security/originGuard");

// Log leve por request — mesmo padrao de apps/finan/backend/src/app.js.
// Nunca loga body/headers (evita vazar Authorization/senha).
function requestTimingLogger(req, res, next) {
	const startedAt = process.hrtime.bigint();
	res.on("finish", () => {
		const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
		console.log(`[rot-api] ${req.method} ${req.path} ${res.statusCode} ${durationMs.toFixed(0)}ms`);
	});
	next();
}

function resolveJsonLimit(env = process.env) {
	return env.ROT_JSON_LIMIT || "1mb";
}

function createApp() {
	const app = express();
	app.disable("x-powered-by");
	app.set("trust proxy", 1);

	app.use(helmet());
	app.use(compression());
	app.use(cors(buildRotCorsOptions()));
	app.use(express.json({ limit: resolveJsonLimit(), strict: true }));
	app.use(sameSiteOriginGuard);
	app.use(requestTimingLogger);
	// Prometheus/Grafana (status.retiradas.tech) — endpoint texto plano,
	// sem autenticacao, so alcancavel via 127.0.0.1 (ver comentario em
	// observabilidade/prometheusMetrics.js).
	app.use(prometheusMetrics.prometheusMiddleware);
	app.get("/metrics", prometheusMetrics.metricsRoute);

	app.use(
		rateLimit({
			windowMs: 60 * 1000,
			limit: Number(process.env.ROT_RATE_LIMIT_PER_MINUTE || 600),
			standardHeaders: true,
			legacyHeaders: false,
		}),
	);

	app.use("/api/health", healthRoutes);
	app.use("/api/auth", authRoutes);
	app.use("/api/documents", documentsRoutes);
	app.use("/api/admin/documents", documentsAdminRoutes);
	app.use("/api/admin/oauth", oauthRoutes);
	app.use("/api/admin/users", usersRoutes);
	app.use("/api/admin/dashboard", dashboardRoutes);
	app.use("/api/admin/roles", rolesRoutes);
	app.use("/api/admin/agents", agentsRoutes);
	app.use("/api/admin/companies", companiesRoutes);
	app.use("/api/admin/integrations", integrationsRoutes);
	app.use("/api/admin", legacySyncRoutes);
	app.use("/api/admin/regionals", regionalsRoutes);
	app.use("/api/admin/settings", settingsRoutes);
	app.use("/api/admin/qrcodes", qrcodesRoutes);
	app.use("/api/public/qr", publicQrRoutes);
	app.use("/api/admin/audit-logs", auditRoutes);
	app.use("/api/admin/holidays", holidaysRoutes);
	app.use("/api/admin/notices", noticesRoutes);
	app.use("/api/admin/keys", keysRoutes);
	app.use("/api/admin/materials", materialsRoutes);
	app.use("/api/admin", operationFlowsRoutes);
	app.use("/api/admin/operational-intelligence", operationalIntelligenceRoutes);
	app.use("/api/admin/fleet", fleetRoutes);
	app.use("/api/admin/equipments", equipmentsRoutes);
	app.use("/api/admin/service-types", serviceTypesRoutes);
	app.use("/api/admin/tickets", ticketsRoutes);
	app.use("/api/admin/technicians", techniciansRoutes);
	app.use("/api/admin/tecnicos/auditoria/bolsa", tecnicosBolsaAuditoriaRoutes);
	app.use("/api/admin/absences", absencesRoutes);
	app.use("/api/admin/apr", aprRoutes);
	app.use("/api/admin/attachments", attachmentsRoutes);
	app.use("/api/admin/assets-security", assetsSecurityRoutes);
	app.use("/api/public/assets", assetsSecurityPublicRoutes);
	app.use("/api/admin/sst", sstRoutes);
	app.use("/api/admin/dss", dssRoutes);
	app.use("/api/admin/notifications", notificationsRoutes);
	app.use("/api/admin/shifts", shiftsRoutes);
	app.use("/api/admin/rain", rainRoutes);
	app.use("/api/admin/rompimentos", rompimentosRoutes);
	app.use("/api/admin/activities", activitiesRoutes);
	app.use("/api/admin/ranking", rankingRoutes);
	app.use("/api/admin/warlinho", warlinhoRoutes);

	app.use((req, res) => {
		res.status(404).json({ ok: false, error: "Rota não encontrada." });
	});

	// Handler de erro global — SEMPRE por ultimo. Toda rota async precisa
	// de try/catch + next(error) (Express 4 nao captura rejection
	// automatico); sem isso um erro de banco nao tratado derruba o
	// processo Node inteiro, nao so a requisicao (mesma causa raiz do
	// crash loop real do Finan em 2026-09-05, documentado no CLAUDE.md).
	// eslint-disable-next-line no-unused-vars
	app.use((error, req, res, _next) => {
		const { status, body } = toClientResponse(error);
		if (status >= 500) {
			console.error(`[rot-api] erro ${status} em ${req.method} ${req.path}:`, error);
		}
		res.status(status).json(body);
	});

	return app;
}

module.exports = { createApp, resolveJsonLimit };
