export const ROLES = {
	ADMIN: "admin",
	BACKOFFICE_RETIRADA: "backoffice_retirada",
	SUPERVISOR: "supervisor",
	SUPERVISOR_ADMINISTRATIVO: "supervisor_administrativo",
	ANALISTA_ADMINISTRATIVO: "analista_administrativo",
	LIDER_EMPRESA: "lider_empresa",
	AGENTE_AUTORIZADO: "agente_autorizado",
	BACKOFFICE: "backoffice",
	VISITANTE: "visitante",

	// Compatibilidade com usuarios antigos ate todos serem ajustados.
	GESTOR: "gestor",
	TECNICO: "tecnico",
	ESTOQUE: "estoque",
	SUPERVISOR_ESTOQUE: "supervisor_estoque",
};

export const CARGOS_RETIRADAS = [
	{ value: ROLES.ADMIN, label: "Admin" },
	{ value: ROLES.BACKOFFICE_RETIRADA, label: "Backoffice Retirada" },
	{ value: ROLES.SUPERVISOR, label: "Supervisor" },
	{
		value: ROLES.SUPERVISOR_ADMINISTRATIVO,
		label: "Supervisor Administrativo",
	},
	{ value: ROLES.ANALISTA_ADMINISTRATIVO, label: "Analista Administrativo" },
	{ value: ROLES.LIDER_EMPRESA, label: "Lider Empresa" },
	{ value: ROLES.AGENTE_AUTORIZADO, label: "Agente Autorizado" },
	{ value: ROLES.BACKOFFICE, label: "Backoffice" },
	{ value: ROLES.VISITANTE, label: "Visitante" },
];

export const CARGOS_FS = [];
export const TODOS_CARGOS = [...CARGOS_RETIRADAS, ...CARGOS_FS];
export const ROLE_VALUES = Object.freeze(
	CARGOS_RETIRADAS.map((cargo) => cargo.value),
);

export const ROLE_LABELS = Object.freeze(
	Object.fromEntries(
		CARGOS_RETIRADAS.map((cargo) => [cargo.value, cargo.label]),
	),
);

const FULL_OPERATION_ROLES = [
	ROLES.ADMIN,
	ROLES.BACKOFFICE_RETIRADA,
	ROLES.SUPERVISOR,
];

const ACERTO_ROLES = [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.BACKOFFICE];

const DASHBOARD_ROLES = [
	...FULL_OPERATION_ROLES,
	ROLES.LIDER_EMPRESA,
	ROLES.BACKOFFICE,
	ROLES.SUPERVISOR_ADMINISTRATIVO,
	ROLES.ANALISTA_ADMINISTRATIVO,
	ROLES.VISITANTE,
];

const EMPRESAS_DOCUMENTOS_ROLES = [
	ROLES.ADMIN,
	ROLES.SUPERVISOR,
	ROLES.LIDER_EMPRESA,
	ROLES.AGENTE_AUTORIZADO,
	ROLES.SUPERVISOR_ADMINISTRATIVO,
	ROLES.ANALISTA_ADMINISTRATIVO,
];

const ADMIN_ONLY = [ROLES.ADMIN];

