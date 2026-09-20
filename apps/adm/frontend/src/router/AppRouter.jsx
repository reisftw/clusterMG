import {
	AlertTriangle,
	BarChart3,
	Bell,
	Building2,
	Camera,
	CalendarDays,
	ChevronDown,
	ChevronRight,
	ClipboardCheck,
	ClipboardList,
	FileClock,
	FileText,
	Files,
	Home,
	KeyRound,
	LayoutDashboard,
	LogOut,
	Mail,
	Menu,
	MonitorPlay,
	PackagePlus,
	PanelLeftClose,
	PanelLeftOpen,
	Plus,
	RefreshCw,
	Search,
	Settings,
	ShieldCheck,
	UserCog,
	Users,
	X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	BrowserRouter,
	Navigate,
	NavLink,
	Outlet,
	Route,
	Routes,
	useLocation,
	useParams,
} from "react-router-dom";
import ErrorPage from "../components/ui/ErrorPage";
import Spinner from "../components/ui/Spinner";
import { hasAnyPermission } from "../constants/roles";
import { AuthProvider } from "../context/AuthContext";
import { useAuthContext } from "../context/useAuthContext";
import { LayoutModeProvider } from "../context/LayoutModeContext";
import { SystemProvider } from "../context/SystemContext";
import { ThemeProvider } from "../context/ThemeContext";
import AccessDenied from "../modules/auth/components/AccessDenied";
import ForgotPasswordPage from "../modules/auth/components/ForgotPasswordPage";
import LoginForm from "../modules/auth/components/LoginForm";
import ResetPasswordPage from "../modules/auth/components/ResetPasswordPage";
import TrocarSenhaModal from "../modules/auth/components/TrocarSenhaModal";
import { atualizarAvatarPerfil } from "../modules/auth/services/authService";
import {
	listarDocumentos,
	listarEnviosDocumentos,
	listarTratativasDocumentos,
} from "../modules/documentos/services/documentosService";
import { buscarFeriados } from "../modules/feriados/services/feriadosService";
import {
	listarImoveis,
	obterRelatoriosImoveis,
} from "../modules/imoveisAdministrativos/services/imoveisAdministrativosService";
import {
	listarInsumosAdministrativos,
	listarInsumosRequisicoes,
} from "../modules/insumosAdministrativos/services/insumosAdministrativosService";
import {
	buscarAgenda,
	criarAgenda,
} from "../modules/agenda/services/agendaService";
import {
	listarNotificacoesInternas,
	marcarNotificacoesLidas,
	obterContadoresNotificacoes,
} from "../services/internalNotificationsService";
import { AVATAR_ACCEPT, validateImageFile } from "../utils/imageUpload";
import UserAvatar from "../components/ui/UserAvatar";
import { ROUTES } from "./routes";

const Empresas = lazy(
	() => import("../modules/empresasTecnicos/components/EmpresasTecnicosPage"),
);
const Documentos = lazy(
	() => import("../modules/documentos/components/DocumentosPage"),
);
const DocumentosTratativas = lazy(
	() => import("../modules/documentos/components/DocumentosTratativasPage"),
);
const DocumentosConfig = lazy(
	() => import("../modules/documentos/components/DocumentosConfigPage"),
);
const DocumentosRelatorios = lazy(
	() => import("../modules/documentos/components/DocumentosRelatoriosPage"),
);
const TerceirizadosDocumentosPage = lazy(
	() => import("../pages/Terceiros/TerceirizadosDocumentosPage"),
);
const TotemInsumosPage = lazy(
	() => import("../modules/totemInsumos/components/TotemInsumosPage"),
);
const InsumosAdministrativos = lazy(
	() =>
		import(
			"../modules/insumosAdministrativos/components/InsumosAdministrativosPage"
		),
);
const InsumosRequisicoes = lazy(
	() =>
		import(
			"../modules/insumosAdministrativos/components/InsumosRequisicoesPage"
		),
);
const ImoveisAdministrativos = lazy(
	() =>
		import(
			"../modules/imoveisAdministrativos/components/ImoveisAdministrativosPage"
		),
);
const FacilitiesDashboardPage = lazy(
	() => import("../modules/facilities/dashboard/pages/FacilitiesDashboardPage"),
);
const FacilitiesDomainPage = lazy(
	() => import("../modules/facilities/components/FacilitiesPage"),
);
const FacilitiesAssetQrPage = lazy(
	() => import("../modules/facilities/public/pages/FacilitiesAssetQrPage"),
);
const SupplierEvaluationPublicPage = lazy(
	() => import("../modules/facilities/components/SupplierEvaluationPublicPage"),
);
const EmailSettingsPage = lazy(
	() => import("../modules/emailSettings/components/EmailSettingsPage"),
);
const ConfiguracoesGeraisPage = lazy(
	() => import("../modules/configuracoes/components/ConfiguracoesGeraisPage"),
);
const UsuariosPage = lazy(
	() => import("../modules/auth/components/UsuariosPage"),
);
const CargosPermissoesPage = lazy(
	() => import("../modules/auth/components/CargosPermissoesPage"),
);
const IntegracoesPage = lazy(
	() => import("../modules/integracoes/components/IntegracoesPage"),
);
const ApiStatusPage = lazy(
	() => import("../modules/apiStatus/components/ApiStatusPage"),
);
const HubsoftSettingsPage = lazy(
	() => import("../modules/hubsoft/components/HubsoftSettingsPage"),
);
const CvortexSettingsPage = lazy(
	() => import("../modules/cvortex/components/CvortexSettingsPage"),
);
const SeniorSettingsPage = lazy(
	() => import("../modules/senior/components/SeniorSettingsPage"),
);
const DatabaseBackupsPage = lazy(
	() => import("../modules/databaseBackups/components/DatabaseBackupsPage"),
);
const AuditoriaLogsPage = lazy(
	() => import("../modules/auditoria/components/AuditoriaLogsPage"),
);

const DOCUMENTOS_PERMISSION = [
	"view_documentos",
	"administrativo.documentos.view",
	"administrativo.documentos.manage",
];
const IMOVEIS_PERMISSION = [
	"view_imoveis_administrativos",
	"administrativo.imoveis.view",
	"administrativo.imoveis.manage",
];
const FACILITIES_PERMISSION = [
	"facilities.dashboard.view",
	"view_imoveis_administrativos",
	"administrativo.imoveis.view",
	"administrativo.imoveis.manage",
];
const FACILITIES_IMOVEIS_PERMISSION = [
	"facilities.imoveis.view",
	"facilities.imoveis_espacos.view",
	"view_imoveis_administrativos",
	"administrativo.imoveis.view",
	"administrativo.imoveis.manage",
];
const FACILITIES_IMOVEIS_MANAGE_PERMISSION = [
	"facilities.imoveis.create",
	"facilities.imoveis.edit",
	"facilities.imoveis.deactivate",
	"administrativo.imoveis.manage",
	"manage_imoveis_administrativos",
];
const FACILITIES_PATRIMONIO_PERMISSION = [
	"facilities.patrimonio.view",
	"facilities.patrimonio_inventario.view",
	"facilities.manage",
];
const FACILITIES_INVENTARIOS_PERMISSION = [
	"facilities.inventario.view",
	"facilities.patrimonio_inventario.view",
	"facilities.manage",
];
const FACILITIES_ACESSOS_PERMISSION = [
	"facilities.chaves.view",
	"facilities.acessos_chaves.view",
	"facilities.manage",
];
const FACILITIES_OPERACAO_PERMISSION = [
	"facilities.operacao_predial.view",
	"facilities.operacao_predial.manage",
	"facilities.manage",
];
const FACILITIES_SEGURANCA_PERMISSION = [
	"facilities.seguranca.view",
	"facilities.seguranca_conformidade.view",
	"facilities.manage",
];
const FACILITIES_CONTRATOS_PERMISSION = [
	"facilities.fornecedores.view",
	"facilities.contratos.view",
	"facilities.fornecedores_contratos.view",
	"facilities.manage",
];
const FACILITIES_CONSUMOS_PERMISSION = [
	"facilities.consumos.view",
	"facilities.manage",
];
const FACILITIES_SCORE_PERMISSION = [
	"facilities.saude.view",
	"facilities.score.view",
	"facilities.manage",
];
const FACILITIES_RELATORIOS_PERMISSION = [
	"facilities.relatorios.view",
	"facilities.manage",
];
const FACILITIES_SECTION_PERMISSIONS = {
	imoveis: FACILITIES_IMOVEIS_PERMISSION,
	"imoveis-espacos": FACILITIES_IMOVEIS_PERMISSION,
	"patrimonio-inventario": FACILITIES_PATRIMONIO_PERMISSION,
	inventarios: FACILITIES_INVENTARIOS_PERMISSION,
	"acessos-chaves": FACILITIES_ACESSOS_PERMISSION,
	"operacao-predial": FACILITIES_OPERACAO_PERMISSION,
	"seguranca-conformidade": FACILITIES_SEGURANCA_PERMISSION,
	"fornecedores-contratos": FACILITIES_CONTRATOS_PERMISSION,
	consumos: FACILITIES_CONSUMOS_PERMISSION,
	score: FACILITIES_SCORE_PERMISSION,
	relatorios: FACILITIES_RELATORIOS_PERMISSION,
};
const EMPRESAS_PERMISSION = [
	"view_empresas_tecnicos",
	"empresas.cadastro.view",
	"empresas.cadastro.manage",
];
const INSUMOS_MANAGE_PERMISSION = [
	"manage_insumos_administrativos",
	"administrativo.insumos.manage",
];
const INSUMOS_REQUISICOES_PERMISSION = [
	"view_insumos_requisicoes",
	"administrativo.insumos.view",
	"administrativo.insumos.manage",
];
const EMAIL_SETTINGS_PERMISSION = [
	"manage_general_settings",
	"mensageria.email_config.manage",
	"admin",
];
const GENERAL_SETTINGS_PERMISSION = [
	"manage_general_settings",
	"configuracao.geral.manage",
	"admin",
];
const USERS_PERMISSION = [
	"manage_users",
	"configuracao.usuarios.manage",
	"admin",
];
const ROLES_PERMISSION = [
	"manage_roles",
	"configuracao.cargos_permissoes.manage",
	"admin",
];
const INTEGRATIONS_PERMISSION = [
	"manage_general_settings",
	"configuracao.integracoes.manage",
	"admin",
];
const ADM_SIDEBAR_COLLAPSED_KEY = "adm-sidebar-collapsed";

