// Catalogo canonico de permissoes do Finan. Serve dois propositos:
// 1) alimentar a tela de administracao de cargos (compat/routes.js
//    `GET /admin/roles` ja devolvia essa lista antes de existir aqui);
// 2) servir de whitelist para o DTO de cargo (`dtos/roleDto.js`) — nenhuma
//    permissao fora desta lista pode ser gravada em `finan_roles.permissions`
//    via API, mesmo que quem chame a rota tenha `finan.usuarios.manage`.
//
// IMPORTANTE: ao adicionar uma permissao nova usada em algum
// `requireFinanPermission("finan.xxx")` no backend, adicione a mesma string
// aqui — senao a whitelist do DTO vai rejeitar cargos que tentem receber
// essa permissao (ela existiria para "proteger" a rota mas nunca poderia
// ser atribuida a um cargo pela tela de administracao).
const PERMISSION_DEFINITIONS = [
	["finan.dashboard.view", "visao_geral", "Visão geral", "dashboard", "Dashboard", "view"],
	["finan.gestao_orcamentaria.view", "planejamento", "Planejamento", "orcamento", "Gestão Orçamentária", "view"],
	["finan.gestao_orcamentaria.manage", "planejamento", "Planejamento", "orcamento", "Gestão Orçamentária", "manage"],
	["relatorios_financeiros:visualizar", "planejamento", "Planejamento", "relatorios_financeiros", "Relatórios Financeiros", "view"],
	["relatorios_financeiros:gerenciar", "planejamento", "Planejamento", "relatorios_financeiros", "Relatórios Financeiros", "manage"],
	["finan.contas_pagar.view", "operacao", "Operação", "contas_pagar", "Contas a pagar", "view"],
	["finan.contas_pagar.manage", "operacao", "Operação", "contas_pagar", "Contas a pagar", "manage"],
	["finan.contas_receber.view", "operacao", "Operação", "contas_receber", "Contas a receber", "view"],
	["finan.contas_receber.manage", "operacao", "Operação", "contas_receber", "Contas a receber", "manage"],
	["finan.faturamento.view", "operacao", "Operação", "faturamento", "Faturamento", "view"],
	["finan.notas.view", "operacao", "Operação", "notas", "Notas fiscais", "view"],
	["finan.notas.manage", "operacao", "Operação", "notas", "Notas fiscais", "manage"],
	["finan.contratos.view", "operacao", "Operação", "contratos", "Contratos recorrentes", "view"],
	["finan.contratos.manage", "operacao", "Operação", "contratos", "Contratos recorrentes", "manage"],
	["finan.reports.view", "analises", "Análises", "reports", "Reports", "view"],
	["finan.reports.manage", "analises", "Análises", "reports", "Reports", "manage"],
	["finan.equipe.view", "sistema", "Sistema", "equipe", "Equipe", "view"],
	["finan.equipe.manage", "sistema", "Sistema", "equipe", "Equipe", "manage"],
	["finan.integracoes.view", "sistema", "Sistema", "integracoes", "Integrações APIs", "view"],
	["finan.integracoes.manage", "sistema", "Sistema", "integracoes", "Integrações APIs", "manage"],
	["finan.configuracoes.view", "sistema", "Sistema", "configuracoes", "Configurações gerais", "view"],
	["finan.configuracoes.manage", "sistema", "Sistema", "configuracoes", "Configurações gerais", "manage"],
	["finan.usuarios.manage", "sistema", "Sistema", "usuarios", "Usuários, cargos e permissões", "manage"],
	["finan.pin.manage", "sistema", "Sistema", "pin", "PIN de bloqueio", "manage"],
	["finan.calendario.manage", "sistema", "Sistema", "calendario", "Calendário Financeiro", "manage"],
	["finan.pendencias.view", "sistema", "Sistema", "pendencias", "Central de Pendências", "view"],
	["finan.qualidade_dados.view", "sistema", "Sistema", "qualidade_dados", "Qualidade de Dados", "view"],
	["finan.anexos.view", "sistema", "Sistema", "anexos", "Biblioteca de Documentos", "view"],
	["finan.anexos.manage", "sistema", "Sistema", "anexos", "Biblioteca de Documentos", "manage"],
];

const PERMISSION_CATALOG = PERMISSION_DEFINITIONS.map(
	([id, sectionId, sectionLabel, featureId, featureLabel, action], sortOrder) => ({
		id,
		sectionId,
		sectionLabel,
		featureId,
		featureLabel,
		action,
		description: "",
		sortOrder,
	}),
);

const PERMISSION_IDS = new Set(PERMISSION_CATALOG.map((item) => item.id));

function isKnownPermission(id) {
	return PERMISSION_IDS.has(String(id || ""));
}

module.exports = { PERMISSION_CATALOG, PERMISSION_IDS, isKnownPermission };