export const PERMISSION_LABELS = Object.freeze({
	view_dashboard: "Dashboard",
	view_diario: "Diário",
	view_acerto_estoque: "Acerto de Estoque",
	manage_acerto_estoque: "Gerenciar Acerto de Estoque",
	view_estoque_integrado: "Estoque integrado",
	view_equipamentos: "Equipamentos",
	view_mapa: "Mapa O.S",
	view_metas: "Metas",
	view_cobrancas: "Cobranças",
	view_relatorios: "Relatórios operacionais",
	view_agenda: "Agenda da Equipe",
	view_agendamentos: "Agendamentos",
	view_visitas: "Visitas",
	view_duvidas: "Dúvidas",
	view_retiradas: "Retiradas",
	view_entregas_tecnicos: "Entrega",
	"tecnicos.auditoria_bolsa.view": "Auditoria",
	"tecnicos.auditoria_bolsa.manage": "Gerenciar Auditoria",
	"financeiro.visao_geral.view": "Financeiro - Visão Geral",
	"financeiro.contas_pagar.view": "Financeiro - Contas a Pagar",
	"financeiro.contas_pagar.manage": "Gerenciar Contas a Pagar",
	"financeiro.contas_receber.view": "Financeiro - Contas a Receber",
	"financeiro.contas_receber.manage": "Gerenciar Contas a Receber",
	"financeiro.faturamento.view": "Financeiro - Faturamento",
	"financeiro.notas.view": "Financeiro - Notas",
	"financeiro.chamados.view": "Financeiro - Reports",
	"financeiro.gestao_orcamento.view": "Financeiro - Gestão Orçamento",
	"financeiro.gestao_orcamento.manage": "Gerenciar Gestão Orçamento",
	"financeiro.configuracoes.view": "Financeiro - Configurações",
	"financeiro.configuracoes.manage": "Gerenciar Configurações Financeiras",
	"atendimento.casos.view": "Atendimento - Casos",
	"atendimento.casos.manage": "Gerenciar Casos de Atendimento",
	"atendimento.tecnicos.view": "Atendimento - Técnicos WhatsApp",
	"atendimento.tecnicos.manage": "Gerenciar Técnicos WhatsApp",
	"atendimento.avaliacoes.manage": "Atendimento - Avaliações",
	"atendimento.configuracoes.view": "Atendimento - Configurações",
	"atendimento.configuracoes.manage": "Gerenciar Configurações do Atendimento",
	"atendimento.templates.manage": "Gerenciar Templates do Atendimento",
	"atendimento.logs.view": "Atendimento - Logs",
	view_logistica: "Logística",
	manage_logistica: "Gerenciar Logística",
	view_empresas_tecnicos: "Empresas",
	manage_empresas_tecnicos: "Gerenciar Empresas",
	view_documentos: "Documentos",
	view_documentos_tratativas: "Tratativas de Documentos",
	manage_documentos: "Regras de Aprovação",
	view_documentos_relatorios: "Relatórios de Documentos",
	view_insumos_administrativos: "Insumos administrativos",
	view_insumos_requisicoes: "Requisições de insumos",
	manage_insumos_administrativos: "Gerenciar Insumos administrativos",
	view_imoveis_administrativos: "Imóveis administrativos",
	manage_imoveis_administrativos: "Gerenciar Imóveis administrativos",
	view_ferramentas: "Ferramentas",
	view_regionais: "Regionais",
	manage_regionais: "Gerenciar Regionais",
	view_agentes: "Agentes",
	manage_agentes: "Gerenciar Agentes",
	request_ferias: "Férias",
	manage_feriados: "Gerenciar Feriados",
	manage_colaboradores: "Gerenciar Colaboradores",
	manage_metas: "Gerenciar Metas",
	manage_cobrancas: "Gerenciar Cobranças",
	manage_agenda: "Gerenciar Agenda da Equipe",
	manage_agendamentos: "Gerenciar Agendamentos",
	manage_visitas: "Gerenciar Visitas",
	manage_equipamentos: "Gerenciar Equipamentos",
	manage_duvidas: "Gerenciar Dúvidas",
	manage_retiradas: "Gerenciar Retiradas",
	manage_entregas_tecnicos: "Gerenciar Entrega",
	manage_veiculos: "Gerenciar Veículos",
	view_mensageria: "Mensageria",
	view_mensageria_relatorios: "Relatórios da Mensageria",
	view_confirmacao_agendamentos: "Confirmação de Agendamentos",
	manage_confirmacao_agendamentos: "Gerenciar Confirmação de Agendamentos",
	manage_mensageria: "Configurar Mensageria",
	manage_general_settings: "Configurações Gerais",
	view_integracoes: "Integrações",
	manage_integracoes: "Gerenciar Integrações",
	manage_users: "Usuários",
	manage_roles: "Cargos e Permissões",
	manage_api_status: "APIs",
	"configuracao.senior.view": "Senior / Sapiens",
	"configuracao.senior.manage": "Gerenciar Senior / Sapiens",
	"configuracao.vpn.view": "VPN",
	"configuracao.vpn.manage": "Gerenciar VPN",
	manage_database_backups: "Banco de Dados",
	manage_email: "E-mail",
});