const DASHBOARD_NAV_ITEM = {
	label: "Dashboard",
	path: ROUTES.DASHBOARD,
	icon: LayoutDashboard,
	permission: ["view_dashboard", "administrativo.documentos.view"],
};

const NAV_GROUPS = [
	{
		icon: ClipboardList,
		title: "Solicitações",
		items: [
			{
				label: "Requisições",
				path: ROUTES.INSUMOS_REQUISICOES,
				icon: ClipboardList,
				permission: INSUMOS_REQUISICOES_PERMISSION,
			},
			{
				label: "Insumos",
				path: ROUTES.INSUMOS_ADMINISTRATIVOS,
				icon: PackagePlus,
				permission: INSUMOS_MANAGE_PERMISSION,
			},
			{
				label: "Totem",
				path: ROUTES.TOTEM_INSUMOS,
				icon: MonitorPlay,
				permission: INSUMOS_REQUISICOES_PERMISSION,
			},
		],
	},
	{
		icon: FileText,
		title: "Documentos",
		items: [
			{
				label: "Visão Geral",
				path: ROUTES.DOCUMENTOS_PENDENTES,
				icon: FileClock,
				permission: DOCUMENTOS_PERMISSION,
			},
			{
				label: "Documentos",
				path: ROUTES.DOCUMENTOS_TRATATIVAS,
				icon: ShieldCheck,
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
				permission: DOCUMENTOS_PERMISSION,
			},
			{
				label: "Terceirizados",
				path: ROUTES.DOCUMENTOS_TECNICOS_TERCEIRIZADOS,
				icon: Users,
				permission: EMPRESAS_PERMISSION,
			},
			{
				label: "Relatórios",
				path: ROUTES.DOCUMENTOS_RELATORIOS,
				icon: Files,
				permission: [
					"view_documentos_relatorios",
					"administrativo.relatorios.view",
				],
			},
		],
	},
	{
		icon: Building2,
		title: "Facilities",
		items: [
			{
				label: "Visão Geral",
				path: ROUTES.FACILITIES,
				icon: BarChart3,
				permission: FACILITIES_PERMISSION,
			},
			{
				label: "Imóveis & Espaços",
				path: ROUTES.FACILITIES_IMOVEIS,
				icon: Building2,
				permission: FACILITIES_IMOVEIS_PERMISSION,
			},
			{
				label: "Patrimônio",
				path: ROUTES.FACILITIES_PATRIMONIO_INVENTARIO,
				icon: PackagePlus,
				permission: FACILITIES_PATRIMONIO_PERMISSION,
			},
			{
				label: "Inventários",
				path: ROUTES.FACILITIES_INVENTARIOS,
				icon: ClipboardCheck,
				permission: FACILITIES_INVENTARIOS_PERMISSION,
			},
			{
				label: "Acessos & Chaves",
				path: ROUTES.FACILITIES_ACESSOS_CHAVES,
				icon: KeyRound,
				permission: FACILITIES_ACESSOS_PERMISSION,
			},
			{
				label: "Operação Predial",
				path: ROUTES.FACILITIES_OPERACAO_PREDIAL,
				icon: ClipboardList,
				permission: FACILITIES_OPERACAO_PERMISSION,
			},
			{
				label: "Segurança",
				path: ROUTES.FACILITIES_SEGURANCA_CONFORMIDADE,
				icon: ShieldCheck,
				permission: FACILITIES_SEGURANCA_PERMISSION,
			},
			{
				label: "Fornecedores & Contratos",
				path: ROUTES.FACILITIES_FORNECEDORES_CONTRATOS,
				icon: Files,
				permission: FACILITIES_CONTRATOS_PERMISSION,
			},
			{
				label: "Consumos & Custos",
				path: ROUTES.FACILITIES_CONSUMOS,
				icon: FileText,
				permission: FACILITIES_CONSUMOS_PERMISSION,
			},
			{
				label: "Saúde das Unidades",
				path: ROUTES.FACILITIES_SCORE,
				icon: AlertTriangle,
				permission: FACILITIES_SCORE_PERMISSION,
			},
			{
				label: "Relatórios",
				path: ROUTES.FACILITIES_RELATORIOS,
				icon: BarChart3,
				permission: FACILITIES_RELATORIOS_PERMISSION,
			},
		],
	},
	{
		icon: Settings,
		title: "Administração",
		items: [
			{
				label: "Empresas",
				path: ROUTES.EMPRESAS_TECNICOS,
				icon: Building2,
				permission: EMPRESAS_PERMISSION,
			},
			{
				label: "Usuários",
				path: ROUTES.USUARIOS,
				icon: Users,
				permission: USERS_PERMISSION,
			},
			{
				label: "Perfis & Permissões",
				path: ROUTES.CARGOS_PERMISSOES,
				icon: UserCog,
				permission: ROLES_PERMISSION,
			},
			{
				label: "Auditoria",
				path: ROUTES.AUDITORIA_LOGS,
				icon: FileClock,
				permission: ["administrativo.auditoria.view", "configuracao.auditoria.view", "admin"],
			},
			{
				label: "Integrações",
				path: ROUTES.INTEGRACOES,
				icon: Settings,
				permission: INTEGRATIONS_PERMISSION,
			},
			{
				label: "Configurações",
				path: ROUTES.CONFIGURACOES_GERAIS,
				icon: Settings,
				permission: GENERAL_SETTINGS_PERMISSION,
			},
		],
	},
];

const TITLES = {
	[ROUTES.DASHBOARD]: "Dashboard Administrativo",
	[ROUTES.EMPRESAS_TECNICOS]: "Empresas",
	[ROUTES.DOCUMENTOS_PENDENTES]: "Documentos",
	[ROUTES.DOCUMENTOS_TRATATIVAS]: "Tratativas",
	[ROUTES.DOCUMENTOS_HISTORICO]: "Histórico de documentos",
	[ROUTES.DOCUMENTOS_APROVADOS]: "Documentos aprovados",
	[ROUTES.DOCUMENTOS_NOTAS_FISCAIS]: "Notas fiscais",
	[ROUTES.DOCUMENTOS_TECNICOS_TERCEIRIZADOS]: "Terceirizados",
	[ROUTES.DOCUMENTOS_CONFIGURACAO]: "Configuração de documentos",
	[ROUTES.DOCUMENTOS_RELATORIOS]: "Relatórios de documentos",
	[ROUTES.FACILITIES]: "Facilities",
	[ROUTES.FACILITIES_IMOVEIS]: "Imóveis & espaços",
	[ROUTES.FACILITIES_IMOVEIS_NOVO]: "Novo imóvel",
	[ROUTES.FACILITIES_IMOVEIS_IMPORTAR]: "Importar imóveis",
	[ROUTES.FACILITIES_IMOVEIS_CONFIGURACOES]: "Configurações de imóveis",
	[ROUTES.FACILITIES_IMOVEIS_ESPACOS]: "Imóveis & espaços",
	[ROUTES.FACILITIES_PATRIMONIO_INVENTARIO]: "Patrimônio & inventário",
	[ROUTES.FACILITIES_INVENTARIOS]: "Inventários",
	[ROUTES.FACILITIES_ACESSOS_CHAVES]: "Acessos & chaves",
	[ROUTES.FACILITIES_OPERACAO_PREDIAL]: "Operação predial",
	[ROUTES.FACILITIES_SEGURANCA_CONFORMIDADE]: "Segurança & conformidade",
	[ROUTES.FACILITIES_FORNECEDORES_CONTRATOS]: "Fornecedores & contratos",
	[ROUTES.FACILITIES_CONSUMOS]: "Consumos",
	[ROUTES.FACILITIES_SCORE]: "Saúde das Unidades",
	[ROUTES.FACILITIES_RELATORIOS]: "Relatórios de Facilities",
	[ROUTES.INSUMOS_ADMINISTRATIVOS]: "Catálogo de Insumos",
	[ROUTES.INSUMOS_REQUISICOES]: "Requisições de Insumos",
	[ROUTES.IMOVEIS_ADMINISTRATIVOS]: "Imóveis",
	[ROUTES.IMOVEIS_ADMINISTRATIVOS_CONTRATOS]: "Contratos de imóveis",
	[ROUTES.IMOVEIS_ADMINISTRATIVOS_HISTORICO]: "Histórico de imóveis",
	[ROUTES.IMOVEIS_ADMINISTRATIVOS_RELATORIOS]: "Relatórios de imóveis",
	[ROUTES.CONFIGURACOES_GERAIS]: "Configurações gerais",
	[ROUTES.CONFIGURACOES_NOTIFICACOES]: "Notificações",
	[ROUTES.USUARIOS]: "Usuários",
	[ROUTES.CARGOS_PERMISSOES]: "Cargos e permissões",
	[ROUTES.EMAIL_SETTINGS]: "Configuração de e-mail",
	[ROUTES.INTEGRACOES]: "Central de integrações",
	[ROUTES.API_STATUS]: "Integrações APIs",
	[ROUTES.HUBSOFT_SETTINGS]: "Hubsoft",
	[ROUTES.CVORTEX_SETTINGS]: "Cvortex",
	[ROUTES.SENIOR_SETTINGS]: "Sênior",
	[ROUTES.DATABASE_BACKUPS]: "Banco de dados",
	[ROUTES.AUDITORIA_LOGS]: "Logs de auditoria",
};

