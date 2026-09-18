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
	KeyRound,
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
	ReceiptText,
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
import { useEffect, useMemo, useRef, useState } from "react";
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
		featured: false,
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
		label: "Perfis & Permissões",
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
		label: "Configurações",
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
		label: "Auditoria",
		path: ROUTES.AUDITORIA_LOGS,
		icon: FileSearch,
		permission: ["configuracao.auditoria.view"],
	},
	{
		label: "Empresas",
		path: ROUTES.EMPRESAS_TECNICOS,
		icon: Building2,
		permission: [
			"view_empresas_tecnicos",
			"empresas.cadastro.view",
			"empresas.cadastro.manage",
		],
	},
	{
		label: "Visão Geral",
		path: ROUTES.DOCUMENTOS_PENDENTES,
		icon: FileClock,
		permission: [
			"view_documentos",
			"administrativo.documentos.view",
			"administrativo.documentos.manage",
		],
	},
	{
		label: "Documentos",
		path: ROUTES.DOCUMENTOS_TRATATIVAS,
		icon: FileClock,
		permission: [
			"view_documentos_tratativas",
			"administrativo.documentos.view",
			"administrativo.documentos.manage",
		],
	},
	{
		label: "Pendências",
		path: ROUTES.DOCUMENTOS_HISTORICO,
		icon: Files,
		permission: [
			"view_documentos",
			"administrativo.documentos.view",
			"administrativo.documentos.manage",
		],
	},
	{
		label: "Aprovados",
		path: ROUTES.DOCUMENTOS_APROVADOS,
		icon: FileCheck2,
		permission: [
			"view_documentos",
			"administrativo.documentos.view",
			"administrativo.documentos.manage",
		],
	},
	{
		label: "Notas Fiscais",
		path: ROUTES.DOCUMENTOS_NOTAS_FISCAIS,
		icon: ReceiptText,
		permission: [
			"view_documentos",
			"administrativo.documentos.view",
			"administrativo.documentos.manage",
		],
	},
	{
		label: "Terceirizados",
		path: ROUTES.DOCUMENTOS_TECNICOS_TERCEIRIZADOS,
		icon: Users,
		permission: [
			"view_empresas_tecnicos",
			"empresas.cadastro.view",
			"empresas.cadastro.manage",
		],
	},
	{
		label: "Configuração documental",
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
		label: "Insumos",
		path: ROUTES.INSUMOS_ADMINISTRATIVOS,
		icon: PackagePlus,
		permission: [
			"manage_insumos_administrativos",
			"administrativo.insumos.manage",
		],
	},
	{
		label: "Requisições",
		path: ROUTES.INSUMOS_REQUISICOES,
		icon: ClipboardList,
		permission: ["view_insumos_requisicoes"],
	},
	{
		label: "Totem",
		path: ROUTES.TOTEM_INSUMOS,
		icon: MonitorPlay,
		permission: ["view_insumos_requisicoes"],
		publicAuthenticated: true,
	},
	{
		label: "Visão Geral",
		path: ROUTES.FACILITIES,
		icon: BarChart3,
		permission: [
			"facilities.dashboard.view",
			"view_imoveis_administrativos",
			"administrativo.imoveis.view",
		],
	},
	{
		label: "Imóveis & Espaços",
		path: ROUTES.FACILITIES_IMOVEIS_ESPACOS,
		icon: Building2,
		permission: [
			"facilities.imoveis.view",
			"facilities.imoveis_espacos.view",
			"view_imoveis_administrativos",
			"administrativo.imoveis.view",
		],
	},
	{
		label: "Patrimônio",
		path: ROUTES.FACILITIES_PATRIMONIO_INVENTARIO,
		icon: PackageSearch,
		permission: [
			"facilities.patrimonio.view",
			"facilities.inventario.view",
			"facilities.patrimonio_inventario.view",
			"view_insumos_administrativos",
			"administrativo.insumos.view",
		],
	},
	{
		label: "Acessos & Chaves",
		path: ROUTES.FACILITIES_ACESSOS_CHAVES,
		icon: KeyRound,
		permission: [
			"facilities.acessos_chaves.view",
			"facilities.chaves.view",
			"facilities.dashboard.view",
			"view_imoveis_administrativos",
		],
	},
	{
		label: "Operação Predial",
		path: ROUTES.FACILITIES_OPERACAO_PREDIAL,
		icon: ClipboardCheck,
		permission: [
			"facilities.operacao_predial.view",
			"facilities.operacao_predial.manage",
			"facilities.dashboard.view",
			"view_imoveis_administrativos",
		],
	},
	{
		label: "Segurança",
		path: ROUTES.FACILITIES_SEGURANCA_CONFORMIDADE,
		icon: ShieldCheck,
		permission: [
			"facilities.seguranca.view",
			"facilities.seguranca_conformidade.view",
			"facilities.dashboard.view",
			"view_imoveis_administrativos",
		],
	},
	{
		label: "Fornecedores & Contratos",
		path: ROUTES.FACILITIES_FORNECEDORES_CONTRATOS,
		icon: Files,
		permission: [
			"facilities.fornecedores.view",
			"facilities.contratos.view",
			"facilities.fornecedores_contratos.view",
			"view_imoveis_administrativos",
			"administrativo.imoveis.view",
		],
	},
	{
		label: "Consumos & Custos",
		path: ROUTES.FACILITIES_CONSUMOS,
		icon: Wallet,
		permission: [
			"facilities.consumos.view",
			"view_imoveis_administrativos",
			"administrativo.imoveis.view",
		],
	},
	{
		label: "Saúde das Unidades",
		path: ROUTES.FACILITIES_SCORE,
		icon: Target,
		permission: [
			"facilities.saude.view",
			"facilities.score.view",
			"facilities.dashboard.view",
			"view_imoveis_administrativos",
		],
	},
	{
		label: "Relatórios",
		path: ROUTES.FACILITIES_RELATORIOS,
		icon: BarChart3,
		permission: [
			"facilities.relatorios.view",
			"view_imoveis_administrativos",
			"administrativo.imoveis.view",
		],
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

const MODERN_FEATURED_ORDER = [];
const MODERN_MENU_ORDER = [
	ROUTES.DASHBOARD,
	ROUTES.INSUMOS_REQUISICOES,
	ROUTES.INSUMOS_ADMINISTRATIVOS,
	ROUTES.TOTEM_INSUMOS,
	ROUTES.DOCUMENTOS_PENDENTES,
	ROUTES.DOCUMENTOS_TECNICOS_TERCEIRIZADOS,
	ROUTES.DOCUMENTOS_TRATATIVAS,
	ROUTES.DOCUMENTOS_HISTORICO,
	ROUTES.DOCUMENTOS_APROVADOS,
	ROUTES.DOCUMENTOS_NOTAS_FISCAIS,
	ROUTES.DOCUMENTOS_CONFIGURACAO,
	ROUTES.DOCUMENTOS_RELATORIOS,
	ROUTES.FACILITIES,
	ROUTES.FACILITIES_IMOVEIS_ESPACOS,
	ROUTES.FACILITIES_PATRIMONIO_INVENTARIO,
	ROUTES.FACILITIES_ACESSOS_CHAVES,
	ROUTES.FACILITIES_OPERACAO_PREDIAL,
	ROUTES.FACILITIES_SEGURANCA_CONFORMIDADE,
	ROUTES.FACILITIES_FORNECEDORES_CONTRATOS,
	ROUTES.FACILITIES_CONSUMOS,
	ROUTES.FACILITIES_SCORE,
	ROUTES.FACILITIES_RELATORIOS,
	ROUTES.EMPRESAS_TECNICOS,
	ROUTES.AGENDAMENTOS,
	ROUTES.ENTREGAS_TECNICOS,
	ROUTES.TECNICOS_AUDITORIA_BOLSA,
	ROUTES.TECNICOS_AUDITORIA_RELATORIOS,
	ROUTES.ESTOQUE_BOLSA_TECNICO,
	ROUTES.LOGISTICA,
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
	ROUTES.DOCUMENTOS_NOTAS_FISCAIS,
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
	ROUTES.DOCUMENTOS_TECNICOS_TERCEIRIZADOS,
	ROUTES.DOCUMENTOS_TRATATIVAS,
	ROUTES.DOCUMENTOS_HISTORICO,
	ROUTES.DOCUMENTOS_APROVADOS,
	ROUTES.DOCUMENTOS_NOTAS_FISCAIS,
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
];

const SOLICITACOES_PATHS = [
	ROUTES.INSUMOS_REQUISICOES,
	ROUTES.INSUMOS_ADMINISTRATIVOS,
	ROUTES.TOTEM_INSUMOS,
];

const FACILITIES_PATHS = [
	ROUTES.FACILITIES,
	ROUTES.FACILITIES_IMOVEIS_ESPACOS,
	ROUTES.FACILITIES_PATRIMONIO_INVENTARIO,
	ROUTES.FACILITIES_ACESSOS_CHAVES,
	ROUTES.FACILITIES_OPERACAO_PREDIAL,
	ROUTES.FACILITIES_SEGURANCA_CONFORMIDADE,
	ROUTES.FACILITIES_FORNECEDORES_CONTRATOS,
	ROUTES.FACILITIES_CONSUMOS,
	ROUTES.FACILITIES_SCORE,
	ROUTES.FACILITIES_RELATORIOS,
];

const TECNICOS_AUDITORIA_PATHS = [
	ROUTES.TECNICOS_AUDITORIA_BOLSA,
	ROUTES.TECNICOS_AUDITORIA_RELATORIOS,
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
		id: "solicitacoes",
		label: "Solicitações",
		icon: ClipboardList,
		paths: SOLICITACOES_PATHS,
	},
	{
		id: "documentos",
		label: "Documentos",
		icon: Files,
		paths: [
			ROUTES.DOCUMENTOS_PENDENTES,
			ROUTES.DOCUMENTOS_TRATATIVAS,
			ROUTES.DOCUMENTOS_HISTORICO,
			ROUTES.DOCUMENTOS_TECNICOS_TERCEIRIZADOS,
			ROUTES.DOCUMENTOS_RELATORIOS,
		],
	},
	{
		id: "facilities",
		label: "Facilities",
		icon: Building2,
		paths: FACILITIES_PATHS,
	},
	{
		id: "administracao",
		label: "Administração",
		icon: Settings,
		paths: [
			ROUTES.EMPRESAS_TECNICOS,
			ROUTES.USUARIOS,
			ROUTES.CARGOS_PERMISSOES,
			ROUTES.AUDITORIA_LOGS,
			ROUTES.INTEGRACOES,
			ROUTES.CONFIGURACOES_GERAIS,
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

function SidebarSearch({
	collapsed,
	isModernLayout,
	items,
	onNavigate,
	displayLabel,
}) {
	const [query, setQuery] = useState("");
	const inputRef = useRef(null);
	const normalizedQuery = query.trim().toLowerCase();
	const results = useMemo(() => {
		if (normalizedQuery.length < 2) return [];
		return items
			.filter((item) =>
				`${item.label} ${item.path}`.toLowerCase().includes(normalizedQuery),
			)
			.slice(0, 8);
	}, [items, normalizedQuery]);

	useEffect(() => {
		const handleShortcut = (event) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				inputRef.current?.focus();
			}
		};
		window.addEventListener("keydown", handleShortcut);
		return () => window.removeEventListener("keydown", handleShortcut);
	}, []);

	if (collapsed) {
		return (
			<button
				type="button"
				onClick={() => inputRef.current?.focus()}
				className={
					isModernLayout
						? "mb-3 flex h-10 w-full items-center justify-center rounded-xl border border-white/10 bg-white/10 text-slate-200"
						: "mb-3 flex h-10 w-full items-center justify-center rounded-xl border border-gray-100 bg-white text-gray-500"
				}
				title="Buscar no sistema"
			>
				<Search size={16} />
			</button>
		);
	}

	return (
		<div className="relative mb-4">
			<div
				className={
					isModernLayout
						? "flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-slate-200"
						: "flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-600"
				}
			>
				<Search size={15} className="shrink-0" />
				<input
					ref={inputRef}
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Buscar no sistema..."
					className={
						isModernLayout
							? "min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-400 focus:outline-none"
							: "min-w-0 flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
					}
				/>
				<span
					className={
						isModernLayout
							? "rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-400"
							: "rounded-md border border-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-400"
					}
				>
					Ctrl K
				</span>
			</div>
			{results.length ? (
				<div
					className={
						isModernLayout
							? "absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#071f3e] shadow-2xl"
							: "absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl"
					}
				>
					{results.map((item) => {
						const Icon = item.icon;
						return (
							<NavLink
								key={item.path}
								to={item.path}
								onClick={() => {
									setQuery("");
									onNavigate?.();
								}}
								className={({ isActive }) =>
									isModernLayout
										? `flex items-center gap-2 px-3 py-2 text-sm font-semibold transition ${isActive ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`
										: `flex items-center gap-2 px-3 py-2 text-sm font-semibold transition ${isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`
								}
							>
								<Icon size={15} className="shrink-0" />
								<span className="min-w-0 flex-1 truncate">
									{displayLabel(item.label, item.path)}
								</span>
							</NavLink>
						);
					})}
				</div>
			) : null}
		</div>
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
	badgeCount = 0,
	labelClass = "min-w-0 flex-1 truncate text-left",
}) {
	if (!items.length) return null;
	const safeBadgeCount = Number(badgeCount || 0);
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
				<span className={labelClass}>
					{title}
					{safeBadgeCount > 0 ? (
						<>
							{" "}
							(<span className="text-red-500">{safeBadgeCount}</span>)
						</>
					) : null}
				</span>
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
	documentBadgeCount = 0,
	insumosBadgeCount = 0,
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
				badgeCount={documentBadgeCount}
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
				badgeCount={insumosBadgeCount}
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

// Extraido de MenuGroup (achado javascript:S3776, docs/SONARQUBE-MAP.md)
// — substitui a cadeia de ternarios encadeados (administrativo/tecnicos/
// fallback) por uma tabela de despacho; os 2 componentes ja recebem
// exatamente o mesmo conjunto de props.
const GROUP_ITEMS_COMPONENTS = {};

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
	documentBadgeCount = 0,
	insumosBadgeCount = 0,
}) {
	const IconComponent = group.icon;
	const label =
		group.id === "atendimento"
			? displayLabel(group.label, "__atendimento_group")
			: group.label;
	const GroupItemsComponent = GROUP_ITEMS_COMPONENTS[group.id];
	return (
		<div key={group.id}>
			<button
				type="button"
				onClick={() =>
					setClickedGroups((current) =>
						current[group.id] ? {} : { [group.id]: true },
					)
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
					{GroupItemsComponent ? (
						<GroupItemsComponent
							group={group}
							pathname={pathname}
							clickedGroups={clickedGroups}
							setClickedGroups={setClickedGroups}
							isModernLayout={isModernLayout}
							nestedButtonClass={nestedButtonClass}
							submenuClass={submenuClass}
							onNavigate={onNavigate}
							displayLabel={displayLabel}
							documentBadgeCount={documentBadgeCount}
							insumosBadgeCount={insumosBadgeCount}
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

// Extraido de Sidebar (achado javascript:S3776, docs/SONARQUBE-MAP.md) —
// so os contadores de badge (documentos pendentes / atendimentos abertos),
// mesmo efeito/assinaturas realtime de antes.
function useSidebarBadgeCounters() {
	const [documentosPendentes, setDocumentosPendentes] = useState(0);
	const [insumosRequisicoesPendentes, setInsumosRequisicoesPendentes] =
		useState(0);
	const [atendimentoAbertos, setAtendimentoAbertos] = useState(0);

	useEffect(() => {
		let active = true;
		const refreshNotificationCounters = () =>
			obterContadoresNotificacoes()
				.then((counters) => {
					if (active)
						setDocumentosPendentes(
							Number(counters?.documentosPendentes || 0),
						);
					if (active)
						setInsumosRequisicoesPendentes(
							Number(counters?.insumosRequisicoesPendentes || 0),
						);
				})
				.catch(() => {});
		const refreshAtendimentoStats = () =>
			buscarEstatisticasAtendimento()
				.then((atendimentoStats) => {
					if (active)
						setAtendimentoAbertos(Number(atendimentoStats?.openCases || 0));
				})
				.catch(() => {});
		refreshNotificationCounters();
		refreshAtendimentoStats();
		const handleCounters = (event) => {
			setDocumentosPendentes(Number(event.detail?.documentosPendentes || 0));
			setInsumosRequisicoesPendentes(
				Number(event.detail?.insumosRequisicoesPendentes || 0),
			);
		};
		const unsubscribeAtendimento = subscribeRealtimeTopics(
			"atendimento",
			refreshAtendimentoStats,
			{ debounceMs: 300 },
		);
		window.addEventListener("retiradas:notification-counters", handleCounters);
		window.addEventListener(
			"retiradas:documentos-pendentes-updated",
			refreshNotificationCounters,
		);
		return () => {
			active = false;
			unsubscribeAtendimento();
			window.removeEventListener(
				"retiradas:notification-counters",
				handleCounters,
			);
			window.removeEventListener(
				"retiradas:documentos-pendentes-updated",
				refreshNotificationCounters,
			);
		};
	}, []);

	return { documentosPendentes, insumosRequisicoesPendentes, atendimentoAbertos };
}

// Extraido de Sidebar (achado javascript:S3776, docs/SONARQUBE-MAP.md) —
// so os useMemo de derivacao do menu (itens visiveis/destacados/
// agrupados), mesmas dependencias e mesma logica de antes.
function useSidebarMenuItems({ currentUser }) {
	const visibleItems = useMemo(
		() =>
			NAV_ITEMS.filter((item) =>
				item.publicAuthenticated
					? Boolean(currentUser)
					: hasAnyPermission(currentUser, item.permission),
			),
		[currentUser],
	);
	const dashboardItem = useMemo(
		() => visibleItems.find((item) => item.path === ROUTES.DASHBOARD),
		[visibleItems],
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
	const searchableItems = useMemo(
		() =>
			sortByPathOrder(
				visibleItems.filter((item) => item.path !== ROUTES.DASHBOARD),
				MODERN_MENU_ORDER,
			),
		[visibleItems],
	);

	return { dashboardItem, groupedMenu, otherMenuItems: [], searchableItems };
}

// Extraidos de Sidebar (achado javascript:S3776, docs/SONARQUBE-MAP.md) —
// os dois blocos de cabecalho (moderno/classico) sao arvores JSX
// independentes, so um renderiza por vez.
function SidebarHeader({ collapsed, isModernLayout, isMobileDrawer, onToggleCollapsed }) {
	const toggleTitle = isMobileDrawer
		? "Fechar menu"
		: collapsed
			? "Expandir menu"
			: "Ocultar menu";
	const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

	if (isModernLayout) {
		return (
			<div className={collapsed ? "flex flex-col items-center gap-3" : ""}>
				<img
					src="/logo-adm.png"
					alt="Administrativo | Cluster MG"
					className={`${collapsed ? "w-12 rounded-xl" : "w-28 rounded-2xl"} mx-auto h-auto max-w-full object-contain`}
				/>
				<p
					className={`${collapsed ? "sr-only" : "mt-3 text-center"} text-[11px] font-semibold uppercase tracking-wide text-slate-300`}
				>
					Administrativo | Cluster MG
				</p>
				<button
					type="button"
					onClick={onToggleCollapsed}
					className="mt-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15"
					title={toggleTitle}
					aria-label={toggleTitle}
				>
					<ToggleIcon size={18} />
				</button>
			</div>
		);
	}

	return (
		<div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
			<div className="flex h-9 w-9 items-center justify-center rounded-xl shadow-md">
				<img
					src="/logo-adm.png"
					alt="Administrativo | Cluster MG"
					className="h-9 w-9 rounded-xl object-cover"
				/>
			</div>
			<div className={collapsed ? "sr-only" : ""}>
				<p className="text-sm font-bold leading-none text-gray-900">
					Administrativo
				</p>
				<p className="mt-0.5 text-xs font-medium text-orange-500">
					Cluster MG
				</p>
			</div>
			<button
				type="button"
				onClick={onToggleCollapsed}
				className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-100 bg-white text-gray-600 transition hover:bg-gray-50"
				title={toggleTitle}
				aria-label={toggleTitle}
			>
				<ToggleIcon size={18} />
			</button>
		</div>
	);
}

// Extraido de Sidebar (achado javascript:S3776, docs/SONARQUBE-MAP.md) —
// cartao de usuario + botao de sair, so aparece no layout classico.
function SidebarUserFooter({ currentUser, signOut }) {
	return (
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
	);
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
	const { documentosPendentes, insumosRequisicoesPendentes, atendimentoAbertos } =
		useSidebarBadgeCounters();
	const currentRole = currentUser?.role;
	const isEstoqueOnly = ["estoque", "supervisor_estoque"].includes(
		String(currentRole || "").toLowerCase(),
	);

	const displayLabel = (label, path) => {
		if (path === ROUTES.DOCUMENTOS_PENDENTES && documentosPendentes > 0) {
			return (
				<>
					{label} (<span className="text-red-500">{documentosPendentes}</span>)
				</>
			);
		}
		if (
			path === ROUTES.INSUMOS_REQUISICOES &&
			insumosRequisicoesPendentes > 0
		) {
			return (
				<>
					{label} (
					<span className="text-red-500">
						{insumosRequisicoesPendentes}
					</span>
					)
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

	const { dashboardItem, groupedMenu, otherMenuItems, searchableItems } =
		useSidebarMenuItems({
		currentUser,
	});
	const isGroupActive = (group) =>
		group.items.some((item) => isMenuPathActive(location.pathname, item));
	const explicitlyOpenGroupId = Object.keys(clickedGroups).find(
		(groupId) => clickedGroups[groupId],
	);
	const activeGroupId = groupedMenu.find((group) => isGroupActive(group))?.id;
	const openGroupId = explicitlyOpenGroupId || activeGroupId || "";
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
				<SidebarHeader
					collapsed={collapsed}
					isModernLayout={isModernLayout}
					isMobileDrawer={isMobileDrawer}
					onToggleCollapsed={onToggleCollapsed}
				/>
			</div>

			<nav
				className={
					isModernLayout
						? "flex-1 space-y-1 overflow-y-auto px-3 py-4"
						: "flex-1 space-y-0.5 overflow-y-auto px-3 py-4"
				}
			>
				<SidebarSearch
					collapsed={collapsed}
					isModernLayout={isModernLayout}
					items={searchableItems}
					onNavigate={handleNavigation}
					displayLabel={displayLabel}
				/>

				{dashboardItem ? (
					<SidebarNavLink
						item={dashboardItem}
						onNavigate={() => {
							setClickedGroups({});
							handleNavigation();
						}}
						displayLabel={displayLabel}
						labelClass={itemLabelClass}
						className={navClass}
					/>
				) : null}

				{groupedMenu.map((group) => (
					<div key={group.id}>
						{group.id === "administracao" ? (
							<div
								className={
									isModernLayout
										? "my-3 border-t border-white/10"
										: "my-3 border-t border-gray-100"
								}
							/>
						) : null}
						<MenuGroup
							group={group}
							collapsed={collapsed}
							active={isGroupActive(group)}
							open={openGroupId === group.id}
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
							documentBadgeCount={documentosPendentes}
							insumosBadgeCount={insumosRequisicoesPendentes}
						/>
					</div>
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
				<SidebarUserFooter currentUser={currentUser} signOut={signOut} />
			)}
		</div>
	);
};

export default Sidebar;
