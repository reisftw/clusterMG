const db = require("./db");

const ADMIN_ROLE = "admin";
const ADM_ROLE_IDS = new Set([
	"admin",
	"supervisor_administrativo",
	"analista_administrativo",
	"lider_empresa",
	"supervisor_empresa",
	"agente_autorizado",
	"visitante",
]);

const ADM_PERMISSION_SECTIONS = new Set([
	"destaque",
	"empresas",
	"administrativo",
	"administracao",
	"facilities",
	"configuracao",
]);

const ADM_DASHBOARD_PERMISSION_IDS = new Set(["destaque.dashboard.view"]);
const ADM_CONFIG_FEATURES = new Set([
	"geral",
	"notificacoes",
	"usuarios",
	"cargos_permissoes",
	"email",
	"banco_dados",
	"auditoria",
]);

const STATIC_ADM_PERMISSIONS = Object.freeze([
	{
		id: "facilities.dashboard.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "dashboard",
		featureLabel: "Visão Geral",
		action: "view",
		description: "Visualizar o painel executivo de Facilities.",
		sortOrder: 4100,
		legacyPermission: "view_imoveis_administrativos",
	},
	{
		id: "facilities.imoveis_espacos.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "imoveis_espacos",
		featureLabel: "Imóveis & Espaços",
		action: "view",
		description: "Visualizar imóveis, unidades e espaços administrativos.",
		sortOrder: 4110,
		legacyPermission: "view_imoveis_administrativos",
	},
	{
		id: "facilities.imoveis.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "imoveis_espacos",
		featureLabel: "Imóveis & Espaços",
		action: "view",
		description: "Visualizar imóveis e espaços de Facilities.",
		sortOrder: 4111,
		legacyPermission: "facilities.imoveis_espacos.view",
	},
	{
		id: "facilities.imoveis.create",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "imoveis_espacos",
		featureLabel: "Imóveis & Espaços",
		action: "create",
		description: "Criar imóveis e espaços de Facilities.",
		sortOrder: 4112,
		legacyPermission: "administrativo.imoveis.manage",
	},
	{
		id: "facilities.imoveis.edit",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "imoveis_espacos",
		featureLabel: "Imóveis & Espaços",
		action: "edit",
		description: "Editar imóveis e espaços de Facilities.",
		sortOrder: 4113,
		legacyPermission: "administrativo.imoveis.manage",
	},
	{
		id: "facilities.imoveis.deactivate",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "imoveis_espacos",
		featureLabel: "Imóveis & Espaços",
		action: "deactivate",
		description: "Inativar imóveis e espaços preservando histórico.",
		sortOrder: 4114,
		legacyPermission: "administrativo.imoveis.manage",
	},
	{
		id: "facilities.patrimonio_inventario.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "patrimonio",
		featureLabel: "Patrimônio",
		action: "view",
		description: "Visualizar patrimônio e itens administrativos.",
		sortOrder: 4120,
		legacyPermission: "facilities.patrimonio_inventario.view",
	},
	{
		id: "facilities.patrimonio.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "patrimonio",
		featureLabel: "Patrimônio",
		action: "view",
		description: "Visualizar ativos patrimoniais.",
		sortOrder: 4121,
		legacyPermission: "facilities.patrimonio_inventario.view",
	},
	{
		id: "facilities.patrimonio.create",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "patrimonio",
		featureLabel: "Patrimônio",
		action: "create",
		description: "Criar ativos patrimoniais.",
		sortOrder: 4122,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.patrimonio.edit",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "patrimonio",
		featureLabel: "Patrimônio",
		action: "edit",
		description: "Editar ativos patrimoniais.",
		sortOrder: 4123,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.patrimonio.transfer",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "patrimonio",
		featureLabel: "Patrimônio",
		action: "transfer",
		description: "Transferir ativos patrimoniais.",
		sortOrder: 4124,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.patrimonio.deactivate",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "patrimonio",
		featureLabel: "Patrimônio",
		action: "deactivate",
		description: "Inativar ativos patrimoniais preservando histórico.",
		sortOrder: 4125,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.patrimonio.qr.export",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "patrimonio",
		featureLabel: "Patrimônio",
		action: "qr_export",
		description: "Exportar QR Code de patrimônio.",
		sortOrder: 4126,
		legacyPermission: "facilities.patrimonio_inventario.view",
	},
	{
		id: "facilities.inventario.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "inventarios",
		featureLabel: "Inventários",
		action: "view",
		description: "Visualizar inventários patrimoniais.",
		sortOrder: 4127,
		legacyPermission: "facilities.patrimonio_inventario.view",
	},
	{
		id: "facilities.inventario.execute",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "inventarios",
		featureLabel: "Inventários",
		action: "execute",
		description: "Executar inventários patrimoniais.",
		sortOrder: 4128,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.inventario.approve",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "inventarios",
		featureLabel: "Inventários",
		action: "approve",
		description: "Aprovar inventários patrimoniais.",
		sortOrder: 4129,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.acessos_chaves.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "acessos_chaves",
		featureLabel: "Acessos & Chaves",
		action: "view",
		description: "Visualizar acessos e chaves do ADM.",
		sortOrder: 4130,
		legacyPermission: "view_imoveis_administrativos",
	},
	{
		id: "facilities.chaves.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "chaves",
		featureLabel: "Acessos & Chaves",
		action: "view",
		description: "Visualizar chaves nativas do ADM.",
		sortOrder: 4131,
		legacyPermission: "facilities.acessos_chaves.view",
	},
	{
		id: "facilities.chaves.create",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "chaves",
		featureLabel: "Acessos & Chaves",
		action: "create",
		description: "Criar chaves no ADM.",
		sortOrder: 4132,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.chaves.edit",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "chaves",
		featureLabel: "Acessos & Chaves",
		action: "edit",
		description: "Editar chaves do ADM.",
		sortOrder: 4133,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.chaves.checkout",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "chaves",
		featureLabel: "Acessos & Chaves",
		action: "checkout",
		description: "Registrar retirada de chave.",
		sortOrder: 4134,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.chaves.return",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "chaves",
		featureLabel: "Acessos & Chaves",
		action: "return",
		description: "Registrar devolução de chave.",
		sortOrder: 4135,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.chaves.declare_lost",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "chaves",
		featureLabel: "Acessos & Chaves",
		action: "declare_lost",
		description: "Declarar chave perdida.",
		sortOrder: 4136,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.chaves.deactivate",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "chaves",
		featureLabel: "Acessos & Chaves",
		action: "deactivate",
		description: "Inativar chave preservando histórico.",
		sortOrder: 4137,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.chaves.qr.generate",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "chaves",
		featureLabel: "Acessos & Chaves",
		action: "qr_generate",
		description: "Gerar ou regenerar QR Code de chave.",
		sortOrder: 4138,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.chaves.qr.export",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "chaves",
		featureLabel: "Acessos & Chaves",
		action: "qr_export",
		description: "Exportar QR Code de chave em PNG/PDF.",
		sortOrder: 4139,
		legacyPermission: "facilities.acessos_chaves.view",
	},
	{
		id: "facilities.operacao_predial.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "operacao_predial",
		featureLabel: "Operação Predial",
		action: "view",
		description: "Visualizar rotinas, checklists e ocorrências prediais.",
		sortOrder: 4140,
		legacyPermission: "view_imoveis_administrativos",
	},
	{
		id: "facilities.operacao_predial.manage",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "operacao_predial",
		featureLabel: "Operação Predial",
		action: "manage",
		description: "Gerenciar rotinas, checklists e ocorrências prediais.",
		sortOrder: 4141,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.seguranca_conformidade.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "seguranca_conformidade",
		featureLabel: "Segurança & Conformidade",
		action: "view",
		description: "Visualizar conformidades, laudos e vencimentos críticos.",
		sortOrder: 4150,
		legacyPermission: "view_imoveis_administrativos",
	},
	{
		id: "facilities.seguranca.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "seguranca_conformidade",
		featureLabel: "Segurança & Conformidade",
		action: "view",
		description: "Visualizar itens de segurança e conformidade.",
		sortOrder: 4151,
		legacyPermission: "facilities.seguranca_conformidade.view",
	},
	{
		id: "facilities.seguranca.create",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "seguranca_conformidade",
		featureLabel: "Segurança & Conformidade",
		action: "create",
		description: "Criar itens de segurança e conformidade.",
		sortOrder: 4152,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.seguranca.edit",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "seguranca_conformidade",
		featureLabel: "Segurança & Conformidade",
		action: "edit",
		description: "Editar itens de segurança e conformidade.",
		sortOrder: 4153,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.seguranca.inspect",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "seguranca_conformidade",
		featureLabel: "Segurança & Conformidade",
		action: "inspect",
		description: "Registrar inspeções de segurança.",
		sortOrder: 4154,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.seguranca.deactivate",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "seguranca_conformidade",
		featureLabel: "Segurança & Conformidade",
		action: "deactivate",
		description: "Inativar itens de segurança preservando histórico.",
		sortOrder: 4155,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.fornecedores_contratos.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "fornecedores_contratos",
		featureLabel: "Fornecedores & Contratos",
		action: "view",
		description: "Visualizar fornecedores, SLAs e contratos de Facilities.",
		sortOrder: 4160,
		legacyPermission: "view_imoveis_administrativos",
	},
	{
		id: "facilities.fornecedores.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "fornecedores_contratos",
		featureLabel: "Fornecedores & Contratos",
		action: "view",
		description: "Visualizar fornecedores de Facilities.",
		sortOrder: 4161,
		legacyPermission: "facilities.fornecedores_contratos.view",
	},
	{
		id: "facilities.fornecedores.manage",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "fornecedores_contratos",
		featureLabel: "Fornecedores & Contratos",
		action: "manage",
		description: "Gerenciar fornecedores de Facilities.",
		sortOrder: 4162,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.contratos.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "fornecedores_contratos",
		featureLabel: "Fornecedores & Contratos",
		action: "view",
		description: "Visualizar contratos de Facilities.",
		sortOrder: 4163,
		legacyPermission: "facilities.fornecedores_contratos.view",
	},
	{
		id: "facilities.contratos.manage",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "fornecedores_contratos",
		featureLabel: "Fornecedores & Contratos",
		action: "manage",
		description: "Gerenciar contratos de Facilities.",
		sortOrder: 4164,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.consumos.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "consumos",
		featureLabel: "Consumos",
		action: "view",
		description: "Visualizar consumos e custos prediais.",
		sortOrder: 4170,
		legacyPermission: "view_imoveis_administrativos",
	},
	{
		id: "facilities.consumos.create",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "consumos",
		featureLabel: "Consumos",
		action: "create",
		description: "Criar registros de consumo predial.",
		sortOrder: 4171,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.consumos.edit",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "consumos",
		featureLabel: "Consumos",
		action: "edit",
		description: "Editar registros de consumo predial.",
		sortOrder: 4172,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.score.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "score",
		featureLabel: "Saúde das Unidades",
		action: "view",
		description: "Visualizar indicador de saúde operacional por unidade.",
		sortOrder: 4180,
		legacyPermission: "view_imoveis_administrativos",
	},
	{
		id: "facilities.saude.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "score",
		featureLabel: "Saúde das Unidades",
		action: "view",
		description: "Visualizar indicador de saúde das unidades.",
		sortOrder: 4181,
		legacyPermission: "facilities.score.view",
	},
	{
		id: "facilities.saude.configure",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "score",
		featureLabel: "Saúde das Unidades",
		action: "configure",
		description: "Configurar regras do indicador de saúde das unidades.",
		sortOrder: 4182,
		legacyPermission: "facilities.manage",
	},
	{
		id: "facilities.relatorios.view",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "relatorios",
		featureLabel: "Relatórios",
		action: "view",
		description: "Visualizar relatórios consolidados de Facilities.",
		sortOrder: 4190,
		legacyPermission: "view_imoveis_administrativos",
	},
	{
		id: "facilities.manage",
		sectionId: "facilities",
		sectionLabel: "Facilities",
		featureId: "gestao",
		featureLabel: "Gestão",
		action: "manage",
		description: "Gerenciar cadastros e configurações de Facilities.",
		sortOrder: 4200,
		legacyPermission: "manage_imoveis_administrativos",
	},
	{
		id: "administrativo.auditoria.view",
		sectionId: "administracao",
		sectionLabel: "Administração",
		featureId: "auditoria",
		featureLabel: "Auditoria",
		action: "view",
		description: "Visualizar logs de auditoria administrativa.",
		sortOrder: 5100,
		legacyPermission: "configuracao.auditoria.view",
	},
	{
		id: "administrativo.email.view",
		sectionId: "administracao",
		sectionLabel: "Administração",
		featureId: "email",
		featureLabel: "E-mail",
		action: "view",
		description: "Visualizar configurações e logs de e-mail administrativo.",
		sortOrder: 5110,
		legacyPermission: "mensageria.email_config.view",
	},
	{
		id: "administrativo.email.manage",
		sectionId: "administracao",
		sectionLabel: "Administração",
		featureId: "email",
		featureLabel: "E-mail",
		action: "manage",
		description: "Gerenciar templates, SMTP e testes de e-mail administrativo.",
		sortOrder: 5111,
		legacyPermission: "mensageria.email_config.manage",
	},
]);