const DASHBOARD_CARDS = [
	{
		label: "Documentos",
		description: "Pendências, tratativas, aprovados e configurações.",
		path: ROUTES.DOCUMENTOS_PENDENTES,
		icon: FileText,
		tone: "blue",
	},
	{
		label: "Empresas",
		description: "Cadastro de empresas, técnicos e vínculos.",
		path: ROUTES.EMPRESAS_TECNICOS,
		icon: Building2,
		tone: "emerald",
	},
	{
		label: "Imóveis",
		description: "Imóveis, contratos, histórico e relatórios.",
		path: ROUTES.IMOVEIS_ADMINISTRATIVOS,
		icon: Files,
		tone: "orange",
	},
	{
		label: "Insumos",
		description: "Catálogo administrativo e requisições.",
		path: ROUTES.INSUMOS_ADMINISTRATIVOS,
		icon: PackagePlus,
		tone: "violet",
	},
];

const toneClasses = {
	blue: "bg-blue-50 text-blue-700 border-blue-100",
	emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
	orange: "bg-orange-50 text-orange-700 border-orange-100",
	red: "bg-red-50 text-red-700 border-red-100",
	violet: "bg-violet-50 text-violet-700 border-violet-100",
};

const dashboardListToneClasses = {
	blue: "border-blue-100 bg-blue-50/70 text-blue-700",
	emerald: "border-emerald-100 bg-emerald-50/80 text-emerald-700",
	orange: "border-orange-100 bg-orange-50/80 text-orange-700",
	red: "border-red-200 bg-red-50 text-red-700",
	violet: "border-violet-100 bg-violet-50/80 text-violet-700",
	slate: "border-slate-100 bg-slate-50 text-slate-700",
};

const dashboardDateFormatter = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
});

const dashboardWeekdayFormatter = new Intl.DateTimeFormat("pt-BR", {
	weekday: "short",
});

const dashboardMonthFormatter = new Intl.DateTimeFormat("pt-BR", {
	month: "long",
});

function toDateValue(value) {
	if (!value) return null;
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	const textValue = String(value);
	if (/^\d{4}-\d{2}-\d{2}$/.test(textValue)) {
		const [year, month, day] = textValue.split("-").map(Number);
		return new Date(year, month - 1, day);
	}
	const date = new Date(textValue);
	return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(value) {
	const date = toDateValue(value);
	if (!date) return "";
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function getFieldDate(item = {}, keys = []) {
	for (const key of keys) {
		const value = item?.[key];
		if (toDateValue(value)) return value;
	}
	return "";
}

function sortByRecent(items = [], keys = ["createdAt", "criado_em", "updatedAt"]) {
	return [...items].sort((a, b) =>
		String(getFieldDate(b, keys) || "").localeCompare(
			String(getFieldDate(a, keys) || ""),
		),
	);
}

function getInsumosRequestItems(requisicao = {}) {
	if (Array.isArray(requisicao.itens) && requisicao.itens.length) {
		return requisicao.itens.filter((item) => Number(item.quantidade || 0) > 0);
	}
	if (!requisicao.produto_nome && !requisicao.produtoNome) return [];
	return [
		{
			produto_nome: requisicao.produto_nome || requisicao.produtoNome,
			quantidade: requisicao.quantidade || 0,
			unidade: requisicao.unidade || "",
		},
	];
}

function formatInsumosRequestTitle(requisicao = {}) {
	const itens = getInsumosRequestItems(requisicao);
	if (itens.length > 1) return `${itens.length} materiais solicitados`;
	return itens[0]?.produto_nome || "Insumo solicitado";
}

function formatInsumosRequestSubtitle(requisicao = {}) {
	const itens = getInsumosRequestItems(requisicao);
	if (!itens.length) return `${requisicao.status || "pendente"}`;
	const summary = itens
		.slice(0, 2)
		.map((item) => `${item.quantidade || 0} ${item.unidade || ""}`.trim())
		.join(" + ");
	return `${requisicao.status || "pendente"} · ${summary}${itens.length > 2 ? ` · +${itens.length - 2}` : ""}`;
}

function startOfWeek(date = new Date()) {
	const start = new Date(date);
	const day = start.getDay() || 7;
	start.setHours(0, 0, 0, 0);
	start.setDate(start.getDate() - day + 1);
	return start;
}

function buildWeekDays() {
	const start = startOfWeek();
	return Array.from({ length: 7 }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		return {
			date,
			key: toDateKey(date),
			label: dashboardWeekdayFormatter.format(date).replace(".", ""),
			day: dashboardDateFormatter.format(date),
		};
	});
}

function isUpcoming(value, days = 30) {
	const date = toDateValue(value);
	if (!date) return false;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const end = new Date(today);
	end.setDate(today.getDate() + days);
	return date >= today && date <= end;
}

function flattenDocumentDates(items = []) {
	return items.flatMap((item) => {
		const files = Array.isArray(item.files) ? item.files : [];
		const baseStatus = String(item.status || "pendente").toLowerCase();
		const shouldTrackStatus = (status) =>
			!["aprovado", "aguardando_administrativo"].includes(
				String(status || "").toLowerCase(),
			);
		const base = {
			id: item.id,
			title: item.empresaNome || item.empresa_nome || item.nome || "Documento",
			status: item.status || "pendente",
			date: getFieldDate(item, [
				"vencimento",
				"dataVencimento",
				"dueDate",
				"prazo",
			]),
		};
		const fileDates = files
			.filter((file) =>
				shouldTrackStatus(
					file.adminStatus || file.status || item.status || "pendente",
				),
			)
			.map((file) => ({
				id: file.id || `${item.id}-${file.fieldId || file.nome}`,
				empresaId: item.empresaId || item.empresa_id || file.empresaId,
				empresaNome:
					item.empresaNome ||
					item.empresa_nome ||
					file.empresaNome ||
					file.empresa_nome ||
					"Empresa sem nome",
				title:
					file.fieldLabel ||
					file.fieldNome ||
					file.nome ||
					item.empresaNome ||
					"Documento enviado",
				status: file.adminStatus || file.status || item.status || "pendente",
				date: getFieldDate(file, [
					"vencimento",
					"dataVencimento",
					"dueDate",
					"prazo",
					"data",
				]),
			}))
			.filter((file) => file.date);
		return [...(base.date && shouldTrackStatus(baseStatus) ? [base] : []), ...fileDates];
	});
}

function groupDocumentExpirationsByCompany(items = []) {
	const grouped = new Map();
	items.forEach((item) => {
		const companyName =
			item.empresaNome || item.title || item.empresa_nome || "Empresa sem nome";
		const key = item.empresaId || companyName;
		const current = grouped.get(key) || {
			id: key,
			title: companyName,
			count: 0,
			nearestDate: item.date,
			items: [],
			tone: "red",
		};
		current.count += 1;
		current.items.push(item);
		if (
			toDateValue(item.date) &&
			(!toDateValue(current.nearestDate) ||
				toDateValue(item.date) < toDateValue(current.nearestDate))
		) {
			current.nearestDate = item.date;
		}
		grouped.set(key, current);
	});
	return [...grouped.values()].sort(
		(a, b) =>
			(toDateValue(a.nearestDate)?.getTime() || 0) -
			(toDateValue(b.nearestDate)?.getTime() || 0),
	);
}

function DashboardMetric({
	icon: Icon,
	label,
	value,
	description,
	tone = "blue",
	onClick,
}) {
	const Component = onClick ? "button" : "div";
	return (
		<Component
			type={onClick ? "button" : undefined}
			onClick={onClick}
			className="group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg"
		>
			<div
				className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${toneClasses[tone] || toneClasses.blue}`}
			>
				<Icon size={20} />
			</div>
			<p className="text-xs font-black uppercase tracking-wide text-slate-500">
				{label}
			</p>
			<p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
			<p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
				{description}
			</p>
			{onClick ? (
				<p className="mt-3 text-[11px] font-black uppercase tracking-wide text-blue-600 opacity-0 transition group-hover:opacity-100">
					Ver detalhes
				</p>
			) : null}
		</Component>
	);
}

function DashboardDetailsModal({ title, description, items, onClose, renderItem }) {
	if (!title) return null;
	return (
		<div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
			<div className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
				<div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
					<div>
						<h3 className="text-xl font-black text-slate-950">{title}</h3>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							{description}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
						aria-label="Fechar"
					>
						<X size={18} />
					</button>
				</div>
				<div className="max-h-[64vh] space-y-2 overflow-y-auto p-5">
					{items?.length ? (
						items.map((item, index) => (
							<div
								key={item.id || `${title}-${index}`}
								className={`rounded-2xl border px-4 py-3 ${dashboardListToneClasses[item.tone] || dashboardListToneClasses.slate}`}
							>
								{renderItem(item)}
							</div>
						))
					) : (
						<p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-500">
							Nenhum item encontrado.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

function DashboardList({ title, icon: Icon, items, emptyText, renderItem, tone = "blue" }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="mb-3 flex items-center gap-2">
				<span
					className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${toneClasses[tone] || toneClasses.blue}`}
				>
					<Icon size={18} />
				</span>
				<h3 className="text-sm font-black text-slate-950">{title}</h3>
			</div>
			<div className="space-y-2">
				{items?.length ? (
					items.slice(0, 5).map((item, index) => (
						<div
							key={item.id || `${title}-${index}`}
							className={`rounded-xl border px-3 py-2 ${dashboardListToneClasses[item.tone || tone] || dashboardListToneClasses.slate}`}
						>
							{renderItem(item)}
						</div>
					))
				) : (
					<p className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-sm font-semibold text-slate-500">
						{emptyText}
					</p>
				)}
			</div>
		</div>
	);
}

