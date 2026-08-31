import {
	BadgeDollarSign,
	BarChart3,
	BellRing,
	Boxes,
	Building2,
	CalendarCheck,
	CalendarClock,
	CalendarDays,
	CalendarRange,
	ChevronDown,
	ClipboardCheck,
	ClipboardList,
	Clock,
	Database,
	FileCheck2,
	FileClock,
	FileSearch,
	FileText,
	Files,
	LayoutDashboard,
	ListChecks,
	Mail,
	Map,
	MapPin,
	MessageCircle,
	MessageCircleReply,
	MessagesSquare,
	MonitorPlay,
	PackageCheck,
	PackagePlus,
	PackageSearch,
	PanelLeftClose,
	PanelLeftOpen,
	Plug,
	Search,
	Send,
	Server,
	Settings,
	ShieldCheck,
	SlidersHorizontal,
	Star,
	Target,
	Truck,
	UserCog,
	UserSquare2,
	Users,
	Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { getRoleLabel, hasAnyPermission } from "../../constants/roles";
import { useAuthContext } from "../../context/AuthContext";
import { useLayoutMode } from "../../context/LayoutModeContext";
import { buscarEstatisticasAtendimento } from "../../modules/atendimento/services/atendimentoService";
import { ROUTES } from "../../router/routes";
import { obterContadoresNotificacoes } from "../../services/internalNotificationsService";
import { subscribeRealtimeTopics } from "../../services/realtimeEvents";

const NAV_ITEMS = [
	{
		label: "Acerto de Estoque",
		path: ROUTES.ACERTO_ESTOQUE,
		icon: Boxes,
		permission: [
			"view_acerto_estoque",
			"estoque.acerto_estoque.view",
			"estoque.acerto_estoque.manage",
		],
	},
	{
		label: "Equipamentos",
		path: ROUTES.ESTOQUE_EQUIPAMENTOS,
		icon: PackageSearch,
		permission: [
			"view_estoque_integrado",
			"estoque.equipamentos.view",
			"estoque.equipamentos.manage",
		],
	},
	{
		label: "Bolsa Técnico",
		path: ROUTES.TECNICOS_AUDITORIA_BOLSA,
		icon: PackageSearch,
		permission: [
			"tecnicos.auditoria_bolsa.view",
			"tecnicos.auditoria_bolsa.manage",
		],
	},
	{
		label: "Relatórios",
		path: ROUTES.TECNICOS_AUDITORIA_RELATORIOS,
		icon: BarChart3,
		permission: [
			"tecnicos.auditoria_bolsa.view",
			"tecnicos.auditoria_bolsa.manage",
		],
	},
	{
		label: "Consulta",
		path: ROUTES.ESTOQUE_CONSULTA,
		icon: Search,
		permission: ["view_estoque_integrado", "estoque.consulta.view"],
	},
	{
		label: "Dashboard",
		path: ROUTES.DASHBOARD,
		icon: LayoutDashboard,
		permission: ["view_dashboard", "destaque.dashboard.view"],
		featured: true,
	},
	{
		label: "Diário",
		path: ROUTES.DIARIO,
		icon: ClipboardList,
		permission: [
			"view_diario",
			"destaque.diario.view",
			"destaque.diario.manage",
		],
		featured: true,
	},
	{
		label: "Mapa O.S",
		path: ROUTES.MAPA,
		icon: Map,
		permission: ["view_mapa", "destaque.mapa_os.view"],
		featured: true,
	},
	{
		label: "Metas",
		path: ROUTES.METAS,
		icon: Target,
		permission: ["view_metas", "destaque.metas.view", "destaque.metas.manage"],
		featured: true,
	},
	{
		label: "Colaboradores",
		path: ROUTES.COLABORADORES,
		icon: UserSquare2,
		permission: [
			"manage_colaboradores",
			"equipe.colaboradores.view",
			"equipe.colaboradores.manage",
		],
	},
	{
		label: "Férias",
		path: ROUTES.FERIAS,
		icon: CalendarDays,
		permission: [
			"request_ferias",
			"equipe.ferias.view",
			"equipe.ferias.manage",
		],
	},
	{
		label: "Regionais",
		path: ROUTES.REGIONAIS,
		icon: MapPin,
		permission: [
			"view_regionais",
			"configuracao.regionais.view",
			"configuracao.regionais.manage",
		],
	},
	{
		label: "Agentes",
		path: ROUTES.AGENTES,
		icon: Star,
		permission: [
			"view_agentes",
			"configuracao.agentes.view",
			"configuracao.agentes.manage",
		],
	},
	{
		label: "Agenda da Equipe",
		path: ROUTES.AGENDA,
		icon: CalendarRange,
		permission: ["view_agenda", "equipe.agenda.view", "equipe.agenda.manage"],
	},
	{
		label: "Agendamentos",
		path: ROUTES.AGENDAMENTOS,
		icon: CalendarClock,
		permission: [
			"view_agendamentos",
			"cliente.agendamentos.view",
			"cliente.agendamentos.manage",
		],
		featured: true,
	},
	{
		label: "Entrega",
		path: ROUTES.ENTREGAS_TECNICOS,
		icon: PackageCheck,
		permission: [
			"view_entregas_tecnicos",
			"tecnicos.entrega_tecnicos.view",
			"tecnicos.entrega_tecnicos.manage",
		],
	},
	{
		label: "Logística",
		path: ROUTES.LOGISTICA,
		icon: Truck,
		permission: [
			"view_logistica",
			"logistica.logistica.view",
			"logistica.logistica.manage",
		],
	},
	{
		label: "Visão Geral",
		path: ROUTES.FINANCEIRO,
		icon: BadgeDollarSign,
		permission: [
			"financeiro.visao_geral.view",
			"financeiro.visao_geral.manage",
		],
	},
	{
		label: "Contas a Pagar",
		path: ROUTES.FINANCEIRO_CONTAS_PAGAR,
		icon: ClipboardList,
		permission: [
			"financeiro.contas_pagar.view",
			"financeiro.contas_pagar.manage",
		],
	},
	{
		label: "Contas a Receber",
		path: ROUTES.FINANCEIRO_CONTAS_RECEBER,
		icon: PackageCheck,
		permission: [
			"financeiro.contas_receber.view",
			"financeiro.contas_receber.manage",
		],
	},
	{
		label: "Faturamento",
		path: ROUTES.FINANCEIRO_FATURAMENTO,
		icon: BarChart3,
		permission: ["financeiro.faturamento.view"],
	},
	{
		label: "Notas Fiscais",
		path: ROUTES.FINANCEIRO_NOTAS,
		icon: FileCheck2,
		permission: ["financeiro.notas.view"],
	},
	{
		label: "Reports - Serasa",
		path: ROUTES.FINANCEIRO_REPORTS_SERASA,
		icon: BarChart3,
		permission: ["financeiro.chamados.view"],
	},
	{
		label: "Reports - Tarifas",
		path: ROUTES.FINANCEIRO_REPORTS_TARIFAS,
		icon: BarChart3,
		permission: ["financeiro.chamados.view"],
	},
	{
		label: "Reports - Tarifas - Faturas",
		path: ROUTES.FINANCEIRO_REPORTS_TARIFAS_FATURAS,
		icon: FileText,
		permission: ["financeiro.chamados.view"],
	},
	{
		label: "Reports - Tarifas - Receita Cliente",
		path: ROUTES.FINANCEIRO_REPORTS_TARIFAS_REC_CLIENTE,
		icon: Users,
		permission: ["financeiro.chamados.view"],
	},
	{
		label: "Reports - Tarifas - Formas de Pagamento",
		path: ROUTES.FINANCEIRO_REPORTS_TARIFAS_FORMAS_PAGAMENTO,
		icon: Wallet,
		permission: ["financeiro.chamados.view"],
	},
	{
		label: "Gestão Orçamento - Visão Geral",
		path: ROUTES.FINANCEIRO_GESTAO_ORCAMENTO,
		icon: Target,
		permission: [
			"financeiro.gestao_orcamento.view",
			"financeiro.gestao_orcamento.manage",
		],
	},
	{
		label: "Gestão Orçamento - Dados",
		path: ROUTES.FINANCEIRO_ORCAMENTO_DADOS,
		icon: Database,
		permission: [
			"financeiro.gestao_orcamento.view",
			"financeiro.gestao_orcamento.manage",
		],
	},
	{
		label: "Gestão Orçamento - Centros de Custo",
		path: ROUTES.FINANCEIRO_ORCAMENTO_CENTROS_CUSTO,
		icon: Building2,
		permission: [
			"financeiro.gestao_orcamento.view",
			"financeiro.gestao_orcamento.manage",
		],
	},
	{
		label: "Gestão Orçamento - DRE",
		path: ROUTES.FINANCEIRO_ORCAMENTO_DRE,
		icon: BarChart3,
		permission: [
			"financeiro.gestao_orcamento.view",
			"financeiro.gestao_orcamento.manage",
		],
	},
	{
		label: "Gestão Orçamento - Aprovações",
		path: ROUTES.FINANCEIRO_ORCAMENTO_APROVACOES,
		icon: ClipboardCheck,
		permission: [
			"financeiro.gestao_orcamento.view",
			"financeiro.gestao_orcamento.manage",
		],
	},
	{
		label: "Gestão Orçamento - Configurações Orçamentárias",
		path: ROUTES.FINANCEIRO_ORCAMENTO_CONFIGURACOES,
		icon: Settings,
		permission: ["financeiro.gestao_orcamento.manage"],
	},
	{
		label: "Configurações Gerais",
		path: ROUTES.FINANCEIRO_CONFIGURACOES,
		icon: Settings,
		permission: [
			"financeiro.configuracoes.view",
			"financeiro.configuracoes.manage",
		],
	},
	{
		label: "Casos",
		path: ROUTES.ATENDIMENTO_CASOS,
		icon: MessagesSquare,
		permission: ["atendimento.casos.view", "atendimento.casos.manage"],
	},
	{
		label: "Técnicos WhatsApp",
		path: ROUTES.ATENDIMENTO_TECNICOS,
		icon: UserCog,
		permission: ["atendimento.tecnicos.view", "atendimento.tecnicos.manage"],
	},
	{
		label: "Avaliação",
		path: ROUTES.ATENDIMENTO_AVALIACOES,
		icon: Star,
		permission: ["atendimento.avaliacoes.manage"],
	},
	{
		label: "Configurações",
		path: ROUTES.ATENDIMENTO_CONFIGURACOES,
		icon: Settings,
		permission: [
			"atendimento.configuracoes.view",
			"atendimento.configuracoes.manage",
		],
	},
	{
		label: "Templates",
		path: ROUTES.ATENDIMENTO_TEMPLATES,
		icon: Files,
		permission: ["atendimento.templates.manage"],
	},
	{
		label: "Logs",
		path: ROUTES.ATENDIMENTO_LOGS,
		icon: ClipboardList,
		permission: ["atendimento.logs.view"],
	},
	{
		label: "Mensagens",
		path: ROUTES.ATENDIMENTO_MENSAGENS,
		icon: MessagesSquare,
		permission: ["atendimento.logs.view"],
	},
	{
		label: "Feriados",
		path: ROUTES.FERIADOS,
		icon: CalendarCheck,
		permission: [
			"manage_feriados",
			"equipe.feriados.view",
			"equipe.feriados.manage",
		],
	},
	{
		label: "Usuários",
		path: ROUTES.USUARIOS,
		icon: Users,
		permission: [
			"manage_users",
			"configuracao.usuarios.view",
			"configuracao.usuarios.manage",
		],
	},
	{
		label: "Cargos e Permissões",
		path: ROUTES.CARGOS_PERMISSOES,
		icon: ShieldCheck,
		permission: [
			"manage_roles",
			"configuracao.cargos_permissoes.view",
			"configuracao.cargos_permissoes.manage",
		],
	},
	{
		label: "Integrações",
		path: ROUTES.INTEGRACOES,
		icon: Plug,
		permission: [
			"view_integracoes",
			"configuracao.integracoes.view",
			"configuracao.integracoes.manage",
		],
	},
	{
		label: "Configurações de Envio",
		path: ROUTES.MENSAGERIA,
		icon: MessageCircle,
		permission: [
			"manage_mensageria",
			"mensageria.email_config.view",
			"mensageria.email_config.manage",
		],
	},
	{
		label: "API",
		path: ROUTES.MENSAGERIA_API,
		icon: Server,
		permission: [
			"manage_mensageria",
			"mensageria.api.view",
			"mensageria.api.manage",
		],
	},
	{
		label: "Fila",
		path: ROUTES.MENSAGERIA_FILA,
		icon: Clock,
		permission: [
			"manage_mensageria",
			"mensageria.fila.view",
			"mensageria.fila.manage",
		],
	},
	{
		label: "Enviados",
		path: ROUTES.MENSAGERIA_ENVIADOS,
		icon: Send,
		permission: ["view_mensageria", "mensageria.enviados.view"],
	},
	{
		label: "Relatórios",
		path: ROUTES.MENSAGERIA_RELATORIOS,
		icon: BarChart3,
		permission: ["view_mensageria_relatorios", "mensageria.relatorios.view"],
	},
	{
		label: "Confirmação de Agendamentos",
		path: ROUTES.MENSAGERIA_CONFIRMACAO_AGENDAMENTOS,
		icon: ShieldCheck,
		permission: [
			"view_confirmacao_agendamentos",
			"mensageria.confirmacao_agendamentos.view",
			"mensageria.confirmacao_agendamentos.manage",
		],
	},
	{
		label: "Backlog",
		path: ROUTES.MENSAGERIA_BACKLOG,
		icon: ListChecks,
		permission: [
			"view_mensageria",
			"mensageria.backlog.view",
			"mensageria.backlog.manage",
		],
	},
	{
		label: "Callback",
		path: ROUTES.MENSAGERIA_CALLBACK,
		icon: MessageCircleReply,
		permission: [
			"manage_mensageria",
			"mensageria.callback.view",
			"mensageria.callback.manage",
		],
	},
	{
		label: "Notificações",
		path: ROUTES.NOTIFICACOES,
		icon: BellRing,
		permission: [
			"manage_general_settings",
			"configuracao.notificacoes.view",
			"configuracao.notificacoes.manage",
		],
	},
	{
		label: "Geral",
		path: ROUTES.CONFIGURACOES_GERAIS,
		icon: SlidersHorizontal,
		permission: [
			"manage_general_settings",
			"configuracao.geral.view",
			"configuracao.geral.manage",
		],
	},
	{
		label: "APIs",
		path: ROUTES.API_STATUS,
		icon: Server,
		permission: [
			"manage_api_status",
			"configuracao.apis.view",
			"configuracao.apis.manage",
		],
	},
	{
		label: "Hubsoft",
		path: ROUTES.HUBSOFT_SETTINGS,
		icon: Plug,
		permission: [
			"manage_integracoes",
			"configuracao.hubsoft.view",
			"configuracao.hubsoft.manage",
		],
	},
	{
		label: "Cvortex",
		path: ROUTES.CVORTEX_SETTINGS,
		icon: MessageCircle,
		permission: [
			"manage_integracoes",
			"configuracao.cvortex.view",
			"configuracao.cvortex.manage",
		],
	},
	{
		label: "Senior / Sapiens",
		path: ROUTES.SENIOR_SETTINGS,
		icon: Database,
		permission: [
			"manage_integracoes",
			"configuracao.senior.view",
			"configuracao.senior.manage",
		],
	},
	{
		label: "Banco de Dados",
		path: ROUTES.DATABASE_BACKUPS,
		icon: Database,
		permission: [
			"manage_database_backups",
			"configuracao.banco_dados.view",
			"configuracao.banco_dados.manage",
		],
	},
	{
		label: "E-mail",
		path: ROUTES.EMAIL_SETTINGS,
		icon: Mail,
		permission: [
			"manage_email",
			"configuracao.email.view",
			"configuracao.email.manage",
		],
	},
	{
		label: "Logs de Auditoria",
		path: ROUTES.AUDITORIA_LOGS,
		icon: FileSearch,
		permission: ["configuracao.auditoria.view"],
	},
	{
		label: "Cadastro",
		path: ROUTES.EMPRESAS_TECNICOS,
		icon: Building2,
		permission: [
			"view_empresas_tecnicos",
			"empresas.cadastro.view",
			"empresas.cadastro.manage",
		],
	},
	{
		label: "Documentos Pendentes",
		path: ROUTES.DOCUMENTOS_PENDENTES,
		icon: FileClock,
		permission: [
			"view_documentos",
			"administrativo.documentos.view",
			"administrativo.documentos.manage",
		],
	},
	{
		label: "Tratativas",
		path: ROUTES.DOCUMENTOS_TRATATIVAS,
		icon: FileClock,
		permission: [
			"view_documentos_tratativas",
			"administrativo.documentos.view",
			"administrativo.documentos.manage",
		],
	},
	{
		label: "Documentos - Histórico",
		path: ROUTES.DOCUMENTOS_HISTORICO,
		icon: Files,
		permission: [
			"view_documentos",
			"administrativo.documentos.view",
			"administrativo.documentos.manage",
		],
	},
	{
		label: "Documentos Aprovados",
		path: ROUTES.DOCUMENTOS_APROVADOS,
		icon: FileCheck2,
		permission: [
			"view_documentos",
			"administrativo.documentos.view",
			"administrativo.documentos.manage",
		],
	},
	{
		label: "Documentos - Regras de Aprovação",
		path: ROUTES.DOCUMENTOS_CONFIGURACAO,
		icon: Settings,
		permission: ["manage_documentos", "administrativo.documentos.manage"],
	},
	{
		label: "Relatórios",
		path: ROUTES.DOCUMENTOS_RELATORIOS,
		icon: BarChart3,
		permission: [
			"view_documentos_relatorios",
			"administrativo.relatorios.view",
		],
	},
	{
		label: "Insumos - Estoque",
		path: ROUTES.INSUMOS_ADMINISTRATIVOS,
		icon: PackagePlus,
		permission: [
			"manage_insumos_administrativos",
			"administrativo.insumos.manage",
		],
	},
	{
		label: "Insumos - Requisições",
		path: ROUTES.INSUMOS_REQUISICOES,
		icon: ClipboardList,
		publicAuthenticated: true,
	},
	{
		label: "Imóveis",
		path: ROUTES.IMOVEIS_ADMINISTRATIVOS,
		icon: Building2,
		permission: [
			"view_imoveis_administrativos",
			"administrativo.imoveis.view",
			"administrativo.imoveis.manage",
		],
	},
	{
		label: "Imóveis - Contratos",
		path: ROUTES.IMOVEIS_ADMINISTRATIVOS_CONTRATOS,
		icon: Files,
		permission: [
			"view_imoveis_administrativos",
			"administrativo.imoveis.view",
			"administrativo.imoveis.manage",
		],
	},
	{
		label: "Imóveis - Histórico",
		path: ROUTES.IMOVEIS_ADMINISTRATIVOS_HISTORICO,
		icon: FileClock,
		permission: [
			"view_imoveis_administrativos",
			"administrativo.imoveis.view",
			"administrativo.imoveis.manage",
		],
	},
	{
		label: "Imóveis - Relatórios",
		path: ROUTES.IMOVEIS_ADMINISTRATIVOS_RELATORIOS,
		icon: BarChart3,
		permission: [
			"view_imoveis_administrativos",
			"administrativo.imoveis.view",
			"administrativo.imoveis.manage",
		],
	},
];

const MODERN_FEATURED_ORDER = [
	ROUTES.DASHBOARD,
	ROUTES.DIARIO,
	ROUTES.MAPA,
	ROUTES.METAS,
];
const MODERN_MENU_ORDER = [
	ROUTES.EMPRESAS_TECNICOS,
	ROUTES.AGENDAMENTOS,
	ROUTES.ENTREGAS_TECNICOS,
	ROUTES.TECNICOS_AUDITORIA_BOLSA,
	ROUTES.TECNICOS_AUDITORIA_RELATORIOS,
	ROUTES.ESTOQUE_BOLSA_TECNICO,
	ROUTES.LOGISTICA,
	ROUTES.FINANCEIRO,
	ROUTES.FINANCEIRO_CONTAS_PAGAR,
	ROUTES.FINANCEIRO_CONTAS_RECEBER,
	ROUTES.FINANCEIRO_FATURAMENTO,
	ROUTES.FINANCEIRO_NOTAS,
	ROUTES.FINANCEIRO_REPORTS_SERASA,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS_FATURAS,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS_REC_CLIENTE,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS_FORMAS_PAGAMENTO,
	ROUTES.FINANCEIRO_GESTAO_ORCAMENTO,
	ROUTES.FINANCEIRO_ORCAMENTO_DADOS,
	ROUTES.FINANCEIRO_ORCAMENTO_CENTROS_CUSTO,
	ROUTES.FINANCEIRO_ORCAMENTO_DRE,
	ROUTES.FINANCEIRO_ORCAMENTO_APROVACOES,
	ROUTES.FINANCEIRO_ORCAMENTO_CONFIGURACOES,
	ROUTES.FINANCEIRO_CONFIGURACOES,
	ROUTES.ATENDIMENTO_CASOS,
	ROUTES.ATENDIMENTO_TECNICOS,
	ROUTES.ATENDIMENTO_AVALIACOES,
	ROUTES.ATENDIMENTO_CONFIGURACOES,
	ROUTES.ATENDIMENTO_TEMPLATES,
	ROUTES.ATENDIMENTO_LOGS,
	ROUTES.ATENDIMENTO_MENSAGENS,
	ROUTES.ESTOQUE_EQUIPAMENTOS,
	ROUTES.ESTOQUE_CONSULTA,
	ROUTES.ACERTO_ESTOQUE,
	ROUTES.DOCUMENTOS_PENDENTES,
	ROUTES.DOCUMENTOS_TRATATIVAS,
	ROUTES.DOCUMENTOS_HISTORICO,
	ROUTES.DOCUMENTOS_APROVADOS,
	ROUTES.DOCUMENTOS_CONFIGURACAO,
	ROUTES.DOCUMENTOS_RELATORIOS,
	ROUTES.INSUMOS_ADMINISTRATIVOS,
	ROUTES.INSUMOS_REQUISICOES,
	ROUTES.IMOVEIS_ADMINISTRATIVOS,
	ROUTES.IMOVEIS_ADMINISTRATIVOS_CONTRATOS,
	ROUTES.IMOVEIS_ADMINISTRATIVOS_HISTORICO,
	ROUTES.IMOVEIS_ADMINISTRATIVOS_RELATORIOS,
	ROUTES.COLABORADORES,
	ROUTES.AGENDA,
	ROUTES.FERIADOS,
	ROUTES.FERIAS,
	ROUTES.MENSAGERIA_ENVIADOS,
	ROUTES.MENSAGERIA_RELATORIOS,
	ROUTES.MENSAGERIA_CONFIRMACAO_AGENDAMENTOS,
	ROUTES.MENSAGERIA_FILA,
	ROUTES.MENSAGERIA_BACKLOG,
	ROUTES.MENSAGERIA_CALLBACK,
	ROUTES.MENSAGERIA_API,
	ROUTES.MENSAGERIA,
	ROUTES.CONFIGURACOES_GERAIS,
	ROUTES.NOTIFICACOES,
	ROUTES.REGIONAIS,
	ROUTES.USUARIOS,
	ROUTES.AGENTES,
	ROUTES.INTEGRACOES,
	ROUTES.API_STATUS,
	ROUTES.HUBSOFT_SETTINGS,
	ROUTES.CVORTEX_SETTINGS,
	ROUTES.SENIOR_SETTINGS,
	ROUTES.DATABASE_BACKUPS,
	ROUTES.EMAIL_SETTINGS,
	ROUTES.AUDITORIA_LOGS,
];

const ADMINISTRATIVO_DOCUMENTOS_PATHS = [
	ROUTES.DOCUMENTOS_PENDENTES,
	ROUTES.DOCUMENTOS_TRATATIVAS,
	ROUTES.DOCUMENTOS_HISTORICO,
	ROUTES.DOCUMENTOS_APROVADOS,
	ROUTES.DOCUMENTOS_CONFIGURACAO,
];

const ADMINISTRATIVO_IMOVEIS_PATHS = [
	ROUTES.IMOVEIS_ADMINISTRATIVOS,
	ROUTES.IMOVEIS_ADMINISTRATIVOS_CONTRATOS,
	ROUTES.IMOVEIS_ADMINISTRATIVOS_HISTORICO,
	ROUTES.IMOVEIS_ADMINISTRATIVOS_RELATORIOS,
];

const ADMINISTRATIVO_INSUMOS_PATHS = [
	ROUTES.INSUMOS_ADMINISTRATIVOS,
	ROUTES.INSUMOS_REQUISICOES,
];

const TECNICOS_AUDITORIA_PATHS = [
	ROUTES.TECNICOS_AUDITORIA_BOLSA,
	ROUTES.TECNICOS_AUDITORIA_RELATORIOS,
];

const FINANCEIRO_PATHS = [
	ROUTES.FINANCEIRO,
	ROUTES.FINANCEIRO_CONTAS_PAGAR,
	ROUTES.FINANCEIRO_CONTAS_RECEBER,
	ROUTES.FINANCEIRO_FATURAMENTO,
	ROUTES.FINANCEIRO_NOTAS,
	ROUTES.FINANCEIRO_REPORTS_SERASA,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS_FATURAS,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS_REC_CLIENTE,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS_FORMAS_PAGAMENTO,
	ROUTES.FINANCEIRO_GESTAO_ORCAMENTO,
	ROUTES.FINANCEIRO_ORCAMENTO_DADOS,
	ROUTES.FINANCEIRO_ORCAMENTO_CENTROS_CUSTO,
	ROUTES.FINANCEIRO_ORCAMENTO_DRE,
	ROUTES.FINANCEIRO_ORCAMENTO_APROVACOES,
	ROUTES.FINANCEIRO_ORCAMENTO_CONFIGURACOES,
	ROUTES.FINANCEIRO_CONFIGURACOES,
];

const FINANCEIRO_ORCAMENTO_PATHS = [
	ROUTES.FINANCEIRO_GESTAO_ORCAMENTO,
	ROUTES.FINANCEIRO_ORCAMENTO_DADOS,
	ROUTES.FINANCEIRO_ORCAMENTO_CENTROS_CUSTO,
	ROUTES.FINANCEIRO_ORCAMENTO_DRE,
	ROUTES.FINANCEIRO_ORCAMENTO_APROVACOES,
	ROUTES.FINANCEIRO_ORCAMENTO_CONFIGURACOES,
];

const FINANCEIRO_REPORTS_PATHS = [
	ROUTES.FINANCEIRO_REPORTS_SERASA,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS_FATURAS,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS_REC_CLIENTE,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS_FORMAS_PAGAMENTO,
];

const FINANCEIRO_TARIFAS_REPORTS_PATHS = [
	ROUTES.FINANCEIRO_REPORTS_TARIFAS_FATURAS,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS_REC_CLIENTE,
	ROUTES.FINANCEIRO_REPORTS_TARIFAS_FORMAS_PAGAMENTO,
];

const DIRECT_MENU_DUPLICATE_PATHS = new Set();

const ATENDIMENTO_PATHS = [
	ROUTES.ATENDIMENTO_CASOS,
	ROUTES.ATENDIMENTO_TECNICOS,
	ROUTES.ATENDIMENTO_AVALIACOES,
	ROUTES.ATENDIMENTO_CONFIGURACOES,
	ROUTES.ATENDIMENTO_TEMPLATES,
	ROUTES.ATENDIMENTO_LOGS,
	ROUTES.ATENDIMENTO_MENSAGENS,
];

const MENU_GROUPS = [
	{
		id: "empresas",
		label: "Empresas",
		icon: Building2,
		paths: [ROUTES.EMPRESAS_TECNICOS],
	},
	{
		id: "cliente",
		label: "Cliente",
		icon: Users,
		paths: [ROUTES.AGENDAMENTOS],
	},
	{
		id: "tecnicos",
		label: "Técnicos",
		icon: UserSquare2,
		paths: [
			ROUTES.ENTREGAS_TECNICOS,
			ROUTES.TECNICOS_AUDITORIA_BOLSA,
			ROUTES.TECNICOS_AUDITORIA_RELATORIOS,
		],
	},
	{
		id: "logistica",
		label: "Logística",
		icon: Truck,
		paths: [ROUTES.LOGISTICA],
	},
	{
		id: "financeiro",
		label: "Financeiro",
		icon: BadgeDollarSign,
		paths: FINANCEIRO_PATHS,
	},
	{
		id: "atendimento",
		label: "Atendimento",
		icon: MessagesSquare,
		paths: ATENDIMENTO_PATHS,
	},
	{
		id: "estoque",
		label: "Estoque",
		icon: Boxes,
		paths: [
			ROUTES.ESTOQUE_EQUIPAMENTOS,
			ROUTES.ESTOQUE_CONSULTA,
			ROUTES.ACERTO_ESTOQUE,
		],
	},
	{
		id: "administrativo",
		label: "Administrativo",
		icon: Files,
		paths: [
			ROUTES.DOCUMENTOS_PENDENTES,
			ROUTES.DOCUMENTOS_TRATATIVAS,
			ROUTES.DOCUMENTOS_HISTORICO,
			ROUTES.DOCUMENTOS_APROVADOS,
			ROUTES.DOCUMENTOS_CONFIGURACAO,
			ROUTES.DOCUMENTOS_RELATORIOS,
			ROUTES.INSUMOS_ADMINISTRATIVOS,
			ROUTES.INSUMOS_REQUISICOES,
			ROUTES.IMOVEIS_ADMINISTRATIVOS,
			ROUTES.IMOVEIS_ADMINISTRATIVOS_CONTRATOS,
			ROUTES.IMOVEIS_ADMINISTRATIVOS_HISTORICO,
			ROUTES.IMOVEIS_ADMINISTRATIVOS_RELATORIOS,
		],
	},
	{
		id: "equipe",
		label: "Equipe",
		icon: UserSquare2,
		paths: [
			ROUTES.COLABORADORES,
			ROUTES.AGENDA,
			ROUTES.FERIADOS,
			ROUTES.FERIAS,
		],
	},
	{
		id: "mensageria",
		label: "Mensageria",
		icon: MessageCircle,
		paths: [
			ROUTES.MENSAGERIA_ENVIADOS,
			ROUTES.MENSAGERIA_RELATORIOS,
			ROUTES.MENSAGERIA_CONFIRMACAO_AGENDAMENTOS,
			ROUTES.MENSAGERIA_FILA,
			ROUTES.MENSAGERIA_BACKLOG,
			ROUTES.MENSAGERIA_CALLBACK,
			ROUTES.MENSAGERIA_API,
			ROUTES.MENSAGERIA,
		],
	},
	{
		id: "configuracao",
		label: "Configuração",
		icon: Settings,
		paths: [
			ROUTES.CONFIGURACOES_GERAIS,
			ROUTES.NOTIFICACOES,
			ROUTES.REGIONAIS,
			ROUTES.USUARIOS,
			ROUTES.CARGOS_PERMISSOES,
			ROUTES.AGENTES,
			ROUTES.INTEGRACOES,
			ROUTES.API_STATUS,
			ROUTES.HUBSOFT_SETTINGS,
			ROUTES.CVORTEX_SETTINGS,
			ROUTES.SENIOR_SETTINGS,
			ROUTES.DATABASE_BACKUPS,
			ROUTES.EMAIL_SETTINGS,
			ROUTES.AUDITORIA_LOGS,
		],
	},
];

const sortByPathOrder = (items, order) =>
	[...items].sort((a, b) => {
		const posA = order.indexOf(a.path);
		const posB = order.indexOf(b.path);
		return (posA === -1 ? 999 : posA) - (posB === -1 ? 999 : posB);
	});

const isMenuPathActive = (pathname, item) =>
	item.path === ROUTES.DASHBOARD
		? pathname === item.path
		: pathname === item.path || pathname.startsWith(`${item.path}/`);

const stripDocumentLabel = (label) =>
	String(label || "")
		.replace(/^Documentos\s+-\s+/i, "")
		.replace(/^Documentos\s+/i, "");

const stripImovelLabel = (label) =>
	String(label || "")
		.replace(/^Imóveis\s+-\s+/i, "")
		.replace(/^Imóveis\s+/i, "");

const stripInsumosLabel = (label) =>
	String(label || "")
		.replace(/^Insumos\s+-\s+/i, "")
		.replace(/^Insumos\s+/i, "");

const stripTecnicosAuditoriaLabel = (label) =>
	String(label || "")
		.replace(/^Auditoria\s+-\s+/i, "")
		.replace(/^Auditoria\s+/i, "");

const stripFinanceiroOrcamentoLabel = (label) =>
	String(label || "")
		.replace(/^Gestão\s+Orçamento\s+-\s+/i, "")
		.replace(/^Gestão\s+Orçamento\s+/i, "");

const getFinanceiroOrcamentoLabel = (label, item) =>
	item.path === ROUTES.FINANCEIRO_ORCAMENTO_CONFIGURACOES
		? "Configurações Orçamentárias"
		: stripFinanceiroOrcamentoLabel(label);

const getTarifasReportLabel = (item) => {
	if (item.path === ROUTES.FINANCEIRO_REPORTS_TARIFAS) return "Visão Geral";
	if (item.path === ROUTES.FINANCEIRO_REPORTS_TARIFAS_REC_CLIENTE) {
		return "Receitas";
	}
	return String(item.label || "").replace(
		/^Reports\s*-\s*Tarifas\s*-\s*/i,
		"",
	);
};

function SidebarNavLink({
	item,
	className,
	onNavigate,
	displayLabel,
	labelClass = "truncate",
}) {
	const { label, path, icon: IconComponent } = item;
	return (
		<NavLink
			key={path}
			to={path}
			onClick={onNavigate}
			className={className}
			title={label}
		>
			<IconComponent size={16} className="shrink-0" />
			<span className={labelClass}>{displayLabel(label, path)}</span>
		</NavLink>
	);
}

function SidebarSectionLabel({
	children,
	collapsed,
	isModernLayout,
	tone = "default",
}) {
	const colorClass = isModernLayout
		? "text-slate-400"
		: tone === "blue"
			? "text-blue-500"
			: "text-gray-400";
	return (
		<p
			className={`${collapsed ? "sr-only" : ""} mb-2 px-4 text-[10px] font-bold uppercase tracking-wider ${colorClass}`}
		>
			{children}
		</p>
	);
}

function FeaturedMenuItems({
	items,
	collapsed,
	isModernLayout,
	navClass,
	onNavigate,
	displayLabel,
}) {
	if (!items.length) return null;
	return (
		<>
			<SidebarSectionLabel
				collapsed={collapsed}
				isModernLayout={isModernLayout}
				tone="blue"
			>
				Em destaque
			</SidebarSectionLabel>
			{items.map((item) => (
				<SidebarNavLink
					key={item.path}
					item={item}
					onNavigate={onNavigate}
					displayLabel={displayLabel}
					labelClass={collapsed ? "sr-only" : "truncate"}
					className={(state) =>
						isModernLayout
							? navClass(state)
							: `nav-item ${
									state.isActive
										? "nav-item-active"
										: "border border-blue-100 bg-blue-50/70 text-blue-700 hover:bg-blue-100"
								}`
					}
				/>
			))}
			<div
				className={
					isModernLayout
						? "my-3 border-t border-white/10"
						: "my-3 border-t border-gray-100"
				}
			/>
		</>
	);
}

function AdminNestedSection({
	title,
	icon: Icon,
	items,
	open,
	active,
	toggleKey,
	labelFormatter,
	setClickedGroups,
	nestedButtonClass,
	submenuClass,
	submenuWrapClass,
	onNavigate,
	displayLabel,
	labelClass = "min-w-0 flex-1 truncate text-left",
}) {
	if (!items.length) return null;
	return (
		<div>
			<button
				type="button"
				onClick={() =>
					setClickedGroups((current) => ({
						...current,
						[toggleKey]: !current[toggleKey],
					}))
				}
				className={nestedButtonClass(active, open)}
				aria-expanded={open}
				title={title}
			>
				<Icon size={15} className="shrink-0" />
				<span className={labelClass}>{title}</span>
				<ChevronDown
					size={14}
					className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>
			{open ? (
				<div className={submenuWrapClass}>
					{items.map((item) => {
						const ChildIcon = item.icon;
						return (
							<NavLink
								key={item.path}
								to={item.path}
								onClick={onNavigate}
								className={submenuClass}
							>
								<ChildIcon size={15} className="shrink-0" />
								<span className={labelClass}>
									{displayLabel(labelFormatter(item.label, item), item.path)}
								</span>
							</NavLink>
						);
					})}
				</div>
			) : null}
		</div>
	);
}

function AdministrativeGroupItems({
	group,
	pathname,
	clickedGroups,
	setClickedGroups,
	isModernLayout,
	nestedButtonClass,
	submenuClass,
	onNavigate,
	displayLabel,
}) {
	const submenuWrapClass = isModernLayout
		? "ml-4 mt-1 space-y-1 border-l border-white/10 pl-3"
		: "ml-4 mt-1 space-y-1 border-l border-gray-100 pl-3";
	const documentItems = group.items.filter((item) =>
		ADMINISTRATIVO_DOCUMENTOS_PATHS.includes(item.path),
	);
	const imoveisItems = group.items.filter((item) =>
		ADMINISTRATIVO_IMOVEIS_PATHS.includes(item.path),
	);
	const insumosItems = group.items.filter((item) =>
		ADMINISTRATIVO_INSUMOS_PATHS.includes(item.path),
	);
	const nestedPaths = new Set([
		...ADMINISTRATIVO_DOCUMENTOS_PATHS,
		...ADMINISTRATIVO_INSUMOS_PATHS,
		...ADMINISTRATIVO_IMOVEIS_PATHS,
	]);
	const directItems = group.items.filter((item) => !nestedPaths.has(item.path));
	const isActive = (items) =>
		items.some((item) => isMenuPathActive(pathname, item));

	return (
		<>
			<AdminNestedSection
				title="Documentos"
				icon={Files}
				items={documentItems}
				open={Boolean(clickedGroups.administrativo_documentos)}
				active={isActive(documentItems)}
				toggleKey="administrativo_documentos"
				labelFormatter={stripDocumentLabel}
				setClickedGroups={setClickedGroups}
				nestedButtonClass={nestedButtonClass}
				submenuClass={submenuClass}
				submenuWrapClass={submenuWrapClass}
				onNavigate={onNavigate}
				displayLabel={displayLabel}
			/>
			<AdminNestedSection
				title="Insumos"
				icon={PackagePlus}
				items={insumosItems}
				open={Boolean(clickedGroups.administrativo_insumos)}
				active={isActive(insumosItems)}
				toggleKey="administrativo_insumos"
				labelFormatter={stripInsumosLabel}
				setClickedGroups={setClickedGroups}
				nestedButtonClass={nestedButtonClass}
				submenuClass={submenuClass}
				submenuWrapClass={submenuWrapClass}
				onNavigate={onNavigate}
				displayLabel={displayLabel}
			/>
			<AdminNestedSection
				title="Imóveis"
				icon={Building2}
				items={imoveisItems}
				open={Boolean(clickedGroups.administrativo_imoveis)}
				active={isActive(imoveisItems)}
				toggleKey="administrativo_imoveis"
				labelFormatter={stripImovelLabel}
				setClickedGroups={setClickedGroups}
				nestedButtonClass={nestedButtonClass}
				submenuClass={submenuClass}
				submenuWrapClass={submenuWrapClass}
				onNavigate={onNavigate}
				displayLabel={displayLabel}
			/>
			{directItems.map((item) => {
				const ChildIcon = item.icon;
				return (
					<NavLink
						key={item.path}
						to={item.path}
						onClick={onNavigate}
						className={submenuClass}
					>
						<ChildIcon size={15} className="shrink-0" />
						<span className="truncate">
							{displayLabel(item.label, item.path)}
						</span>
					</NavLink>
				);
			})}
		</>
	);
}

function TecnicosGroupItems({
	group,
	pathname,
	clickedGroups,
	setClickedGroups,
	isModernLayout,
	nestedButtonClass,
	submenuClass,
	onNavigate,
	displayLabel,
}) {
	const submenuWrapClass = getSubmenuWrapClass(isModernLayout);
	const auditoriaItems = group.items.filter((item) =>
		TECNICOS_AUDITORIA_PATHS.includes(item.path),
	);
	const nestedPaths = new Set(TECNICOS_AUDITORIA_PATHS);
	const directItems = group.items.filter((item) => !nestedPaths.has(item.path));
	const isActive = (items) =>
		items.some((item) => isMenuPathActive(pathname, item));

	return (
		<>
			{directItems.map((item) => {
				const ChildIcon = item.icon;
				return (
					<NavLink
						key={item.path}
						to={item.path}
						onClick={onNavigate}
						className={submenuClass}
					>
						<ChildIcon size={15} className="shrink-0" />
						<span className="truncate">
							{displayLabel(item.label, item.path)}
						</span>
					</NavLink>
				);
			})}
			<AdminNestedSection
				title="Auditoria"
				icon={PackageSearch}
				items={auditoriaItems}
				open={Boolean(clickedGroups.tecnicos_auditoria)}
				active={isActive(auditoriaItems)}
				toggleKey="tecnicos_auditoria"
				labelFormatter={stripTecnicosAuditoriaLabel}
				setClickedGroups={setClickedGroups}
				nestedButtonClass={nestedButtonClass}
				submenuClass={submenuClass}
				submenuWrapClass={submenuWrapClass}
				onNavigate={onNavigate}
				displayLabel={displayLabel}
			/>
		</>
	);
}

function FinanceiroGroupItems({
	group,
	pathname,
	clickedGroups,
	setClickedGroups,
	isModernLayout,
	nestedButtonClass,
	submenuClass,
	onNavigate,
	displayLabel,
}) {
	const submenuWrapClass = getSubmenuWrapClass(isModernLayout);
	const financeSectionClass = isModernLayout
		? "mb-2 mt-5 px-3 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400"
		: "mb-2 mt-5 px-3 text-[10px] font-bold uppercase tracking-[0.06em] text-gray-400";
	const financeLinkLabelClass =
		"min-w-0 flex-1 whitespace-normal break-words text-left leading-tight";
	const financeSubmenuClass = ({ isActive }) =>
		`${submenuClass({ isActive })} ${isActive ? "font-black" : ""}`;
	const renderSectionTitle = (title) => (
		<p key={`section-${title}`} className={financeSectionClass}>
			{title}
		</p>
	);
	const renderFinanceLink = (item, label = item.label, level = 1) => {
		if (!item) return null;
		const ChildIcon = item.icon;
		const levelClass =
			level === 3 ? "pl-4 text-[13px]" : level === 2 ? "pl-3" : "";
		return (
			<NavLink
				key={item.path}
				to={item.path}
				onClick={onNavigate}
				className={(state) => `${financeSubmenuClass(state)} ${levelClass}`}
				title={typeof label === "string" ? label : item.label}
			>
				<ChildIcon size={level === 3 ? 14 : 15} className="shrink-0" />
				<span className={financeLinkLabelClass}>
					{displayLabel(label, item.path)}
				</span>
			</NavLink>
		);
	};
	const orcamentoItems = group.items.filter((item) =>
		FINANCEIRO_ORCAMENTO_PATHS.includes(item.path),
	);
	const reportsItems = group.items.filter((item) =>
		FINANCEIRO_REPORTS_PATHS.includes(item.path),
	);
	const tarifasReportItems = reportsItems.filter((item) =>
		FINANCEIRO_TARIFAS_REPORTS_PATHS.includes(item.path),
	);
	const directReportItems = reportsItems.filter(
		(item) =>
			!FINANCEIRO_TARIFAS_REPORTS_PATHS.includes(item.path) &&
			item.path !== ROUTES.FINANCEIRO_REPORTS_TARIFAS,
	);
	const tarifasReportItem = reportsItems.find(
		(item) => item.path === ROUTES.FINANCEIRO_REPORTS_TARIFAS,
	);
	const dashboardItem = group.items.find(
		(item) => item.path === ROUTES.FINANCEIRO,
	);
	const operationItems = [
		ROUTES.FINANCEIRO_CONTAS_PAGAR,
		ROUTES.FINANCEIRO_CONTAS_RECEBER,
		ROUTES.FINANCEIRO_FATURAMENTO,
		ROUTES.FINANCEIRO_NOTAS,
	]
		.map((path) => group.items.find((item) => item.path === path))
		.filter(Boolean);
	const configItem = group.items.find(
		(item) => item.path === ROUTES.FINANCEIRO_CONFIGURACOES,
	);
	const orcamentoActive = orcamentoItems.some((item) =>
		isMenuPathActive(pathname, item),
	);
	const reportsActive = reportsItems.some((item) =>
		isMenuPathActive(pathname, item),
	);
	const tarifasReportsActive =
		Boolean(tarifasReportItem && isMenuPathActive(pathname, tarifasReportItem)) ||
		tarifasReportItems.some((item) => isMenuPathActive(pathname, item));
	const reportsOpen =
		Boolean(clickedGroups.financeiro_reports) || reportsActive;
	const tarifasReportsOpen =
		Boolean(clickedGroups.financeiro_reports_tarifas) || tarifasReportsActive;
	const orcamentoOpen =
		Boolean(clickedGroups.financeiro_orcamento) || orcamentoActive;

	return (
		<>
			{dashboardItem ? renderFinanceLink(dashboardItem, "Visão Geral") : null}
			{operationItems.length ? renderSectionTitle("Operação") : null}
			{operationItems.map((item) =>
				renderFinanceLink(
					item,
					item.path === ROUTES.FINANCEIRO_NOTAS ? "Notas Fiscais" : item.label,
				),
			)}
			{reportsItems.length ? (
				<>
					{renderSectionTitle("Análises")}
					<div>
						<button
							type="button"
							onClick={() =>
								setClickedGroups((current) => ({
									...current,
									financeiro_reports: !current.financeiro_reports,
								}))
							}
							className={nestedButtonClass(reportsActive, reportsOpen)}
							aria-expanded={reportsOpen}
							aria-controls="financeiro-reports-submenu"
							title="Reports"
						>
							<BarChart3 size={15} className="shrink-0" />
							<span className={financeLinkLabelClass}>Reports</span>
							<ChevronDown
								size={14}
								className={`shrink-0 transition-transform ${reportsOpen ? "rotate-180" : ""}`}
							/>
						</button>
						{reportsOpen ? (
							<div id="financeiro-reports-submenu" className={submenuWrapClass}>
								{directReportItems.map((item) =>
									renderFinanceLink(
										item,
										String(item.label || "").replace(/^Reports\s*-\s*/i, ""),
										2,
									),
								)}
								{tarifasReportItem ? (
									<>
										<button
											type="button"
											onClick={() =>
												setClickedGroups((current) => ({
													...current,
													financeiro_reports_tarifas:
														!current.financeiro_reports_tarifas,
												}))
											}
											className={nestedButtonClass(
												tarifasReportsActive,
												tarifasReportsOpen,
											)}
											aria-expanded={tarifasReportsOpen}
											aria-controls="financeiro-tarifas-submenu"
											title="Tarifas"
										>
											<BarChart3 size={15} className="shrink-0" />
											<span className={financeLinkLabelClass}>Tarifas</span>
											<ChevronDown
												size={14}
												className={`shrink-0 transition-transform ${tarifasReportsOpen ? "rotate-180" : ""}`}
											/>
										</button>
										{tarifasReportsOpen ? (
											<div
												id="financeiro-tarifas-submenu"
												className={submenuWrapClass}
											>
												{[tarifasReportItem, ...tarifasReportItems].map(
													(item) =>
														renderFinanceLink(
															item,
															getTarifasReportLabel(item),
															3,
														),
												)}
											</div>
										) : null}
									</>
								) : null}
							</div>
						) : null}
					</div>
				</>
			) : null}
			{orcamentoItems.length ? renderSectionTitle("Planejamento") : null}
			<AdminNestedSection
				title="Gestão Orçamentária"
				icon={Target}
				items={orcamentoItems}
				open={orcamentoOpen}
				active={orcamentoActive}
				toggleKey="financeiro_orcamento"
				labelFormatter={getFinanceiroOrcamentoLabel}
				setClickedGroups={setClickedGroups}
				nestedButtonClass={nestedButtonClass}
				submenuClass={submenuClass}
				submenuWrapClass={submenuWrapClass}
				onNavigate={onNavigate}
				displayLabel={displayLabel}
				labelClass={financeLinkLabelClass}
			/>
			{configItem ? (
				<>
					{renderSectionTitle("Sistema")}
					{renderFinanceLink(configItem, "Configurações Gerais")}
				</>
			) : null}
		</>
	);
}

function MenuGroup({
	group,
	collapsed,
	active,
	open,
	clickedGroups,
	setClickedGroups,
	isModernLayout,
	groupButtonClass,
	nestedButtonClass,
	submenuClass,
	submenuWrapClass,
	onNavigate,
	displayLabel,
	pathname,
}) {
	const IconComponent = group.icon;
	const label =
		group.id === "atendimento"
			? displayLabel(group.label, "__atendimento_group")
			: group.label;
	return (
		<div key={group.id}>
			<button
				type="button"
				onClick={() =>
					setClickedGroups((current) => ({
						...current,
						[group.id]: !current[group.id],
					}))
				}
				className={groupButtonClass(active, open)}
				aria-expanded={open}
				title={group.label}
			>
				<IconComponent size={16} className="shrink-0" />
				<span
					className={
						collapsed ? "sr-only" : "min-w-0 flex-1 truncate text-left"
					}
				>
					{label}
				</span>
				{!collapsed ? (
					<ChevronDown
						size={15}
						className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
					/>
				) : null}
			</button>
			{open && !collapsed ? (
				<div className={submenuWrapClass}>
					{group.id === "administrativo" ? (
						<AdministrativeGroupItems
							group={group}
							pathname={pathname}
							clickedGroups={clickedGroups}
							setClickedGroups={setClickedGroups}
							isModernLayout={isModernLayout}
							nestedButtonClass={nestedButtonClass}
							submenuClass={submenuClass}
							onNavigate={onNavigate}
							displayLabel={displayLabel}
						/>
					) : group.id === "tecnicos" ? (
						<TecnicosGroupItems
							group={group}
							pathname={pathname}
							clickedGroups={clickedGroups}
							setClickedGroups={setClickedGroups}
							isModernLayout={isModernLayout}
							nestedButtonClass={nestedButtonClass}
							submenuClass={submenuClass}
							onNavigate={onNavigate}
							displayLabel={displayLabel}
						/>
					) : group.id === "financeiro" ? (
						<FinanceiroGroupItems
							group={group}
							pathname={pathname}
							clickedGroups={clickedGroups}
							setClickedGroups={setClickedGroups}
							isModernLayout={isModernLayout}
							nestedButtonClass={nestedButtonClass}
							submenuClass={submenuClass}
							onNavigate={onNavigate}
							displayLabel={displayLabel}
						/>
					) : (
						group.items.map((item) => {
							const ChildIcon = item.icon;
							return (
								<NavLink
									key={item.path}
									to={item.path}
									onClick={onNavigate}
									className={submenuClass}
								>
									<ChildIcon size={15} className="shrink-0" />
									<span className="truncate">
										{displayLabel(item.label, item.path)}
									</span>
								</NavLink>
							);
						})
					)}
				</div>
			) : null}
		</div>
	);
}

function getGroupButtonClass({ active, open, isModernLayout }) {
	if (!isModernLayout) {
		return `nav-item w-full ${active || open ? "nav-item-active" : "nav-item-inactive"}`;
	}
	return `nav-item-modern w-full ${
		active || open
			? "nav-item-modern-active"
			: "text-slate-300 hover:bg-white/10 hover:text-white"
	}`;
}

function getSubmenuWrapClass(isModernLayout) {
	return isModernLayout
		? "ml-3 mt-1 space-y-1 border-l border-white/10 pl-3 transition-all duration-200"
		: "ml-3 mt-1 space-y-1 border-l border-gray-100 pl-3 transition-all duration-200";
}

function getSubmenuClass({ isActive, isModernLayout }) {
	if (!isModernLayout) {
		return `relative flex min-h-9 min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
			isActive
				? "bg-blue-50 text-blue-700 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-blue-600"
				: "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
		}`;
	}
	return `relative flex min-h-9 min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
		isActive
			? "bg-white/12 text-white before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-orange-400"
			: "text-slate-300 hover:bg-white/10 hover:text-white"
	}`;
}

function getNestedButtonClass({ active, open, isModernLayout }) {
	if (!isModernLayout) {
		return `flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
			active || open
				? "bg-blue-50 text-blue-700"
				: "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
		}`;
	}
	return `flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
		active || open
			? "bg-white/12 text-white"
			: "text-slate-300 hover:bg-white/10 hover:text-white"
	}`;
}

function getNavClass({ isActive, tone, isModernLayout }) {
	if (!isModernLayout) {
		return `nav-item ${isActive ? "nav-item-active" : "nav-item-inactive"} ${
			tone === "orange"
				? "text-orange-500"
				: tone === "blue"
					? "text-blue-600"
					: ""
		}`;
	}

	return `nav-item-modern ${
		isActive
			? "nav-item-modern-active"
			: tone === "orange"
				? "text-orange-200 hover:bg-white/10 hover:text-white"
				: tone === "blue"
					? "text-blue-100 hover:bg-white/10 hover:text-white"
					: "text-slate-300 hover:bg-white/10 hover:text-white"
	}`;
}

const Sidebar = ({
	collapsed = false,
	onToggleCollapsed,
	onNavigate,
	variant = "desktop",
}) => {
	const { currentUser, signOut } = useAuthContext();
	const { isModernLayout } = useLayoutMode();
	const location = useLocation();
	const [clickedGroups, setClickedGroups] = useState({});
	const [documentosPendentes, setDocumentosPendentes] = useState(0);
	const [atendimentoAbertos, setAtendimentoAbertos] = useState(0);
	const currentRole = currentUser?.role;
	const isEstoqueOnly = ["estoque", "supervisor_estoque"].includes(
		String(currentRole || "").toLowerCase(),
	);

	useEffect(() => {
		let active = true;
		const refreshAtendimentoStats = () =>
			buscarEstatisticasAtendimento()
				.then((atendimentoStats) => {
					if (active)
						setAtendimentoAbertos(Number(atendimentoStats?.openCases || 0));
				})
				.catch(() => {});
		obterContadoresNotificacoes()
			.then((counters) => {
				if (active)
					setDocumentosPendentes(Number(counters?.documentosPendentes || 0));
			})
			.catch(() => {});
		refreshAtendimentoStats();
		const handleCounters = (event) => {
			setDocumentosPendentes(Number(event.detail?.documentosPendentes || 0));
		};
		const unsubscribeAtendimento = subscribeRealtimeTopics(
			"atendimento",
			refreshAtendimentoStats,
			{ debounceMs: 300 },
		);
		window.addEventListener("retiradas:notification-counters", handleCounters);
		return () => {
			active = false;
			unsubscribeAtendimento();
			window.removeEventListener(
				"retiradas:notification-counters",
				handleCounters,
			);
		};
	}, []);

	const displayLabel = (label, path) => {
		if (path === ROUTES.DOCUMENTOS_PENDENTES && documentosPendentes > 0) {
			return (
				<>
					{label} (<span className="text-red-500">{documentosPendentes}</span>)
				</>
			);
		}
		if (
			(path === ROUTES.ATENDIMENTO_CASOS || path === "__atendimento_group") &&
			atendimentoAbertos > 0
		) {
			return (
				<>
					{label} (<span className="text-red-500">{atendimentoAbertos}</span>)
				</>
			);
		}
		return label;
	};

	const visibleItems = useMemo(
		() =>
			NAV_ITEMS.filter((item) =>
				item.publicAuthenticated
					? Boolean(currentUser)
					: hasAnyPermission(currentUser, item.permission),
			),
		[currentUser],
	);
	const featuredItems = useMemo(
		() =>
			isModernLayout
				? sortByPathOrder(
						visibleItems.filter((item) =>
							MODERN_FEATURED_ORDER.includes(item.path),
						),
						MODERN_FEATURED_ORDER,
					)
				: visibleItems.filter((item) => item.featured),
		[isModernLayout, visibleItems],
	);
	const menuItems = useMemo(
		() =>
			isModernLayout
				? sortByPathOrder(
						visibleItems.filter(
							(item) => !MODERN_FEATURED_ORDER.includes(item.path),
						),
						MODERN_MENU_ORDER,
					)
				: visibleItems.filter((item) => !item.featured),
		[isModernLayout, visibleItems],
	);
	const groupedMenu = useMemo(
		() =>
			MENU_GROUPS.map((group) => ({
				...group,
				items: group.paths
					.map((path) => visibleItems.find((item) => item.path === path))
					.filter(Boolean),
			})).filter((group) => group.items.length),
		[visibleItems],
	);
	const groupedPaths = useMemo(
		() => new Set(MENU_GROUPS.flatMap((group) => group.paths)),
		[],
	);
	const otherMenuItems = useMemo(
		() =>
			menuItems.filter(
				(item) =>
					!groupedPaths.has(item.path) ||
					DIRECT_MENU_DUPLICATE_PATHS.has(item.path),
			),
		[groupedPaths, menuItems],
	);
	const isGroupActive = (group) =>
		group.items.some((item) => isMenuPathActive(location.pathname, item));
	const groupButtonClass = (active, open) =>
		getGroupButtonClass({ active, open, isModernLayout });
	const submenuWrapClass = getSubmenuWrapClass(isModernLayout);
	const submenuClass = ({ isActive }) =>
		getSubmenuClass({ isActive, isModernLayout });
	const nestedButtonClass = (active, open) =>
		getNestedButtonClass({ active, open, isModernLayout });
	const itemLabelClass = collapsed ? "sr-only" : "truncate";
	const isMobileDrawer = variant === "mobile";
	const handleNavigation = () => {
		onNavigate?.();
	};

	const navClass = ({ isActive }, tone = "default") =>
		getNavClass({ isActive, tone, isModernLayout });

	return (
		<div
			className={
				isModernLayout
					? "flex h-full flex-col border-r border-slate-950 bg-[linear-gradient(180deg,#061b38_0%,#06294d_54%,#04162c_100%)] text-white shadow-sidebar"
					: "flex h-full flex-col border-r border-gray-100 bg-white"
			}
		>
			<div
				className={
					isModernLayout
						? `${collapsed ? "px-3" : "px-5"} border-b border-white/10 py-5`
						: `${collapsed ? "px-3" : "px-6"} border-b border-gray-100 py-5`
				}
			>
				{isModernLayout ? (
					<div className={collapsed ? "flex flex-col items-center gap-3" : ""}>
						<img
							src="/cluster-mg.png"
							alt="Sempre Internet"
							className={`${collapsed ? "w-12 rounded-xl" : "w-52 rounded-2xl"} mx-auto h-auto max-w-full object-contain shadow-[0_18px_42px_rgba(0,0,0,0.34)]`}
						/>
						<p
							className={`${collapsed ? "sr-only" : "mt-5"} text-xs font-semibold text-slate-300`}
						>
							Gestão Retiradas
						</p>
						<button
							type="button"
							onClick={onToggleCollapsed}
							className="mt-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15"
							title={
								isMobileDrawer
									? "Fechar menu"
									: collapsed
										? "Expandir menu"
										: "Ocultar menu"
							}
							aria-label={
								isMobileDrawer
									? "Fechar menu"
									: collapsed
										? "Expandir menu"
										: "Ocultar menu"
							}
						>
							{collapsed ? (
								<PanelLeftOpen size={18} />
							) : (
								<PanelLeftClose size={18} />
							)}
						</button>
					</div>
				) : (
					<div
						className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}
					>
						<div
							className={
								isModernLayout
									? "flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-md"
									: "flex h-9 w-9 items-center justify-center rounded-xl shadow-md"
							}
						>
							<img
								src="/cluster-mg.png"
								alt="Sempre Internet"
								className={
									isModernLayout
										? "max-h-8 max-w-8 object-contain"
										: "h-9 w-9 rounded-xl object-cover"
								}
							/>
						</div>
						<div className={collapsed ? "sr-only" : ""}>
							<p
								className={
									isModernLayout
										? "text-sm font-extrabold uppercase leading-none tracking-wide text-white"
										: "text-sm font-bold leading-none text-gray-900"
								}
							>
								Sempre Internet
							</p>
							<p
								className={
									isModernLayout
										? "mt-1 text-xs font-medium text-slate-300"
										: "mt-0.5 text-xs font-medium text-orange-500"
								}
							>
								Gestão Retiradas
							</p>
						</div>
						<button
							type="button"
							onClick={onToggleCollapsed}
							className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-100 bg-white text-gray-600 transition hover:bg-gray-50"
							title={
								isMobileDrawer
									? "Fechar menu"
									: collapsed
										? "Expandir menu"
										: "Ocultar menu"
							}
							aria-label={
								isMobileDrawer
									? "Fechar menu"
									: collapsed
										? "Expandir menu"
										: "Ocultar menu"
							}
						>
							{collapsed ? (
								<PanelLeftOpen size={18} />
							) : (
								<PanelLeftClose size={18} />
							)}
						</button>
					</div>
				)}
			</div>

			<nav
				className={
					isModernLayout
						? "flex-1 space-y-1 overflow-y-auto px-3 py-4"
						: "flex-1 space-y-0.5 overflow-y-auto px-3 py-4"
				}
			>
				<FeaturedMenuItems
					items={featuredItems}
					collapsed={collapsed}
					isModernLayout={isModernLayout}
					navClass={navClass}
					onNavigate={handleNavigation}
					displayLabel={displayLabel}
				/>

				<SidebarSectionLabel
					collapsed={collapsed}
					isModernLayout={isModernLayout}
				>
					Menu
				</SidebarSectionLabel>
				{groupedMenu.map((group) => (
					<MenuGroup
						key={group.id}
						group={group}
						collapsed={collapsed}
						active={isGroupActive(group)}
						open={Boolean(clickedGroups[group.id]) || isGroupActive(group)}
						clickedGroups={clickedGroups}
						setClickedGroups={setClickedGroups}
						isModernLayout={isModernLayout}
						groupButtonClass={groupButtonClass}
						nestedButtonClass={nestedButtonClass}
						submenuClass={submenuClass}
						submenuWrapClass={submenuWrapClass}
						onNavigate={handleNavigation}
						displayLabel={displayLabel}
						pathname={location.pathname}
					/>
				))}

				{otherMenuItems.map(({ label, path, icon: IconComponent }) => (
					<NavLink
						key={path}
						to={path}
						onClick={handleNavigation}
						className={navClass}
						title={label}
					>
						<IconComponent size={16} className="shrink-0" />
						<span className={itemLabelClass}>{displayLabel(label, path)}</span>
					</NavLink>
				))}

				{!isEstoqueOnly ? (
					<>
						<div
							className={
								isModernLayout
									? "my-3 border-t border-white/10"
									: "my-3 border-t border-gray-100"
							}
						/>
						<SidebarSectionLabel
							collapsed={collapsed}
							isModernLayout={isModernLayout}
						>
							Público
						</SidebarSectionLabel>
						<a
							href={ROUTES.PAINEL_PUBLICO}
							target="_blank"
							rel="noreferrer"
							onClick={handleNavigation}
							className={navClass({ isActive: false }, "orange")}
							title="Painel Público"
						>
							<MonitorPlay size={16} className="shrink-0" />
							<span className={itemLabelClass}>Painel Público</span>
						</a>
					</>
				) : null}
			</nav>

			{!isModernLayout && (
				<div className="border-t border-gray-100 px-3 py-4">
					<div className="mb-2 flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600">
							<span className="text-xs font-bold text-white">
								{currentUser?.nome?.charAt(0)?.toUpperCase() ?? "U"}
							</span>
						</div>
						<div className="min-w-0">
							<p className="truncate text-sm font-semibold text-gray-900">
								{currentUser?.nome}
							</p>
							<p className="truncate text-xs capitalize text-gray-400">
								{getRoleLabel(currentUser?.role)}
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={signOut}
						className="nav-item nav-item-inactive w-full text-red-400 hover:bg-red-50 hover:text-red-500"
					>
						<span>Sair</span>
					</button>
				</div>
			)}
		</div>
	);
};

export default Sidebar;
