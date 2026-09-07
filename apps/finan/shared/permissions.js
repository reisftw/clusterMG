export const FINAN_PERMISSIONS = {
	DASHBOARD_VIEW: "finan.dashboard.view",
	BUDGET_VIEW: "finan.gestao_orcamentaria.view",
	BUDGET_MANAGE: "finan.gestao_orcamentaria.manage",
	FINANCIAL_REPORTS_VIEW: "relatorios_financeiros:visualizar",
	FINANCIAL_REPORTS_MANAGE: "relatorios_financeiros:gerenciar",
	ACCOUNTS_PAYABLE_VIEW: "finan.contas_pagar.view",
	ACCOUNTS_PAYABLE_MANAGE: "finan.contas_pagar.manage",
	ACCOUNTS_RECEIVABLE_VIEW: "finan.contas_receber.view",
	ACCOUNTS_RECEIVABLE_MANAGE: "finan.contas_receber.manage",
	BILLING_VIEW: "finan.faturamento.view",
	NOTES_VIEW: "finan.notas.view",
	REPORTS_VIEW: "finan.reports.view",
	REPORTS_MANAGE: "finan.reports.manage",
	TEAM_VIEW: "finan.equipe.view",
	TEAM_MANAGE: "finan.equipe.manage",
	INTEGRATIONS_VIEW: "finan.integracoes.view",
	INTEGRATIONS_MANAGE: "finan.integracoes.manage",
	SETTINGS_VIEW: "finan.configuracoes.view",
	SETTINGS_MANAGE: "finan.configuracoes.manage",
	USERS_MANAGE: "finan.usuarios.manage"
};

export const FINAN_ROLE_PRESETS = {
	admin: Object.values(FINAN_PERMISSIONS),
	coordenador_financeiro: [
		FINAN_PERMISSIONS.DASHBOARD_VIEW,
		FINAN_PERMISSIONS.BUDGET_VIEW,
		FINAN_PERMISSIONS.BUDGET_MANAGE,
		FINAN_PERMISSIONS.FINANCIAL_REPORTS_VIEW,
		FINAN_PERMISSIONS.FINANCIAL_REPORTS_MANAGE,
		FINAN_PERMISSIONS.REPORTS_VIEW,
		FINAN_PERMISSIONS.TEAM_VIEW,
		FINAN_PERMISSIONS.TEAM_MANAGE
	],
	analista_financeiro: [
		FINAN_PERMISSIONS.DASHBOARD_VIEW,
		FINAN_PERMISSIONS.BUDGET_VIEW,
		FINAN_PERMISSIONS.FINANCIAL_REPORTS_VIEW,
		FINAN_PERMISSIONS.ACCOUNTS_PAYABLE_VIEW,
		FINAN_PERMISSIONS.ACCOUNTS_RECEIVABLE_VIEW,
		FINAN_PERMISSIONS.REPORTS_VIEW
	]
};