function DashboardAgendaModal({ form, setForm, saving, onClose, onSave }) {
	const inputClass =
		"w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
	return (
		<div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
			<div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
				<div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
					<div>
						<h3 className="text-lg font-black text-slate-950">
							Novo compromisso
						</h3>
						<p className="text-sm font-semibold text-slate-500">
							Registre um lembrete para a semana administrativa.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
						aria-label="Fechar"
					>
						<X size={18} />
					</button>
				</div>
				<div className="space-y-4 p-5">
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Título
						</span>
						<input
							className={inputClass}
							value={form.atividade}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									atividade: event.target.value,
								}))
							}
							placeholder="Ex: Renovar contrato"
						/>
					</label>
					<div className="grid gap-3 sm:grid-cols-2">
						<label className="block">
							<span className="text-xs font-black uppercase text-slate-500">
								Data
							</span>
							<input
								type="date"
								className={inputClass}
								value={form.data_inicio}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										data_inicio: event.target.value,
										data_fim: event.target.value,
									}))
								}
							/>
						</label>
						<label className="block">
							<span className="text-xs font-black uppercase text-slate-500">
								Tipo
							</span>
							<select
								className={inputClass}
								value={form.tipo}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										tipo: event.target.value,
									}))
								}
							>
								<option>Documento</option>
								<option>Contrato</option>
								<option>Imóvel</option>
								<option>Insumo</option>
								<option>Outro</option>
							</select>
						</label>
					</div>
					<label className="block">
						<span className="text-xs font-black uppercase text-slate-500">
							Descrição
						</span>
						<textarea
							className={`${inputClass} min-h-24 resize-y`}
							value={form.descricao}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									descricao: event.target.value,
								}))
							}
							placeholder="Detalhes do compromisso"
						/>
					</label>
				</div>
				<div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-600 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={onSave}
						disabled={saving || !form.atividade.trim() || !form.data_inicio}
						className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{saving ? "Salvando..." : "Salvar"}
					</button>
				</div>
			</div>
		</div>
	);
}