function isAdmRole(role = {}) {
	return ADM_ROLE_IDS.has(normalizeRole(role.id || role.role));
}

function isAdmPermission(permission = {}) {
	if (ADM_DASHBOARD_PERMISSION_IDS.has(permission.id)) return true;
	if (!ADM_PERMISSION_SECTIONS.has(permission.sectionId)) return false;
	if (permission.sectionId === "destaque") return false;
	if (permission.sectionId === "configuracao") {
		return ADM_CONFIG_FEATURES.has(permission.featureId);
	}
	return true;
}

const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
	admin: ["*"],
	backoffice_retirada: [
		"view_dashboard",
		"view_diario",
		"view_acerto_estoque",
		"manage_acerto_estoque",
		"view_estoque_integrado",
		"view_equipamentos",
		"view_mapa",
		"view_metas",
		"view_cobrancas",
		"view_relatorios",
		"view_agenda",
		"view_agendamentos",
		"view_visitas",
		"view_duvidas",
		"view_retiradas",
		"view_entregas_tecnicos",
		"tecnicos.auditoria_bolsa.view",
		"tecnicos.auditoria_bolsa.manage",
		"view_logistica",
		"manage_logistica",
		"view_ferramentas",
		"view_regionais",
		"view_agentes",
		"request_ferias",
		"manage_colaboradores",
		"manage_metas",
		"manage_cobrancas",
		"manage_duvidas",
		"manage_retiradas",
		"manage_entregas_tecnicos",
		"manage_feriados",
		"manage_regionais",
		"manage_agentes",
		"manage_agenda",
		"manage_agendamentos",
		"manage_visitas",
		"manage_equipamentos",
		"manage_veiculos",
		"view_mensageria",
		"view_confirmacao_agendamentos",
		"view_insumos_requisicoes",
		"view_insumos_administrativos",
		"manage_insumos_administrativos",
	],
	supervisor: [
		"view_dashboard",
		"view_diario",
		"view_acerto_estoque",
		"manage_acerto_estoque",
		"view_estoque_integrado",
		"view_equipamentos",
		"view_mapa",
		"view_metas",
		"view_cobrancas",
		"view_relatorios",
		"view_agenda",
		"view_agendamentos",
		"view_visitas",
		"view_duvidas",
		"view_retiradas",
		"view_entregas_tecnicos",
		"tecnicos.auditoria_bolsa.view",
		"tecnicos.auditoria_bolsa.manage",
		"view_logistica",
		"manage_logistica",
		"view_empresas_tecnicos",
		"manage_empresas_tecnicos",
		"view_documentos",
		"view_documentos_tratativas",
		"view_ferramentas",
		"view_regionais",
		"view_agentes",
		"request_ferias",
		"manage_colaboradores",
		"manage_metas",
		"manage_cobrancas",
		"manage_duvidas",
		"manage_retiradas",
		"manage_entregas_tecnicos",
		"manage_feriados",
		"manage_regionais",
		"manage_agentes",
		"manage_agenda",
		"manage_agendamentos",
		"manage_visitas",
		"manage_equipamentos",
		"manage_veiculos",
		"view_mensageria",
		"view_confirmacao_agendamentos",
		"manage_users",
		"manage_general_settings",
		"view_insumos_administrativos",
		"view_insumos_requisicoes",
		"manage_insumos_administrativos",
	],
	supervisor_administrativo: [
		"view_dashboard",
		"view_empresas_tecnicos",
		"manage_empresas_tecnicos",
		"view_documentos",
		"view_documentos_tratativas",
		"manage_documentos",
		"view_documentos_relatorios",
		"view_insumos_administrativos",
		"view_insumos_requisicoes",
		"manage_insumos_administrativos",
		"view_imoveis_administrativos",
		"manage_imoveis_administrativos",
		"facilities.dashboard.view",
		"facilities.imoveis_espacos.view",
		"facilities.patrimonio_inventario.view",
		"facilities.acessos_chaves.view",
		"facilities.operacao_predial.view",
		"facilities.seguranca_conformidade.view",
		"facilities.fornecedores_contratos.view",
		"facilities.consumos.view",
		"facilities.score.view",
		"facilities.relatorios.view",
		"facilities.manage",
		"manage_general_settings",
		"manage_users",
		"manage_roles",
	],
	analista_administrativo: [
		"view_dashboard",
		"view_empresas_tecnicos",
		"manage_empresas_tecnicos",
		"view_documentos",
		"view_documentos_tratativas",
		"view_documentos_relatorios",
		"view_insumos_administrativos",
		"view_insumos_requisicoes",
		"manage_insumos_administrativos",
		"view_imoveis_administrativos",
		"manage_imoveis_administrativos",
		"facilities.dashboard.view",
		"facilities.imoveis_espacos.view",
		"facilities.patrimonio_inventario.view",
		"facilities.acessos_chaves.view",
		"facilities.operacao_predial.view",
		"facilities.seguranca_conformidade.view",
		"facilities.fornecedores_contratos.view",
		"facilities.consumos.view",
		"facilities.score.view",
		"facilities.relatorios.view",
	],
	lider_empresa: [
		"view_dashboard",
		"view_empresas_tecnicos",
		"view_documentos",
		"view_insumos_requisicoes",
		"tecnicos.auditoria_bolsa.view",
	],
	supervisor_empresa: [
		"view_dashboard",
		"view_empresas_tecnicos",
		"view_documentos",
		"view_documentos_tratativas",
	],
	agente_autorizado: [
		"view_empresas_tecnicos",
		"view_documentos",
		"view_insumos_requisicoes",
	],
	backoffice: [
		"view_dashboard",
		"view_acerto_estoque",
		"manage_acerto_estoque",
		"view_insumos_requisicoes",
		"tecnicos.auditoria_bolsa.view",
		"tecnicos.auditoria_bolsa.manage",
	],
	visitante: ["view_dashboard", "view_insumos_requisicoes"],
});

