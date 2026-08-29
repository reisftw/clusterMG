import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";
import { useLayoutMode } from "../../context/LayoutModeContext";
import TrocarSenhaModal from "../../modules/auth/components/TrocarSenhaModal";
import { ROUTES } from "../../router/routes";
import { verificarAcessoVpn } from "../../services/vpnAccessService";
import MelzFooter from "./MelzFooter";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const PAGE_TITLES = {
	[ROUTES.DASHBOARD]: "Dashboard",
	[ROUTES.ACERTO_ESTOQUE]: "Acerto de Estoque",
	[ROUTES.ESTOQUE_INTEGRADO]: "Estoque",
	[ROUTES.ESTOQUE_EQUIPAMENTOS]: "Equipamentos",
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
	[ROUTES.FINANCEIRO]: "Painel Financeiro",
	[ROUTES.FINANCEIRO_CONTAS_PAGAR]: "Contas a Pagar",
	[ROUTES.FINANCEIRO_CONTAS_RECEBER]: "Contas a Receber",
	[ROUTES.FINANCEIRO_FATURAMENTO]: "Faturamento",
	[ROUTES.FINANCEIRO_NOTAS]: "Notas",
	[ROUTES.FINANCEIRO_REPORTS_SERASA]: "Reports - Serasa",
	[ROUTES.FINANCEIRO_REPORTS_TARIFAS]: "Reports - Tarifas",
	[ROUTES.FINANCEIRO_REPORTS_TARIFAS_FATURAS]: "Reports - Tarifas - Faturas",
	[ROUTES.FINANCEIRO_REPORTS_TARIFAS_REC_CLIENTE]:
		"Reports - Tarifas - Receita Cliente",
	[ROUTES.FINANCEIRO_REPORTS_TARIFAS_FORMAS_PAGAMENTO]:
		"Reports - Tarifas - Formas de Pagamento",
	[ROUTES.FINANCEIRO_GESTAO_ORCAMENTO]: "Gestão Orçamento",
	[ROUTES.FINANCEIRO_ORCAMENTO_DADOS]: "Dados Orçamentários",
	[ROUTES.FINANCEIRO_ORCAMENTO_CENTROS_CUSTO]: "Centros de Custo",
	[ROUTES.FINANCEIRO_ORCAMENTO_REALIZADO]: "Orçado x Realizado",
	[ROUTES.FINANCEIRO_ORCAMENTO_APROVACOES]: "Aprovações de Orçamento",
	[ROUTES.FINANCEIRO_ORCAMENTO_CONFIGURACOES]: "Configurações de Orçamento",
	[ROUTES.FINANCEIRO_CONFIGURACOES]: "Configurações Financeiras",
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
	[ROUTES.API_STATUS]: "APIs",
	[ROUTES.HUBSOFT_SETTINGS]: "Hubsoft",
	[ROUTES.CVORTEX_SETTINGS]: "Cvortex",
	[ROUTES.SENIOR_SETTINGS]: "Senior / Sapiens",
	[ROUTES.DATABASE_BACKUPS]: "Banco de Dados",
	[ROUTES.EMAIL_SETTINGS]: "E-mail do Sistema",
	[ROUTES.VPN_SETTINGS]: "VPN",
	[ROUTES.EMPRESAS_TECNICOS]: "Empresas",
	[ROUTES.METAS]: "Metas",
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
	const { trocarSenhaObrigatorio } = useAuthContext();
	const { isModernLayout } = useLayoutMode();
	const bypassVpnCheck = pathname === ROUTES.VPN_SETTINGS;
	const [vpnCheck, setVpnCheck] = useState({
		route: "",
		blocked: false,
		ip: "",
	});
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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
		let active = true;
		if (bypassVpnCheck) return undefined;
		verificarAcessoVpn(pathname)
			.then((result) => {
				if (!active) return;
				setVpnCheck({
					route: pathname,
					blocked: Boolean(result?.protected && !result?.allowed),
					ip: result?.ip || "",
				});
			})
			.catch(() => {
				if (active) setVpnCheck({ route: pathname, blocked: false, ip: "" });
			});
		return () => {
			active = false;
		};
	}, [bypassVpnCheck, pathname]);

	const vpnCheckPending = !bypassVpnCheck && vpnCheck.route !== pathname;
	const content =
		!bypassVpnCheck && vpnCheck.blocked ? (
			<div className="mx-auto mt-10 max-w-2xl rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
				<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
					<X size={26} />
				</div>
				<h1 className="mt-5 text-2xl font-black text-slate-950">
					Acesso permitido apenas pela VPN
				</h1>
				<p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
					Esta área está protegida por faixa de IP. Conecte-se à VPN corporativa
					e atualize a página.
				</p>
				{vpnCheck.ip ? (
					<p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 font-mono text-sm font-bold text-slate-700">
						IP detectado: {vpnCheck.ip}
					</p>
				) : null}
			</div>
		) : (
			children || <Outlet />
		);

	return (
		<div
			className={
				isModernLayout
					? "flex min-h-dvh overflow-x-hidden bg-slate-100 lg:h-dvh lg:overflow-hidden"
					: "flex min-h-dvh overflow-x-hidden bg-gray-50 lg:h-dvh lg:overflow-hidden"
			}
		>
			<div
				className={
					isModernLayout
						? `${sidebarCollapsed ? "w-16" : "w-60"} hidden h-full shrink-0 shadow-sidebar transition-[width] duration-200 lg:block`
						: `${sidebarCollapsed ? "w-16" : "w-60"} hidden h-full shrink-0 shadow-sm transition-[width] duration-200 lg:block`
				}
			>
				<Sidebar
					collapsed={sidebarCollapsed}
					onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
				/>
			</div>

			{mobileSidebarOpen ? (
				<div
					className="fixed inset-0 z-layout-sidebar lg:hidden"
					role="dialog"
					aria-modal="true"
				>
					<button
						type="button"
						className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
						aria-label="Fechar menu"
						onClick={() => setMobileSidebarOpen(false)}
					/>
					<aside className="absolute inset-y-0 left-0 w-[min(86vw,320px)] max-w-full shadow-2xl">
						<Sidebar
							collapsed={false}
							onToggleCollapsed={() => setMobileSidebarOpen(false)}
							onNavigate={() => setMobileSidebarOpen(false)}
							variant="mobile"
						/>
					</aside>
					<button
						type="button"
						onClick={() => setMobileSidebarOpen(false)}
						className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/15 text-white shadow-lg backdrop-blur"
						aria-label="Fechar menu"
						title="Fechar menu"
					>
						<X size={20} />
					</button>
				</div>
			) : null}

			<div className="flex min-h-dvh min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
				<Topbar
					title={title}
					onOpenMobileMenu={() => setMobileSidebarOpen(true)}
				/>
				<main
					className={
						isModernLayout
							? "min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(255,107,0,0.08),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] p-3 sm:p-4 lg:p-6"
							: "min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6"
					}
				>
					{vpnCheckPending ? (
						<div className="py-10 text-center text-sm font-black text-slate-500">
							Verificando acesso VPN...
						</div>
					) : (
						content
					)}
				</main>
				<MelzFooter
					className={isModernLayout ? "" : "border-gray-100 bg-white"}
				/>
			</div>

			{trocarSenhaObrigatorio && (
				<TrocarSenhaModal obrigatorio={true} onClose={() => {}} />
			)}
		</div>
	);
};

export default PageWrapper;
