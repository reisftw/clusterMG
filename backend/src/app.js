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
const contratosRoutes = require("./contratos/routes");
const fechamentoRoutes = require("./fechamento/routes");
const financeirinhoRoutes = require("./financeirinho/routes");
const fornecedoresRoutes = require("./fornecedores/routes");
const createFinanceiroRouter = require("./financeiro/routes/financeiroRoutes");
const healthRoutes = require("./health/routes");
const insightsRoutes = require("./insights/routes");
const inteligenciaRoutes = require("./inteligencia/routes");
const integrationsRoutes = require("./integrations/routes");
const brasilapiRoutes = require("./brasilapi/routes");
const budgetRoutes = require("./orcamento/routes");
const buscaRoutes = require("./busca/routes");
const contasPagarRoutes = require("./contasPagar/routes");
const contasReceberRoutes = require("./contasReceber/routes");
const documentosRoutes = require("./documentos/routes");
const notasRoutes = require("./notas/routes");
const indicadoresRoutes = require("./indicadores/routes");
const metasRoutes = require("./metas/routes");
const navegacaoRoutes = require("./navegacao/routes");
const preferenciasRoutes = require("./preferencias/routes");
const pendenciasRoutes = require("./pendencias/routes");
const qualidadeDadosRoutes = require("./qualidadeDados/routes");
const anexosRoutes = require("./anexos/routes");
const pushRoutes = require("./push/routes");
const jobsRoutes = require("./jobs/routes");
const importadorRoutes = require("./importador/routes");
const regrasRoutes = require("./regras/routes");
const briefingRoutes = require("./briefing/routes");
const businessCaseRoutes = require("./businessCase/routes");
const webhooksRoutes = require("./webhooks/routes");
const conciliacaoRoutes = require("./conciliacao/routes");
const observabilidadeRoutes = require("./observabilidade/routes");
const metricsCollector = require("./observabilidade/metricsCollector");
const prometheusMetrics = require("./observabilidade/prometheusMetrics");
const apiV1HealthRoutes = require("./apiV1/routes/health");
const apiV1DocsRoutes = require("./apiV1/routes/docs");
const { createApiV1Router } = require("./apiV1/router");
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
		// Roteiro Finan #27 (Observabilidade): alimenta o mesmo acumulador
		// que o painel tecnico le, sem adicionar um segundo middleware so
		// pra medir a mesma coisa duas vezes.
		metricsCollector.recordRequest(durationMs, res.statusCode);
	});
	next();
}

// Bug real corrigido aqui (Roteiro #33 — Linha do tempo financeira): pra
// um POST de criacao, o id do registro so existe DEPOIS que o handler
// roda (gerado no servidor) — nunca em req.params/req.body. Sem capturar
// o corpo da resposta, entity_id ficava sempre null no evento de
// "criou", e esse evento nunca aparecia na timeline dos eventos
// seguintes do mesmo registro (que tem o id certo). Intercepta res.json
// so pra guardar o payload (nao muda o que e enviado ao cliente).
function findResponseId(body) {
	if (!body || typeof body !== "object") return null;
	const direct = body.id || body.data?.id;
	if (direct) return String(direct);
	// Alguns handlers respondem { ok, <chaveDoRecurso>: {...} } em vez de
	// { ok, data } — pega o primeiro objeto com `.id` entre as chaves.
	for (const value of Object.values(body)) {
		if (value && typeof value === "object" && !Array.isArray(value) && value.id) {
			return String(value.id);
		}
	}
	return null;
}

function auditMutations(req, res, next) {
	if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
		next();
		return;
	}
	const startedAt = Date.now();
	let responseBody;
	const originalJson = res.json.bind(res);
	res.json = (body) => {
		responseBody = body;
		return originalJson(body);
	};
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
				normalizeAuditAction(req.method, req.path),
				resolveAuditModule(req.path),
				resolveAuditEntity(req.path),
				req.params?.id || req.body?.id || findResponseId(responseBody) || null,
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

