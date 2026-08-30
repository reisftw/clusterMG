const express = require("express");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const db = require("./db");
const apiStatus = require("./apiStatus");
const databaseBackups = require("./databaseBackups");
const documents = require("./documents");
const auditLog = require("./auditLog");
const notificationsService = require("./notificationsService");
const agendamentoEsteiraCommands = require("./agendamentoEsteiraCommands");
const evolutionMessaging = require("./evolutionMessaging");
const agendamentoConfirmacao = require("./agendamentoConfirmacao");
const antiBot = require("./antiBot");
const atendimentoService = require("./atendimento/atendimentoService");
const emailService = require("./emailService");
const operationalImports = require("./operationalImports");
const sempreIntegration = require("./sempreIntegration");
const tecnicosBolsaAuditoria = require("./tecnicosBolsaAuditoria");
const logisticaIntegration = require("./logisticaIntegration");
const hubsoftIntegration = require("./hubsoftIntegration");
const cvortexIntegration = require("./cvortexIntegration");
const seniorIntegration = require("./seniorIntegration");
const rolePermissions = require("./rolePermissions");
const createAgendamentoConfirmacaoAdminRouter = require("./agendamentoConfirmacaoAdmin/routes/agendamentoConfirmacaoAdminRoutes");
const createAtendimentoRouter = require("./atendimento/routes/atendimentoRoutes");
const createCvortexAdminRouter = require("./cvortexAdmin/routes/cvortexAdminRoutes");
const createDatabaseBackupsAdminRouter = require("./databaseBackupsAdmin/routes/databaseBackupsAdminRoutes");
const createEmailAdminRouter = require("./emailAdmin/routes/emailAdminRoutes");
const createFinanceiroRouter = require("./financeiro/routes/financeiroRoutes");
const createHealthRealtimeRouter = require("./healthRealtime/routes/healthRealtimeRoutes");
const createHubsoftAdminRouter = require("./hubsoftAdmin/routes/hubsoftAdminRoutes");
const createLogisticaRouter = require("./logistica/routes/logisticaRoutes");
const createMensageriaEvolutionRouter = require("./mensageriaEvolution/routes/mensageriaEvolutionRoutes");
const metrics = require("./metrics");
const vpnAccess = require("./vpnAccess");
const createNotificationsRouter = require("./notifications/routes/notificationsRoutes");
const createSeniorAdminRouter = require("./seniorAdmin/routes/seniorAdminRoutes");
const createWebhooksRouter = require("./webhooks/routes/webhooksRoutes");
const { createImoveisRouter } = require("./imoveis");
const createDocumentosRouter = require("./documentos/routes/documentosRoutes");
const documentosService = require("./documentos/services/documentosService");
const { attachRealtimeClient, broadcastRealtime } = require("./realtime");
const {
	buildSnapshotDomain,
	getCachedPublicDashboard,
} = require("./publicDashboard");
const {
	canReadSnapshotDomain,
	changeOwnPassword,
	createPasswordResetToken,
	createPasswordResetTokenByEmail,
	createCsrfToken,
	createLocalUser,
	deleteLocalUser,
	getGoogleOAuthConfig,
	getOktaOAuthConfig,
	getImportedUserProfile,
	getLocalUserByEmail,
	loginWithGoogleIdToken,
	loginWithOktaIdToken,
	loginWithPassword,
	makeTemporaryPassword,
	requireAuthenticated,
	requireRoles,
	renewSessionFromPayload,
	revokeSession,
	resetLocalUserPassword,
	resetPasswordWithToken,
	startEmailMfaLogin,
	TOKEN_TTL_SECONDS,
	updateLocalUser,
	verifyEmailMfaLogin,
	verifyCsrfToken,
} = require("./auth");

const uploadRoot = path.resolve(
	process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"),
);
const avatarUpload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: Number(process.env.AVATAR_UPLOAD_LIMIT_BYTES || 600 * 1024),
	},
	fileFilter: (_req, file, cb) => {
		const mime = String(file?.mimetype || "").toLowerCase();
		const name = String(file?.originalname || "").toLowerCase();
		const allowed =
			["image/png", "image/jpeg"].includes(mime) && /\.(png|jpe?g)$/.test(name);
		if (!allowed) {
			cb(new Error("Use apenas imagem JPG ou PNG."));
			return;
		}
		cb(null, true);
	},
});

function timingSafeEqualText(left, right) {
	const leftBuffer = Buffer.from(String(left || ""));
	const rightBuffer = Buffer.from(String(right || ""));
	if (leftBuffer.length !== rightBuffer.length) return false;
	return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function uploadAvatarFile(req, res, next) {
	avatarUpload.single("avatar")(req, res, (error) => {
		if (!error) {
			next();
			return;
		}
		if (error instanceof multer.MulterError) {
			res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
				error:
					error.code === "LIMIT_FILE_SIZE"
						? "A imagem deve ter no máximo 600 KB."
						: `Erro no upload: ${error.message}`,
			});
			return;
		}
		if (error?.message === "Use apenas imagem JPG ou PNG.") {
			res.status(400).json({ error: error.message });
			return;
		}
		next(error);
	});
}

function isValidAvatarBuffer(file) {
	if (!file?.buffer?.length) return false;
	const header4 = file.buffer.subarray(0, 4);
	const header3 = file.buffer.subarray(0, 3);
	return (
		header4.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ||
		header3.equals(Buffer.from([0xff, 0xd8, 0xff]))
	);
}