export const PERMISSION_GROUPS = Object.freeze([
	{
		label: "Operação",
		permissions: [
			"view_dashboard",
			"view_diario",
			"view_mapa",
			"view_metas",
			"manage_metas",
			"view_agendamentos",
			"manage_agendamentos",
			"view_entregas_tecnicos",
			"tecnicos.auditoria_bolsa.view",
			"tecnicos.auditoria_bolsa.manage",
			"view_ferramentas",
			"view_retiradas",
			"manage_retiradas",
		],
	},
	{
		label: "Financeiro",
		permissions: [
			"financeiro.visao_geral.view",
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
		],
	},
	{
		label: "Atendimento",
		permissions: [
			"atendimento.casos.view",
			"atendimento.casos.manage",
			"atendimento.tecnicos.view",
			"atendimento.tecnicos.manage",
			"atendimento.avaliacoes.manage",
			"atendimento.configuracoes.view",
			"atendimento.configuracoes.manage",
			"atendimento.templates.manage",
			"atendimento.logs.view",
		],
	},
	{
		label: "Estoque e logística",
		permissions: [
			"view_acerto_estoque",
			"manage_acerto_estoque",
			"view_estoque_integrado",
			"view_equipamentos",
			"manage_equipamentos",
			"view_logistica",
			"manage_logistica",
			"view_insumos_administrativos",
			"view_insumos_requisicoes",
			"manage_insumos_administrativos",
			"view_imoveis_administrativos",
			"manage_imoveis_administrativos",
		],
	},
	{
		label: "Empresas e documentos",
		permissions: [
			"view_empresas_tecnicos",
			"manage_empresas_tecnicos",
			"view_documentos",
			"view_documentos_tratativas",
			"manage_documentos",
			"view_documentos_relatorios",
		],
	},
	{
		label: "Equipe",
		permissions: [
			"manage_colaboradores",
			"view_agenda",
			"manage_agenda",
			"request_ferias",
			"manage_feriados",
			"view_regionais",
			"manage_regionais",
			"view_agentes",
			"manage_agentes",
		],
	},
	{
		label: "Mensageria",
		permissions: [
			"view_mensageria",
			"manage_mensageria",
			"view_mensageria_relatorios",
			"view_confirmacao_agendamentos",
			"manage_confirmacao_agendamentos",
		],
	},
	{
		label: "Configuração",
		permissions: [
			"manage_general_settings",
			"manage_users",
			"manage_roles",
			"view_integracoes",
			"manage_integracoes",
			"manage_api_status",
			"configuracao.senior.view",
			"configuracao.senior.manage",
			"configuracao.vpn.view",
			"configuracao.vpn.manage",
			"manage_database_backups",
			"manage_email",
		],
	},
]);

export const isFS = () => false;
export const isValidRole = (role) =>
	ROLE_VALUES.includes(String(role ?? "").toLowerCase());
export const getRoleLabel = (role) =>
	ROLE_LABELS[String(role || "").toLowerCase()] || role || "-";

const VIEW_TO_MANAGE_PERMISSION = (permission) =>
	String(permission || "").endsWith(".view")
		? String(permission).replace(/\.view$/, ".manage")
		: "";

