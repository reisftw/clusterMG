import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";
import { useLayoutMode } from "../../context/LayoutModeContext";
import TrocarSenhaModal from "../../modules/auth/components/TrocarSenhaModal";
import WelcomeModal from "../../modules/auth/components/WelcomeModal";
import { obterStatusAutenticador } from "../../modules/auth/services/authService";
import {
	hasSeenWelcomeModal,
	WELCOME_MODAL_EVENT,
} from "../../modules/auth/utils/welcomeModalStorage";
import { ROUTES } from "../../router/routes";
import AuthenticatorModal from "./AuthenticatorModal";
import MelzFooter from "./MelzFooter";
import {
	MobileBottomNav,
	MobileHeader,
	MobileMoreSheet,
	MobilePageContainer,
} from "./MobileNavigation";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const PAGE_TITLES = {
	[ROUTES.DASHBOARD]: "Dashboard",
	[ROUTES.ACERTO_ESTOQUE]: "Acerto de Estoque",
	[ROUTES.ESTOQUE_INTEGRADO]: "Estoque",
	[ROUTES.ESTOQUE_EQUIPAMENTOS]: "Equipamentos",
	[ROUTES.ESTOQUE_ONNET]: "Estoque Onnet",
	[ROUTES.ESTOQUE_BOLSA_TECNICO]: "Bolsa Técnico",
	[ROUTES.TECNICOS_AUDITORIA_BOLSA]: "Auditoria de Bolsa Técnico",
	[ROUTES.TECNICOS_AUDITORIA_RELATORIOS]: "Relatórios de Bolsa Técnico",
	[ROUTES.ESTOQUE_CONSULTA]: "Consulta de Estoque",
	[ROUTES.MAPA]: "Mapa O.S",
	[ROUTES.MAPA_HISTORICO]: "Histórico do Mapa",
	[ROUTES.COLABORADORES]: "Colaboradores",
	[ROUTES.FERIAS]: "Gestão de Férias",
	[ROUTES.EQUIPAMENTOS]: "Equipamentos",
	[ROUTES.FERRAMENTAS]: "Ferramentas",
	[ROUTES.REGIONAIS]: "Regionais",
	[ROUTES.AGENTES]: "Agentes Autorizados",
	[ROUTES.AGENDA]: "Agenda",
	[ROUTES.AGENDAMENTOS]: "Central de Agendamentos",
	[ROUTES.ENTREGAS_TECNICOS]: "Entrega",
	[ROUTES.LOGISTICA]: "Logística",
	[ROUTES.VISITAS]: "Central de Visitas",
	[ROUTES.GESTAO_DUVIDAS]: "Gestão de Dúvidas",
	[ROUTES.RETIRADAS]: "Retiradas",
	[ROUTES.INTEGRACOES]: "Central de Integrações",
	[ROUTES.MENSAGERIA]: "Mensageria",
	[ROUTES.MENSAGERIA_API]: "API da Mensageria",
	[ROUTES.MENSAGERIA_FILA]: "Fila da Mensageria",
	[ROUTES.MENSAGERIA_ENVIADOS]: "Enviados da Mensageria",
	[ROUTES.MENSAGERIA_RELATORIOS]: "Relatórios da Mensageria",
	[ROUTES.MENSAGERIA_CONFIRMACAO_AGENDAMENTOS]: "Confirmação de Agendamentos",
	[ROUTES.MENSAGERIA_BACKLOG]: "Backlog da Mensageria",
	[ROUTES.MENSAGERIA_CALLBACK]: "Callback da Mensageria",
	[ROUTES.EVIDENCIAS]: "Evidências",
	[ROUTES.API_STATUS]: "APIs",
	[ROUTES.HUBSOFT_SETTINGS]: "Hubsoft",
	[ROUTES.CVORTEX_SETTINGS]: "Cvortex",
	[ROUTES.SENIOR_SETTINGS]: "Senior / Sapiens",
	[ROUTES.DATABASE_BACKUPS]: "Banco de Dados",
	[ROUTES.EMAIL_SETTINGS]: "E-mail do Sistema",
	[ROUTES.MERCADO_SETTINGS]: "Mercado",
	[ROUTES.AUDITORIA_LOGS]: "Logs de Auditoria",
	[ROUTES.EMPRESAS_TECNICOS]: "Empresas",
	[ROUTES.METAS]: "Metas",
	[ROUTES.RANKING]: "Ranking",
	[ROUTES.NOTIFICACOES]: "Notificações",
	[ROUTES.RELATORIOS]: "Central de Relatorios",
	[ROUTES.FERIADOS]: "Feriados e Calendario",
	[ROUTES.USUARIOS]: "Usuários",
	[ROUTES.REGRAS]: "Regras",
};