async function saveAvatarUpload(file, prefix = "avatar") {
	if (!isValidAvatarBuffer(file)) {
		const error = new Error(
			"Arquivo inválido ou corrompido. Envie JPG ou PNG.",
		);
		error.statusCode = 400;
		throw error;
	}
	const extension =
		String(file.mimetype || "").toLowerCase() === "image/png" ? "png" : "jpg";
	const avatarsDir = path.join(uploadRoot, "avatars");
	await fs.mkdir(avatarsDir, { recursive: true });
	const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${extension}`;
	await fs.writeFile(path.join(avatarsDir, filename), file.buffer);
	return `/api/uploads/avatars/${filename}`;
}

function requireInternalToken(req, res, next) {
	const expected = process.env.INTERNAL_API_TOKEN;
	if (!expected || expected.length < 24) {
		res.status(503).json({ error: "Token interno nao configurado." });
		return;
	}

	const provided = req.get("x-internal-api-token") || "";
	if (!timingSafeEqualText(provided, expected)) {
		res.status(401).json({ error: "Token interno invalido." });
		return;
	}

	next();
}

function normalizeUserRole(role) {
	return String(role || "")
		.trim()
		.toLowerCase();
}

const ADMIN_ROLES = ["admin"];
const DOCUMENTOS_CONFIG_ROLES = ["admin", "supervisor_administrativo"];
const USER_MANAGED_ROLES = [
	"admin",
	"backoffice_retirada",
	"supervisor",
	"supervisor_administrativo",
	"analista_administrativo",
	"lider_empresa",
	"agente_autorizado",
	"backoffice",
	"visitante",
];
const USER_MANAGER_ROLES = ["admin", "supervisor", "supervisor_administrativo"];
const SUPERVISOR_MANAGED_USER_ROLES = ["backoffice", "lider_empresa"];
const ADMINISTRATIVO_MANAGED_USER_ROLES = [
	"analista_administrativo",
	"lider_empresa",
	"agente_autorizado",
];
const SCOPED_ROLE_MANAGEMENT_PERMISSIONS = new Set([
	"configuracao.usuarios.manage",
	"configuracao.cargos_permissoes.manage",
	"manage_users",
	"manage_roles",
]);
const SCOPED_ROLE_BASELINE_PERMISSIONS = new Set([
	"destaque.dashboard.view",
	"view_dashboard",
	"configuracao.usuarios.view",
	"configuracao.cargos_permissoes.view",
]);
const SCOPED_ROLE_BLOCKED_GRANT_PERMISSIONS = new Set([
	"configuracao.usuarios.manage",
	"configuracao.cargos_permissoes.manage",
	"manage_users",
	"manage_roles",
	"*",
]);
const ADMINISTRATIVO_LEGACY_PERMISSION_PREFIXES = [
	"view_documentos",
	"manage_documentos",
	"view_insumos",
	"manage_insumos",
	"view_imoveis",
	"manage_imoveis",
	"view_empresas",
	"manage_empresas",
];
const FULL_OPERATION_ROLES = ["admin", "backoffice_retirada", "supervisor"];
const DASHBOARD_ROLES = [
	...FULL_OPERATION_ROLES,
	"lider_empresa",
	"backoffice",
	"estoque",
	"supervisor_estoque",
];
const ACERTO_ROLES = ["admin", "supervisor", "backoffice"];
const ESTOQUE_INTEGRADO_ROLES = [
	...new Set([...FULL_OPERATION_ROLES, ...ACERTO_ROLES]),
];
const TECNICOS_BOLSA_AUDITORIA_ROLES = [
	"admin",
	"supervisor",
	"backoffice",
	"backoffice_retirada",
	"lider_empresa",
];
const TECNICOS_BOLSA_AUDITORIA_VIEW_PERMISSIONS = [
	"tecnicos.auditoria_bolsa.view",
	"tecnicos.auditoria_bolsa.manage",
];
const TECNICOS_BOLSA_AUDITORIA_MANAGE_PERMISSIONS = [
	"tecnicos.auditoria_bolsa.manage",
];
const REGIONAL_SCOPED_ACERTO_ROLES = ["supervisor"];
const EMPRESAS_COLLECTION = "empresas_tecnicos";
const ADMINISTRATIVO_DOCUMENTOS_ROLES = [
	"supervisor_administrativo",
	"analista_administrativo",
];
const EMPRESAS_VIEW_ROLES = [
	...DASHBOARD_ROLES,
	...ADMINISTRATIVO_DOCUMENTOS_ROLES,
	"agente_autorizado",
];
const EMPRESAS_WRITE_ROLES = [
	...FULL_OPERATION_ROLES,
	...ADMINISTRATIVO_DOCUMENTOS_ROLES,
	"lider_empresa",
	"agente_autorizado",
];
const INSUMOS_ADMINISTRATIVOS_COLLECTIONS = new Set([
	"insumos_administrativos_produtos",
	"insumos_administrativos_retiradas",
	"insumos_administrativos_reposicoes",
	"insumos_administrativos_requisicoes",
	"insumos_administrativos_config",
]);
const INSUMOS_ADMINISTRATIVOS_ROLES = [
	...FULL_OPERATION_ROLES,
	...ADMINISTRATIVO_DOCUMENTOS_ROLES,
];
const INSUMOS_PRODUTOS_COLLECTION = "insumos_administrativos_produtos";
const INSUMOS_RETIRADAS_COLLECTION = "insumos_administrativos_retiradas";
const INSUMOS_REQUISICOES_COLLECTION = "insumos_administrativos_requisicoes";
const INSUMOS_EXPIRATION_CHECK_INTERVAL_MS = Math.max(
	Number(process.env.INSUMOS_EXPIRATION_CHECK_INTERVAL_MS || 60000),
	0,
);
let lastInsumosExpirationCheckAt = 0;
let insumosExpirationPromise = null;
const IMOVEIS_ADMINISTRATIVOS_COLLECTIONS = new Set([
	"imoveis_administrativos",
	"imoveis_administrativos_reajustes",
	"imoveis_administrativos_iptu",
	"imoveis_administrativos_alugueis",
	"imoveis_administrativos_contratos",
]);
const IMOVEIS_ADMINISTRATIVOS_ROLES = [
	"admin",
	...ADMINISTRATIVO_DOCUMENTOS_ROLES,
];
const FINANCEIRO_ROLES = ["admin"];
const PUBLIC_STATIC_CACHE_TTL_MS = Math.max(
	Number(process.env.PUBLIC_STATIC_CACHE_TTL_MS || 10000),
	0,
);
const publicStaticCache = new Map();
const FINANCEIRO_VIEW_PERMISSIONS = [
	"financeiro.visao_geral.view",
	"financeiro.visao_geral.manage",
	"financeiro.contas_pagar.view",
	"financeiro.contas_pagar.manage",
	"financeiro.contas_receber.view",
	"financeiro.contas_receber.manage",
	"financeiro.faturamento.view",
	"financeiro.notas.view",
	"financeiro.chamados.view",
	"financeiro.gestao_orcamento.view",
	"financeiro.gestao_orcamento.manage",
	"financeiro.configuracoes.view",
	"financeiro.configuracoes.manage",
];
const FINANCEIRO_MANAGE_PERMISSIONS = [
	"financeiro.configuracoes.manage",
	"financeiro.gestao_orcamento.manage",
];

const COLLECTION_READ_PERMISSIONS = Object.freeze({
	usuarios: [
		"configuracao.usuarios.view",
		"configuracao.usuarios.manage",
		"manage_users",
	],
	[EMPRESAS_COLLECTION]: [
		"empresas.cadastro.view",
		"empresas.cadastro.manage",
		"view_empresas_tecnicos",
		"manage_empresas_tecnicos",
	],
	agendamentos: [
		"destaque.dashboard.view",
		"view_dashboard",
		"cliente.agendamentos.view",
		"cliente.agendamentos.manage",
		"view_agendamentos",
		"manage_agendamentos",
	],
	agendamentos_logs: [
		"cliente.agendamentos.view",
		"cliente.agendamentos.manage",
		"view_agendamentos",
		"manage_agendamentos",
	],
	acompanhamento_diario: [
		"destaque.diario.view",
		"destaque.diario.manage",
		"view_diario",
	],
	acompanhamento_diario_logs: [
		"destaque.diario.view",
		"destaque.diario.manage",
		"view_diario",
	],
	feriados: [
		"equipe.feriados.view",
		"equipe.feriados.manage",
		"manage_feriados",
		"destaque.dashboard.view",
		"view_dashboard",
	],
	regionais: [
		"configuracao.regionais.view",
		"configuracao.regionais.manage",
		"view_regionais",
		"manage_regionais",
	],
	agentes: [
		"configuracao.agentes.view",
		"configuracao.agentes.manage",
		"view_agentes",
		"manage_agentes",
	],
	agenda: [
		"equipe.agenda.view",
		"equipe.agenda.manage",
		"view_agenda",
		"manage_agenda",
	],
	visitas: ["view_visitas", "manage_visitas"],
	visitas_tecnicos: ["view_visitas", "manage_visitas"],
	visitas_config: ["view_visitas", "manage_visitas"],
	duvidas_retirada: ["view_duvidas", "manage_duvidas"],
	retiradas_solicitacoes: ["view_retiradas", "manage_retiradas"],
	insumos_administrativos_produtos: [
		"administrativo.insumos.view",
		"administrativo.insumos.manage",
		"view_insumos_administrativos",
		"manage_insumos_administrativos",
	],
	insumos_administrativos_retiradas: [
		"administrativo.insumos.view",
		"administrativo.insumos.manage",
		"view_insumos_administrativos",
		"manage_insumos_administrativos",
	],
	insumos_administrativos_reposicoes: [
		"administrativo.insumos.view",
		"administrativo.insumos.manage",
		"view_insumos_administrativos",
		"manage_insumos_administrativos",
	],
	insumos_administrativos_requisicoes: [
		"administrativo.insumos.view",
		"administrativo.insumos.manage",
		"view_insumos_requisicoes",
		"view_insumos_administrativos",
		"manage_insumos_administrativos",
	],
	insumos_administrativos_config: [
		"administrativo.insumos.view",
		"administrativo.insumos.manage",
		"view_insumos_administrativos",
		"manage_insumos_administrativos",
	],
	imoveis_administrativos: [
		"administrativo.imoveis.view",
		"administrativo.imoveis.manage",
		"view_imoveis_administrativos",
		"manage_imoveis_administrativos",
	],
	imoveis_administrativos_reajustes: [
		"administrativo.imoveis.view",
		"administrativo.imoveis.manage",
		"view_imoveis_administrativos",
		"manage_imoveis_administrativos",
	],
	imoveis_administrativos_iptu: [
		"administrativo.imoveis.view",
		"administrativo.imoveis.manage",
		"view_imoveis_administrativos",
		"manage_imoveis_administrativos",
	],
	imoveis_administrativos_alugueis: [
		"administrativo.imoveis.view",
		"administrativo.imoveis.manage",
		"view_imoveis_administrativos",
		"manage_imoveis_administrativos",
	],
	imoveis_administrativos_contratos: [
		"administrativo.imoveis.view",
		"administrativo.imoveis.manage",
		"view_imoveis_administrativos",
		"manage_imoveis_administrativos",
	],
	integracoes_api: [
		"configuracao.integracoes.view",
		"configuracao.integracoes.manage",
		"view_integracoes",
		"manage_integracoes",
	],
	vpn_access: ["configuracao.vpn.view", "configuracao.vpn.manage"],
	vpn_access_logs: ["configuracao.vpn.view", "configuracao.vpn.manage"],
	equipamentos: [
		"estoque.equipamentos.view",
		"estoque.equipamentos.manage",
		"view_equipamentos",
		"manage_equipamentos",
	],
	entregas_tecnicos: [
		"tecnicos.entrega_tecnicos.view",
		"tecnicos.entrega_tecnicos.manage",
		"view_entregas_tecnicos",
		"manage_entregas_tecnicos",
	],
	validacoes_entregas: [
		"tecnicos.entrega_tecnicos.view",
		"tecnicos.entrega_tecnicos.manage",
		"view_entregas_tecnicos",
		"manage_entregas_tecnicos",
	],
	competencias_entregas: [
		"tecnicos.entrega_tecnicos.view",
		"tecnicos.entrega_tecnicos.manage",
		"view_entregas_tecnicos",
		"manage_entregas_tecnicos",
	],
	entregas_tecnicos_config: [
		"tecnicos.entrega_tecnicos.view",
		"tecnicos.entrega_tecnicos.manage",
		"view_entregas_tecnicos",
		"manage_entregas_tecnicos",
	],
	mensageria_config: [
		"mensageria.email_config.view",
		"mensageria.email_config.manage",
		"manage_mensageria",
	],
	mensageria_templates: [
		"mensageria.email_config.view",
		"mensageria.email_config.manage",
		"manage_mensageria",
	],
	mensageria_fila: [
		"mensageria.fila.view",
		"mensageria.fila.manage",
		"manage_mensageria",
	],
	mensageria_historico: [
		"mensageria.enviados.view",
		"mensageria.relatorios.view",
		"view_mensageria",
		"view_mensageria_relatorios",
		"manage_mensageria",
	],
	mensageria_callbacks: [
		"mensageria.callback.view",
		"mensageria.callback.manage",
		"manage_mensageria",
	],
	logistica_pontos: [
		"logistica.logistica.view",
		"logistica.logistica.manage",
		"view_logistica",
		"manage_logistica",
	],
	logistica_cotacoes: [
		"logistica.logistica.view",
		"logistica.logistica.manage",
		"view_logistica",
		"manage_logistica",
	],
	logistica_config: [
		"logistica.logistica.view",
		"logistica.logistica.manage",
		"view_logistica",
		"manage_logistica",
	],
	config: [
		"destaque.dashboard.view",
		"destaque.metas.view",
		"destaque.metas.manage",
		"configuracao.geral.view",
		"configuracao.geral.manage",
		"view_dashboard",
		"view_metas",
		"manage_metas",
		"manage_general_settings",
	],
});

const COLLECTION_WRITE_PERMISSIONS = Object.freeze({
	usuarios: ["configuracao.usuarios.manage", "manage_users"],
	[EMPRESAS_COLLECTION]: [
		"empresas.cadastro.manage",
		"manage_empresas_tecnicos",
	],
	agendamentos: ["cliente.agendamentos.manage", "manage_agendamentos"],
	agendamentos_logs: ["cliente.agendamentos.manage", "manage_agendamentos"],
	acompanhamento_diario: ["destaque.diario.manage"],
	acompanhamento_diario_logs: ["destaque.diario.manage"],
	feriados: ["equipe.feriados.manage", "manage_feriados"],
	regionais: ["configuracao.regionais.manage", "manage_regionais"],
	agentes: ["configuracao.agentes.manage", "manage_agentes"],
	agenda: ["equipe.agenda.manage", "manage_agenda"],
	visitas: ["manage_visitas"],
	visitas_tecnicos: ["manage_visitas"],
	visitas_config: ["manage_visitas"],
	duvidas_retirada: ["manage_duvidas"],
	retiradas_solicitacoes: ["manage_retiradas"],
	insumos_administrativos_produtos: [
		"administrativo.insumos.manage",
		"manage_insumos_administrativos",
	],
	insumos_administrativos_retiradas: [
		"administrativo.insumos.manage",
		"manage_insumos_administrativos",
	],
	insumos_administrativos_reposicoes: [
		"administrativo.insumos.manage",
		"manage_insumos_administrativos",
	],
	insumos_administrativos_requisicoes: [
		"administrativo.insumos.manage",
		"manage_insumos_administrativos",
	],
	insumos_administrativos_config: [
		"administrativo.insumos.manage",
		"manage_insumos_administrativos",
	],
	imoveis_administrativos: [
		"administrativo.imoveis.manage",
		"manage_imoveis_administrativos",
	],
	imoveis_administrativos_reajustes: [
		"administrativo.imoveis.manage",
		"manage_imoveis_administrativos",
	],
	imoveis_administrativos_iptu: [
		"administrativo.imoveis.manage",
		"manage_imoveis_administrativos",
	],
	imoveis_administrativos_alugueis: [
		"administrativo.imoveis.manage",
		"manage_imoveis_administrativos",
	],
	imoveis_administrativos_contratos: [
		"administrativo.imoveis.manage",
		"manage_imoveis_administrativos",
	],
	integracoes_api: ["configuracao.integracoes.manage", "manage_integracoes"],
	vpn_access: ["configuracao.vpn.manage"],
	vpn_access_logs: ["configuracao.vpn.manage"],
	equipamentos: ["estoque.equipamentos.manage", "manage_equipamentos"],
	entregas_tecnicos: [
		"tecnicos.entrega_tecnicos.manage",
		"manage_entregas_tecnicos",
	],
	validacoes_entregas: [
		"tecnicos.entrega_tecnicos.manage",
		"manage_entregas_tecnicos",
	],
	competencias_entregas: [
		"tecnicos.entrega_tecnicos.manage",
		"manage_entregas_tecnicos",
	],
	entregas_tecnicos_config: [
		"tecnicos.entrega_tecnicos.manage",
		"manage_entregas_tecnicos",
	],
	mensageria_config: ["mensageria.email_config.manage", "manage_mensageria"],
	mensageria_templates: ["mensageria.email_config.manage", "manage_mensageria"],
	mensageria_fila: ["mensageria.fila.manage", "manage_mensageria"],
	mensageria_historico: ["manage_mensageria"],
	mensageria_callbacks: ["mensageria.callback.manage", "manage_mensageria"],
	logistica_pontos: ["logistica.logistica.manage", "manage_logistica"],
	logistica_cotacoes: ["logistica.logistica.manage", "manage_logistica"],
	logistica_config: ["logistica.logistica.manage", "manage_logistica"],
	config: [
		"destaque.metas.manage",
		"configuracao.geral.manage",
		"manage_metas",
		"manage_general_settings",
	],
});

function hasRole(user, roles) {
	return roles.includes(normalizeUserRole(user?.role));
}

function getUserPermissions(user = {}) {
	return Array.isArray(user?.profile?.permissions)
		? user.profile.permissions
		: Array.isArray(user?.permissions)
			? user.permissions
			: [];
}

function hasPermission(user, permission) {
	if (!permission) return false;
	const role = normalizeUserRole(user?.role || user?.profile?.role);
	if (role === "admin") return true;
	const permissions = new Set(getUserPermissions(user));
	if (permissions.has("*") || permissions.has(permission)) return true;
	if (String(permission).endsWith(".view")) {
		const managePermission = String(permission).replace(/\.view$/, ".manage");
		if (permissions.has(managePermission)) return true;
	}
	return false;
}

function hasAnyPermission(user, permissions = []) {
	return (Array.isArray(permissions) ? permissions : [permissions]).some(
		(permission) => hasPermission(user, permission),
	);
}

function requireAnyPermission(permissions, fallbackRoles = []) {
	return (req, res, next) => {
		if (
			hasAnyPermission(req.user, permissions) ||
			(fallbackRoles.length && hasRole(req.user, fallbackRoles))
		) {
			next();
			return;
		}
		res.status(403).json({ error: "Permissao insuficiente." });
	};
}

function getPublicStaticCacheKey(domain, { compact = false } = {}) {
	const key = String(domain || "").trim();
	return key ? `${key}:${compact ? "compact" : "full"}` : "";
}

function getCachedPublicStaticSnapshot(domain, options = {}) {
	const key = String(domain || "").trim();
	if (!PUBLIC_STATIC_CACHE_TTL_MS || !key) return null;
	const cached = publicStaticCache.get(
		getPublicStaticCacheKey(domain, options),
	);
	if (!cached) return null;
	if (Date.now() - cached.createdAt > PUBLIC_STATIC_CACHE_TTL_MS) {
		publicStaticCache.delete(getPublicStaticCacheKey(domain, options));
		return null;
	}
	return {
		data: cached.data,
		cacheStatus: "HIT",
		cacheAgeMs: Date.now() - cached.createdAt,
	};
}

function setCachedPublicStaticSnapshot(domain, data, options = {}) {
	if (!PUBLIC_STATIC_CACHE_TTL_MS || !domain || !data) return;
	publicStaticCache.set(getPublicStaticCacheKey(domain, options), {
		createdAt: Date.now(),
		data,
	});
	if (publicStaticCache.size > 20) {
		const firstKey = publicStaticCache.keys().next().value;
		if (firstKey) publicStaticCache.delete(firstKey);
	}
}

function normalizeComparableText(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

function getUserRegional(user) {
	return String(user?.regional || user?.profile?.regional || "").trim();
}

function getRecordRegional(data = {}) {
	return String(
		data.regional ||
			data.regionalNome ||
			data.regional_nome ||
			data.filial_id ||
			data.filial ||
			"",
	).trim();
}

function isRegionalScopedAcertoUser(user) {
	return hasRole(user, REGIONAL_SCOPED_ACERTO_ROLES);
}

const PUBLIC_COLLECTIONS = new Set([
	"ordens_abertas",
	"match_os_abertas",
	"ordens_legadas",
]);
const PUBLIC_DOCUMENTS = new Set([
	"public_dashboard/mapa_os",
	"public_dashboard/match_os",
	"public_dashboard/agentes_match_os",
	"public_dashboard/mapa_os_legadas",
]);
const ACERTO_ESTOQUE_COLLECTIONS = new Set([
	"acerto_estoque_empresas",
	"acerto_estoque_tecnicos",
	"acerto_estoque_agendas",
	"acerto_estoque_produtos",
	"acerto_estoque_acertos",
	"estoque_equipamentos",
	"estoque_equipamentos_logs",
	"estoque_equipamentos_tratativas",
]);
const REGIONAL_SCOPED_ACERTO_COLLECTIONS = new Set([
	"acerto_estoque_empresas",
	"acerto_estoque_tecnicos",
	"acerto_estoque_agendas",
	"acerto_estoque_produtos",
	"acerto_estoque_acertos",
]);

function isAcertoEstoqueCollection(collectionPath) {
	return REGIONAL_SCOPED_ACERTO_COLLECTIONS.has(
		String(collectionPath || "").trim(),
	);
}

function canAccessRegionalRecord(user, data = {}) {
	if (!isRegionalScopedAcertoUser(user)) return true;
	const userRegional = normalizeComparableText(getUserRegional(user));
	if (!userRegional) return false;
	const recordRegional = normalizeComparableText(getRecordRegional(data));
	return Boolean(recordRegional && recordRegional === userRegional);
}

function filterRegionalDocuments(user, collectionPath, items = []) {
	if (
		!isAcertoEstoqueCollection(collectionPath) ||
		!isRegionalScopedAcertoUser(user)
	)
		return items;
	return items.filter((item) =>
		canAccessRegionalRecord(user, item?.data || {}),
	);
}

function applyRegionalScopeToData(user, collectionPath, data = {}) {
	if (
		!isAcertoEstoqueCollection(collectionPath) ||
		!isRegionalScopedAcertoUser(user)
	)
		return data || {};
	const userRegional = getUserRegional(user);
	const existingRegional = getRecordRegional(data);
	if (
		existingRegional &&
		normalizeComparableText(existingRegional) !==
			normalizeComparableText(userRegional)
	) {
		const error = new Error(
			"Supervisor so pode alterar registros da propria regional.",
		);
		error.statusCode = 403;
		throw error;
	}
	return { ...(data || {}), regional: userRegional };
}

function getUserEmpresaId(user) {
	return String(
		user?.empresaId ||
			user?.empresa_id ||
			user?.profile?.empresaId ||
			user?.profile?.empresa_id ||
			"",
	).trim();
}

function getUserEmpresaNome(user) {
	return String(
		user?.empresaNome ||
			user?.empresa_nome ||
			user?.profile?.empresaNome ||
			user?.profile?.empresa_nome ||
			"",
	).trim();
}

function isEmpresaLeader(user) {
	return hasRole(user, ["lider_empresa", "agente_autorizado"]);
}

function canAccessEmpresaRecord(user, documentId, data = {}) {
	if (hasRole(user, ["supervisor"])) {
		return (
			normalizeComparableText(getUserRegional(user)) ===
			normalizeComparableText(getRecordRegional(data))
		);
	}
	if (!isEmpresaLeader(user)) return true;
	const empresaId = getUserEmpresaId(user);
	const empresaNome = normalizeComparableText(getUserEmpresaNome(user));
	const recordNome = normalizeComparableText(data.nome || data.empresa);
	return Boolean(
		(empresaId && empresaId === documentId) ||
			(empresaNome && recordNome && empresaNome === recordNome),
	);
}

function filterEmpresaDocuments(user, collectionPath, items = []) {
	if (
		String(collectionPath || "") !== EMPRESAS_COLLECTION ||
		(!isEmpresaLeader(user) && !hasRole(user, ["supervisor"]))
	) {
		return items;
	}
	return items.filter((item) =>
		canAccessEmpresaRecord(user, item?.documentId || "", item?.data || {}),
	);
}

function applyEmpresaScopeToData(user, collectionPath, documentId, data = {}) {
	if (
		String(collectionPath || "") !== EMPRESAS_COLLECTION ||
		!isEmpresaLeader(user)
	)
		return data || {};
	if (!canAccessEmpresaRecord(user, documentId, data || {})) {
		const error = new Error("Este perfil so pode alterar a propria empresa.");
		error.statusCode = 403;
		throw error;
	}
	return data || {};
}

function isGoogleDriveConfigured() {
	return Boolean(
		process.env.GOOGLE_DRIVE_FOLDER_ID &&
			process.env.GOOGLE_APPLICATION_CREDENTIALS,
	);
}

async function ensureEmpresaDriveFolderIfConfigured(
	collectionPath,
	documentId,
	user,
) {
	if (
		String(collectionPath || "") !== EMPRESAS_COLLECTION ||
		!isGoogleDriveConfigured()
	)
		return;
	try {
		await documentosService.createClientFolder({ empresaId: documentId, user });
	} catch (error) {
		console.warn(
			"[documentos] nao foi possivel criar pasta da empresa no Drive:",
			error.message,
		);
	}
}

function normalizeStockNumber(value) {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function isProdutoInLowStock(data = {}) {
	if (String(data.status || "ativo").toLowerCase() !== "ativo") return false;
	const minimo = normalizeStockNumber(data.estoque_minimo);
	if (minimo <= 0) return false;
	return normalizeStockNumber(data.estoque_atual) <= minimo;
}

function buildLowStockAlertSignature(data = {}) {
	return [
		String(data.nome || "").trim(),
		normalizeStockNumber(data.estoque_atual),
		normalizeStockNumber(data.estoque_minimo),
		String(data.unidade || "").trim(),
	].join("|");
}

async function listSupervisoresAdministrativosForEmail() {
	const result = await db.query(
		`select uid, email, display_name as "displayName"
       from app_users
      where lower(role) = 'supervisor_administrativo'
        and coalesce(disabled, false) = false
        and coalesce(email, '') <> ''
      order by display_name, email`,
	);
	return result.rows;
}

async function notifyAdministrativeLowStock({
	documentPath,
	documentId,
	data = {},
	previousData = {},
}) {
	if (!isProdutoInLowStock(data) || isProdutoInLowStock(previousData)) return;

	const recipients = await listSupervisoresAdministrativosForEmail();
	if (!recipients.length) return;

	const appUrl = process.env.PUBLIC_APP_URL || "https://retiradas.tech";
	const produtoNome = String(data.nome || "Insumo administrativo").trim();
	const estoqueAtual = normalizeStockNumber(data.estoque_atual);
	const estoqueMinimo = normalizeStockNumber(data.estoque_minimo);
	const unidade = String(data.unidade || "unidade").trim();
	const categoria = String(data.categoria || "-").trim();
	const observacao = String(data.observacao || "").trim();

	const to = recipients.map((recipient) => recipient.email).join(",");
	await emailService.sendInsumosLowStockEmail({
		to,
		recipients: recipients.map((recipient) => ({
			uid: recipient.uid,
			email: recipient.email,
			nome: recipient.displayName,
			displayName: recipient.displayName,
		})),
		produto: {
			documentPath,
			documentId,
			nome: produtoNome,
			estoqueAtual,
			estoqueMinimo,
			unidade,
			categoria,
			observacao,
			appUrl,
		},
	});

	await documents.upsertDocument({
		path: documentPath,
		collectionPath: INSUMOS_PRODUTOS_COLLECTION,
		documentId,
		parentPath: null,
		data: {
			...data,
			low_stock_alert_sent_at: new Date().toISOString(),
			low_stock_alert_signature: buildLowStockAlertSignature(data),
		},
	});
}

function buildProdutoDataWithLowStockReset(data = {}) {
	if (isProdutoInLowStock(data)) return data;
	if (!data.low_stock_alert_sent_at && !data.low_stock_alert_signature)
		return data;
	const next = { ...(data || {}) };
	delete next.low_stock_alert_sent_at;
	delete next.low_stock_alert_signature;
	return next;
}

async function handleInsumosLowStockAfterWrite({
	collectionPath,
	documentPath,
	documentId,
	data = {},
	existing = null,
}) {
	if (collectionPath !== INSUMOS_PRODUTOS_COLLECTION) return;
	const previousData = existing?.data || {};
	const normalizedData = buildProdutoDataWithLowStockReset(data);

	if (normalizedData !== data) {
		await documents.upsertDocument({
			path: documentPath,
			collectionPath,
			documentId,
			parentPath: null,
			data: normalizedData,
		});
	}

	try {
		await notifyAdministrativeLowStock({
			documentPath,
			documentId,
			data: normalizedData,
			previousData,
		});
	} catch (error) {
		console.error(
			"[insumos] Falha ao enviar alerta de estoque baixo:",
			error?.message || error,
		);
	}
}

function isInsumosManager(user) {
	return hasRole(user, INSUMOS_ADMINISTRATIVOS_ROLES);
}

function getUserDisplayName(user = {}) {
	return String(
		user.displayName ||
			user.display_name ||
			user.nome ||
			user.email ||
			user.uid ||
			"Usuario",
	).trim();
}

function getUserEmail(user = {}) {
	return String(user.email || "").trim();
}

function normalizeRequestQuantity(value) {
	const parsed = Number(value || 0);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(0, Math.trunc(parsed));
}

function buildInsumosRequestProtocol() {
	const now = new Date();
	const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
	const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
	return `REQ-${ymd}-${suffix}`;
}

function formatSaoPauloDateTime(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
		timeZone: "America/Sao_Paulo",
	});
}

function insumosRequestPath(id) {
	return `${INSUMOS_REQUISICOES_COLLECTION}/${id}`;
}

function addInsumosAudit(data = {}, entry = {}) {
	const history = Array.isArray(data.auditoria) ? data.auditoria : [];
	return [
		...history,
		{
			...entry,
			data: entry.data || new Date().toISOString(),
		},
	];
}

function normalizeInsumosRequestRow(row = {}) {
	return {
		id: row.documentId,
		path: row.path,
		...(row.data || {}),
	};
}

async function getDocumentForUpdate(client, documentPath) {
	const result = await client.query(
		`select path, collection_path as "collectionPath", document_id as "documentId", data
       from app_documents
      where path = $1
      for update`,
		[documentPath],
	);
	return result.rows[0] || null;
}

async function updateDocumentData(client, documentPath, data = {}) {
	await client.query(
		`update app_documents
        set data = $2::jsonb
      where path = $1`,
		[documentPath, JSON.stringify(data || {})],
	);
}

async function insertDocumentData(
	client,
	{ path: documentPath, collectionPath, documentId, data = {} },
) {
	await client.query(
		`insert into app_documents (path, collection_path, document_id, parent_path, data)
     values ($1, $2, $3, null, $4::jsonb)`,
		[documentPath, collectionPath, documentId, JSON.stringify(data || {})],
	);
}

async function expireOverdueInsumosRequests() {
	const client = await db.connect();
	const expired = [];
	try {
		await client.query("begin");
		const result = await client.query(
			`select path, document_id as "documentId", data
         from app_documents
        where collection_path = $1
          and data->>'status' = 'aprovada_aguardando_retirada'
          and nullif(data->>'expira_em', '')::timestamptz <= now()
        for update`,
			[INSUMOS_REQUISICOES_COLLECTION],
		);

		for (const request of result.rows) {
			const data = request.data || {};
			const productPath = `${INSUMOS_PRODUTOS_COLLECTION}/${data.produto_id}`;
			const product = await getDocumentForUpdate(client, productPath);
			if (product) {
				const productData = product.data || {};
				const quantidade = normalizeRequestQuantity(data.quantidade);
				await updateDocumentData(client, productPath, {
					...productData,
					estoque_atual:
						normalizeStockNumber(productData.estoque_atual) + quantidade,
					atualizado_em: new Date().toISOString(),
					atualizado_por: "Expiração automática de requisição",
				});
			}

			const updated = {
				...data,
				status: "expirada",
				atualizado_em: new Date().toISOString(),
				expirado_em: new Date().toISOString(),
				auditoria: addInsumosAudit(data, {
					acao: "expirou",
					usuario_nome: "Sistema",
					observacao: "Prazo de 24h expirado. Itens devolvidos ao estoque.",
				}),
			};
			await updateDocumentData(client, request.path, updated);
			expired.push({ id: request.documentId, ...updated });
		}

		await client.query("commit");
		return expired;
	} catch (error) {
		await client.query("rollback").catch(() => null);
		throw error;
	} finally {
		client.release();
	}
}

async function expireOverdueInsumosRequestsThrottled({ force = false } = {}) {
	const now = Date.now();
	if (
		!force &&
		INSUMOS_EXPIRATION_CHECK_INTERVAL_MS > 0 &&
		now - lastInsumosExpirationCheckAt < INSUMOS_EXPIRATION_CHECK_INTERVAL_MS
	) {
		return [];
	}
	if (insumosExpirationPromise) return insumosExpirationPromise;

	lastInsumosExpirationCheckAt = now;
	insumosExpirationPromise = expireOverdueInsumosRequests().finally(() => {
		insumosExpirationPromise = null;
	});
	return insumosExpirationPromise;
}

async function mergeUserProfileExtras(uid, body = {}) {
	const allowed = {};
	if (body.empresaId !== undefined || body.empresa_id !== undefined) {
		allowed.empresaId = String(body.empresaId || body.empresa_id || "").trim();
	}
	if (body.empresaNome !== undefined || body.empresa_nome !== undefined) {
		allowed.empresaNome = String(
			body.empresaNome || body.empresa_nome || "",
		).trim();
	}
	if (body.avatarUrl !== undefined || body.avatar_url !== undefined) {
		const avatarUrl = String(body.avatarUrl || body.avatar_url || "").trim();
		if (avatarUrl && !avatarUrl.startsWith("/api/uploads/avatars/")) {
			const error = new Error("Avatar inválido.");
			error.statusCode = 400;
			throw error;
		}
		allowed.avatarUrl = avatarUrl;
		allowed.avatarDataUrl = "";
	}
	if (
		body.insumosBaseId !== undefined ||
		body.insumos_base_id !== undefined ||
		body.baseInsumosId !== undefined
	) {
		allowed.insumosBaseId = String(
			body.insumosBaseId || body.insumos_base_id || body.baseInsumosId || "",
		).trim();
	}
	if (
		body.insumosBaseNome !== undefined ||
		body.insumos_base_nome !== undefined ||
		body.baseInsumosNome !== undefined
	) {
		allowed.insumosBaseNome = String(
			body.insumosBaseNome ||
				body.insumos_base_nome ||
				body.baseInsumosNome ||
				"",
		).trim();
	}
	if (body.insumosCategoriasVer !== undefined) {
		allowed.insumosCategoriasVer = Array.isArray(body.insumosCategoriasVer)
			? body.insumosCategoriasVer
					.map((item) => String(item || "").trim())
					.filter(Boolean)
			: [];
	}
	if (body.insumosCategoriasSolicitar !== undefined) {
		allowed.insumosCategoriasSolicitar = Array.isArray(
			body.insumosCategoriasSolicitar,
		)
			? body.insumosCategoriasSolicitar
					.map((item) => String(item || "").trim())
					.filter(Boolean)
			: [];
	}
	if (!Object.keys(allowed).length) return;

	const current = await documents.getDocument(`usuarios/${uid}`);
	await documents.upsertDocument({
		path: `usuarios/${uid}`,
		collectionPath: "usuarios",
		documentId: uid,
		data: {
			...(current?.data || {}),
			...allowed,
			atualizado_em: new Date().toISOString(),
		},
	});
}

function canManageUsers(user) {
	return (
		hasAnyPermission(user, ["configuracao.usuarios.manage", "manage_users"]) ||
		hasRole(user, USER_MANAGER_ROLES)
	);
}

function canViewUsers(user) {
	return (
		canManageUsers(user) ||
		hasAnyPermission(user, ["configuracao.usuarios.view"])
	);
}

async function isKnownManagedRole(role) {
	const normalized = normalizeUserRole(role);
	if (USER_MANAGED_ROLES.includes(normalized)) return true;
	try {
		const roles = await rolePermissions.listRoles();
		return roles.some(
			(item) => item.id === normalized && item.active !== false,
		);
	} catch (error) {
		console.error(
			"[roles] Falha ao validar cargo dinamico:",
			error?.message || error,
		);
		return false;
	}
}

function canSupervisorManageUserRole(role) {
	return SUPERVISOR_MANAGED_USER_ROLES.includes(normalizeUserRole(role));
}

function canAdministrativoManageUserRole(role) {
	return ADMINISTRATIVO_MANAGED_USER_ROLES.includes(normalizeUserRole(role));
}

function getUserPermissionList(user = {}) {
	const permissions = Array.isArray(user?.permissions)
		? user.permissions
		: Array.isArray(user?.profile?.permissions)
			? user.profile.permissions
			: [];
	return permissions
		.map((permission) => String(permission || "").trim())
		.filter(Boolean);
}

function isAdministrativoLegacyPermission(permission) {
	return ADMINISTRATIVO_LEGACY_PERMISSION_PREFIXES.some((prefix) =>
		permission.startsWith(prefix),
	);
}

function getPermissionSection(permission, catalogById = new Map()) {
	const normalized = String(permission || "").trim();
	if (!normalized) return "";
	const catalogItem = catalogById.get(normalized);
	if (catalogItem?.sectionId) return catalogItem.sectionId;
	const legacyCatalogItem = [...catalogById.values()].find(
		(item) => item?.legacyPermission === normalized,
	);
	if (legacyCatalogItem?.sectionId) return legacyCatalogItem.sectionId;
	if (normalized.startsWith("financeiro.")) return "financeiro";
	if (
		normalized.startsWith("administrativo.") ||
		isAdministrativoLegacyPermission(normalized)
	)
		return "administrativo";
	return "";
}

function deriveScopedRoleSections(user = {}) {
	const permissions = getUserPermissionList(user);
	const sections = new Set();
	if (hasRole(user, ["supervisor_administrativo"]))
		sections.add("administrativo");

	permissions.forEach((permission) => {
		if (permission === "*") {
			sections.add("*");
			return;
		}
		if (permission.startsWith("financeiro.")) {
			sections.add("financeiro");
			sections.add("administrativo");
			return;
		}
		if (
			permission.startsWith("administrativo.") ||
			isAdministrativoLegacyPermission(permission)
		) {
			sections.add("administrativo");
		}
	});

	return sections;
}

function canGrantScopedPermission(permission, scope) {
	const normalized = String(permission || "").trim();
	if (!normalized || SCOPED_ROLE_BLOCKED_GRANT_PERMISSIONS.has(normalized))
		return false;
	if (SCOPED_ROLE_BASELINE_PERMISSIONS.has(normalized)) return true;
	const section = getPermissionSection(normalized, scope.catalogById);
	return Boolean(section && scope.sections.has(section));
}

function canScopedManagerAccessRole(role = {}, scope, options = {}) {
	if (!scope || scope.unrestricted) return true;
	const roleId = normalizeUserRole(role.id || role.role);
	if (!roleId || roleId === "admin" || role.active === false) return false;
	const permissions = Array.isArray(role.permissions) ? role.permissions : [];
	if (permissions.includes("*")) return false;
	if (
		options.forUserAssignment &&
		permissions.some((permission) =>
			SCOPED_ROLE_MANAGEMENT_PERMISSIONS.has(permission),
		)
	) {
		return false;
	}
	const scopedPermissions = permissions.filter(
		(permission) => !SCOPED_ROLE_BASELINE_PERMISSIONS.has(permission),
	);
	return (
		scopedPermissions.length > 0 &&
		scopedPermissions.every((permission) =>
			canGrantScopedPermission(permission, scope),
		)
	);
}

async function getScopedRoleManagementScope(user = {}) {
	if (hasRole(user, ADMIN_ROLES)) return { unrestricted: true };
	if (
		!hasAnyPermission(user, [
			"configuracao.usuarios.view",
			"configuracao.usuarios.manage",
			"configuracao.cargos_permissoes.view",
			"configuracao.cargos_permissoes.manage",
			"manage_users",
			"manage_roles",
		])
	) {
		return null;
	}

	const sections = deriveScopedRoleSections(user);
	if (!sections.size || sections.has("*")) return null;

	const [roles, catalog] = await Promise.all([
		rolePermissions.listRoles(),
		rolePermissions.listPermissionCatalog(),
	]);
	const catalogById = new Map(
		catalog.map((permission) => [permission.id, permission]),
	);
	const rolesById = new Map(roles.map((role) => [role.id, role]));

	return {
		catalog,
		catalogById,
		roles,
		rolesById,
		sections,
		unrestricted: false,
	};
}

async function assertScopedRoleCanBeAssigned(user, role) {
	if (hasRole(user, ADMIN_ROLES)) return;
	const scope = await getScopedRoleManagementScope(user);
	if (
		scope &&
		canScopedManagerAccessRole(
			scope.rolesById.get(normalizeUserRole(role)),
			scope,
			{ forUserAssignment: true },
		)
	)
		return;
	const error = new Error(
		"Voce so pode criar ou alterar usuarios em cargos abaixo do seu setor.",
	);
	error.statusCode = 403;
	throw error;
}

function canScopedManagerAccessUserRecord(data = {}, scope) {
	const role = scope?.rolesById?.get(normalizeUserRole(data.role));
	return canScopedManagerAccessRole(role, scope, { forUserAssignment: true });
}

function filterScopedPermissionCatalog(scope) {
	if (!scope || scope.unrestricted) return scope?.catalog || [];
	return scope.catalog.filter((permission) =>
		canGrantScopedPermission(permission.id, scope),
	);
}

async function getRolesPayloadForUser(user = {}) {
	if (hasRole(user, ADMIN_ROLES)) {
		return {
			roles: await rolePermissions.listRoles(),
			permissions: await rolePermissions.listPermissionCatalog(),
		};
	}
	const scope = await getScopedRoleManagementScope(user);
	if (!scope) {
		return { roles: [], permissions: [] };
	}

	return {
		roles: scope.roles.filter((role) =>
			canScopedManagerAccessRole(role, scope),
		),
		permissions: filterScopedPermissionCatalog(scope),
	};
}

async function assertCanSaveRoleForUser(user, roleId, permissions = []) {
	if (hasRole(user, ADMIN_ROLES)) return;
	const scope = await getScopedRoleManagementScope(user);
	if (!scope) {
		const error = new Error("Permissao insuficiente.");
		error.statusCode = 403;
		throw error;
	}

	const normalizedRoleId = normalizeUserRole(roleId);
	if (!normalizedRoleId || normalizedRoleId === "admin") {
		const error = new Error("Este cargo nao pode ser alterado por aqui.");
		error.statusCode = 403;
		throw error;
	}

	const existingRole = scope.rolesById.get(normalizedRoleId);
	if (existingRole && !canScopedManagerAccessRole(existingRole, scope)) {
		const error = new Error("Voce so pode editar cargos do seu setor.");
		error.statusCode = 403;
		throw error;
	}

	const permissionList = (Array.isArray(permissions) ? permissions : [])
		.map((permission) => String(permission || "").trim())
		.filter(Boolean);
	const invalidPermission = permissionList.find(
		(permission) => !canGrantScopedPermission(permission, scope),
	);
	if (invalidPermission) {
		const error = new Error(
			`Permissao fora do seu setor: ${invalidPermission}`,
		);
		error.statusCode = 403;
		throw error;
	}
}

function canSupervisorAccessUserRecord(user, data = {}) {
	if (!hasRole(user, ["supervisor"])) return true;
	const userRegional = normalizeComparableText(getUserRegional(user));
	const recordRegional = normalizeComparableText(getRecordRegional(data));
	return Boolean(
		userRegional &&
			recordRegional &&
			userRegional === recordRegional &&
			canSupervisorManageUserRole(data.role),
	);
}

function canAdministrativoAccessUserRecord(user, data = {}) {
	if (!hasRole(user, ["supervisor_administrativo"])) return true;
	return canAdministrativoManageUserRole(data.role);
}

async function filterUserDocumentsForManager(user, collectionPath, items = []) {
	if (String(collectionPath || "") !== "usuarios") return items;
	if (hasRole(user, ADMIN_ROLES)) return items;
	if (hasRole(user, ["supervisor"])) {
		return items.filter((item) =>
			canSupervisorAccessUserRecord(user, item?.data || {}),
		);
	}
	if (hasRole(user, ["supervisor_administrativo"])) {
		return items.filter((item) =>
			canAdministrativoAccessUserRecord(user, item?.data || {}),
		);
	}
	const scope = await getScopedRoleManagementScope(user);
	if (scope) {
		return items.filter((item) =>
			canScopedManagerAccessUserRecord(item?.data || {}, scope),
		);
	}
	return [];
}

function mapAdminUserRow(row = {}) {
	const profile = row.profile_data || {};
	return {
		id: row.uid,
		uid: row.uid,
		email: row.email || profile.email || "",
		nome:
			row.display_name ||
			profile.nome ||
			profile.displayName ||
			row.email ||
			"",
		role: normalizeUserRole(row.role || profile.role),
		regional: row.regional || profile.regional || "",
		disabled: Boolean(row.disabled),
		trocar_senha: Boolean(row.must_change_password),
		must_change_password: Boolean(row.must_change_password),
		ultimo_login: row.last_login_at || profile.ultimo_login || null,
		last_login_at: row.last_login_at || profile.last_login_at || null,
		ultimo_login_ip: row.last_login_ip || profile.ultimo_login_ip || "",
		ultimo_login_navegador:
			row.last_login_user_agent || profile.ultimo_login_navegador || "",
		login_provider: profile.login_provider || "local",
		criado_por_oauth: Boolean(profile.criado_por_oauth),
		status_oauth: profile.status_oauth || "",
		empresaId: profile.empresaId || profile.empresa_id || "",
		empresaNome: profile.empresaNome || profile.empresa_nome || "",
		avatarUrl: profile.avatarUrl || profile.avatar_url || "",
		avatarDataUrl: profile.avatarDataUrl || profile.avatar_data_url || "",
		criado_em: profile.criado_em || row.created_at || null,
		atualizado_em: profile.atualizado_em || null,
	};
}

async function listManagedUsersForAdmin(user) {
	const result = await db.query(
		`select au.uid, au.email, au.display_name, au.role, au.regional,
            au.disabled, au.must_change_password, au.last_login_at,
            au.last_login_ip, au.last_login_user_agent,
            au.created_at,
            coalesce(ad.data, '{}'::jsonb) as profile_data
       from app_users au
       left join app_documents ad on ad.path = 'usuarios/' || au.uid
      order by coalesce(au.display_name, au.email) asc`,
	);

	const filteredItems = await filterUserDocumentsForManager(
		user,
		"usuarios",
		result.rows.map((row) => ({
			documentId: row.uid,
			data: mapAdminUserRow(row),
		})),
	);
	return filteredItems.map((item) => item.data);
}

async function getUserProfileDocument(uid) {
	const item = await documents.getDocument(`usuarios/${uid}`);
	return item?.data ? { id: uid, ...item.data } : null;
}

async function assertCanCreateManagedUser(user, body = {}) {
	if (hasRole(user, ADMIN_ROLES)) return;
	if (hasRole(user, ["supervisor_administrativo"])) {
		if (canAdministrativoManageUserRole(body.role)) return;
		const error = new Error(
			"Supervisor Administrativo so pode criar Analista Administrativo, Lider Empresa ou Agente Autorizado.",
		);
		error.statusCode = 403;
		throw error;
	}
	if (!hasRole(user, ["supervisor"])) {
		const error = new Error("Permissao insuficiente.");
		error.statusCode = 403;
		throw error;
	}
	if (
		!hasRole(user, ["supervisor"]) &&
		hasAnyPermission(user, ["configuracao.usuarios.manage", "manage_users"])
	) {
		await assertScopedRoleCanBeAssigned(user, body.role);
		return;
	}
	const role = normalizeUserRole(body.role);
	if (!canSupervisorManageUserRole(role)) {
		const error = new Error(
			"Supervisor so pode criar Backoffice ou Lider Empresa.",
		);
		error.statusCode = 403;
		throw error;
	}
	const userRegional = normalizeComparableText(getUserRegional(user));
	const bodyRegional = normalizeComparableText(body.regional);
	if (!userRegional || bodyRegional !== userRegional) {
		const error = new Error(
			"Supervisor so pode criar usuarios da propria regional.",
		);
		error.statusCode = 403;
		throw error;
	}
}

async function assertCanUpdateManagedUser(user, uid, body = {}) {
	if (hasRole(user, ADMIN_ROLES)) return;
	if (hasRole(user, ["supervisor_administrativo"])) {
		const current = await getUserProfileDocument(uid);
		if (!current || !canAdministrativoAccessUserRecord(user, current)) {
			const error = new Error(
				"Supervisor Administrativo so pode alterar Analista Administrativo, Lider Empresa ou Agente Autorizado.",
			);
			error.statusCode = 403;
			throw error;
		}
		const nextRole =
			body.role !== undefined
				? normalizeUserRole(body.role)
				: normalizeUserRole(current.role);
		if (!canAdministrativoManageUserRole(nextRole)) {
			const error = new Error(
				"Supervisor Administrativo so pode manter usuarios como Analista Administrativo, Lider Empresa ou Agente Autorizado.",
			);
			error.statusCode = 403;
			throw error;
		}
		return;
	}
	if (
		!hasRole(user, ["supervisor"]) &&
		hasAnyPermission(user, ["configuracao.usuarios.manage", "manage_users"])
	) {
		const current = await getUserProfileDocument(uid);
		if (!current) {
			const error = new Error("Usuario nao encontrado.");
			error.statusCode = 404;
			throw error;
		}
		await assertScopedRoleCanBeAssigned(user, current.role);
		const nextRole =
			body.role !== undefined
				? normalizeUserRole(body.role)
				: normalizeUserRole(current.role);
		await assertScopedRoleCanBeAssigned(user, nextRole);
		return;
	}
	if (!hasRole(user, ["supervisor"])) {
		const error = new Error("Permissao insuficiente.");
		error.statusCode = 403;
		throw error;
	}

	const current = await getUserProfileDocument(uid);
	if (!current || !canSupervisorAccessUserRecord(user, current)) {
		const error = new Error(
			"Supervisor so pode alterar usuarios da propria regional.",
		);
		error.statusCode = 403;
		throw error;
	}

	const nextRole =
		body.role !== undefined
			? normalizeUserRole(body.role)
			: normalizeUserRole(current.role);
	if (!canSupervisorManageUserRole(nextRole)) {
		const error = new Error(
			"Supervisor so pode manter usuarios como Backoffice ou Lider Empresa.",
		);
		error.statusCode = 403;
		throw error;
	}

	const nextRegional =
		body.regional !== undefined ? body.regional : current.regional;
	if (
		normalizeComparableText(nextRegional) !==
		normalizeComparableText(getUserRegional(user))
	) {
		const error = new Error(
			"Supervisor nao pode mover usuario para outra regional.",
		);
		error.statusCode = 403;
		throw error;
	}
}

const ADMIN_ONLY_COLLECTION_PREFIXES = [
	"app_users",
	"auth_sessions",
	"password_reset_tokens",
	"system_",
	"integracoes",
	"api_status",
	"database_backups",
	"mensageria_config",
	"mensageria_evolution",
	"mensageria_templates",
];

const AUTH_COOKIE_NAME = "retiradas_session";
const CSRF_COOKIE_NAME = "retiradas_csrf";
const TOKEN_RENEW_WINDOW_SECONDS = Number(
	process.env.ACCESS_TOKEN_RENEW_WINDOW_SECONDS || 60 * 60 * 24 * 7,
);

function getAllowedOrigins() {
	return String(process.env.CORS_ORIGIN || "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
}

function isAllowedOrigin(allowedOrigins, origin) {
	if (!origin) return true;
	return allowedOrigins.includes(origin);
}

function isProduction() {
	return process.env.NODE_ENV === "production";
}

function getBaseCookieOptions(maxAgeSeconds) {
	return [
		"Path=/",
		"SameSite=Lax",
		`Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds || 0))}`,
		isProduction() ? "Secure" : "",
	].filter(Boolean);
}

function getAuthCookieOptions(maxAgeSeconds) {
	return ["HttpOnly", ...getBaseCookieOptions(maxAgeSeconds)];
}

function setCsrfCookie(res, csrfToken, maxAgeSeconds) {
	const cookie = `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken || "")}; ${getBaseCookieOptions(maxAgeSeconds).join("; ")}`;
	const previous = res.getHeader("Set-Cookie");
	const cookies = Array.isArray(previous)
		? previous
		: previous
			? [previous]
			: [];
	res.setHeader("Set-Cookie", [...cookies, cookie]);
}

function setAuthCookie(res, token, maxAgeSeconds) {
	const csrfToken = createCsrfToken(token);
	res.setHeader("Set-Cookie", [
		`${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${getAuthCookieOptions(maxAgeSeconds).join("; ")}`,
		`${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; ${getBaseCookieOptions(maxAgeSeconds).join("; ")}`,
	]);
	return csrfToken;
}

function shouldRenewAuthToken(payload) {
	const expiresAt = Number(payload?.exp || 0);
	if (!expiresAt) return true;
	const remainingSeconds = expiresAt - Math.floor(Date.now() / 1000);
	return remainingSeconds <= TOKEN_RENEW_WINDOW_SECONDS;
}

function clearAuthCookie(res) {
	res.setHeader("Set-Cookie", [
		`${AUTH_COOKIE_NAME}=; ${getAuthCookieOptions(0).join("; ")}`,
		`${CSRF_COOKIE_NAME}=; ${getBaseCookieOptions(0).join("; ")}`,
	]);
}

function rejectLargePublicVisit(req, res, next) {
	const contentLength = Number(req.get("content-length") || 0);
	const maxBytes = Number(process.env.PUBLIC_VISIT_MAX_BYTES || 4096);
	if (contentLength > maxBytes) {
		res.status(413).json({ error: "Payload muito grande." });
		return;
	}
	next();
}

function requireCsrfToken(req, res, next) {
	if (verifyCsrfToken(req)) {
		next();
		return;
	}

	res.status(403).json({ error: "Token CSRF invalido ou ausente." });
}

function canReadCollection(user, collectionPath) {
	const collection = String(collectionPath || "").trim();
	if (
		ADMIN_ONLY_COLLECTION_PREFIXES.some(
			(prefix) => collection === prefix || collection.startsWith(`${prefix}/`),
		)
	) {
		return hasRole(user, ADMIN_ROLES);
	}
	if (hasAnyPermission(user, COLLECTION_READ_PERMISSIONS[collection] || []))
		return true;
	if (collection === "usuarios") return canManageUsers(user);
	if (collection === EMPRESAS_COLLECTION)
		return hasRole(user, EMPRESAS_VIEW_ROLES);
	if (INSUMOS_ADMINISTRATIVOS_COLLECTIONS.has(collection))
		return hasRole(user, INSUMOS_ADMINISTRATIVOS_ROLES);
	if (IMOVEIS_ADMINISTRATIVOS_COLLECTIONS.has(collection))
		return hasRole(user, IMOVEIS_ADMINISTRATIVOS_ROLES);
	if (hasRole(user, FULL_OPERATION_ROLES)) return true;
	if (hasRole(user, ACERTO_ROLES))
		return ACERTO_ESTOQUE_COLLECTIONS.has(collection);
	return false;
}

function canReadDocumentPath(user, documentPath) {
	const collectionPath = String(documentPath || "")
		.split("/")
		.filter(Boolean)
		.slice(0, -1)
		.join("/");
	return canReadCollection(user, collectionPath);
}

function canWriteCollection(user, collectionPath) {
	const collection = String(collectionPath || "").trim();
	if (
		ADMIN_ONLY_COLLECTION_PREFIXES.some(
			(prefix) => collection === prefix || collection.startsWith(`${prefix}/`),
		)
	) {
		return hasRole(user, ADMIN_ROLES);
	}
	if (hasAnyPermission(user, COLLECTION_WRITE_PERMISSIONS[collection] || []))
		return true;
	if (collection === "usuarios") return canManageUsers(user);
	if (collection === EMPRESAS_COLLECTION)
		return hasRole(user, EMPRESAS_WRITE_ROLES);
	if (INSUMOS_ADMINISTRATIVOS_COLLECTIONS.has(collection))
		return hasRole(user, INSUMOS_ADMINISTRATIVOS_ROLES);
	if (IMOVEIS_ADMINISTRATIVOS_COLLECTIONS.has(collection))
		return hasRole(user, IMOVEIS_ADMINISTRATIVOS_ROLES);
	if (hasRole(user, FULL_OPERATION_ROLES)) return true;
	if (hasRole(user, ACERTO_ROLES))
		return ACERTO_ESTOQUE_COLLECTIONS.has(collection);
	return false;
}

function canWriteDocumentPath(user, documentPath) {
	const collectionPath = String(documentPath || "")
		.split("/")
		.filter(Boolean)
		.slice(0, -1)
		.join("/");
	return canWriteCollection(user, collectionPath);
}

function pickFirstText(data = {}, keys = []) {
	for (const key of keys) {
		const value = data?.[key];
		if (value !== null && value !== undefined && String(value).trim()) {
			return String(value).trim();
		}
	}
	return "";
}

function normalizeAgendamentoClienteRecord(row = null) {
	if (!row) return null;
	const data = row.data || {};
	const clienteNome = pickFirstText(data, [
		"nome_cliente",
		"cliente_nome",
		"nome_razaosocial",
		"nome",
		"cliente",
	]);

	return {
		path: row.path,
		collectionPath: row.collectionPath,
		documentId: row.documentId,
		codigo_cliente:
			pickFirstText(data, ["codigo_cliente", "codigo", "cod_cliente"]) ||
			row.documentId ||
			"",
		cliente_nome: clienteNome.replace(/^\(\d+\)\s*/, ""),
		cidade: pickFirstText(data, ["cidade", "municipio"]),
		regional: pickFirstText(data, ["regional"]),
		empresa: pickFirstText(data, ["empresa", "fonte"]),
		num_os: pickFirstText(data, ["num_os", "numero", "os"]),
		telefone: pickFirstText(data, ["telefone", "whatsapp", "celular", "fone"]),
		endereco: pickFirstText(data, [
			"endereco",
			"endereco_instalacao",
			"logradouro",
		]),
		bairro: pickFirstText(data, ["bairro"]),
		tipo: pickFirstText(data, ["tipo"]),
		status: pickFirstText(data, ["status"]),
		fonte: pickFirstText(data, ["fonte"]),
	};
}

function createApp() {
	const app = express();
	const allowedOrigins = getAllowedOrigins();
	if (isProduction() && allowedOrigins.length === 0) {
		throw new Error("CORS_ORIGIN obrigatorio em producao.");
	}
	const loginLimiter = rateLimit({
		windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
		limit: Number(process.env.LOGIN_RATE_LIMIT_MAX || 8),
		standardHeaders: true,
		legacyHeaders: false,
		message: { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." },
	});
	const publicWriteLimiter = rateLimit({
		windowMs: Number(
			process.env.PUBLIC_WRITE_RATE_LIMIT_WINDOW_MS || 60 * 1000,
		),
		limit: Number(process.env.PUBLIC_WRITE_RATE_LIMIT_MAX || 20),
		standardHeaders: true,
		legacyHeaders: false,
		message: { error: "Muitas requisicoes. Tente novamente em instantes." },
	});
	const realtimeLimiter = rateLimit({
		windowMs: Number(process.env.REALTIME_RATE_LIMIT_WINDOW_MS || 60 * 1000),
		limit: Number(process.env.REALTIME_RATE_LIMIT_MAX || 180),
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			error: "Muitas conexoes em tempo real. Tente novamente em instantes.",
		},
	});
	const antiBotGuard = antiBot.requireAntiBot();

	app.set("trust proxy", 1);
	app.use(helmet());
	app.use((req, res, next) => {
		const origin = req.get("origin");
		if (origin && !isAllowedOrigin(allowedOrigins, origin)) {
			res.status(403).json({ error: "Origem nao permitida." });
			return;
		}
		next();
	});
	app.use(
		cors({
			origin(origin, callback) {
				if (!origin) {
					callback(null, true);
					return;
				}
				if (isAllowedOrigin(allowedOrigins, origin)) {
					callback(null, true);
					return;
				}
				if (!isProduction() && allowedOrigins.length === 0) {
					callback(null, true);
					return;
				}
				callback(new Error("Origem nao permitida."));
			},
			credentials: true,
		}),
	);
	app.use(
		compression({
			threshold: 1024,
			filter(req, res) {
				if (req.headers["x-no-compression"]) return false;
				return compression.filter(req, res);
			},
		}),
	);
	metrics.initMetrics().catch((error) => {
		console.error("[metrics] Falha ao inicializar metricas:", error);
	});
	app.use(metrics.metricsMiddleware);
	app.use(auditLog.captureAuditRequestContext);
	app.get(
		"/api/admin/metrics",
		requireInternalToken,
		metrics.metricsController,
	);
	app.post(
		"/api/admin/metrics/reset",
		requireInternalToken,
		metrics.resetMetricsController,
	);
	app.use(
		"/api/uploads",
		requireAuthenticated,
		express.static(uploadRoot, {
			immutable: true,
			maxAge: "30d",
		}),
	);
	app.use("/api/public/visits", rejectLargePublicVisit);
	app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "10mb" }));
	app.use(vpnAccess.createMiddleware());

	app.get(
		"/api/admin/audit-logs",
		requireAuthenticated,
		requireAnyPermission(["configuracao.auditoria.view"], ADMIN_ROLES),
		async (req, res, next) => {
			try {
				res.json(await auditLog.listAuditLogs(req.query || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/admin/audit-logs/:id",
		requireAuthenticated,
		requireAnyPermission(["configuracao.auditoria.view"], ADMIN_ROLES),
		async (req, res, next) => {
			try {
				const item = await auditLog.getAuditLog(req.params.id);
				if (!item) {
					res.status(404).json({ error: "Log de auditoria nao encontrado." });
					return;
				}
				res.json({ item });
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/admin/vpn/config",
		requireAuthenticated,
		requireAnyPermission(
			["configuracao.vpn.view", "configuracao.vpn.manage"],
			ADMIN_ROLES,
		),
		async (_req, res, next) => {
			try {
				res.json({
					ok: true,
					config: await vpnAccess.readConfig({ fresh: true }),
				});
			} catch (error) {
				next(error);
			}
		},
	);

	app.put(
		"/api/admin/vpn/config",
		requireAuthenticated,
		requireCsrfToken,
		requireAnyPermission(["configuracao.vpn.manage"], ADMIN_ROLES),
		async (req, res, next) => {
			try {
				res.json(await vpnAccess.saveConfig(req.body || {}, req.user || {}));
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/admin/vpn/logs",
		requireAuthenticated,
		requireAnyPermission(
			["configuracao.vpn.view", "configuracao.vpn.manage"],
			ADMIN_ROLES,
		),
		async (req, res, next) => {
			try {
				res.json(await vpnAccess.listLogs(req.query.limit));
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/admin/vpn/access-check",
		requireAuthenticated,
		requireAnyPermission(
			["configuracao.vpn.view", "configuracao.vpn.manage"],
			ADMIN_ROLES,
		),
		async (req, res, next) => {
			try {
				const route = req.query.route || req.query.path || "";
				res.json(
					await vpnAccess.checkAccess({
						route,
						ip: vpnAccess.getClientIp(req),
					}),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/vpn/access-check",
		requireAuthenticated,
		async (req, res, next) => {
			try {
				const route = req.query.route || req.query.path || "";
				res.json(
					await vpnAccess.checkAccess({
						route,
						ip: vpnAccess.getClientIp(req),
					}),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	app.use(
		"/api/documentos",
		createDocumentosRouter({
			requireAuthenticated,
			requireCsrfToken,
			requireRoles,
			adminRoles: DOCUMENTOS_CONFIG_ROLES,
		}),
	);
	app.use(
		"/api/imoveis",
		createImoveisRouter({
			requireAuthenticated,
			requireCsrfToken,
			requireRoles,
		}),
	);

	app.use(
		"/api/financeiro",
		createFinanceiroRouter({
			financeiroManagePermissions: FINANCEIRO_MANAGE_PERMISSIONS,
			financeiroRoles: FINANCEIRO_ROLES,
			financeiroViewPermissions: FINANCEIRO_VIEW_PERMISSIONS,
			requireAnyPermission,
			requireAuthenticated,
			requireCsrfToken,
		}),
	);

	app.use(
		"/api",
		createHealthRealtimeRouter({
			attachRealtimeClient,
			db,
			realtimeLimiter,
		}),
	);

	app.use(
		"/api/notifications",
		createNotificationsRouter({
			adminRoles: ADMIN_ROLES,
			notificationsService,
			requireAnyPermission,
			requireAuthenticated,
			requireCsrfToken,
		}),
	);

	app.get("/api/public/dashboard", async (req, res, next) => {
		try {
			const dashboard = await getCachedPublicDashboard();
			res.set("X-Retiradas-Cache", dashboard.cacheStatus);
			res.set(
				"X-Retiradas-Cache-Age-Ms",
				String(Math.max(0, Math.round(dashboard.cacheAgeMs))),
			);
			res.json(dashboard.data);
		} catch (error) {
			next(error);
		}
	});

	app.get("/api/public/static/:domain", async (req, res, next) => {
		try {
			const domain = String(req.params.domain || "").trim();
			const compact = ["1", "true", "yes"].includes(
				String(req.query.compact || "").toLowerCase(),
			);
			const cacheOptions = { compact };
			const cached = getCachedPublicStaticSnapshot(domain, cacheOptions);
			if (cached) {
				res.set("X-Retiradas-Static-Cache", cached.cacheStatus);
				res.set(
					"X-Retiradas-Static-Cache-Age-Ms",
					String(Math.max(0, Math.round(cached.cacheAgeMs))),
				);
				if (compact) res.set("X-Retiradas-Static-Compact", "1");
				res.json(cached.data);
				return;
			}

			const dynamicSnapshot = await buildSnapshotDomain(domain, { compact });
			if (!dynamicSnapshot) {
				res.status(404).json({ error: "Snapshot nao encontrado." });
				return;
			}

			setCachedPublicStaticSnapshot(domain, dynamicSnapshot, cacheOptions);
			res.set("X-Retiradas-Static-Cache", "MISS");
			res.set("X-Retiradas-Static-Cache-Age-Ms", "0");
			if (compact) res.set("X-Retiradas-Static-Compact", "1");
			res.json(dynamicSnapshot);
		} catch (error) {
			next(error);
		}
	});

	app.get("/api/public/documents", async (req, res, next) => {
		try {
			const collectionPath = String(req.query.collection || "").trim();
			if (!PUBLIC_COLLECTIONS.has(collectionPath)) {
				res.status(404).json({ error: "Colecao publica nao encontrada." });
				return;
			}

			const items = await documents.listDocuments({
				collectionPath,
				limit: req.query.limit,
				offset: req.query.offset,
			});
			res.json({ items });
		} catch (error) {
			next(error);
		}
	});

	app.get("/api/public/documents/*", async (req, res, next) => {
		try {
			const documentPath = req.params[0];
			if (!PUBLIC_DOCUMENTS.has(documentPath)) {
				res.status(404).json({ error: "Documento publico nao encontrado." });
				return;
			}

			const item = await documents.getDocument(documentPath);
			if (!item) {
				res.status(404).json({ error: "Documento nao encontrado." });
				return;
			}

			res.json(item);
		} catch (error) {
			next(error);
		}
	});

	app.get(
		"/api/public/sempre/equipment",
		publicWriteLimiter,
		async (req, res, next) => {
			try {
				const result = await sempreIntegration.consultEquipment(req.query.mac);
				const primary = result.primary || {};
				const stockLocal = result.stockLocal || {};
				res.json({
					ok: true,
					mac: result.mac,
					found: result.found === true,
					status: result.found
						? primary.status || "Encontrado"
						: "Nao localizado",
					estoqueAtual:
						stockLocal.descricao || primary.estoqueLocal || "Nao localizado",
					estoqueHelper: stockLocal.seniorId || primary.estoqueLocalId || "",
					produto: primary.produtoNome || "Nao localizado",
					produtoHelper: primary.produtoId || "",
					vinculadoEm:
						primary.vinculadoEm || primary.origemStatus || "Nao localizado",
					vinculoHelper: primary.vinculadoTipo || "",
				});
			} catch (error) {
				next(error);
			}
		},
	);

	app.post("/api/public/visits", publicWriteLimiter, async (req, res, next) => {
		try {
			const documentId = crypto.randomUUID();
			const path = `painel_visitas/${documentId}`;
			await documents.upsertDocument({
				path,
				collectionPath: "painel_visitas",
				documentId,
				parentPath: null,
				data: {
					...(req.body || {}),
					createdAt: new Date().toISOString(),
				},
			});
			res.json({ ok: true, id: documentId });
		} catch (error) {
			next(error);
		}
	});

	app.get("/api/auth/google/config", async (req, res, next) => {
		try {
			const config = await getGoogleOAuthConfig();
			res.json({
				enabled: Boolean(config.enabled && config.clientId),
				clientId: config.enabled ? config.clientId : "",
			});
		} catch (error) {
			next(error);
		}
	});

	app.get("/api/auth/okta/config", async (req, res, next) => {
		try {
			const config = await getOktaOAuthConfig();
			res.json({
				enabled: Boolean(config.enabled && config.issuer && config.clientId),
				issuer: config.enabled ? config.issuer : "",
				clientId: config.enabled ? config.clientId : "",
				redirectUri: config.enabled ? config.redirectUri : "",
			});
		} catch (error) {
			next(error);
		}
	});

	app.get("/api/auth/anti-bot/config", async (_req, res) => {
		res.json(antiBot.getAntiBotConfig());
	});

	app.post("/api/auth/google", loginLimiter, async (req, res) => {
		try {
			const credential = String(
				req.body?.credential || req.body?.idToken || "",
			).trim();
			if (!credential) {
				res.json({ ok: false, error: "Token Google ausente." });
				return;
			}

			const session = await loginWithGoogleIdToken(credential, { req });
			const csrfToken = setAuthCookie(res, session.token, session.expiresIn);
			res.json({
				ok: true,
				csrfToken,
				expiresIn: session.expiresIn,
				token: session.token,
				user: session.user,
			});
		} catch (error) {
			console.error("[auth] Falha no login Google:", error?.message || error);
			res.json({
				ok: false,
				error: error?.message || "Nao foi possivel entrar com Google.",
			});
		}
	});

	app.post("/api/auth/okta", loginLimiter, async (req, res) => {
		try {
			const credential = String(
				req.body?.credential || req.body?.idToken || "",
			).trim();
			if (!credential) {
				res.json({ ok: false, error: "Token Okta ausente." });
				return;
			}

			const session = await loginWithOktaIdToken(credential, {
				nonce: String(req.body?.nonce || ""),
				req,
			});
			const csrfToken = setAuthCookie(res, session.token, session.expiresIn);
			res.json({
				ok: true,
				csrfToken,
				expiresIn: session.expiresIn,
				token: session.token,
				user: session.user,
			});
		} catch (error) {
			console.error("[auth] Falha no login Okta:", error?.message || error);
			res.json({
				ok: false,
				error: error?.message || "Nao foi possivel entrar com Okta.",
			});
		}
	});

	app.post("/api/auth/login", loginLimiter, antiBotGuard, async (req, res) => {
		try {
			const email = String(req.body?.email || "")
				.trim()
				.toLowerCase();
			const password = String(req.body?.password || "");
			if (!email || !password) {
				res.json({ ok: false, error: "Informe e-mail e senha." });
				return;
			}

			const emailConfig = await emailService.getConfig().catch(() => ({}));
			if (emailConfig.mfaEmailEnabled) {
				const challenge = await startEmailMfaLogin(email, password, {
					ttlMinutes: emailConfig.mfaEmailTtlMinutes || 10,
					req,
				});
				await emailService.sendMfaLoginCodeEmail({
					user: challenge.user,
					code: challenge.code,
					ttlMinutes: challenge.ttlMinutes,
				});
				res.json({
					ok: true,
					mfaRequired: true,
					method: "email",
					challengeId: challenge.challengeId,
					maskedEmail: challenge.maskedEmail,
					expiresAt: challenge.expiresAt,
					ttlMinutes: challenge.ttlMinutes,
				});
				return;
			}

			const session = await loginWithPassword(email, password, { req });
			const csrfToken = setAuthCookie(res, session.token, session.expiresIn);
			res.json({
				ok: true,
				csrfToken,
				expiresIn: session.expiresIn,
				token: session.token,
				user: session.user,
			});
		} catch (error) {
			res.json({
				ok: false,
				error: error?.message || "E-mail ou senha invalidos.",
			});
		}
	});

	app.post(
		"/api/auth/mfa/email/verify",
		loginLimiter,
		antiBotGuard,
		async (req, res) => {
			try {
				const challengeId = String(req.body?.challengeId || "").trim();
				const code = String(req.body?.code || "").replace(/\D/g, "");
				if (!challengeId || code.length !== 6) {
					res.json({ ok: false, error: "Informe o código de 6 dígitos." });
					return;
				}

				const session = await verifyEmailMfaLogin(challengeId, code, { req });
				const csrfToken = setAuthCookie(res, session.token, session.expiresIn);
				res.json({
					ok: true,
					csrfToken,
					expiresIn: session.expiresIn,
					token: session.token,
					user: session.user,
				});
			} catch (error) {
				res.json({
					ok: false,
					error: error?.message || "Código MFA inválido.",
				});
			}
		},
	);

	app.post(
		"/api/auth/logout",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				await revokeSession(req.user?.jti || req.authPayload?.jti);
				clearAuthCookie(res);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	app.get("/api/auth/me", requireAuthenticated, async (req, res, next) => {
		try {
			const nowSeconds = Math.floor(Date.now() / 1000);
			const currentExpiresIn = Math.max(
				0,
				Number(req.authPayload?.exp || nowSeconds) - nowSeconds,
			);

			if (shouldRenewAuthToken(req.authPayload)) {
				const renewedToken = await renewSessionFromPayload(req.authPayload);
				const csrfToken = setAuthCookie(res, renewedToken, TOKEN_TTL_SECONDS);
				res.json({
					csrfToken,
					expiresIn: TOKEN_TTL_SECONDS,
					renewed: true,
					token: renewedToken,
					user: req.user.profile,
				});
				return;
			}

			const csrfToken = createCsrfToken(req.authToken);
			setCsrfCookie(res, csrfToken, currentExpiresIn || TOKEN_TTL_SECONDS);
			res.json({
				csrfToken,
				expiresIn: currentExpiresIn,
				renewed: false,
				user: req.user.profile,
			});
		} catch (error) {
			next(error);
		}
	});

	app.put(
		"/api/auth/avatar",
		requireAuthenticated,
		requireCsrfToken,
		uploadAvatarFile,
		async (req, res, next) => {
			try {
				if (!req.file) {
					res.status(400).json({ error: "Selecione uma imagem JPG ou PNG." });
					return;
				}
				const avatarUrl = await saveAvatarUpload(
					req.file,
					`user-${req.user.uid}`,
				);

				const current = await documents.getDocument(`usuarios/${req.user.uid}`);
				await documents.upsertDocument({
					path: `usuarios/${req.user.uid}`,
					collectionPath: "usuarios",
					documentId: req.user.uid,
					data: {
						...(current?.data || {}),
						avatarUrl,
						avatarDataUrl: "",
						atualizado_em: new Date().toISOString(),
					},
				});

				const csrfToken = createCsrfToken(req.authToken);
				setCsrfCookie(res, csrfToken, TOKEN_TTL_SECONDS);
				res.json({
					ok: true,
					csrfToken,
					avatarUrl,
					user: {
						...(req.user.profile || {}),
						avatarUrl,
						avatarDataUrl: "",
					},
				});
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/auth/change-password",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res) => {
			try {
				await changeOwnPassword(
					req.user.uid,
					String(req.body?.currentPassword || ""),
					String(req.body?.nextPassword || ""),
					{ keepSessionJti: req.user.jti || req.authPayload?.jti || "" },
				);
				emailService
					.sendPasswordChangedEmail({
						user: {
							uid: req.user.uid,
							email: req.user.email,
							display_name: req.user.profile?.nome || req.user.email,
						},
					})
					.catch((error) =>
						console.error(
							"[email] Falha ao avisar troca de senha:",
							error?.message || error,
						),
					);
				res.json({
					ok: true,
					user: await getImportedUserProfile(req.user.uid),
				});
			} catch (error) {
				res
					.status(400)
					.json({ error: error?.message || "Erro ao trocar senha." });
			}
		},
	);

	app.post(
		"/api/auth/forgot-password",
		loginLimiter,
		antiBotGuard,
		async (req, res) => {
			try {
				const email = String(req.body?.email || "")
					.trim()
					.toLowerCase();
				if (email) {
					const reset = await createPasswordResetTokenByEmail(email, {
						purpose: "password_reset",
						req,
					});
					if (reset?.user) {
						await emailService.sendPasswordResetEmail({
							user: reset.user,
							resetUrl: reset.resetUrl,
						});
					}
				}
				res.json({
					ok: true,
					message: "Se o e-mail existir, enviaremos um link de redefinicao.",
				});
			} catch (error) {
				console.error(
					"[auth] Falha ao solicitar redefinicao:",
					error?.message || error,
				);
				res.json({
					ok: true,
					message: "Se o e-mail existir, enviaremos um link de redefinicao.",
				});
			}
		},
	);

	app.post(
		"/api/auth/reset-password",
		loginLimiter,
		antiBotGuard,
		async (req, res) => {
			try {
				const user = await resetPasswordWithToken(
					String(req.body?.token || ""),
					String(req.body?.password || ""),
				);
				emailService
					.sendPasswordChangedEmail({ user })
					.catch((error) =>
						console.error(
							"[email] Falha ao avisar senha alterada:",
							error?.message || error,
						),
					);
				res.json({ ok: true });
			} catch (error) {
				res
					.status(400)
					.json({
						ok: false,
						error: error?.message || "Nao foi possivel redefinir a senha.",
					});
			}
		},
	);

	app.get(
		"/api/admin/oauth/google",
		requireAuthenticated,
		requireRoles(ADMIN_ROLES),
		async (_req, res, next) => {
			try {
				const config = await getGoogleOAuthConfig();
				res.json({
					ok: true,
					config: {
						enabled: Boolean(config.enabled),
						clientId: config.clientId,
						autoProvision: Boolean(config.autoProvision),
						defaultRole: config.defaultRole || "visitante",
						allowedDomains: config.allowedDomains.join(","),
					},
				});
			} catch (error) {
				next(error);
			}
		},
	);

	app.put(
		"/api/admin/oauth/google",
		requireAuthenticated,
		requireCsrfToken,
		requireRoles(ADMIN_ROLES),
		async (req, res, next) => {
			try {
				const data = {
					enabled: req.body?.enabled === true,
					clientId: String(req.body?.clientId || "").trim(),
					autoProvision: req.body?.autoProvision === true,
					defaultRole: "visitante",
					allowedDomains: String(req.body?.allowedDomains || "")
						.split(",")
						.map((item) => item.trim().toLowerCase())
						.filter(Boolean)
						.join(","),
					updatedAt: new Date().toISOString(),
					updatedBy: req.user?.uid || "",
				};

				await documents.upsertDocument({
					path: "config/google_oauth",
					collectionPath: "config",
					documentId: "google_oauth",
					parentPath: null,
					data,
				});
				res.json({ ok: true, config: data });
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/admin/oauth/okta",
		requireAuthenticated,
		requireRoles(ADMIN_ROLES),
		async (_req, res, next) => {
			try {
				const config = await getOktaOAuthConfig();
				res.json({
					ok: true,
					config: {
						enabled: Boolean(config.enabled),
						issuer: config.issuer,
						clientId: config.clientId,
						redirectUri: config.redirectUri,
						autoProvision: Boolean(config.autoProvision),
						defaultRole: config.defaultRole || "visitante",
						allowedDomains: config.allowedDomains.join(","),
					},
				});
			} catch (error) {
				next(error);
			}
		},
	);

	app.put(
		"/api/admin/oauth/okta",
		requireAuthenticated,
		requireCsrfToken,
		requireRoles(ADMIN_ROLES),
		async (req, res, next) => {
			try {
				const data = {
					enabled: req.body?.enabled === true,
					issuer: String(req.body?.issuer || "")
						.trim()
						.replace(/\/+$/, ""),
					clientId: String(req.body?.clientId || "").trim(),
					redirectUri: String(req.body?.redirectUri || "").trim(),
					autoProvision: req.body?.autoProvision === true,
					defaultRole: "visitante",
					allowedDomains: String(req.body?.allowedDomains || "")
						.split(",")
						.map((item) => item.trim().toLowerCase())
						.filter(Boolean)
						.join(","),
					updatedAt: new Date().toISOString(),
					updatedBy: req.user?.uid || "",
				};

				await documents.upsertDocument({
					path: "config/okta_oauth",
					collectionPath: "config",
					documentId: "okta_oauth",
					parentPath: null,
					data,
				});
				res.json({ ok: true, config: data });
			} catch (error) {
				next(error);
			}
		},
	);

	app.use(
		"/api/admin/email",
		createEmailAdminRouter({
			adminRoles: ADMIN_ROLES,
			emailService,
			notificationsService,
			requireAuthenticated,
			requireCsrfToken,
			requireRoles,
		}),
	);

	app.get(
		"/api/insumos/requisicoes",
		requireAuthenticated,
		async (req, res, next) => {
			try {
				await expireOverdueInsumosRequestsThrottled();
				const manager = isInsumosManager(req.user);
				const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
				const offset = Math.max(Number(req.query.offset || 0), 0);
				const status = String(req.query.status || "").trim();
				const params = [INSUMOS_REQUISICOES_COLLECTION];
				const where = ["collection_path = $1"];

				if (!manager) {
					params.push(String(req.user?.uid || ""));
					where.push(`data->>'solicitante_uid' = $${params.length}`);
				}
				if (status && status !== "todos") {
					params.push(status);
					where.push(`data->>'status' = $${params.length}`);
				}

				const whereSql = where.join(" and ");
				const countResult = await db.query(
					`select count(*)::int as total from app_documents where ${whereSql}`,
					params,
				);
				const result = await db.query(
					`select path, document_id as "documentId", data
           from app_documents
          where ${whereSql}
          order by coalesce(data->>'atualizado_em', data->>'criado_em') desc, document_id desc
          limit $${params.length + 1} offset $${params.length + 2}`,
					[...params, limit, offset],
				);

				res.json({
					ok: true,
					items: result.rows.map(normalizeInsumosRequestRow),
					total: countResult.rows[0]?.total || 0,
					limit,
					offset,
					canManage: manager,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/insumos/requisicoes",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				const produtoId = String(
					req.body?.produtoId || req.body?.produto_id || "",
				).trim();
				const quantidade = normalizeRequestQuantity(req.body?.quantidade);
				const observacao = String(req.body?.observacao || "").trim();
				if (!produtoId) {
					res.status(400).json({ error: "Produto obrigatorio." });
					return;
				}
				if (quantidade <= 0) {
					res
						.status(400)
						.json({ error: "Quantidade deve ser maior que zero." });
					return;
				}

				const produto = await documents.getDocument(
					`${INSUMOS_PRODUTOS_COLLECTION}/${produtoId}`,
				);
				if (
					!produto ||
					String(produto.data?.status || "ativo") === "excluido"
				) {
					res.status(404).json({ error: "Produto nao encontrado." });
					return;
				}
				if (String(produto.data?.status || "ativo") !== "ativo") {
					res
						.status(400)
						.json({ error: "Produto inativo nao pode ser solicitado." });
					return;
				}
				const estoqueAtual = normalizeStockNumber(produto.data?.estoque_atual);
				if (quantidade > estoqueAtual) {
					res
						.status(400)
						.json({
							error: `Estoque insuficiente. Disponivel: ${estoqueAtual} ${produto.data?.unidade || ""}.`,
						});
					return;
				}

				const now = new Date().toISOString();
				const documentId = crypto.randomUUID();
				const data = {
					id: documentId,
					protocolo: buildInsumosRequestProtocol(),
					status: "pendente",
					produto_id: produtoId,
					produto_nome: produto.data?.nome || "Insumo",
					unidade: produto.data?.unidade || "Unidade",
					categoria: produto.data?.categoria || "",
					quantidade,
					observacao,
					solicitante_uid: req.user?.uid || "",
					solicitante_nome: getUserDisplayName(req.user),
					solicitante_email: getUserEmail(req.user),
					solicitante_role: normalizeUserRole(req.user?.role),
					criado_em: now,
					atualizado_em: now,
					auditoria: addInsumosAudit(
						{},
						{
							acao: "criou",
							usuario_uid: req.user?.uid || "",
							usuario_nome: getUserDisplayName(req.user),
							observacao: `Solicitou ${quantidade} ${produto.data?.unidade || ""}.`,
						},
					),
				};

				await documents.upsertDocument({
					path: insumosRequestPath(documentId),
					collectionPath: INSUMOS_REQUISICOES_COLLECTION,
					documentId,
					parentPath: null,
					data,
				});
				res.json({ ok: true, item: { id: documentId, ...data } });
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/insumos/requisicoes/:id/aprovar",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res, next) => {
			if (!isInsumosManager(req.user)) {
				res.status(403).json({ error: "Permissao insuficiente." });
				return;
			}
			const client = await db.connect();
			let updatedRequest = null;
			try {
				await client.query("begin");
				const request = await getDocumentForUpdate(
					client,
					insumosRequestPath(req.params.id),
				);
				if (!request) {
					await client.query("rollback");
					res.status(404).json({ error: "Requisicao nao encontrada." });
					return;
				}
				const data = request.data || {};
				if (data.status !== "pendente") {
					await client.query("rollback");
					res
						.status(400)
						.json({
							error: "Apenas requisicoes pendentes podem ser aprovadas.",
						});
					return;
				}
				const productPath = `${INSUMOS_PRODUTOS_COLLECTION}/${data.produto_id}`;
				const produto = await getDocumentForUpdate(client, productPath);
				if (!produto) {
					await client.query("rollback");
					res.status(404).json({ error: "Produto nao encontrado." });
					return;
				}
				const productData = produto.data || {};
				const quantidade = normalizeRequestQuantity(data.quantidade);
				const estoqueAtual = normalizeStockNumber(productData.estoque_atual);
				if (quantidade > estoqueAtual) {
					await client.query("rollback");
					res
						.status(400)
						.json({
							error: `Estoque insuficiente. Disponivel: ${estoqueAtual} ${productData.unidade || ""}.`,
						});
					return;
				}

				const now = new Date();
				const expiresAt = new Date(
					now.getTime() + 24 * 60 * 60 * 1000,
				).toISOString();
				await updateDocumentData(client, productPath, {
					...productData,
					estoque_atual: estoqueAtual - quantidade,
					atualizado_em: now.toISOString(),
					atualizado_por: getUserDisplayName(req.user),
				});

				updatedRequest = {
					...data,
					status: "aprovada_aguardando_retirada",
					aprovado_em: now.toISOString(),
					aprovado_por_uid: req.user?.uid || "",
					aprovado_por_nome: getUserDisplayName(req.user),
					expira_em: expiresAt,
					atualizado_em: now.toISOString(),
					auditoria: addInsumosAudit(data, {
						acao: "aprovou",
						usuario_uid: req.user?.uid || "",
						usuario_nome: getUserDisplayName(req.user),
						observacao: `Estoque reservado por 24h. Expira em ${formatSaoPauloDateTime(expiresAt)}.`,
					}),
				};
				await updateDocumentData(client, request.path, updatedRequest);
				await client.query("commit");
			} catch (error) {
				await client.query("rollback").catch(() => null);
				next(error);
				return;
			} finally {
				client.release();
			}

			if (updatedRequest?.solicitante_email) {
				emailService
					.sendInsumosRequestApprovedEmail({
						to: updatedRequest.solicitante_email,
						requisicao: updatedRequest,
					})
					.catch((error) => {
						console.error(
							"[insumos] Falha ao enviar e-mail de requisicao aprovada:",
							error?.message || error,
						);
					});
			}
			res.json({ ok: true, item: { id: req.params.id, ...updatedRequest } });
		},
	);

	app.post(
		"/api/insumos/requisicoes/:id/rejeitar",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res, next) => {
			if (!isInsumosManager(req.user)) {
				res.status(403).json({ error: "Permissao insuficiente." });
				return;
			}
			try {
				const item = await documents.getDocument(
					insumosRequestPath(req.params.id),
				);
				if (!item) {
					res.status(404).json({ error: "Requisicao nao encontrada." });
					return;
				}
				const data = item.data || {};
				if (data.status !== "pendente") {
					res
						.status(400)
						.json({
							error: "Apenas requisicoes pendentes podem ser rejeitadas.",
						});
					return;
				}
				const now = new Date().toISOString();
				const updated = {
					...data,
					status: "rejeitada",
					rejeitado_em: now,
					rejeitado_por_uid: req.user?.uid || "",
					rejeitado_por_nome: getUserDisplayName(req.user),
					motivo_rejeicao: String(req.body?.motivo || "").trim(),
					atualizado_em: now,
					auditoria: addInsumosAudit(data, {
						acao: "rejeitou",
						usuario_uid: req.user?.uid || "",
						usuario_nome: getUserDisplayName(req.user),
						observacao: String(
							req.body?.motivo || "Sem motivo informado.",
						).trim(),
					}),
				};
				await documents.upsertDocument({
					path: item.path,
					collectionPath: INSUMOS_REQUISICOES_COLLECTION,
					documentId: item.documentId,
					parentPath: null,
					data: updated,
				});
				res.json({ ok: true, item: { id: item.documentId, ...updated } });
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/insumos/requisicoes/:id/entregar",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res, next) => {
			if (!isInsumosManager(req.user)) {
				res.status(403).json({ error: "Permissao insuficiente." });
				return;
			}
			const client = await db.connect();
			let updatedRequest = null;
			try {
				await client.query("begin");
				const request = await getDocumentForUpdate(
					client,
					insumosRequestPath(req.params.id),
				);
				if (!request) {
					await client.query("rollback");
					res.status(404).json({ error: "Requisicao nao encontrada." });
					return;
				}
				const data = request.data || {};
				if (data.status !== "aprovada_aguardando_retirada") {
					await client.query("rollback");
					res
						.status(400)
						.json({
							error:
								"Apenas requisicoes aprovadas aguardando retirada podem ser entregues.",
						});
					return;
				}
				const now = new Date().toISOString();
				const retiradaId = crypto.randomUUID();
				const retirada = {
					produto_id: data.produto_id,
					produto_nome: data.produto_nome,
					unidade: data.unidade,
					categoria: data.categoria || "",
					quantidade: normalizeRequestQuantity(data.quantidade),
					responsavel: data.solicitante_nome,
					responsavel_uid: data.solicitante_uid || "",
					setor: data.solicitante_role || "Solicitacao",
					observacao:
						`Retirada vinculada ao protocolo ${data.protocolo}. ${String(req.body?.observacao || "").trim()}`.trim(),
					retirado_em: now,
					criado_em: now,
					criado_por: getUserDisplayName(req.user),
					estoque_antes: null,
					estoque_depois: null,
					requisicao_id: request.documentId,
					protocolo: data.protocolo,
				};
				await insertDocumentData(client, {
					path: `${INSUMOS_RETIRADAS_COLLECTION}/${retiradaId}`,
					collectionPath: INSUMOS_RETIRADAS_COLLECTION,
					documentId: retiradaId,
					data: retirada,
				});

				updatedRequest = {
					...data,
					status: "retirada",
					retirado_em: now,
					retirado_por_uid: req.user?.uid || "",
					retirado_por_nome: getUserDisplayName(req.user),
					retirada_id: retiradaId,
					atualizado_em: now,
					auditoria: addInsumosAudit(data, {
						acao: "entregou",
						usuario_uid: req.user?.uid || "",
						usuario_nome: getUserDisplayName(req.user),
						observacao:
							"Material entregue ao solicitante e contabilizado como retirada.",
					}),
				};
				await updateDocumentData(client, request.path, updatedRequest);
				await client.query("commit");
				res.json({
					ok: true,
					item: { id: request.documentId, ...updatedRequest },
					retirada: { id: retiradaId, ...retirada },
				});
			} catch (error) {
				await client.query("rollback").catch(() => null);
				next(error);
			} finally {
				client.release();
			}
		},
	);

	app.post(
		"/api/insumos/requisicoes/expirar",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res, next) => {
			if (!isInsumosManager(req.user)) {
				res.status(403).json({ error: "Permissao insuficiente." });
				return;
			}
			try {
				const items = await expireOverdueInsumosRequests();
				res.json({ ok: true, expiradas: items.length, items });
			} catch (error) {
				next(error);
			}
		},
	);

	app.get("/api/documents", async (req, res, next) => {
		try {
			const collectionPath = String(req.query.collection || "").trim();
			if (!PUBLIC_COLLECTIONS.has(collectionPath)) {
				next();
				return;
			}

			const items = await documents.listDocuments({
				collectionPath,
				limit: req.query.limit,
				offset: req.query.offset,
			});
			res.json({ items });
		} catch (error) {
			next(error);
		}
	});

	app.get("/api/documents/*", async (req, res, next) => {
		try {
			const documentPath = req.params[0];
			if (!PUBLIC_DOCUMENTS.has(documentPath)) {
				next();
				return;
			}

			const item = await documents.getDocument(documentPath);
			if (!item) {
				res.status(404).json({ error: "Documento nao encontrado." });
				return;
			}

			res.json(item);
		} catch (error) {
			next(error);
		}
	});

	app.get("/api/documents", requireAuthenticated, async (req, res, next) => {
		try {
			const collectionPath = String(req.query.collection || "").trim();
			if (!collectionPath) {
				res.status(400).json({ error: "Parametro collection obrigatorio." });
				return;
			}
			if (!canReadCollection(req.user, collectionPath)) {
				res.status(403).json({ error: "Permissao insuficiente." });
				return;
			}

			const items = await documents.listDocuments({
				collectionPath,
				limit: req.query.limit,
				offset: req.query.offset,
			});
			const visibleItems = await filterUserDocumentsForManager(
				req.user,
				collectionPath,
				filterEmpresaDocuments(
					req.user,
					collectionPath,
					filterRegionalDocuments(req.user, collectionPath, items),
				),
			);
			res.json({
				items: visibleItems,
			});
		} catch (error) {
			next(error);
		}
	});

	app.get("/api/documents/*", requireAuthenticated, async (req, res, next) => {
		try {
			const documentPath = req.params[0];
			const item = await documents.getDocument(documentPath);
			if (!item) {
				res.status(404).json({ error: "Documento nao encontrado." });
				return;
			}
			const isOwnUserProfile = documentPath === `usuarios/${req.user.uid}`;
			const canReadGenericDocument = canReadDocumentPath(
				req.user,
				documentPath,
			);
			if (!isOwnUserProfile && !canReadGenericDocument) {
				res.status(403).json({ error: "Permissao insuficiente." });
				return;
			}
			if (
				!isOwnUserProfile &&
				isAcertoEstoqueCollection(item.collectionPath) &&
				!canAccessRegionalRecord(req.user, item.data || {})
			) {
				res
					.status(403)
					.json({
						error: "Supervisor so pode acessar registros da propria regional.",
					});
				return;
			}
			if (
				!isOwnUserProfile &&
				item.collectionPath === EMPRESAS_COLLECTION &&
				!canAccessEmpresaRecord(req.user, item.documentId, item.data || {})
			) {
				res
					.status(403)
					.json({ error: "Lider Empresa so pode acessar a propria empresa." });
				return;
			}
			if (
				!isOwnUserProfile &&
				item.collectionPath === "usuarios" &&
				(!canSupervisorAccessUserRecord(req.user, item.data || {}) ||
					!canAdministrativoAccessUserRecord(req.user, item.data || {}))
			) {
				res
					.status(403)
					.json({ error: "Sem permissao para acessar este usuario." });
				return;
			}

			res.json(item);
		} catch (error) {
			next(error);
		}
	});

	app.get(
		"/api/static/:domain",
		requireAuthenticated,
		async (req, res, next) => {
			try {
				const domain = String(req.params.domain || "").trim();
				if (!canReadSnapshotDomain(req.user, domain)) {
					res.status(403).json({ error: "Permissao insuficiente." });
					return;
				}

				const result = await db.query(
					`select domain, data, generated_at as "generatedAt", updated_at as "updatedAt"
           from static_snapshots
          where domain = $1`,
					[domain],
				);

				const item = result.rows[0] || null;
				if (!item) {
					const dynamicSnapshot = await buildSnapshotDomain(domain);
					if (!dynamicSnapshot) {
						res.status(404).json({ error: "Snapshot nao encontrado." });
						return;
					}

					res.json(dynamicSnapshot);
					return;
				}

				res.json({
					domain: item.domain,
					generatedAt: item.generatedAt,
					updatedAt: item.updatedAt,
					...item.data,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/static/refresh",
		requireAuthenticated,
		requireCsrfToken,
		requireRoles(FULL_OPERATION_ROLES),
		async (req, res, next) => {
			try {
				const requestedDomains = Array.isArray(req.body?.domains)
					? req.body.domains
					: ["dashboard", "rh", "operacional", "financeiro"];
				const domains = [
					...new Set(
						requestedDomains
							.map((item) => String(item || "").trim())
							.filter(Boolean),
					),
				];
				const generatedAt = new Date().toISOString();
				const results = [];

				for (const domain of domains) {
					const snapshot = await buildSnapshotDomain(domain);
					if (!snapshot) {
						results.push({
							domain,
							ok: false,
							error: "Snapshot nao encontrado.",
						});
						continue;
					}

					await db.query(
						`insert into static_snapshots (domain, data, generated_at)
             values ($1, $2::jsonb, $3)
             on conflict (domain) do update set
               data = excluded.data,
               generated_at = excluded.generated_at`,
						[domain, JSON.stringify(snapshot), generatedAt],
					);
					broadcastRealtime(domain);
					broadcastRealtime("dashboard", { domain });
					broadcastRealtime("acompanhamento", { domain });
					results.push({ domain, ok: true });
				}

				res.json({ ok: true, generatedAt, results });
			} catch (error) {
				next(error);
			}
		},
	);

	app.get("/api/admin/users", requireAuthenticated, async (req, res, next) => {
		try {
			if (!canViewUsers(req.user)) {
				res.status(403).json({ error: "Permissao insuficiente." });
				return;
			}

			const users = await listManagedUsersForAdmin(req.user);
			const totalOAuth = users.filter(
				(user) => user.criado_por_oauth || user.login_provider === "google",
			).length;
			res.json({
				ok: true,
				items: users,
				total: users.length,
				stats: {
					totalOAuth,
					totalNeverAccessed: users.filter(
						(user) => !(user.ultimo_login || user.last_login_at),
					).length,
				},
			});
		} catch (error) {
			next(error);
		}
	});

	app.post(
		"/api/admin/users",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				if (!canManageUsers(req.user)) {
					res.status(403).json({ error: "Permissao insuficiente." });
					return;
				}
				await assertCanCreateManagedUser(req.user, req.body || {});
				const email = String(req.body?.email || "")
					.trim()
					.toLowerCase();
				const nome = String(req.body?.nome || "").trim();
				const role = normalizeUserRole(req.body?.role);
				const regional = hasRole(req.user, ["supervisor"])
					? getUserRegional(req.user)
					: String(req.body?.regional || "").trim();
				const temporaryPassword =
					String(req.body?.temporaryPassword || "").trim() ||
					makeTemporaryPassword();

				if (!email || !nome || !role) {
					res
						.status(400)
						.json({ error: "Nome, e-mail e perfil sao obrigatorios." });
					return;
				}
				if (!(await isKnownManagedRole(role))) {
					res.status(400).json({ error: "Cargo invalido para novo usuario." });
					return;
				}
				if (await getLocalUserByEmail(email)) {
					res
						.status(409)
						.json({ error: "Usuario ja cadastrado com este e-mail." });
					return;
				}

				let user = null;
				try {
					user = await createLocalUser({
						email,
						nome,
						role,
						regional,
						password: temporaryPassword,
						mustChangePassword: true,
					});
				} catch (error) {
					if (error?.code === "23505") {
						res
							.status(409)
							.json({ error: "Usuario ja cadastrado com este e-mail." });
						return;
					}
					throw error;
				}
				await mergeUserProfileExtras(user.uid, req.body || {});

				let passwordResetLink = "";
				let emailStatus = "nao_enviado";
				let emailError = "";
				try {
					const reset = await createPasswordResetToken(user.uid, {
						purpose: "first_access",
						req,
					});
					passwordResetLink = reset.resetUrl;
					await emailService.sendWelcomeUserEmail({
						user,
						resetUrl: reset.resetUrl,
					});
					emailStatus = "enviado";
				} catch (error) {
					emailStatus = "erro";
					emailError = String(error?.message || error);
					console.error("[email] Falha ao enviar primeiro acesso:", emailError);
				}

				res.json({
					ok: true,
					uid: user.uid,
					temporaryPassword,
					passwordResetLink,
					emailStatus,
					emailError,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/admin/avatars",
		requireAuthenticated,
		requireCsrfToken,
		uploadAvatarFile,
		async (req, res, next) => {
			try {
				if (!canManageUsers(req.user)) {
					res.status(403).json({ error: "Permissao insuficiente." });
					return;
				}
				if (!req.file) {
					res.status(400).json({ error: "Selecione uma imagem JPG ou PNG." });
					return;
				}
				const avatarUrl = await saveAvatarUpload(req.file, "admin-avatar");
				res.json({ ok: true, avatarUrl });
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/admin/roles",
		requireAuthenticated,
		requireAnyPermission(
			[
				"configuracao.cargos_permissoes.view",
				"configuracao.cargos_permissoes.manage",
				"manage_roles",
			],
			ADMIN_ROLES,
		),
		async (req, res, next) => {
			try {
				const payload = await getRolesPayloadForUser(req.user);
				res.json({
					ok: true,
					roles: payload.roles,
					permissions: payload.permissions,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	app.put(
		"/api/admin/roles/:roleId",
		requireAuthenticated,
		requireCsrfToken,
		requireAnyPermission(
			["configuracao.cargos_permissoes.manage", "manage_roles"],
			ADMIN_ROLES,
		),
		async (req, res, next) => {
			try {
				const roleId = normalizeUserRole(req.params.roleId);
				await assertCanSaveRoleForUser(
					req.user,
					roleId,
					req.body?.permissions || [],
				);
				await rolePermissions.saveRole({
					id: roleId,
					name: req.body?.name,
					description: req.body?.description,
					active: req.body?.active !== false,
					permissions: req.body?.permissions || [],
				});
				res.json({ ok: true, role: roleId });
			} catch (error) {
				next(error);
			}
		},
	);

	app.put(
		"/api/admin/users/:uid",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				if (!canManageUsers(req.user)) {
					res.status(403).json({ error: "Permissao insuficiente." });
					return;
				}
				const uid = String(req.params.uid || "").trim();
				if (!uid) {
					res.status(400).json({ error: "UID obrigatorio." });
					return;
				}

				const nextBody = req.body || {};
				await assertCanUpdateManagedUser(req.user, uid, nextBody);
				if (hasRole(req.user, ["supervisor"])) {
					nextBody.regional = getUserRegional(req.user);
				}
				const nextRole =
					nextBody.role !== undefined ? normalizeUserRole(nextBody.role) : "";
				if (nextRole && !(await isKnownManagedRole(nextRole))) {
					res.status(400).json({ error: "Cargo invalido para usuario." });
					return;
				}

				await updateLocalUser(uid, nextBody);
				await mergeUserProfileExtras(uid, nextBody);
				res.json({ ok: true, uid });
			} catch (error) {
				next(error);
			}
		},
	);

	app.delete(
		"/api/admin/users/:uid",
		requireAuthenticated,
		requireCsrfToken,
		requireRoles(ADMIN_ROLES),
		async (req, res, next) => {
			try {
				const uid = String(req.params.uid || "").trim();
				if (!uid) {
					res.status(400).json({ error: "UID obrigatorio." });
					return;
				}

				await deleteLocalUser(uid);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/admin/users/:uid/first-access",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				if (!canManageUsers(req.user)) {
					res.status(403).json({ error: "Permissao insuficiente." });
					return;
				}
				const uid = String(req.params.uid || "").trim();
				await assertCanUpdateManagedUser(req.user, uid, {});
				const temporaryPassword = await resetLocalUserPassword(uid);
				const user = await getImportedUserProfile(uid);
				const reset = await createPasswordResetToken(uid, {
					purpose: "first_access",
					req,
				});
				let emailStatus = "nao_enviado";
				let emailError = "";
				try {
					await emailService.sendWelcomeUserEmail({
						user: {
							uid,
							email: user.email,
							display_name: user.nome || user.email,
							role: user.role,
							regional: user.regional,
						},
						resetUrl: reset.resetUrl,
					});
					emailStatus = "enviado";
				} catch (error) {
					emailStatus = "erro";
					emailError = String(error?.message || error);
				}
				res.json({
					ok: true,
					temporaryPassword,
					passwordResetLink: reset.resetUrl,
					emailStatus,
					emailError,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/admin/api-status",
		requireAuthenticated,
		requireRoles(ADMIN_ROLES),
		async (req, res, next) => {
			try {
				res.json(await apiStatus.getApiStatus());
			} catch (error) {
				next(error);
			}
		},
	);

	app.use(
		"/api/admin/hubsoft",
		createHubsoftAdminRouter({
			adminRoles: ADMIN_ROLES,
			hubsoftIntegration,
			requireAuthenticated,
			requireCsrfToken,
			requireRoles,
		}),
	);

	app.use(
		"/api/admin/cvortex",
		createCvortexAdminRouter({
			adminRoles: ADMIN_ROLES,
			cvortexIntegration,
			requireAuthenticated,
			requireCsrfToken,
			requireRoles,
		}),
	);

	app.use(
		"/api/admin/senior",
		createSeniorAdminRouter({
			adminRoles: ADMIN_ROLES,
			requireAnyPermission,
			requireAuthenticated,
			requireCsrfToken,
			seniorIntegration,
		}),
	);

	app.use(
		"/api/admin/database",
		createDatabaseBackupsAdminRouter({
			adminRoles: ADMIN_ROLES,
			databaseBackups,
			notificationsService,
			requireAuthenticated,
			requireCsrfToken,
			requireRoles,
		}),
	);

	app.get(
		"/api/admin/regionais",
		requireAuthenticated,
		requireRoles(FULL_OPERATION_ROLES),
		async (req, res, next) => {
			try {
				const items = await documents.listDocuments({
					collectionPath: "regionais",
					limit: 1000,
					offset: 0,
				});
				res.json({
					regionais: items
						.map((item) => ({
							id: item.documentId,
							nome: item.data?.nome || item.documentId,
						}))
						.filter((item) => item.nome)
						.sort((a, b) =>
							String(a.nome).localeCompare(String(b.nome), "pt-BR"),
						),
				});
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/integrations/sempre/equipment",
		requireAuthenticated,
		requireRoles(ESTOQUE_INTEGRADO_ROLES),
		async (req, res, next) => {
			try {
				res.json(await sempreIntegration.consultEquipment(req.query.mac));
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/integrations/sempre/equipment/mapa",
		requireAuthenticated,
		requireRoles(ESTOQUE_INTEGRADO_ROLES),
		async (req, res, next) => {
			try {
				res.json(
					await sempreIntegration.listMapEquipments({
						limit: req.query.limit,
						page: req.query.page,
						refresh: req.query.refresh === "true",
						filters: {
							query: req.query.query,
							status: req.query.status,
							cidade: req.query.cidade,
							tecnico: req.query.tecnico,
							estoque: req.query.estoque,
							empresa: req.query.empresa,
							view: req.query.view,
						},
					}),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/integrations/sempre/equipment/treatments",
		requireAuthenticated,
		requireRoles(ESTOQUE_INTEGRADO_ROLES),
		async (req, res, next) => {
			try {
				res.json(await sempreIntegration.listEquipmentTreatments());
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/integrations/sempre/equipment/treatments",
		requireAuthenticated,
		requireCsrfToken,
		requireRoles(ESTOQUE_INTEGRADO_ROLES),
		async (req, res, next) => {
			try {
				const result = await sempreIntegration.saveEquipmentTreatment(
					req.body || {},
					req.user,
				);
				broadcastRealtime("estoque", result);
				broadcastRealtime("mapa", result);
				res.json(result);
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/integrations/sempre/equipment/history",
		requireAuthenticated,
		requireRoles(ESTOQUE_INTEGRADO_ROLES),
		async (req, res, next) => {
			try {
				res.json(
					await sempreIntegration.consultHistory(req.query.mac, {
						limit: req.query.limit,
						page: req.query.page,
					}),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/tecnicos/auditoria/bolsa",
		requireAuthenticated,
		requireAnyPermission(
			TECNICOS_BOLSA_AUDITORIA_VIEW_PERMISSIONS,
			TECNICOS_BOLSA_AUDITORIA_ROLES,
		),
		async (req, res, next) => {
			try {
				res.json(await tecnicosBolsaAuditoria.getDashboard(req.user));
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/tecnicos/auditoria/bolsa/config",
		requireAuthenticated,
		requireAnyPermission(
			TECNICOS_BOLSA_AUDITORIA_VIEW_PERMISSIONS,
			TECNICOS_BOLSA_AUDITORIA_ROLES,
		),
		async (_req, res, next) => {
			try {
				res.json(await tecnicosBolsaAuditoria.readConfig({ sanitized: true }));
			} catch (error) {
				next(error);
			}
		},
	);

	app.put(
		"/api/tecnicos/auditoria/bolsa/config",
		requireAuthenticated,
		requireCsrfToken,
		requireAnyPermission(TECNICOS_BOLSA_AUDITORIA_MANAGE_PERMISSIONS, [
			"admin",
			"supervisor",
		]),
		async (req, res, next) => {
			try {
				res.json(
					await tecnicosBolsaAuditoria.saveConfig(req.body || {}, req.user),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/tecnicos/auditoria/bolsa/logs",
		requireAuthenticated,
		requireAnyPermission(
			TECNICOS_BOLSA_AUDITORIA_VIEW_PERMISSIONS,
			TECNICOS_BOLSA_AUDITORIA_ROLES,
		),
		async (req, res, next) => {
			try {
				res.json(
					await tecnicosBolsaAuditoria.listLogs({
						page: req.query.page,
						limit: req.query.limit,
						user: req.user,
					}),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/tecnicos/auditoria/bolsa/relatorios",
		requireAuthenticated,
		requireAnyPermission(
			TECNICOS_BOLSA_AUDITORIA_VIEW_PERMISSIONS,
			TECNICOS_BOLSA_AUDITORIA_ROLES,
		),
		async (req, res, next) => {
			try {
				res.json(
					await tecnicosBolsaAuditoria.getReports({
						user: req.user,
						query: req.query,
					}),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/tecnicos/auditoria/bolsa/relatorios/refresh",
		requireAuthenticated,
		requireCsrfToken,
		requireAnyPermission(
			TECNICOS_BOLSA_AUDITORIA_MANAGE_PERMISSIONS,
			TECNICOS_BOLSA_AUDITORIA_ROLES,
		),
		async (req, res) => {
			try {
				res
					.status(202)
					.json(
						await tecnicosBolsaAuditoria.startReportRefreshJob(
							req.user,
							req.body || {},
						),
					);
			} catch (error) {
				console.error(
					"[tecnicosBolsaAuditoria] Falha ao atualizar movimentacoes do relatorio:",
					error?.message || error,
				);
				res.status(error?.statusCode || error?.status || 500).json({
					error:
						error?.message || "Falha ao atualizar movimentacoes do relatorio.",
				});
			}
		},
	);

	app.post(
		"/api/tecnicos/auditoria/bolsa/relatorios/email",
		requireAuthenticated,
		requireCsrfToken,
		requireAnyPermission(
			TECNICOS_BOLSA_AUDITORIA_VIEW_PERMISSIONS,
			TECNICOS_BOLSA_AUDITORIA_ROLES,
		),
		async (req, res, next) => {
			try {
				res.json(
					await tecnicosBolsaAuditoria.sendReportByEmail(
						req.body || {},
						req.user,
					),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/tecnicos/auditoria/bolsa/refresh",
		requireAuthenticated,
		requireCsrfToken,
		requireAnyPermission(
			TECNICOS_BOLSA_AUDITORIA_MANAGE_PERMISSIONS,
			TECNICOS_BOLSA_AUDITORIA_ROLES,
		),
		async (req, res, next) => {
			try {
				res
					.status(202)
					.json(await tecnicosBolsaAuditoria.startRefreshAllJob(req.user));
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/tecnicos/auditoria/bolsa/jobs/:jobId",
		requireAuthenticated,
		requireAnyPermission(
			TECNICOS_BOLSA_AUDITORIA_VIEW_PERMISSIONS,
			TECNICOS_BOLSA_AUDITORIA_ROLES,
		),
		async (req, res, next) => {
			try {
				const job = await tecnicosBolsaAuditoria.getRefreshJob(
					req.params.jobId,
				);
				if (!job) {
					res.status(404).json({ error: "Atualização não encontrada." });
					return;
				}
				res.json(job);
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/tecnicos/auditoria/bolsa/refresh/:id",
		requireAuthenticated,
		requireCsrfToken,
		requireAnyPermission(
			TECNICOS_BOLSA_AUDITORIA_MANAGE_PERMISSIONS,
			TECNICOS_BOLSA_AUDITORIA_ROLES,
		),
		async (req, res, next) => {
			try {
				const result = await tecnicosBolsaAuditoria.refreshBySnapshotId(
					req.params.id,
					req.user,
				);
				broadcastRealtime("tecnicos_bolsa_auditoria", result);
				res.json(result);
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/tecnicos/auditoria/bolsa/run-daily",
		requireAuthenticated,
		requireCsrfToken,
		requireAnyPermission(TECNICOS_BOLSA_AUDITORIA_MANAGE_PERMISSIONS, [
			"admin",
			"supervisor",
		]),
		async (req, res, next) => {
			try {
				res
					.status(202)
					.json(await tecnicosBolsaAuditoria.startRefreshAllJob(req.user));
			} catch (error) {
				next(error);
			}
		},
	);

	app.use(
		"/api/logistica",
		createLogisticaRouter({
			fullOperationRoles: FULL_OPERATION_ROLES,
			logisticaIntegration,
			requireAuthenticated,
			requireCsrfToken,
			requireRoles,
		}),
	);

	app.post(
		"/api/admin/documents",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				const collectionPath = String(req.body?.collectionPath || "").trim();
				if (!collectionPath) {
					res.status(400).json({ error: "collectionPath obrigatorio." });
					return;
				}
				if (!canWriteCollection(req.user, collectionPath)) {
					res.status(403).json({ error: "Permissao insuficiente." });
					return;
				}

				const documentId = String(
					req.body?.documentId || crypto.randomUUID(),
				).trim();
				const path = `${collectionPath}/${documentId}`;
				const parts = path.split("/").filter(Boolean);
				const scopedRegionalData = applyRegionalScopeToData(
					req.user,
					collectionPath,
					req.body?.data || {},
				);
				const data = applyEmpresaScopeToData(
					req.user,
					collectionPath,
					documentId,
					scopedRegionalData,
				);
				await documents.upsertDocument({
					path,
					collectionPath,
					documentId,
					parentPath: parts.length > 2 ? parts.slice(0, -2).join("/") : null,
					data,
				});
				await ensureEmpresaDriveFolderIfConfigured(
					collectionPath,
					documentId,
					req.user,
				);
				await handleInsumosLowStockAfterWrite({
					collectionPath,
					documentPath: path,
					documentId,
					data,
					existing: null,
				});
				res.json({ ok: true, path, documentId });
			} catch (error) {
				next(error);
			}
		},
	);

	app.put(
		"/api/admin/documents/*",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				const documentPath = req.params[0];
				const parts = documentPath.split("/").filter(Boolean);
				if (parts.length < 2 || parts.length % 2 !== 0) {
					res.status(400).json({ error: "Caminho de documento invalido." });
					return;
				}
				if (!canWriteDocumentPath(req.user, documentPath)) {
					res.status(403).json({ error: "Permissao insuficiente." });
					return;
				}

				const collectionPath = parts.slice(0, -1).join("/");
				const existing = await documents.getDocument(documentPath);
				if (
					existing &&
					isAcertoEstoqueCollection(collectionPath) &&
					!canAccessRegionalRecord(req.user, existing.data || {})
				) {
					res
						.status(403)
						.json({
							error:
								"Supervisor so pode alterar registros da propria regional.",
						});
					return;
				}
				if (
					existing &&
					collectionPath === EMPRESAS_COLLECTION &&
					!canAccessEmpresaRecord(
						req.user,
						existing.documentId,
						existing.data || {},
					)
				) {
					res
						.status(403)
						.json({
							error: "Lider Empresa so pode alterar a propria empresa.",
						});
					return;
				}
				const requestBody = { ...(req.body || {}) };
				if (
					existing &&
					collectionPath === EMPRESAS_COLLECTION &&
					hasRole(req.user, ["supervisor"]) &&
					!hasRole(req.user, ADMIN_ROLES)
				) {
					requestBody.supervisor = existing.data?.supervisor || {};
				}
				const scopedRegionalData = applyRegionalScopeToData(
					req.user,
					collectionPath,
					requestBody,
				);
				const data = applyEmpresaScopeToData(
					req.user,
					collectionPath,
					parts.at(-1),
					scopedRegionalData,
				);
				await documents.upsertDocument({
					path: documentPath,
					collectionPath,
					documentId: parts.at(-1),
					parentPath: parts.length > 2 ? parts.slice(0, -2).join("/") : null,
					data,
				});
				await ensureEmpresaDriveFolderIfConfigured(
					collectionPath,
					parts.at(-1),
					req.user,
				);
				await handleInsumosLowStockAfterWrite({
					collectionPath,
					documentPath,
					documentId: parts.at(-1),
					data,
					existing,
				});
				res.json({ ok: true, path: documentPath, documentId: parts.at(-1) });
			} catch (error) {
				next(error);
			}
		},
	);

	app.delete(
		"/api/admin/documents/*",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				const documentPath = req.params[0];
				if (!canWriteDocumentPath(req.user, documentPath)) {
					res.status(403).json({ error: "Permissao insuficiente." });
					return;
				}
				const item = await documents.getDocument(documentPath);
				if (
					item &&
					isAcertoEstoqueCollection(item.collectionPath) &&
					!canAccessRegionalRecord(req.user, item.data || {})
				) {
					res
						.status(403)
						.json({
							error:
								"Supervisor so pode excluir registros da propria regional.",
						});
					return;
				}
				if (
					item &&
					item.collectionPath === EMPRESAS_COLLECTION &&
					isEmpresaLeader(req.user)
				) {
					res
						.status(403)
						.json({ error: "Lider Empresa nao pode excluir empresa." });
					return;
				}
				await documents.deleteDocument(documentPath);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/imports/mapa",
		requireAuthenticated,
		requireCsrfToken,
		requireRoles(FULL_OPERATION_ROLES),
		async (req, res, next) => {
			try {
				res
					.status(202)
					.json(
						await operationalImports.createImportJob(
							"mapa",
							req.body || {},
							req.user,
						),
					);
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/imports/match",
		requireAuthenticated,
		requireCsrfToken,
		requireRoles(FULL_OPERATION_ROLES),
		async (req, res, next) => {
			try {
				res
					.status(202)
					.json(
						await operationalImports.createImportJob(
							"match",
							req.body || {},
							req.user,
						),
					);
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/imports/jobs/:jobId",
		requireAuthenticated,
		async (req, res, next) => {
			try {
				const job = await operationalImports.getImportJob(req.params.jobId);
				if (!job) {
					res.status(404).json({ error: "Processamento nao encontrado." });
					return;
				}
				res.json(job);
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/agendamentos/clientes/:codigo",
		requireAuthenticated,
		async (req, res, next) => {
			try {
				if (!hasRole(req.user, FULL_OPERATION_ROLES)) {
					res.status(403).json({ error: "Permissao insuficiente." });
					return;
				}

				const codigo = String(req.params.codigo || "").replace(/\D/g, "");
				if (!codigo) {
					res.status(400).json({ error: "Codigo do cliente obrigatorio." });
					return;
				}

				const result = await db.query(
					`select path,
                  collection_path as "collectionPath",
                  document_id as "documentId",
                  data
             from app_documents
            where collection_path = any($2::text[])
              and (
                document_id = $1
                or data->>'codigo_cliente' = $1
                or data->>'codigo' = $1
                or data->>'cod_cliente' = $1
                or data->>'contrato' = $1
              )
            order by case collection_path
              when 'ordens_abertas' then 1
              when 'match_os_abertas' then 2
              when 'agendamentos' then 3
              else 9
            end,
            updated_at desc
            limit 1`,
					[codigo, ["ordens_abertas", "match_os_abertas", "agendamentos"]],
				);

				const cliente = normalizeAgendamentoClienteRecord(
					result.rows[0] || null,
				);
				if (!cliente) {
					res
						.status(404)
						.json({ error: "Cliente nao encontrado no mapa atual." });
					return;
				}

				res.json({ cliente });
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/imports/metas",
		requireAuthenticated,
		requireCsrfToken,
		requireRoles(FULL_OPERATION_ROLES),
		async (req, res, next) => {
			try {
				const result = await operationalImports.persistMetasImport(
					req.body || {},
					req.user,
				);
				broadcastRealtime("metas", result);
				broadcastRealtime("dashboard", result);
				broadcastRealtime("acompanhamento", result);
				res.json(result);
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/imports/metas/forca-tarefa",
		requireAuthenticated,
		requireCsrfToken,
		requireRoles(FULL_OPERATION_ROLES),
		async (req, res, next) => {
			try {
				const result = await operationalImports.saveMetasForceTaskConfig(
					req.body?.config || {},
					req.user,
				);
				broadcastRealtime("metas", result);
				broadcastRealtime("dashboard", result);
				broadcastRealtime("acompanhamento", result);
				res.json(result);
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/imports/metas/base-config",
		requireAuthenticated,
		requireCsrfToken,
		requireRoles(FULL_OPERATION_ROLES),
		async (req, res, next) => {
			try {
				const result = await operationalImports.saveMetasBaseConfig(
					req.body?.config || {},
					req.user,
				);
				broadcastRealtime("metas", result);
				broadcastRealtime("dashboard", result);
				broadcastRealtime("acompanhamento", result);
				res.json(result);
			} catch (error) {
				next(error);
			}
		},
	);

	app.get(
		"/api/imports/match/config",
		requireAuthenticated,
		async (req, res, next) => {
			try {
				res.json(await operationalImports.getMatchConfig());
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/imports/match/config",
		requireAuthenticated,
		requireCsrfToken,
		requireRoles(FULL_OPERATION_ROLES),
		async (req, res, next) => {
			try {
				const result = await operationalImports.saveMatchConfig(
					req.body || {},
					req.user,
				);
				broadcastRealtime("match", result);
				broadcastRealtime("dashboard", result);
				broadcastRealtime("acompanhamento", result);
				res.json(result);
			} catch (error) {
				next(error);
			}
		},
	);

	app.post(
		"/api/agendamento-esteira/commands",
		requireAuthenticated,
		requireCsrfToken,
		async (req, res, next) => {
			try {
				res.json(
					await agendamentoEsteiraCommands.executeCommand(
						req.body || {},
						req.user,
					),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	app.use(
		"/api/mensageria/evolution",
		createMensageriaEvolutionRouter({
			adminRoles: ADMIN_ROLES,
			evolutionMessaging,
			requireAnyPermission,
			requireAuthenticated,
			requireCsrfToken,
		}),
	);

	app.use(
		"/api/agendamentos/confirmacao",
		createAgendamentoConfirmacaoAdminRouter({
			adminRoles: ADMIN_ROLES,
			agendamentoConfirmacao,
			fullOperationRoles: FULL_OPERATION_ROLES,
			requireAuthenticated,
			requireCsrfToken,
			requireRoles,
		}),
	);

	app.use(
		"/api/atendimento",
		createAtendimentoRouter({
			adminRoles: ADMIN_ROLES,
			atendimentoService,
			requireAnyPermission,
			requireAuthenticated,
			requireCsrfToken,
		}),
	);

	app.use(
		"/api/webhooks",
		createWebhooksRouter({
			agendamentoConfirmacao,
			atendimentoService,
			cvortexIntegration,
			evolutionMessaging,
		}),
	);

	app.put(
		"/api/static/:domain",
		requireInternalToken,
		async (req, res, next) => {
			try {
				const domain = String(req.params.domain || "").trim();
				if (!domain) {
					res.status(400).json({ error: "Dominio obrigatorio." });
					return;
				}

				await db.query(
					`insert into static_snapshots (domain, data, generated_at)
         values ($1, $2::jsonb, now())
         on conflict (domain) do update set
           data = excluded.data,
           generated_at = excluded.generated_at`,
					[domain, JSON.stringify(req.body || {})],
				);
				broadcastRealtime(domain);
				broadcastRealtime("dashboard", { domain });
				broadcastRealtime("acompanhamento", { domain });
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	app.put("/api/documents/*", requireInternalToken, async (req, res, next) => {
		try {
			const documentPath = req.params[0];
			const parts = documentPath.split("/").filter(Boolean);
			if (parts.length < 2 || parts.length % 2 !== 0) {
				res.status(400).json({ error: "Caminho de documento invalido." });
				return;
			}

			await documents.upsertDocument({
				path: documentPath,
				collectionPath: parts.slice(0, -1).join("/"),
				documentId: parts.at(-1),
				parentPath: parts.length > 2 ? parts.slice(0, -2).join("/") : null,
				data: req.body || {},
			});
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	});

	if (!app.locals.insumosExpirationTimer) {
		const timer = setInterval(
			() => {
				expireOverdueInsumosRequests().catch((error) => {
					console.error(
						"[insumos] Falha ao expirar requisicoes vencidas:",
						error?.message || error,
					);
				});
			},
			Number(
				process.env.INSUMOS_REQUEST_EXPIRATION_INTERVAL_MS || 10 * 60 * 1000,
			),
		);
		timer.unref?.();
		app.locals.insumosExpirationTimer = timer;
	}

	if (!app.locals.tecnicosBolsaAuditoriaTimer) {
		const timer = setInterval(
			() => {
				tecnicosBolsaAuditoria
					.runDailyIfDue({
						uid: "system",
						role: "admin",
						profile: { nome: "Rotina automática", role: "admin" },
					})
					.catch((error) => {
						console.error(
							"[tecnicosBolsaAuditoria] Falha na rotina diaria:",
							error?.message || error,
						);
					});
			},
			Number(process.env.TECNICOS_BOLSA_AUDITORIA_INTERVAL_MS || 60 * 1000),
		);
		timer.unref?.();
		app.locals.tecnicosBolsaAuditoriaTimer = timer;
	}

	app.use((error, req, res, next) => {
		if (res.headersSent) {
			next(error);
			return;
		}

		console.error("[api]", error);
		res
			.status(error.statusCode || 500)
			.json({ error: error.statusCode ? error.message : "Erro interno." });
	});

	return app;
}

module.exports = {
	createApp,
};