function AdministrativoDashboard() {
	const { currentUser } = useAuthContext();
	const [loading, setLoading] = useState(true);
	const [savingAgenda, setSavingAgenda] = useState(false);
	const [agendaOpen, setAgendaOpen] = useState(false);
	const [detailsModal, setDetailsModal] = useState(null);
	const [agendaForm, setAgendaForm] = useState(() => ({
		atividade: "",
		tipo: "Documento",
		data_inicio: toDateKey(new Date()),
		data_fim: toDateKey(new Date()),
		descricao: "",
	}));
	const [data, setData] = useState({
		documentos: [],
		enviosPendentes: [],
		tratativas: [],
		insumos: { produtos: [] },
		requisicoes: [],
		imoveis: [],
		relatorioImoveis: {},
		agenda: [],
		feriados: [],
	});

	const loadDashboard = useCallback(async () => {
		setLoading(true);
		const now = new Date();
		const [documentos, enviosPendentes, tratativas, insumos, requisicoes, imoveis, relatorioImoveis, agenda, feriados] =
			await Promise.all([
				listarDocumentos({ limit: 100 }).catch(() => []),
				listarEnviosDocumentos({ status: "pendente", limit: 100 }).catch(
					() => [],
				),
				listarTratativasDocumentos({ limit: 100 }).catch(() => []),
				listarInsumosAdministrativos().catch(() => ({ produtos: [] })),
				listarInsumosRequisicoes({ status: "todos", limit: 20 }).catch(() => ({
					items: [],
				})),
				listarImoveis().catch(() => []),
				obterRelatoriosImoveis({
					mes: String(now.getMonth() + 1).padStart(2, "0"),
					ano: String(now.getFullYear()),
				}).catch(() => ({})),
				buscarAgenda(false, { allowFallback: true, preferStatic: false }).catch(
					() => [],
				),
				buscarFeriados().catch(() => []),
			]);

		setData({
			documentos,
			enviosPendentes,
			tratativas,
			insumos,
			requisicoes: requisicoes.items || [],
			imoveis,
			relatorioImoveis,
			agenda,
			feriados,
		});
		setLoading(false);
	}, []);

	useEffect(() => {
		// loadDashboard chama setLoading(true) de forma síncrona antes do
		// primeiro await — necessário porque a mesma função também é chamada
		// por um botão de atualizar (linha ~1376) e por outro fluxo async
		// (linha ~1203), onde loading já pode estar false.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		loadDashboard();
	}, [loadDashboard]);

	const dashboard = useMemo(() => {
		const produtos = data.insumos?.produtos || [];
		const documentosDatas = flattenDocumentDates([
			...data.documentos,
			...data.enviosPendentes,
			...data.tratativas,
		]);
		const documentosVencendo = groupDocumentExpirationsByCompany(
			documentosDatas.filter((item) => isUpcoming(item.date, 30)),
		);
		const itensBaixoEstoque = produtos
			.filter((item) => {
				const atual = Number(item.estoque_atual || 0);
				const minimo = Number(item.estoque_minimo ?? item.estoque_ideal ?? 0);
				return minimo > 0 && atual <= minimo;
			})
			.map((item) => ({
				...item,
				tone:
					Number(item.estoque_atual || 0) <= 0
						? "red"
						: "violet",
			}));
		const imoveisVencendo = [
			...(data.relatorioImoveis?.contratosProximos || []),
			...(data.relatorioImoveis?.iptusProximos || []),
			...(data.relatorioImoveis?.alugueisProximos || []),
		].map((item) => ({ ...item, tone: "orange" }));
		const ultimosImoveis = sortByRecent(data.imoveis, [
			"criado_em",
			"createdAt",
			"updatedAt",
			"atualizado_em",
		]).slice(0, 5);
		const ultimasRequisicoes = sortByRecent(data.requisicoes, [
			"criado_em",
			"createdAt",
			"solicitado_em",
			"updatedAt",
		]).slice(0, 5);
		const requisicoesPendentes = sortByRecent(
			data.requisicoes.filter((item) => item.status === "pendente"),
			["criado_em", "createdAt", "solicitado_em", "updatedAt"],
		);
		const aguardando = sortByRecent(
			[...data.enviosPendentes, ...data.tratativas],
			["submittedAt", "createdAt", "criado_em"],
		).slice(0, 5);
		const weekDays = buildWeekDays();
		const weekEvents = weekDays.map((day) => {
			const events = [
				...data.feriados
					.filter((item) => toDateKey(item.data || item.date) === day.key)
					.map((item) => ({
						type: "Feriado",
						title: item.nome || item.name || "Feriado",
						tone: "orange",
					})),
				...data.agenda
					.filter((item) => toDateKey(item.data_inicio || item.data) === day.key)
					.map((item) => ({
						type: item.tipo || "Agenda",
						title: item.atividade || item.titulo || "Compromisso",
						tone: "blue",
					})),
				...documentosVencendo
					.filter((item) => toDateKey(item.nearestDate) === day.key)
					.slice(0, 3)
					.map((item) => ({
						type: "Documento",
						title: `${item.title} - ${item.count} documento(s)`,
						tone: "red",
					})),
				...imoveisVencendo
					.filter(
						(item) =>
							toDateKey(
								item.vencimento ||
									item.vencimentoAluguel ||
									item.data ||
									item.createdAt,
							) === day.key,
					)
					.slice(0, 3)
					.map((item) => ({
						type: "Imóvel",
						title: item.nome || item.imovelId || item.seniorId || "Vencimento",
						tone: "emerald",
					})),
			];
			return { ...day, events };
		});

		return {
			documentosPendentes: data.enviosPendentes.length + data.tratativas.length,
			requisicoesPendentes,
			documentosVencendo,
			itensBaixoEstoque,
			imoveisVencendo,
			ultimosImoveis,
			ultimasRequisicoes,
			aguardando,
			weekEvents,
		};
	}, [data]);

	const saveAgenda = async () => {
		if (!agendaForm.atividade.trim() || !agendaForm.data_inicio) return;
		setSavingAgenda(true);
		await criarAgenda({
			...agendaForm,
			data_fim: agendaForm.data_fim || agendaForm.data_inicio,
			criado_por: currentUser?.nome || currentUser?.email || "",
			origem: "adm_dashboard",
		}).catch(() => null);
		setSavingAgenda(false);
		setAgendaOpen(false);
		setAgendaForm({
			atividade: "",
			tipo: "Documento",
			data_inicio: toDateKey(new Date()),
			data_fim: toDateKey(new Date()),
			descricao: "",
		});
		await loadDashboard();
	};

	const openDashboardDetails = (config) => {
		setDetailsModal(config);
	};

	return (
		<div className="space-y-6">
			<DashboardDetailsModal
				title={detailsModal?.title}
				description={detailsModal?.description}
				items={detailsModal?.items || []}
				onClose={() => setDetailsModal(null)}
				renderItem={detailsModal?.renderItem || (() => null)}
			/>
			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
				<DashboardMetric
					icon={FileClock}
					label="Documentos pendentes"
					value={loading ? "..." : dashboard.documentosPendentes}
					description="Envios e tratativas aguardando ação."
					tone="blue"
					onClick={() =>
						openDashboardDetails({
							title: "Documentos pendentes",
							description: "Envios e tratativas aguardando ação.",
							items: [
								...data.enviosPendentes.map((item) => ({
									...item,
									tone: "blue",
									kind: "Envio",
								})),
								...data.tratativas.map((item) => ({
									...item,
									tone: "orange",
									kind: "Tratativa",
								})),
							],
							renderItem: (item) => (
								<NavLink to={ROUTES.DOCUMENTOS_PENDENTES} className="block">
									<p className="text-sm font-black text-slate-950">
										{item.empresaNome || item.empresa_nome || item.nome || "Empresa"}
									</p>
									<p className="mt-1 text-xs font-semibold text-slate-600">
										{item.kind} · {item.status || "pendente"} ·{" "}
										{formatNotificationDate(item.submittedAt || item.createdAt || item.criado_em)}
									</p>
								</NavLink>
							),
						})
					}
				/>
				<DashboardMetric
					icon={ClipboardList}
					label="Requisições pendentes"
					value={loading ? "..." : dashboard.requisicoesPendentes.length}
					description="Pedidos de insumos aguardando aprovação."
					tone="orange"
					onClick={() =>
						openDashboardDetails({
							title: "Requisições pendentes",
							description: "Pedidos aguardando aprovação administrativa.",
							items: dashboard.requisicoesPendentes,
							renderItem: (item) => (
								<NavLink to={ROUTES.INSUMOS_REQUISICOES} className="block">
									<p className="text-sm font-black text-slate-950">
										{item.protocolo || "Requisição"} -{" "}
										{formatInsumosRequestTitle(item)}
									</p>
									<p className="mt-1 text-xs font-semibold text-slate-600">
										{item.solicitante_nome || item.solicitante_email || "Solicitante"} ·{" "}
										{formatNotificationDate(item.criado_em || item.createdAt)}
									</p>
								</NavLink>
							),
						})
					}
				/>
				<DashboardMetric
					icon={AlertTriangle}
					label="Próximos vencimentos"
					value={loading ? "..." : dashboard.documentosVencendo.length}
					description="Documentos vencendo nos próximos 30 dias."
					tone="red"
					onClick={() =>
						openDashboardDetails({
							title: "Documentos próximos de vencer",
							description: "Agrupado por empresa, considerando apenas documentos ainda pendentes ou reprovados.",
							items: dashboard.documentosVencendo,
							renderItem: (item) => (
								<NavLink to={ROUTES.DOCUMENTOS_HISTORICO} className="block">
									<p className="text-sm font-black text-slate-950">
										{item.title} - {item.count} documento(s)
									</p>
									<p className="mt-1 text-xs font-semibold text-red-700">
										Próximo vencimento em{" "}
										{dashboardDateFormatter.format(toDateValue(item.nearestDate) || new Date())}
									</p>
								</NavLink>
							),
						})
					}
				/>
				<DashboardMetric
					icon={PackagePlus}
					label="Itens críticos"
					value={loading ? "..." : dashboard.itensBaixoEstoque.length}
					description="Insumos abaixo ou no estoque mínimo."
					tone="violet"
					onClick={() =>
						openDashboardDetails({
							title: "Itens críticos",
							description: "Insumos abaixo ou no estoque mínimo configurado.",
							items: dashboard.itensBaixoEstoque,
							renderItem: (item) => (
								<NavLink to={ROUTES.INSUMOS_ADMINISTRATIVOS} className="block">
									<p className="text-sm font-black text-slate-950">
										{item.nome || "Produto"}
									</p>
									<p className="mt-1 text-xs font-semibold text-slate-600">
										Atual {item.estoque_atual || 0} · mínimo{" "}
										{item.estoque_minimo ?? item.estoque_ideal ?? 0}
									</p>
								</NavLink>
							),
						})
					}
				/>
				<DashboardMetric
					icon={Home}
					label="Imóveis em atenção"
					value={loading ? "..." : dashboard.imoveisVencendo.length}
					description={`Vencimentos de ${dashboardMonthFormatter.format(new Date())}.`}
					tone="emerald"
					onClick={() =>
						openDashboardDetails({
							title: "Imóveis em atenção",
							description: "Contratos, IPTU e aluguéis com vencimento próximo.",
							items: dashboard.imoveisVencendo,
							renderItem: (item) => (
								<NavLink to={ROUTES.IMOVEIS_ADMINISTRATIVOS_RELATORIOS} className="block">
									<p className="text-sm font-black text-slate-950">
										{item.nome || item.imovelId || item.seniorId || "Imóvel"}
									</p>
									<p className="mt-1 text-xs font-semibold text-slate-600">
										{dashboardDateFormatter.format(toDateValue(item.vencimento || item.vencimentoAluguel || item.data) || new Date())}
									</p>
								</NavLink>
							),
						})
					}
				/>
			</section>

			<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
							<CalendarDays size={20} />
						</span>
						<div>
							<h3 className="text-base font-black text-slate-950">
								Calendário da semana
							</h3>
							<p className="text-sm font-semibold text-slate-500">
								Feriados, agenda e vencimentos próximos.
							</p>
						</div>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={loadDashboard}
							className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-50"
						>
							<RefreshCw size={16} /> Atualizar
						</button>
						<button
							type="button"
							onClick={() => setAgendaOpen(true)}
							className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-black text-white shadow-sm hover:bg-blue-700"
						>
							<Plus size={16} /> Agenda
						</button>
					</div>
				</div>
				<div className="grid gap-3 md:grid-cols-7">
					{dashboard.weekEvents.map((day) => (
						<div
							key={day.key}
							className="min-h-36 rounded-2xl border border-slate-200 bg-slate-50 p-3"
						>
							<p className="text-xs font-black uppercase text-slate-500">
								{day.label}
							</p>
							<p className="text-lg font-black text-slate-950">{day.day}</p>
							<div className="mt-3 space-y-2">
								{day.events.length ? (
									day.events.slice(0, 3).map((event, index) => (
										<div
											key={`${day.key}-${event.type}-${index}`}
											className="rounded-xl bg-white px-2 py-1.5 shadow-sm"
										>
											<p className="text-[10px] font-black uppercase text-blue-600">
												{event.type}
											</p>
											<p className="line-clamp-2 text-xs font-bold text-slate-700">
												{event.title}
											</p>
										</div>
									))
								) : (
									<p className="text-xs font-semibold text-slate-400">
										Sem eventos.
									</p>
								)}
								{day.events.length > 3 ? (
									<p className="text-[11px] font-black text-slate-400">
										+{day.events.length - 3} itens
									</p>
								) : null}
							</div>
						</div>
					))}
				</div>
			</section>

			<section className="grid gap-4 xl:grid-cols-3">
				<DashboardList
					title="Documentos aguardando"
					icon={FileText}
					items={dashboard.aguardando}
					emptyText="Nenhum documento aguardando."
					tone="blue"
					renderItem={(item) => (
						<NavLink to={ROUTES.DOCUMENTOS_PENDENTES} className="block">
							<p className="line-clamp-1 text-sm font-black text-slate-900">
								{item.empresaNome || item.empresa_nome || item.nome || "Empresa"}
							</p>
							<p className="text-xs font-semibold text-slate-500">
								{item.status || "pendente"} · {formatNotificationDate(item.submittedAt || item.createdAt || item.criado_em)}
							</p>
						</NavLink>
					)}
				/>
				<DashboardList
					title="Últimas requisições"
					icon={ClipboardList}
					items={dashboard.ultimasRequisicoes}
					emptyText="Nenhuma requisição recente."
					tone="orange"
					renderItem={(item) => (
						<NavLink to={ROUTES.INSUMOS_REQUISICOES} className="block">
							<p className="line-clamp-1 text-sm font-black text-slate-900">
								{item.protocolo || "Requisição"} -{" "}
								{formatInsumosRequestTitle(item)}
							</p>
							<p className="text-xs font-semibold text-slate-500">
								{formatInsumosRequestSubtitle(item)}
							</p>
						</NavLink>
					)}
				/>
				<DashboardList
					title="Itens próximos de acabar"
					icon={PackagePlus}
					items={dashboard.itensBaixoEstoque}
					emptyText="Estoque dentro do mínimo configurado."
					tone="violet"
					renderItem={(item) => (
						<NavLink to={ROUTES.INSUMOS_ADMINISTRATIVOS} className="block">
							<p className="line-clamp-1 text-sm font-black text-slate-900">
								{item.nome || "Produto"}
							</p>
							<p className="text-xs font-semibold text-slate-500">
								Atual {item.estoque_atual || 0} · mínimo {item.estoque_minimo ?? item.estoque_ideal ?? 0}
							</p>
						</NavLink>
					)}
				/>
				<DashboardList
					title="Imóveis com vencimento próximo"
					icon={Home}
					items={dashboard.imoveisVencendo}
					emptyText="Nenhum vencimento de imóvel próximo."
					tone="orange"
					renderItem={(item) => (
						<NavLink to={ROUTES.IMOVEIS_ADMINISTRATIVOS_RELATORIOS} className="block">
							<p className="line-clamp-1 text-sm font-black text-slate-900">
								{item.nome || item.imovelId || item.seniorId || "Imóvel"}
							</p>
							<p className="text-xs font-semibold text-slate-500">
								{dashboardDateFormatter.format(toDateValue(item.vencimento || item.vencimentoAluguel || item.data) || new Date())}
							</p>
						</NavLink>
					)}
				/>
				<DashboardList
					title="Últimos imóveis cadastrados"
					icon={Building2}
					items={dashboard.ultimosImoveis}
					emptyText="Nenhum imóvel cadastrado."
					tone="emerald"
					renderItem={(item) => (
						<NavLink to={item.id ? `/imoveis/${item.id}` : ROUTES.IMOVEIS_ADMINISTRATIVOS} className="block">
							<p className="line-clamp-1 text-sm font-black text-slate-900">
								{item.nome || item.endereco || "Imóvel"}
							</p>
							<p className="text-xs font-semibold text-slate-500">
								{item.cidade || item.regional || item.status || "Cadastro administrativo"}
							</p>
						</NavLink>
					)}
				/>
				<DashboardList
					title="Documentos próximos de vencer"
					icon={AlertTriangle}
					items={dashboard.documentosVencendo}
					emptyText="Nenhum vencimento próximo."
					tone="red"
					renderItem={(item) => (
						<NavLink to={ROUTES.DOCUMENTOS_HISTORICO} className="block">
							<p className="line-clamp-1 text-sm font-black text-slate-900">
								{item.title} - {item.count} documento(s)
							</p>
							<p className="text-xs font-semibold text-red-700">
								Próximo vencimento {dashboardDateFormatter.format(toDateValue(item.nearestDate) || new Date())}
							</p>
						</NavLink>
					)}
				/>
			</section>

			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{DASHBOARD_CARDS.map((card) => {
					const Icon = card.icon;
					return (
						<NavLink
							key={card.path}
							to={card.path}
							className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
						>
							<div
								className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border ${toneClasses[card.tone]}`}
							>
								<Icon size={22} />
							</div>
							<h3 className="text-lg font-black text-slate-950">
								{card.label}
							</h3>
							<p className="mt-2 text-sm font-semibold leading-5 text-slate-500">
								{card.description}
							</p>
							<span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-blue-600">
								Abrir módulo <ChevronRight size={16} />
							</span>
						</NavLink>
					);
				})}
			</section>
			{agendaOpen ? (
				<DashboardAgendaModal
					form={agendaForm}
					setForm={setAgendaForm}
					saving={savingAgenda}
					onClose={() => setAgendaOpen(false)}
					onSave={saveAgenda}
				/>
			) : null}
		</div>
	);
}

function AuthenticatedRoutes() {
	return (
		<AuthProvider>
			<Outlet />
		</AuthProvider>
	);
}

function RequireAuth({ children, permission }) {
	const { currentUser, loading } = useAuthContext();
	if (loading) return <Spinner fullScreen />;
	if (!currentUser) return <Navigate to={ROUTES.LOGIN} replace />;
	if (permission && !hasAnyPermission(currentUser, permission)) {
		return <Navigate to={ROUTES.ACCESS_DENIED} replace />;
	}
	return children;
}

function FacilitiesSectionRoute() {
	const { section } = useParams();
	const permission =
		FACILITIES_SECTION_PERMISSIONS[section] || FACILITIES_PERMISSION;
	return (
		<RequireAuth permission={permission}>
			<FacilitiesDomainPage />
		</RequireAuth>
	);
}

function Sidebar({ onNavigate, collapsed = false, onToggleCollapsed }) {
	const { currentUser } = useAuthContext();
	const location = useLocation();
	const [menuSearch, setMenuSearch] = useState("");
	const visibleGroups = useMemo(
		() =>
			NAV_GROUPS.map((group) => ({
				...group,
				items: group.items.filter((item) =>
					hasAnyPermission(currentUser, item.permission),
				),
			})).filter((group) => group.items.length),
		[currentUser],
	);
	const dashboardVisible = hasAnyPermission(currentUser, DASHBOARD_NAV_ITEM.permission);
	const searchableItems = useMemo(
		() => [
			...(dashboardVisible ? [DASHBOARD_NAV_ITEM] : []),
			...visibleGroups.flatMap((group) =>
				group.items.map((item) => ({ ...item, groupTitle: group.title })),
			),
		],
		[dashboardVisible, visibleGroups],
	);
	const searchResults = useMemo(() => {
		const query = normalizeSearchText(menuSearch);
		if (query.length < 2) return [];
		return searchableItems
			.filter((item) =>
				normalizeSearchText(`${item.label} ${item.path} ${item.groupTitle || ""}`).includes(query),
			)
			.slice(0, 8);
	}, [menuSearch, searchableItems]);
	const activeGroup = visibleGroups.find((group) =>
		group.items.some((item) => isAdmItemActive(item, location.pathname)),
	);
	const [openGroupTitle, setOpenGroupTitle] = useState(activeGroup?.title || null);

	useEffect(() => {
		if (!activeGroup?.title) return;
		// Sincronização intencional com a rota ativa — abre o grupo do menu
		// correspondente sempre que a navegação muda.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setOpenGroupTitle(activeGroup.title);
	}, [activeGroup?.title]);

	return (
		<aside
			className={`flex h-full flex-col border-r border-slate-950 bg-[linear-gradient(180deg,#061b38_0%,#06294d_54%,#04162c_100%)] text-white shadow-sidebar transition-[width] duration-200 ${collapsed ? "w-16" : "w-72"}`}
		>
			<div className={`${collapsed ? "px-3" : "px-4"} border-b border-white/10 py-4`}>
				<div className={collapsed ? "flex flex-col items-center gap-3" : ""}>
					<img
						src="/adm-menu-hero.webp"
						alt="Administrativo"
						className={`${collapsed ? "w-10" : "w-16"} mx-auto h-auto max-w-full rounded-2xl object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.32)]`}
					/>
					<p className={`${collapsed ? "sr-only" : "mt-3"} text-center text-xs font-semibold uppercase text-slate-300`}>
						Administrativo | Cluster MG
					</p>
				</div>
				<button
					type="button"
					onClick={onToggleCollapsed}
					className="mx-auto mt-2 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15"
					title={collapsed ? "Expandir menu" : "Ocultar menu"}
					aria-label={collapsed ? "Expandir menu" : "Ocultar menu"}
				>
					{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
				</button>
			</div>
			<nav className="flex-1 space-y-1.5 overflow-y-auto px-2.5 py-3">
				{!collapsed ? (
					<div className="relative mb-3">
						<div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-slate-200">
							<Search size={15} className="shrink-0" />
							<input
								value={menuSearch}
								onChange={(event) => setMenuSearch(event.target.value)}
								placeholder="Buscar no sistema..."
								className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white placeholder:text-slate-400 focus:outline-none"
							/>
						</div>
						{searchResults.length ? (
							<div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#071f3e] shadow-2xl">
								{searchResults.map((item) => (
									<AdmLeafItem
										key={item.path}
										item={item}
										onNavigate={() => {
											setMenuSearch("");
											onNavigate?.();
										}}
									/>
								))}
							</div>
						) : null}
					</div>
				) : null}
				{dashboardVisible ? (
					<AdmLeafItem
						item={DASHBOARD_NAV_ITEM}
						onNavigate={onNavigate}
						collapsed={collapsed}
						featured
					/>
				) : null}
				{visibleGroups.map((group) => (
					<div key={group.title} className={group.title === "Administração" ? "border-t border-white/10 pt-3" : ""}>
					<AdmNavGroup
						group={group}
						collapsed={collapsed}
						open={!collapsed && openGroupTitle === group.title}
						active={group.items.some((item) => isAdmItemActive(item, location.pathname))}
						onToggle={() =>
							setOpenGroupTitle((current) =>
								current === group.title ? null : group.title,
							)
						}
						onNavigate={onNavigate}
					/>
					</div>
				))}
			</nav>
		</aside>
	);
}

function AdmNavGroup({ group, collapsed, open, active, onToggle, onNavigate }) {
	const GroupIcon = group.icon || Files;
	return (
		<div className="pt-1">
			<button
				type="button"
				onClick={onToggle}
				className={`group flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
					active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
				}`}
				title={group.title}
				aria-expanded={open}
			>
				<span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${active ? "bg-blue-500/20 text-blue-100" : "bg-white/5 text-slate-300 group-hover:text-white"}`}>
					<GroupIcon size={18} />
				</span>
				<span className={collapsed ? "sr-only" : "flex-1 truncate text-sm font-black tracking-tight"}>
					{group.title}
				</span>
				{!collapsed ? (
					<ChevronDown size={16} className={`ml-auto shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
				) : null}
			</button>
			<div
				className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out ${
					open ? "pointer-events-auto grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0"
				}`}
			>
				<div className="min-h-0">
					<div className="ml-4 mt-1 space-y-1 border-l border-white/10 py-1 pl-3">
						{group.items.map((item) => (
							<AdmLeafItem
								key={item.path}
								item={item}
								onNavigate={onNavigate}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function AdmLeafItem({ item, onNavigate, collapsed = false, featured = false }) {
	const Icon = item.icon;
	return (
		<NavLink
			to={item.path}
			onClick={onNavigate}
			className={({ isActive }) =>
				`flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
					isActive
						? "bg-blue-600 text-white shadow-lg shadow-blue-950/10"
						: featured
							? "bg-white/8 text-slate-100 hover:bg-white/12"
							: "text-slate-300 hover:bg-white/10 hover:text-white"
				}`
			}
			title={item.label}
		>
			<Icon size={16} className="shrink-0" />
			<span className={collapsed ? "sr-only" : "truncate font-medium"}>{item.label}</span>
			{collapsed ? null : <ChevronRight size={14} className="ml-auto shrink-0 opacity-50" />}
		</NavLink>
	);
}

function normalizeSearchText(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function isAdmItemActive(item, currentPath) {
	if (!item?.path) return false;
	return currentPath === item.path || currentPath.startsWith(`${item.path}/`);
}

function formatTopbarDate(date = new Date()) {
	return date.toLocaleDateString("pt-BR", {
		weekday: "long",
		day: "2-digit",
		month: "long",
		year: "numeric",
	});
}

function formatNotificationDate(value) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function AdmTopbar({ onOpenMobileMenu }) {
	const { currentUser, refreshUser, signOut } = useAuthContext();
	const avatarInputRef = useRef(null);
	const [accountOpen, setAccountOpen] = useState(false);
	const [notificationsOpen, setNotificationsOpen] = useState(false);
	const [passwordOpen, setPasswordOpen] = useState(false);
	const [notifications, setNotifications] = useState([]);
	const [unreadCount, setUnreadCount] = useState(0);
	const [avatarError, setAvatarError] = useState("");
	const [avatarSaving, setAvatarSaving] = useState(false);
	const displayName = currentUser?.nome || currentUser?.name || currentUser?.email || "Usuário";
	const firstName = String(displayName).split(/\s+/)[0] || "Usuário";
	const avatarSrc = currentUser?.avatarUrl || currentUser?.avatar_url || currentUser?.avatarDataUrl || currentUser?.avatar_data_url || "";

	const loadNotifications = useCallback(async () => {
		try {
			const [list, counters] = await Promise.all([
				listarNotificacoesInternas({ limit: 8 }),
				obterContadoresNotificacoes(),
			]);
			setNotifications(list?.items || []);
			setUnreadCount(Number(list?.unreadCount ?? counters?.unreadCount ?? counters?.unread ?? 0));
		} catch {
			setNotifications([]);
			setUnreadCount(0);
		}
	}, []);

	useEffect(() => {
		loadNotifications();
		const interval = window.setInterval(loadNotifications, 30000);
		return () => window.clearInterval(interval);
	}, [loadNotifications]);

	const handleAvatarUpload = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setAvatarSaving(true);
		setAvatarError("");
		try {
			validateImageFile(file);
			await atualizarAvatarPerfil(file);
			await refreshUser?.();
		} catch (error) {
			setAvatarError(error?.message || "Não foi possível salvar o avatar.");
		} finally {
			setAvatarSaving(false);
		}
	};

	const markAllRead = async () => {
		await marcarNotificacoesLidas({ all: true }).catch(() => null);
		await loadNotifications();
	};

	return (
		<header className="relative z-[180] flex min-h-20 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-8">
			<div className="flex min-w-0 items-center gap-3">
				<button
					type="button"
					onClick={onOpenMobileMenu}
					className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 lg:hidden"
					aria-label="Abrir menu"
				>
					<Menu size={20} />
				</button>
				<div className="min-w-0">
					<p className="text-base font-semibold text-slate-900">
						Olá, {firstName}
					</p>
					<p className="text-sm font-medium text-slate-500">
						{formatTopbarDate()}
					</p>
				</div>
			</div>

			<div className="flex items-center gap-3">
				<div className="relative">
					<button
						type="button"
						onClick={() => {
							setNotificationsOpen((current) => !current);
							setAccountOpen(false);
						}}
						className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
						title="Alertas"
						aria-label="Alertas"
					>
						<Bell size={19} />
						{unreadCount > 0 ? (
							<span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-black text-white">
								{unreadCount > 9 ? "9+" : unreadCount}
							</span>
						) : null}
					</button>
					{notificationsOpen ? (
						<div className="absolute right-0 top-14 z-[210] w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
							<div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
								<p className="text-sm font-black text-slate-950">Alertas</p>
								<button type="button" onClick={markAllRead} className="text-xs font-black text-blue-600">
									Marcar lidas
								</button>
							</div>
							<div className="max-h-80 overflow-y-auto p-2">
								{notifications.length ? notifications.map((item) => (
									<div key={item.id || item.createdAt} className="rounded-xl px-3 py-2 hover:bg-slate-50">
										<p className="text-sm font-black text-slate-900">{item.title || item.titulo || "Novo alerta"}</p>
										<p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{item.message || item.mensagem || item.description || "Há uma nova atualização no sistema."}</p>
										<p className="mt-1 text-[11px] font-bold text-slate-400">{formatNotificationDate(item.createdAt || item.created_at)}</p>
									</div>
								)) : (
									<p className="px-3 py-6 text-center text-sm font-semibold text-slate-500">
										Nenhum alerta no momento.
									</p>
								)}
							</div>
						</div>
					) : null}
				</div>

				<div className="hidden min-w-0 text-right sm:block">
					<p className="truncate text-sm font-black uppercase text-slate-900">
						{displayName}
					</p>
					<p className="truncate text-xs font-bold text-slate-500">
						{currentUser?.roleName || currentUser?.role || "Usuário"}
					</p>
				</div>
				<div className="relative">
					<button
						type="button"
						onClick={() => {
							setAccountOpen((current) => !current);
							setNotificationsOpen(false);
						}}
						className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-blue-100 bg-blue-50 text-sm font-black text-blue-700 shadow-sm"
						title="Minha conta"
						aria-label="Minha conta"
					>
						<UserAvatar
							src={avatarSrc}
							name={displayName}
							email={currentUser?.email}
							className="flex h-full w-full items-center justify-center"
							initialsClassName="text-sm font-black"
						/>
					</button>
					{accountOpen ? (
						<div className="absolute right-0 top-14 z-[210] w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
							<div className="border-b border-slate-100 p-4">
								<p className="truncate text-sm font-black text-slate-950">{displayName}</p>
								<p className="truncate text-xs font-semibold text-slate-500">{currentUser?.email}</p>
								{avatarError ? <p className="mt-2 text-xs font-bold text-red-600">{avatarError}</p> : null}
							</div>
							<div className="p-2">
								<button
									type="button"
									onClick={() => avatarInputRef.current?.click()}
									disabled={avatarSaving}
									className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
								>
									<Camera size={16} /> {avatarSaving ? "Enviando..." : "Trocar avatar"}
								</button>
								<button
									type="button"
									onClick={() => {
										setPasswordOpen(true);
										setAccountOpen(false);
									}}
									className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
								>
									<KeyRound size={16} /> Trocar senha
								</button>
								<button
									type="button"
									onClick={signOut}
									className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
								>
									<LogOut size={16} /> Sair
								</button>
							</div>
						</div>
					) : null}
					<input
						ref={avatarInputRef}
						type="file"
						accept={AVATAR_ACCEPT}
						className="hidden"
						onChange={handleAvatarUpload}
					/>
				</div>
			</div>
			{passwordOpen ? (
				<TrocarSenhaModal
					obrigatorio={false}
					onClose={() => setPasswordOpen(false)}
				/>
			) : null}
		</header>
	);
}

function AdmLayout() {
	const location = useLocation();
	const [mobileOpen, setMobileOpen] = useState(false);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
		if (typeof window === "undefined") return false;
		return window.localStorage.getItem(ADM_SIDEBAR_COLLAPSED_KEY) === "1";
	});
	const title = TITLES[location.pathname] || "Administrativo";
	const toggleSidebarCollapsed = () => {
		setSidebarCollapsed((current) => {
			const next = !current;
			if (typeof window !== "undefined") {
				window.localStorage.setItem(ADM_SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
			}
			return next;
		});
	};

	return (
		<div className="flex min-h-dvh overflow-x-hidden bg-slate-100 lg:h-dvh lg:overflow-hidden">
			<div
				className={`hidden h-full shrink-0 transition-[width] duration-200 lg:block ${sidebarCollapsed ? "w-16" : "w-72"}`}
			>
				<Sidebar
					collapsed={sidebarCollapsed}
					onToggleCollapsed={toggleSidebarCollapsed}
				/>
			</div>
			{mobileOpen ? (
				<div className="fixed inset-0 z-layout-sidebar lg:hidden">
					<button
						type="button"
						className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
						aria-label="Fechar menu"
						onClick={() => setMobileOpen(false)}
					/>
					<div className="absolute inset-y-0 left-0 w-[min(86vw,320px)] max-w-full shadow-2xl">
						<Sidebar
							onNavigate={() => setMobileOpen(false)}
							onToggleCollapsed={() => {}}
						/>
					</div>
					<button
						type="button"
						onClick={() => setMobileOpen(false)}
						className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/15 text-white shadow-lg backdrop-blur"
						aria-label="Fechar menu"
					>
						<X size={20} />
					</button>
				</div>
			) : null}
			<div className="flex min-h-dvh min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
				<AdmTopbar title={title} onOpenMobileMenu={() => setMobileOpen(true)} />
				<main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(255,107,0,0.08),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] p-3 sm:p-4 lg:p-6">
					<Outlet />
				</main>
			</div>
		</div>
	);
}

function LegacyAdmRedirect({ to }) {
	const params = useParams();
	const search = typeof window !== "undefined" ? window.location.search || "" : "";
	const target = Object.entries(params).reduce(
		(path, [key, value]) =>
			path.replace(`:${key}`, encodeURIComponent(value || "")),
		to,
	);
	return <Navigate to={`${target}${search}`} replace />;
}

function AppRoutes() {
	return (
		<Suspense fallback={<Spinner fullScreen />}>
			<Routes>
				<Route
					path={ROUTES.TERCEIRIZADOS_LOGIN}
					element={
						<AuthProvider>
							<TerceirizadosDocumentosPage />
						</AuthProvider>
					}
				/>
				<Route path={ROUTES.TOTEM_INSUMOS} element={<TotemInsumosPage />} />
				<Route path="/q/:token" element={<FacilitiesAssetQrPage />} />
				<Route path="/avaliacao-fornecedor" element={<SupplierEvaluationPublicPage />} />
				<Route element={<AuthenticatedRoutes />}>
					<Route path={ROUTES.LOGIN} element={<LoginForm />} />
					<Route
						path={ROUTES.FORGOT_PASSWORD}
						element={<ForgotPasswordPage />}
					/>
					<Route path={ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />
					<Route path={ROUTES.ACCESS_DENIED} element={<AccessDenied />} />
					<Route
						path="/administrativo/imoveis"
						element={<LegacyAdmRedirect to={ROUTES.IMOVEIS_ADMINISTRATIVOS} />}
					/>
					<Route
						path="/administrativo/imoveis/:id"
						element={<LegacyAdmRedirect to="/imoveis/:id" />}
					/>
					<Route
						path="/administrativo/imoveis/contratos"
						element={
							<LegacyAdmRedirect
								to={ROUTES.IMOVEIS_ADMINISTRATIVOS_CONTRATOS}
							/>
						}
					/>
					<Route
						path="/administrativo/imoveis/historico"
						element={
							<LegacyAdmRedirect
								to={ROUTES.IMOVEIS_ADMINISTRATIVOS_HISTORICO}
							/>
						}
					/>
					<Route
						path="/administrativo/imoveis/relatorios"
						element={
							<LegacyAdmRedirect
								to={ROUTES.IMOVEIS_ADMINISTRATIVOS_RELATORIOS}
							/>
						}
					/>
					<Route
						path="/administrativo/insumos"
						element={<LegacyAdmRedirect to={ROUTES.INSUMOS_ADMINISTRATIVOS} />}
					/>
					<Route
						path="/administrativo/insumos/requisicoes"
						element={<LegacyAdmRedirect to={ROUTES.INSUMOS_REQUISICOES} />}
					/>
					<Route
						path="/"
						element={
							<RequireAuth>
								<AdmLayout />
							</RequireAuth>
						}
					>
						<Route index element={<AdministrativoDashboard />} />
						<Route
							path="empresas"
							element={
								<RequireAuth permission={EMPRESAS_PERMISSION}>
									<Empresas />
								</RequireAuth>
							}
						/>
						<Route
							path="empresas/:slug"
							element={
								<RequireAuth permission={EMPRESAS_PERMISSION}>
									<Empresas />
								</RequireAuth>
							}
						/>
						<Route
							path="documentos"
							element={
								<RequireAuth permission={DOCUMENTOS_PERMISSION}>
									<Documentos status="pendente" />
								</RequireAuth>
							}
						/>
						<Route
							path="documentos/tratativas"
							element={
								<RequireAuth
									permission={[
										"view_documentos_tratativas",
										"administrativo.documentos.view",
										"administrativo.documentos.manage",
									]}
								>
									<DocumentosTratativas />
								</RequireAuth>
							}
						/>
						<Route
							path="documentos/historico"
							element={
								<RequireAuth permission={DOCUMENTOS_PERMISSION}>
									<Documentos status="historico" />
								</RequireAuth>
							}
						/>
						<Route
							path="documentos/aprovados"
							element={
								<RequireAuth permission={DOCUMENTOS_PERMISSION}>
									<Documentos status="aprovado" />
								</RequireAuth>
							}
						/>
						<Route
							path="documentos/notas-fiscais"
							element={
								<RequireAuth permission={DOCUMENTOS_PERMISSION}>
									<Documentos status="notas_fiscais" />
								</RequireAuth>
							}
						/>
						<Route
							path="documentos/tecnicos-terceirizados"
							element={
								<RequireAuth permission={EMPRESAS_PERMISSION}>
									<Empresas />
								</RequireAuth>
							}
						/>
						<Route
							path="documentos/configuracao"
							element={
								<RequireAuth
									permission={["manage_documentos", "administrativo.documentos.manage"]}
								>
									<DocumentosConfig />
								</RequireAuth>
							}
						/>
						<Route
							path="documentos/relatorios"
							element={
								<RequireAuth
									permission={[
										"view_documentos_relatorios",
										"administrativo.relatorios.view",
									]}
								>
									<DocumentosRelatorios />
								</RequireAuth>
							}
						/>
						<Route
							path="imoveis"
							element={
								<RequireAuth permission={IMOVEIS_PERMISSION}>
									<ImoveisAdministrativos page="dashboard" />
								</RequireAuth>
							}
						/>
						<Route
							path="imoveis/contratos"
							element={
								<RequireAuth permission={IMOVEIS_PERMISSION}>
									<ImoveisAdministrativos page="contratos" />
								</RequireAuth>
							}
						/>
						<Route
							path="imoveis/historico"
							element={
								<RequireAuth permission={IMOVEIS_PERMISSION}>
									<ImoveisAdministrativos page="historico" />
								</RequireAuth>
							}
						/>
						<Route
							path="imoveis/relatorios"
							element={
								<RequireAuth permission={IMOVEIS_PERMISSION}>
									<ImoveisAdministrativos page="relatorios" />
								</RequireAuth>
							}
						/>
						<Route
							path="imoveis/:id"
							element={
								<RequireAuth permission={IMOVEIS_PERMISSION}>
									<ImoveisAdministrativos page="detalhe" />
								</RequireAuth>
							}
						/>
						<Route
							path="facilities"
							element={
								<RequireAuth permission={FACILITIES_PERMISSION}>
									<FacilitiesDashboardPage />
								</RequireAuth>
							}
						/>
						<Route
							path="facilities/imoveis"
							element={
								<RequireAuth permission={FACILITIES_IMOVEIS_PERMISSION}>
									<ImoveisAdministrativos
										page="dashboard"
										basePath={ROUTES.FACILITIES_IMOVEIS}
										context="facilities"
									/>
								</RequireAuth>
							}
						/>
						<Route
							path="facilities/imoveis/novo"
							element={
								<RequireAuth permission={FACILITIES_IMOVEIS_MANAGE_PERMISSION}>
									<ImoveisAdministrativos
										page="cadastro"
										basePath={ROUTES.FACILITIES_IMOVEIS}
										context="facilities"
									/>
								</RequireAuth>
							}
						/>
						<Route
							path="facilities/imoveis/importar"
							element={
								<RequireAuth permission={FACILITIES_IMOVEIS_MANAGE_PERMISSION}>
									<ImoveisAdministrativos
										page="dashboard"
										basePath={ROUTES.FACILITIES_IMOVEIS}
										context="facilities"
										initialAction="importar"
									/>
								</RequireAuth>
							}
						/>
						<Route
							path="facilities/imoveis/configuracoes"
							element={
								<RequireAuth permission={FACILITIES_IMOVEIS_MANAGE_PERMISSION}>
									<ImoveisAdministrativos
										page="dashboard"
										basePath={ROUTES.FACILITIES_IMOVEIS}
										context="facilities"
										initialAction="configuracoes"
									/>
								</RequireAuth>
							}
						/>
						<Route
							path="facilities/imoveis/:id/editar"
							element={
								<RequireAuth permission={FACILITIES_IMOVEIS_MANAGE_PERMISSION}>
									<ImoveisAdministrativos
										page="cadastro"
										basePath={ROUTES.FACILITIES_IMOVEIS}
										context="facilities"
									/>
								</RequireAuth>
							}
						/>
						<Route
							path="facilities/imoveis/:id"
							element={
								<RequireAuth permission={FACILITIES_IMOVEIS_PERMISSION}>
									<ImoveisAdministrativos
										page="detalhe"
										basePath={ROUTES.FACILITIES_IMOVEIS}
										context="facilities"
									/>
								</RequireAuth>
							}
						/>
						<Route
							path="facilities/imoveis-espacos"
							element={<LegacyAdmRedirect to={ROUTES.FACILITIES_IMOVEIS} />}
						/>
						<Route
							path="facilities/inventarios/*"
							element={
								<RequireAuth permission={FACILITIES_INVENTARIOS_PERMISSION}>
									<FacilitiesDomainPage />
								</RequireAuth>
							}
						/>
						<Route
							path="facilities/:section"
							element={<FacilitiesSectionRoute />}
						/>
						<Route
							path="insumos"
							element={
								<RequireAuth permission={INSUMOS_MANAGE_PERMISSION}>
									<InsumosAdministrativos />
								</RequireAuth>
							}
						/>
						<Route
							path="insumos/requisicoes"
							element={
								<RequireAuth permission={INSUMOS_REQUISICOES_PERMISSION}>
									<InsumosRequisicoes />
								</RequireAuth>
							}
						/>
						<Route
							path="configuracoes/geral"
							element={
								<RequireAuth permission={GENERAL_SETTINGS_PERMISSION}>
									<ConfiguracoesGeraisPage />
								</RequireAuth>
							}
						/>
						<Route
							path="configuracoes/notificacoes"
							element={
								<RequireAuth permission={GENERAL_SETTINGS_PERMISSION}>
									<ConfiguracoesGeraisPage />
								</RequireAuth>
							}
						/>
						<Route
							path="usuarios"
							element={
								<RequireAuth permission={USERS_PERMISSION}>
									<UsuariosPage />
								</RequireAuth>
							}
						/>
						<Route
							path="configuracoes/cargos"
							element={
								<RequireAuth permission={ROLES_PERMISSION}>
									<CargosPermissoesPage />
								</RequireAuth>
							}
						/>
						<Route
							path="configuracoes/email"
							element={
								<RequireAuth permission={EMAIL_SETTINGS_PERMISSION}>
									<EmailSettingsPage />
								</RequireAuth>
							}
						/>
						<Route
							path="integracoes"
							element={
								<RequireAuth permission={INTEGRATIONS_PERMISSION}>
									<IntegracoesPage />
								</RequireAuth>
							}
						/>
						<Route
							path="configuracoes/apis"
							element={
								<RequireAuth permission={INTEGRATIONS_PERMISSION}>
									<ApiStatusPage />
								</RequireAuth>
							}
						/>
						<Route
							path="configuracoes/hubsoft"
							element={
								<RequireAuth permission={INTEGRATIONS_PERMISSION}>
									<HubsoftSettingsPage />
								</RequireAuth>
							}
						/>
						<Route
							path="configuracoes/cvortex"
							element={
								<RequireAuth permission={INTEGRATIONS_PERMISSION}>
									<CvortexSettingsPage />
								</RequireAuth>
							}
						/>
						<Route
							path="configuracoes/senior"
							element={
								<RequireAuth permission={INTEGRATIONS_PERMISSION}>
									<SeniorSettingsPage />
								</RequireAuth>
							}
						/>
						<Route
							path="configuracoes/banco-de-dados"
							element={
								<RequireAuth permission={INTEGRATIONS_PERMISSION}>
									<DatabaseBackupsPage />
								</RequireAuth>
							}
						/>
						<Route
							path="logs"
							element={
								<RequireAuth permission={INTEGRATIONS_PERMISSION}>
									<AuditoriaLogsPage />
								</RequireAuth>
							}
						/>
					</Route>
				</Route>
				<Route path="*" element={<ErrorPage code="404" />} />
			</Routes>
		</Suspense>
	);
}

export default function AppRouter() {
	return (
		<ThemeProvider>
			<LayoutModeProvider>
				<SystemProvider>
					<BrowserRouter>
						<AppRoutes />
					</BrowserRouter>
				</SystemProvider>
			</LayoutModeProvider>
		</ThemeProvider>
	);
}
