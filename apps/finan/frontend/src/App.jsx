import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import FinanLayout from "./components/FinanLayout";
import FinanLoginPage from "./components/FinanLoginPage";
import FinanFinanceiroPage from "./components/FinanFinanceiroPage";
import FinanModulePage from "./components/FinanModulePage";
import FinanOfficialPage from "./components/FinanOfficialPage";
import { useFinanAuth } from "./state/FinanAuthContext";
import { FINAN_ROUTES } from "./routes";

const ConfiguracoesGerais = lazy(() => import("../../../../src/modules/configuracoes/components/ConfiguracoesGeraisPage"));
const Notificacoes = lazy(() => import("../../../../src/modules/notificacoes/components/NotificacoesPage"));
const Usuarios = lazy(() => import("../../../../src/modules/auth/components/UsuariosPage"));
const CargosPermissoes = lazy(() => import("../../../../src/modules/auth/components/CargosPermissoesPage"));
const Integracoes = lazy(() => import("../../../../src/modules/integracoes/components/IntegracoesPage"));
const HubsoftSettings = lazy(() => import("../../../../src/modules/hubsoft/components/HubsoftSettingsPage"));
const CvortexSettings = lazy(() => import("../../../../src/modules/cvortex/components/CvortexSettingsPage"));
const SeniorSettings = lazy(() => import("../../../../src/modules/senior/components/SeniorSettingsPage"));
const DatabaseBackups = lazy(() => import("../../../../src/modules/databaseBackups/components/DatabaseBackupsPage"));
const EmailSettings = lazy(() => import("../../../../src/modules/emailSettings/components/EmailSettingsPage"));
const AuditoriaLogs = lazy(() => import("../../../../src/modules/auditoria/components/AuditoriaLogsPage"));

function Protected({ children }) {
	const { user, loading } = useFinanAuth();
	if (loading) return <div className="finan-loading">Carregando Finan...</div>;
	if (!user) return <Navigate to={FINAN_ROUTES.LOGIN} replace />;
	return children;
}

function Official({ children }) {
	return (
		<FinanOfficialPage>
			<Suspense fallback={<div className="finan-loading">Carregando...</div>}>
				{children}
			</Suspense>
		</FinanOfficialPage>
	);
}

function LegacyFinanceiroRedirect() {
	const legacyPathname = window.location.pathname.replace(/^\/financeiro\/?/, "/");
	const pathname = legacyPathname.replace(
		/^\/gestao-orcamento(\/|$)/,
		"/gestao-orcamentaria$1",
	);
	const search = window.location.search || "";
	return <Navigate to={`${pathname}${search}`} replace />;
}

export default function App() {
	return (
		<Routes>
			<Route path={FINAN_ROUTES.LOGIN} element={<FinanLoginPage />} />
			<Route path="/financeiro/*" element={<LegacyFinanceiroRedirect />} />
			<Route
				path="/"
				element={
					<Protected>
						<FinanLayout />
					</Protected>
				}
			>
				<Route index element={<FinanModulePage page="dashboard" />} />
				<Route
					path="reports"
					element={<Navigate to={FINAN_ROUTES.REPORTS_SERASA} replace />}
				/>
				<Route path="reports/serasa" element={<FinanFinanceiroPage page="reportsSerasa" />} />
				<Route path="reports/tarifas" element={<FinanFinanceiroPage page="reportsTarifas" />} />
				<Route path="reports/visao-geral" element={<FinanFinanceiroPage page="reportsTarifas" />} />
				<Route path="reports/faturas" element={<FinanFinanceiroPage page="reportsTarifasFaturas" />} />
				<Route path="reports/receitas" element={<FinanFinanceiroPage page="reportsTarifasRecCliente" />} />
				<Route path="reports/formas-pagamento" element={<FinanFinanceiroPage page="reportsTarifasFormasPagamento" />} />
				<Route
					path="gestao-orcamentaria"
					element={<Navigate to={FINAN_ROUTES.ORCAMENTO_VISAO_GERAL} replace />}
				/>
				<Route
					path="gestao-orcamentaria/visao-geral"
					element={<FinanFinanceiroPage page="orcamentoDashboard" />}
				/>
				<Route
					path="gestao-orcamentaria/dados"
					element={<FinanFinanceiroPage page="orcamentoDados" />}
				/>
				<Route path="gestao-orcamentaria/orcamento" element={<FinanFinanceiroPage page="orcamentoCentrosCusto" />} />
				<Route path="gestao-orcamentaria/dre" element={<FinanFinanceiroPage page="orcamentoDre" />} />
				<Route path="gestao-orcamentaria/aprovacoes" element={<FinanFinanceiroPage page="orcamentoAprovacoes" />} />
				<Route path="gestao-orcamentaria/configuracoes" element={<FinanFinanceiroPage page="orcamentoConfiguracoes" />} />
				<Route path="dados-orcamentarios" element={<Navigate to={FINAN_ROUTES.DADOS_ORCAMENTARIOS} replace />} />
				<Route path="orcamento" element={<Navigate to={FINAN_ROUTES.ORCAMENTO} replace />} />
				<Route path="dre" element={<Navigate to={FINAN_ROUTES.DRE} replace />} />
				<Route path="aprovacoes" element={<Navigate to={FINAN_ROUTES.APROVACOES} replace />} />
				<Route
					path="contas-a-pagar"
					element={<FinanFinanceiroPage page="contasPagar" />}
				/>
				<Route
					path="contas-a-receber"
					element={<FinanFinanceiroPage page="contasReceber" />}
				/>
				<Route path="faturamento" element={<FinanFinanceiroPage page="faturamento" />} />
				<Route path="notas" element={<FinanFinanceiroPage page="notas" />} />
				<Route path="equipe" element={<FinanFinanceiroPage page="equipe" />} />
				<Route path="configuracao-geral" element={<Official><ConfiguracoesGerais /></Official>} />
				<Route path="configuracao-geral/notificacoes" element={<Official><Notificacoes /></Official>} />
				<Route path="configuracao-geral/usuarios" element={<Official><Usuarios /></Official>} />
				<Route path="configuracao-geral/cargos-permissoes" element={<Official><CargosPermissoes /></Official>} />
				<Route path="configuracao-geral/integracoes-apis" element={<Official><Integracoes /></Official>} />
				<Route path="configuracao-geral/hubsoft" element={<Official><HubsoftSettings /></Official>} />
				<Route path="configuracao-geral/cvortex" element={<Official><CvortexSettings /></Official>} />
				<Route path="configuracao-geral/senior" element={<Official><SeniorSettings /></Official>} />
				<Route path="configuracao-geral/banco-de-dados" element={<Official><DatabaseBackups /></Official>} />
				<Route path="configuracao-geral/email" element={<Official><EmailSettings /></Official>} />
				<Route path="configuracao-geral/logs-auditoria" element={<Official><AuditoriaLogs /></Official>} />
				<Route path="usuarios" element={<Navigate to={FINAN_ROUTES.CONFIG_USUARIOS} replace />} />
			</Route>
		</Routes>
	);
}