function normalizeRole(role) {
	return String(role || "")
		.trim()
		.toLowerCase();
}

function normalizePermissions(permissions = []) {
	return [
		...new Set(
			(Array.isArray(permissions) ? permissions : [])
				.map((permission) => String(permission || "").trim())
				.filter(Boolean),
		),
	].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

async function listRoles() {
	const result = await db.query(
		`select r.id, r.name, r.description, r.system_role, r.active,
            coalesce(array_agg(rp.permission order by rp.permission) filter (where rp.permission is not null), '{}') as permissions
       from app_roles r
       left join app_role_permissions rp on rp.role_id = r.id
      group by r.id
      order by r.system_role desc, r.name asc`,
	);
	return result.rows.map((row) => ({
		id: row.id,
		name: row.name,
		description: row.description || "",
		systemRole: Boolean(row.system_role),
		active: Boolean(row.active),
		permissions: normalizePermissions(row.permissions || []),
	})).filter(isAdmRole);
}

async function listPermissionCatalog() {
	try {
		const result = await db.query(
			`select id,
              section_id as "sectionId",
              section_label as "sectionLabel",
              feature_id as "featureId",
              feature_label as "featureLabel",
              action,
              description,
              sort_order as "sortOrder",
              legacy_permission as "legacyPermission"
         from app_permissions
        where active = true
		  and deprecated = false
		order by sort_order asc, id asc`,
		);
		const permissions = result.rows.filter(isAdmPermission);
		const existingIds = new Set(permissions.map((permission) => permission.id));
		return [
			...permissions,
			...STATIC_ADM_PERMISSIONS.filter(
				(permission) => !existingIds.has(permission.id),
			),
		].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
	} catch (error) {
		if (error?.code !== "42P01") throw error;
		return [...STATIC_ADM_PERMISSIONS];
	}
}

async function getRoleById(id) {
	const roleId = normalizeRole(id);
	if (!roleId) return null;
	const result = await db.query(
		`select r.id, r.name, r.description, r.system_role, r.active,
            coalesce(array_agg(rp.permission order by rp.permission) filter (where rp.permission is not null), '{}') as permissions
       from app_roles r
       left join app_role_permissions rp on rp.role_id = r.id
      where r.id = $1
      group by r.id`,
		[roleId],
	);
	const row = result.rows[0];
	if (!row) return null;
	return {
		id: row.id,
		name: row.name,
		description: row.description || "",
		systemRole: Boolean(row.system_role),
		active: Boolean(row.active),
		permissions: normalizePermissions(row.permissions || []),
	};
}

async function getRolePermissions(role) {
	const roleId = normalizeRole(role);
	if (!roleId) return [];
	if (roleId === ADMIN_ROLE) return ["*"];

	try {
		const result = await db.query(
			`select rp.permission
         from app_roles r
         join app_role_permissions rp on rp.role_id = r.id
        where r.id = $1
          and r.active = true
        order by rp.permission`,
			[roleId],
		);
		if (result.rows.length)
			return normalizePermissions(result.rows.map((row) => row.permission));
	} catch (error) {
		if (error?.code !== "42P01") throw error;
	}

	return DEFAULT_ROLE_PERMISSIONS[roleId] || [];
}

async function enrichUserWithPermissions(user) {
	if (!user) return user;
	const role = normalizeRole(user.role);
	const permissions = await getRolePermissions(role);
	return {
		...user,
		role,
		permissions,
		isAdmin: role === ADMIN_ROLE || permissions.includes("*"),
	};
}

async function deleteRole(id) {
	const roleId = normalizeRole(id);
	if (!roleId || roleId === ADMIN_ROLE) {
		const error = new Error("Este cargo nao pode ser excluido.");
		error.statusCode = 400;
		throw error;
	}

	await db.query("begin");
	try {
		const current = await getRoleById(roleId);
		if (!current) {
			const error = new Error("Cargo nao encontrado.");
			error.statusCode = 404;
			throw error;
		}
		if (current.systemRole) {
			const error = new Error("Cargos do sistema nao podem ser excluidos.");
			error.statusCode = 400;
			throw error;
		}
		const users = await db.query(
			"select count(*)::int as total from app_users where lower(role) = $1",
			[roleId],
		);
		if (Number(users.rows[0]?.total || 0) > 0) {
			const error = new Error("Nao e possivel excluir cargo vinculado a usuarios.");
			error.statusCode = 409;
			throw error;
		}

		await db.query("delete from app_role_permissions where role_id = $1", [roleId]);
		await db.query("delete from app_roles where id = $1", [roleId]);
		await db.query("commit");
		return current;
	} catch (error) {
		await db.query("rollback").catch(() => {});
		throw error;
	}
}

async function saveRole({
	id,
	name,
	description = "",
	active = true,
	permissions = [],
}) {
	const roleId = normalizeRole(id);
	if (!roleId || roleId === ADMIN_ROLE) {
		const error = new Error("Este cargo nao pode ser alterado por aqui.");
		error.statusCode = 400;
		throw error;
	}

	const catalog = await listPermissionCatalog();
	const catalogIds = new Set(catalog.map((permission) => permission.id));
	const cleanPermissions = normalizePermissions(permissions).filter(
		(permission) =>
			permission !== "*" && (!catalogIds.size || catalogIds.has(permission)),
	);
	await db.query("begin");
	try {
		const current = await db.query(
			"select system_role from app_roles where id = $1",
			[roleId],
		);
		await db.query(
			`insert into app_roles (id, name, description, system_role, active)
       values ($1, $2, $3, coalesce($4, false), $5)
       on conflict (id) do update set
         name = excluded.name,
         description = excluded.description,
         active = excluded.active`,
			[
				roleId,
				String(name || roleId).trim(),
				String(description || "").trim(),
				current.rows[0]?.system_role ?? false,
				Boolean(active),
			],
		);
		await db.query("delete from app_role_permissions where role_id = $1", [
			roleId,
		]);
		for (const permission of cleanPermissions) {
			await db.query(
				`insert into app_role_permissions (role_id, permission)
         values ($1, $2)
         on conflict do nothing`,
				[roleId, permission],
			);
		}
		await db.query("commit");
	} catch (error) {
		await db.query("rollback");
		throw error;
	}
}

module.exports = {
	deleteRole,
	enrichUserWithPermissions,
	getRoleById,
	getRolePermissions,
	listPermissionCatalog,
	listRoles,
	saveRole,
};