const CATALOG_TO_LEGACY_PERMISSION = Object.freeze({
	"destaque.dashboard.view": "view_dashboard",
	"destaque.diario.view": "view_diario",
	"destaque.diario.manage": "view_diario",
	"destaque.mapa_os.view": "view_mapa",
	"destaque.metas.view": "view_metas",
	"destaque.metas.manage": "manage_metas",
	"empresas.cadastro.view": "view_empresas_tecnicos",
	"empresas.cadastro.manage": "manage_empresas_tecnicos",
	"cliente.agendamentos.view": "view_agendamentos",
	"cliente.agendamentos.manage": "manage_agendamentos",
	"tecnicos.entrega_tecnicos.view": "view_entregas_tecnicos",
	"tecnicos.entrega_tecnicos.manage": "manage_entregas_tecnicos",
	"tecnicos.bolsa_tecnico.view": "view_estoque_integrado",
	"financeiro.visao_geral.view": null,
	"financeiro.contas_pagar.view": null,
	"financeiro.contas_pagar.manage": null,
	"financeiro.contas_receber.view": null,
	"financeiro.contas_receber.manage": null,
	"financeiro.faturamento.view": null,
	"financeiro.notas.view": null,
	"financeiro.chamados.view": null,
	"financeiro.gestao_orcamento.view": null,
	"financeiro.gestao_orcamento.manage": null,
	"financeiro.configuracoes.view": null,
	"financeiro.configuracoes.manage": null,
	"atendimento.casos.view": null,
	"atendimento.casos.manage": null,
	"atendimento.tecnicos.view": null,
	"atendimento.tecnicos.manage": null,
	"atendimento.avaliacoes.manage": null,
	"atendimento.configuracoes.view": null,
	"atendimento.configuracoes.manage": null,
	"atendimento.templates.manage": null,
	"atendimento.logs.view": null,
	"logistica.logistica.view": "view_logistica",
	"logistica.logistica.manage": "manage_logistica",
	"estoque.equipamentos.view": "view_estoque_integrado",
	"estoque.equipamentos.manage": "manage_equipamentos",
	"estoque.consulta.view": "view_estoque_integrado",
	"estoque.acerto_estoque.view": "view_acerto_estoque",
	"estoque.acerto_estoque.manage": "manage_acerto_estoque",
	"administrativo.documentos.view": "view_documentos",
	"administrativo.documentos.manage": "manage_documentos",
	"administrativo.insumos.view": "view_insumos_administrativos",
	"administrativo.insumos.manage": "manage_insumos_administrativos",
	"administrativo.imoveis.view": "view_imoveis_administrativos",
	"administrativo.imoveis.manage": "manage_imoveis_administrativos",
	"administrativo.relatorios.view": "view_documentos_relatorios",
	"equipe.colaboradores.view": "manage_colaboradores",
	"equipe.colaboradores.manage": "manage_colaboradores",
	"equipe.agenda.view": "view_agenda",
	"equipe.agenda.manage": "manage_agenda",
	"equipe.feriados.view": "manage_feriados",
	"equipe.feriados.manage": "manage_feriados",
	"equipe.ferias.view": "request_ferias",
	"equipe.ferias.manage": "approve_ferias",
	"mensageria.enviados.view": "view_mensageria",
	"mensageria.relatorios.view": "view_mensageria_relatorios",
	"mensageria.confirmacao_agendamentos.view": "view_confirmacao_agendamentos",
	"mensageria.confirmacao_agendamentos.manage":
		"manage_confirmacao_agendamentos",
	"mensageria.fila.view": "manage_mensageria",
	"mensageria.fila.manage": "manage_mensageria",
	"mensageria.backlog.view": "manage_mensageria",
	"mensageria.backlog.manage": "manage_mensageria",
	"mensageria.callback.view": "manage_mensageria",
	"mensageria.callback.manage": "manage_mensageria",
	"mensageria.api.view": "manage_mensageria",
	"mensageria.api.manage": "manage_mensageria",
	"mensageria.email_config.view": "manage_mensageria",
	"mensageria.email_config.manage": "manage_mensageria",
	"configuracao.geral.view": "manage_general_settings",
	"configuracao.geral.manage": "manage_general_settings",
	"configuracao.notificacoes.view": "manage_general_settings",
	"configuracao.notificacoes.manage": "manage_general_settings",
	"configuracao.regionais.view": "view_regionais",
	"configuracao.regionais.manage": "manage_regionais",
	"configuracao.usuarios.view": "manage_users",
	"configuracao.usuarios.manage": "manage_users",
	"configuracao.cargos_permissoes.view": "manage_roles",
	"configuracao.cargos_permissoes.manage": "manage_roles",
	"configuracao.agentes.view": "view_agentes",
	"configuracao.agentes.manage": "manage_agentes",
	"configuracao.integracoes.view": "view_integracoes",
	"configuracao.integracoes.manage": "manage_integracoes",
	"configuracao.apis.view": "manage_api_status",
	"configuracao.apis.manage": "manage_api_status",
	"configuracao.hubsoft.view": "manage_integracoes",
	"configuracao.hubsoft.manage": "manage_integracoes",
	"configuracao.cvortex.view": "manage_integracoes",
	"configuracao.cvortex.manage": "manage_integracoes",
	"configuracao.senior.view": "manage_integracoes",
	"configuracao.senior.manage": "manage_integracoes",
	"configuracao.vpn.view": null,
	"configuracao.vpn.manage": null,
	"configuracao.banco_dados.view": "manage_database_backups",
	"configuracao.banco_dados.manage": "manage_database_backups",
	"configuracao.email.view": "manage_email",
	"configuracao.email.manage": "manage_email",
});