// Roteiro Finan #33 (Fase 4B — Linha do tempo financeira, estados
// completos, estende #10): alguns endpoints sao "sub-acoes" (POST
// .../pagar, .../receber, .../fechar, .../reabrir) que semanticamente
// nao sao "create" — sao uma mudanca de estado do documento (baixado,
// fechado). Sem isso, a timeline generica so mostraria "criou conta_pagar"
// pro clique em "Marcar como paga", o que nao diz nada de util. So o
// sufixo do path muda o rotulo — nenhuma outra rota do sistema (as
// ~150 restantes) e afetada.
function normalizeAuditAction(method, pathname = "") {
	const cleanPath = String(pathname || "").split("?")[0].replace(/\/$/, "");
	if (method === "POST") {
		if (/\/pagar$/.test(cleanPath) || /\/receber$/.test(cleanPath)) return "baixar";
		if (/\/fechar$/.test(cleanPath)) return "fechar";
		if (/\/reabrir$/.test(cleanPath)) return "reabrir";
		return "create";
	}
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

// Bug real corrigido aqui (Roteiro #33): so 2 segmentos (modulo +
// recurso), nao 3. Com 3, uma sub-rota tipo POST /finan/contas-pagar/:id/pagar
// virava entity "finan/contas-pagar/<id>" — o id do registro entrando
// como se fosse parte do NOME da entidade, diferente do entity
// "finan/contas-pagar" gravado no create original do mesmo registro.
// Resultado: o evento "baixou" nunca aparecia na mesma timeline do
// evento "criou" (a query de by-record casa `entity` por igualdade
// exata). Com 2 segmentos os dois eventos do mesmo registro sempre tem
// a mesma entity, e o id vai so pra entity_id (coluna certa pra isso).
function resolveAuditEntity(pathname = "") {
	const clean = String(pathname || "").replace(/^\/api\/?/, "");
	return clean.split("/").filter(Boolean).slice(0, 2).join("/") || "finan";
}

function createApp() {
	const app = express();

	// Roteiro Finan #27: comeca a persistir os buckets de metricas de
	// requisicao assim que o app sobe (unref() no timer, ver
	// metricsCollector.js — nunca impede o processo de encerrar).
	metricsCollector.startMetricsFlusher();

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
	app.use(prometheusMetrics.prometheusMiddleware);
	// Sem autenticacao de proposito — o Prometheus da VPS faz scrape direto
	// em 127.0.0.1:<porta>, nunca atraves do nginx publico (ver comentario
	// em observabilidade/prometheusMetrics.js).
	app.get("/metrics", prometheusMetrics.metricsRoute);
	app.use(
		rateLimit({
			windowMs: 60 * 1000,
			limit: Number(process.env.FINAN_RATE_LIMIT_PER_MINUTE || 600),
			standardHeaders: true,
			legacyHeaders: false,
		}),
	);

	app.use("/api/finan/health", healthRoutes);
	app.use("/api/v1/health", apiV1HealthRoutes);
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
	app.use("/api/finan/brasilapi", brasilapiRoutes);
	app.use("/api/finan/integracoes", integrationsRoutes);
	app.use("/api/finan/configuracoes", settingsRoutes);
	app.use("/api/finan/usuarios", usersRoutes);
	app.use("/api/finan/pin-admin", pinAdminRoutes);
	app.use("/api/finan/pendencias", pendenciasRoutes);
	app.use("/api/finan/qualidade-dados", qualidadeDadosRoutes);
	app.use("/api/finan/anexos", anexosRoutes);
	app.use("/api/finan/financeirinho", financeirinhoRoutes);
	app.use("/api/finan/fechamento", fechamentoRoutes);
	app.use("/api/finan/fornecedores", fornecedoresRoutes);
	app.use("/api/finan/contratos", contratosRoutes);
	app.use("/api/finan/metas", metasRoutes);
	app.use("/api/finan/navegacao", navegacaoRoutes);
	app.use("/api/finan/indicadores", indicadoresRoutes);
	app.use("/api/finan/preferencias", preferenciasRoutes);
	app.use("/api/finan/busca", buscaRoutes);
	app.use("/api/finan/insights", insightsRoutes);
	app.use("/api/finan/inteligencia", inteligenciaRoutes);
	app.use("/api/finan/notas", notasRoutes);
	app.use("/api/finan/contas-pagar", contasPagarRoutes);
	app.use("/api/finan/contas-receber", contasReceberRoutes);
	app.use("/api/finan/documentos", documentosRoutes);
	app.use("/api/finan/calendario-financeiro", calendarioRoutes);
	app.use("/api/finan/push", pushRoutes);
	app.use("/api/finan/jobs", jobsRoutes);
	app.use("/api/finan/importador", importadorRoutes);
	app.use("/api/finan/regras-financeiras", regrasRoutes);
	app.use("/api/finan/briefing", briefingRoutes);
	app.use("/api/finan/business-case", businessCaseRoutes);
	app.use("/api/finan/webhooks", webhooksRoutes);
	app.use("/api/finan/conciliacao", conciliacaoRoutes);
	app.use("/api/finan/observabilidade", observabilidadeRoutes);
	// /docs precisa vir ANTES de /api/v1 — o router de /api/v1 tem seu
	// proprio catch-all 404 no final (ver apiV1/router.js), que engoliria
	// qualquer sub-rota registrada depois dele.
	app.use("/api/v1/docs", apiV1DocsRoutes);
	app.use("/api/v1", createApiV1Router());

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