const SIDEBAR_COLLAPSED_KEY = "retiradas-sidebar-collapsed";

const PageWrapper = ({ children }) => {
	const { pathname } = useLocation();
	const title = PAGE_TITLES[pathname] ?? "Gestão Retiradas";
	const { currentUser, trocarSenhaObrigatorio } = useAuthContext();
	const { isModernLayout } = useLayoutMode();
	const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
	const [authenticatorRequiredOpen, setAuthenticatorRequiredOpen] =
		useState(false);
	const [forcedWelcomeOpen, setForcedWelcomeOpen] = useState(false);
	const [welcomeClosedForUser, setWelcomeClosedForUser] = useState("");
	const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
		try {
			return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
		} catch {
			return false;
		}
	});

	useEffect(() => {
		try {
			window.localStorage.setItem(
				SIDEBAR_COLLAPSED_KEY,
				String(sidebarCollapsed),
			);
		} catch {
			// LocalStorage pode estar indisponível em modo privado/restrito.
		}
	}, [sidebarCollapsed]);

	useEffect(() => {
		const openWelcomeModal = () => setForcedWelcomeOpen(true);
		window.addEventListener(WELCOME_MODAL_EVENT, openWelcomeModal);
		return () => {
			window.removeEventListener(WELCOME_MODAL_EVENT, openWelcomeModal);
		};
	}, []);

	const content = children || <Outlet />;
	const currentWelcomeUserKey =
		currentUser?.uid || currentUser?.id || currentUser?.email || "";

	useEffect(() => {
		if (!currentUser || trocarSenhaObrigatorio) {
			Promise.resolve().then(() => setAuthenticatorRequiredOpen(false));
			return undefined;
		}
		let active = true;
		obterStatusAutenticador()
			.then((status) => {
				if (active) setAuthenticatorRequiredOpen(!status?.totpEnabled);
			})
			.catch(() => {
				if (active) setAuthenticatorRequiredOpen(false);
			});
		return () => {
			active = false;
		};
	}, [currentUser, trocarSenhaObrigatorio]);

	const showWelcomeModal =
		Boolean(currentUser) &&
		!trocarSenhaObrigatorio &&
		!authenticatorRequiredOpen &&
		(forcedWelcomeOpen ||
			(welcomeClosedForUser !== currentWelcomeUserKey &&
				!hasSeenWelcomeModal(currentUser)));

	return (
		<div
			className={
				isModernLayout
					? "flex min-h-dvh overflow-x-hidden bg-slate-100 dark:bg-slate-950 lg:h-dvh lg:overflow-hidden"
					: "flex min-h-dvh overflow-x-hidden bg-gray-50 dark:bg-slate-950 lg:h-dvh lg:overflow-hidden"
			}
		>
			<div
				className={`${sidebarCollapsed ? "w-16" : "w-60"} hidden h-full shrink-0 ${isModernLayout ? "shadow-sidebar" : "shadow-sm"} transition-[width] duration-200 lg:block`}
			>
				<Sidebar
					collapsed={sidebarCollapsed}
					onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
				/>
			</div>

			<div className="flex min-h-dvh min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
				<div className="lg:hidden">
					<MobileHeader title={title} onOpenMore={() => setMobileMoreOpen(true)} />
				</div>
				<div className="hidden lg:block">
					<Topbar title={title} />
				</div>
				<main
					className={
						isModernLayout
							? "min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(255,107,0,0.08),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] p-3 dark:bg-none dark:bg-slate-950 sm:p-4 lg:p-6"
							: "min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 dark:bg-slate-950 sm:p-4 lg:p-6"
					}
				>
					<MobilePageContainer>{content}</MobilePageContainer>
				</main>
				<MelzFooter
					className={isModernLayout ? "hidden lg:flex" : "hidden border-gray-100 bg-white lg:flex"}
				/>
			</div>
			<MobileBottomNav onOpenMore={() => setMobileMoreOpen(true)} />
			<MobileMoreSheet open={mobileMoreOpen} onClose={() => setMobileMoreOpen(false)} />

			{trocarSenhaObrigatorio && (
				<TrocarSenhaModal obrigatorio={true} onClose={() => {}} />
			)}
			<AuthenticatorModal
				open={authenticatorRequiredOpen}
				required={true}
				onClose={() => {}}
				onConfigured={() => setAuthenticatorRequiredOpen(false)}
			/>
			<WelcomeModal
				open={showWelcomeModal}
				user={currentUser}
				onClose={() => {
					setForcedWelcomeOpen(false);
					setWelcomeClosedForUser(currentWelcomeUserKey);
				}}
			/>
		</div>
	);
};

export default PageWrapper;