const LEGACY_ROLE_PERMISSIONS = Object.freeze({
	view_dashboard: DASHBOARD_ROLES,
	view_diario: FULL_OPERATION_ROLES,
	view_acerto_estoque: ACERTO_ROLES,
	manage_acerto_estoque: ACERTO_ROLES,
	view_estoque_integrado: FULL_OPERATION_ROLES,
	view_equipamentos: FULL_OPERATION_ROLES,
	view_mapa: FULL_OPERATION_ROLES,
	view_metas: FULL_OPERATION_ROLES,
	view_cobrancas: FULL_OPERATION_ROLES,
	view_relatorios: FULL_OPERATION_ROLES,
	view_agenda: FULL_OPERATION_ROLES,
	view_agendamentos: FULL_OPERATION_ROLES,
	view_visitas: FULL_OPERATION_ROLES,
	view_duvidas: FULL_OPERATION_ROLES,
	view_retiradas: FULL_OPERATION_ROLES,
	view_entregas_tecnicos: FULL_OPERATION_ROLES,
	"tecnicos.auditoria_bolsa.view": [
		ROLES.ADMIN,
		ROLES.SUPERVISOR,
		ROLES.BACKOFFICE,
		ROLES.BACKOFFICE_RETIRADA,
		ROLES.LIDER_EMPRESA,
	],
	"tecnicos.auditoria_bolsa.manage": [
		ROLES.ADMIN,
		ROLES.SUPERVISOR,
		ROLES.BACKOFFICE,
		ROLES.BACKOFFICE_RETIRADA,
	],
	"financeiro.visao_geral.view": ADMIN_ONLY,
	"financeiro.contas_pagar.view": ADMIN_ONLY,
	"financeiro.contas_pagar.manage": ADMIN_ONLY,
	"financeiro.contas_receber.view": ADMIN_ONLY,
	"financeiro.contas_receber.manage": ADMIN_ONLY,
	"financeiro.faturamento.view": ADMIN_ONLY,
	"financeiro.notas.view": ADMIN_ONLY,
	"financeiro.chamados.view": ADMIN_ONLY,
	"financeiro.gestao_orcamento.view": ADMIN_ONLY,
	"financeiro.gestao_orcamento.manage": ADMIN_ONLY,
	"financeiro.configuracoes.view": ADMIN_ONLY,
	"financeiro.configuracoes.manage": ADMIN_ONLY,
	"atendimento.casos.view": [
		ROLES.ADMIN,
		ROLES.SUPERVISOR,
		ROLES.BACKOFFICE,
		ROLES.BACKOFFICE_RETIRADA,
	],
	"atendimento.casos.manage": [
		ROLES.ADMIN,
		ROLES.SUPERVISOR,
		ROLES.BACKOFFICE,
		ROLES.BACKOFFICE_RETIRADA,
	],
	"atendimento.tecnicos.view": [
		ROLES.ADMIN,
		ROLES.SUPERVISOR,
		ROLES.BACKOFFICE,
		ROLES.BACKOFFICE_RETIRADA,
	],
	"atendimento.tecnicos.manage": [ROLES.ADMIN, ROLES.SUPERVISOR],
	"atendimento.avaliacoes.manage": [ROLES.ADMIN, ROLES.SUPERVISOR],
	"atendimento.configuracoes.view": ADMIN_ONLY,
	"atendimento.configuracoes.manage": ADMIN_ONLY,
	"atendimento.templates.manage": ADMIN_ONLY,
	"atendimento.logs.view": [
		ROLES.ADMIN,
		ROLES.SUPERVISOR,
		ROLES.BACKOFFICE,
		ROLES.BACKOFFICE_RETIRADA,
	],
	view_logistica: FULL_OPERATION_ROLES,
	manage_logistica: FULL_OPERATION_ROLES,
	view_empresas_tecnicos: EMPRESAS_DOCUMENTOS_ROLES,
	view_documentos: EMPRESAS_DOCUMENTOS_ROLES,
	view_documentos_relatorios: [
		ROLES.ADMIN,
		ROLES.SUPERVISOR_ADMINISTRATIVO,
		ROLES.ANALISTA_ADMINISTRATIVO,
	],
	view_insumos_administrativos: [
		ROLES.ADMIN,
		ROLES.SUPERVISOR,
		ROLES.BACKOFFICE_RETIRADA,
		ROLES.SUPERVISOR_ADMINISTRATIVO,
		ROLES.ANALISTA_ADMINISTRATIVO,
	],
	view_insumos_requisicoes: ROLE_VALUES,
	manage_insumos_administrativos: [
		ROLES.ADMIN,
		ROLES.SUPERVISOR,
		ROLES.BACKOFFICE_RETIRADA,
		ROLES.SUPERVISOR_ADMINISTRATIVO,
		ROLES.ANALISTA_ADMINISTRATIVO,
	],
	view_imoveis_administrativos: [
		ROLES.ADMIN,
		ROLES.SUPERVISOR_ADMINISTRATIVO,
		ROLES.ANALISTA_ADMINISTRATIVO,
	],
	manage_imoveis_administrativos: [
		ROLES.ADMIN,
		ROLES.SUPERVISOR_ADMINISTRATIVO,
		ROLES.ANALISTA_ADMINISTRATIVO,
	],
	manage_documentos: [ROLES.ADMIN, ROLES.SUPERVISOR_ADMINISTRATIVO],
	view_ferramentas: FULL_OPERATION_ROLES,
	view_regionais: FULL_OPERATION_ROLES,
	view_agentes: FULL_OPERATION_ROLES,
	request_ferias: FULL_OPERATION_ROLES,
	manage_colaboradores: FULL_OPERATION_ROLES,
	manage_metas: FULL_OPERATION_ROLES,
	manage_cobrancas: FULL_OPERATION_ROLES,
	manage_empresas_tecnicos: EMPRESAS_DOCUMENTOS_ROLES,
	view_documentos_tratativas: [
		ROLES.ADMIN,
		ROLES.SUPERVISOR,
		ROLES.SUPERVISOR_ADMINISTRATIVO,
		ROLES.ANALISTA_ADMINISTRATIVO,
	],
	manage_duvidas: FULL_OPERATION_ROLES,
	manage_retiradas: FULL_OPERATION_ROLES,
	manage_entregas_tecnicos: FULL_OPERATION_ROLES,
	manage_feriados: FULL_OPERATION_ROLES,
	manage_regionais: FULL_OPERATION_ROLES,
	manage_agentes: FULL_OPERATION_ROLES,
	manage_agenda: FULL_OPERATION_ROLES,
	manage_agendamentos: FULL_OPERATION_ROLES,
	manage_visitas: FULL_OPERATION_ROLES,
	manage_equipamentos: FULL_OPERATION_ROLES,
	manage_veiculos: FULL_OPERATION_ROLES,
	view_mensageria: FULL_OPERATION_ROLES,
	view_mensageria_relatorios: ADMIN_ONLY,
	view_confirmacao_agendamentos: FULL_OPERATION_ROLES,
	manage_confirmacao_agendamentos: ADMIN_ONLY,
	manage_mensageria: ADMIN_ONLY,
	manage_general_settings: DASHBOARD_ROLES,
	view_integracoes: ADMIN_ONLY,
	manage_integracoes: ADMIN_ONLY,
	manage_users: [
		ROLES.ADMIN,
		ROLES.SUPERVISOR,
		ROLES.SUPERVISOR_ADMINISTRATIVO,
	],
	manage_api_status: ADMIN_ONLY,
	"configuracao.senior.view": ADMIN_ONLY,
	"configuracao.senior.manage": ADMIN_ONLY,
	"configuracao.vpn.view": ADMIN_ONLY,
	"configuracao.vpn.manage": ADMIN_ONLY,
	manage_database_backups: ADMIN_ONLY,
	manage_email: ADMIN_ONLY,
	view_mapeamento: FULL_OPERATION_ROLES,
	view_tecnicos: FULL_OPERATION_ROLES,
	view_visitantes: FULL_OPERATION_ROLES,
	view_auditoria: FULL_OPERATION_ROLES,
	view_operacional: FULL_OPERATION_ROLES,
	view_analises: FULL_OPERATION_ROLES,
});

function getDynamicPermissions(role) {
	if (Array.isArray(role?.permissions)) return role.permissions;
	if (Array.isArray(role?.profile?.permissions))
		return role.profile.permissions;
	return null;
}

const LEGACY_TO_CATALOG_PERMISSIONS = Object.freeze(
	Object.entries(CATALOG_TO_LEGACY_PERMISSION).reduce(
		(acc, [catalogPermission, legacyPermission]) => {
			if (!legacyPermission) return acc;
			acc[legacyPermission] = [
				...(acc[legacyPermission] || []),
				catalogPermission,
			];
			return acc;
		},
		{},
	),
);

function getEquivalentCatalogPermissions(permission) {
	const equivalents = LEGACY_TO_CATALOG_PERMISSIONS[permission] || [];
	return String(permission || "").startsWith("view_")
		? [
				...equivalents,
				...equivalents.map((item) => item.replace(/\.view$/, ".manage")),
			]
		: equivalents;
}

function hasDynamicPermission(role, permission) {
	const dynamicPermissions = getDynamicPermissions(role);
	if (!dynamicPermissions) return false;
	const permissionSet = new Set(dynamicPermissions);
	const managePermission = VIEW_TO_MANAGE_PERMISSION(permission);
	if (
		permissionSet.has(permission) ||
		(managePermission && permissionSet.has(managePermission))
	) {
		return true;
	}
	return getEquivalentCatalogPermissions(permission).some((catalogPermission) =>
		permissionSet.has(catalogPermission),
	);
}

function hasLegacyRolePermission(role, permission) {
	return Boolean(
		LEGACY_ROLE_PERMISSIONS[permission]?.includes(String(role).toLowerCase()),
	);
}

export const hasPermission = (role, permission) => {
	if (!permission) return false;
	if (!role) return false;
	if (typeof role === "object" && !Array.isArray(role)) {
		const normalizedRole = String(role.role || "").toLowerCase();
		if (normalizedRole === ROLES.ADMIN) return true;
		if (hasDynamicPermission(role, permission)) return true;
		role = role.role;
	}

	const userRoles = Array.isArray(role) ? role : [role];
	const hasLegacyPermission = userRoles.some((currentRole) =>
		hasLegacyRolePermission(currentRole, permission),
	);
	if (hasLegacyPermission) return true;
	const legacyPermission = CATALOG_TO_LEGACY_PERMISSION[permission];
	return Boolean(
		legacyPermission && hasPermission(userRoles, legacyPermission),
	);
};

export const hasAnyPermission = (role, permissions = []) =>
	(Array.isArray(permissions) ? permissions : [permissions]).some(
		(permission) => hasPermission(role, permission),
	);
