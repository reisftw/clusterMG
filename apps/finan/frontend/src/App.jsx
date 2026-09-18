import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import FinanLayout from "./components/FinanLayout";
import FinanLoginPage from "./components/FinanLoginPage";
import FinanCalendarioPage from "./components/FinanCalendarioPage";
import FinanFinancialReportsPage from "./components/FinanFinancialReportsPage";
import FinanModulePage from "./components/FinanModulePage";
import FinanMyAccountPage from "./components/FinanMyAccountPage";
import FinanPasswordChangePage from "./components/FinanPasswordChangePage";
import FinanPinLockOverlay from "./components/FinanPinLockOverlay";
import FinanPinRecoveryPage from "./components/FinanPinRecoveryPage";
import FinanPinSetupPage from "./components/FinanPinSetupPage";
import { useFinanAuth } from "./state/FinanAuthContext";
import { useFinanPinLock } from "./state/FinanPinLockContext";
import { FINAN_ROUTES } from "./routes";

const FinanFinanceiroPage = lazy(() => import("./components/FinanFinanceiroPage"));
const FinanUsersPage = lazy(() => import("./components/FinanUsersPage"));
const FinanSettingsPage = lazy(() => import("./components/FinanSettingsPage"));

function RequireAuth({ children }) {
	const { user, loading } = useFinanAuth();
	if (loading) return <div className="finan-loading">Carregando Finan...</div>;
	if (!user) return <Navigate to={FINAN_ROUTES.LOGIN} replace />;
	return children;
}

function Protected({ children }) {
	const { user, loading } = useFinanAuth();
	const { pinConfigured, checking, locked } = useFinanPinLock();
	if (loading) return <div className="finan-loading">Carregando Finan...</div>;
	if (!user) return <Navigate to={FINAN_ROUTES.LOGIN} replace />;
	if (checking || pinConfigured === null) {
		return <div className="finan-loading">Carregando Finan...</div>;
	}
	if (pinConfigured === false) return <Navigate to={FINAN_ROUTES.PIN_SETUP} replace />;
	return (
		<>
			{children}
			{locked ? <FinanPinLockOverlay /> : null}
		</>
	);
}

function RequirePermission({ permission, children }) {
	const { user } = useFinanAuth();
	if (hasFinanPermission(user, permission)) return children;
	return (
		<section className="finan-work-card">
			<div className="finan-card-heading">
				<div>
					<span>403</span>
				</div>
				<div>
					<h2>Acesso restrito</h2>
					<p>Você não tem permissão para acessar esta área do Finan.</p>
				</div>
			</div>
		</section>
	);
}

function PinSetupRoute() {
	const navigate = useNavigate();
	const { pinConfigured } = useFinanPinLock();
	const isVoluntaryChange = pinConfigured === true;
	return (
		<FinanPinSetupPage
			requireCurrentPin={isVoluntaryChange}
			onDone={() => navigate(FINAN_ROUTES.DASHBOARD, { replace: true })}
			onClose={isVoluntaryChange ? () => navigate(FINAN_ROUTES.DASHBOARD) : undefined}
		/>
	);
}

function PasswordChangeRoute() {
	const navigate = useNavigate();
	return (
		<FinanPasswordChangePage
			onDone={() => navigate(FINAN_ROUTES.DASHBOARD, { replace: true })}
			onClose={() => navigate(FINAN_ROUTES.DASHBOARD)}
		/>
	);
}

// "Geral" fica aberta para todo mundo, mas o conteudo muda: quem tem
// finan.configuracoes.view ve a pagina admin de configuracoes (compartilhada
// com o app principal); quem nao tem ve uma pagina pessoal (senha, avatar,
// PIN) — nunca as duas coisas juntas, e a pagina admin nunca e tocada pra
// isso (evita instabilidade cruzada com o app principal, que reusa o mesmo
// componente).
function ConfiguracaoGeralRoute() {
	const { user } = useFinanAuth();
	if (hasFinanPermission(user, "finan.configuracoes.view")) {
		return <FinanSettingsPage section="geral" />;
	}
	return <FinanMyAccountPage />;
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
		<Suspense fallback={<div className="finan-loading">Carregando...</div>}>
			<Routes>
				<Route path={FINAN_ROUTES.LOGIN} element={<FinanLoginPage />} />
				<Route path={FINAN_ROUTES.PIN_RECOVERY} element={<FinanPinRecoveryPage />} />
				<Route
					path={FINAN_ROUTES.PIN_SETUP}
					element={
						<RequireAuth>
							<PinSetupRoute />
						</RequireAuth>
					}
				/>
				<Route
					path={FINAN_ROUTES.PASSWORD_CHANGE}
					element={
						<RequireAuth>
							<PasswordChangeRoute />
						</RequireAuth>
					}
				/>
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
				<Route path="calendario-financeiro" element={<FinanCalendarioPage />} />
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
				<Route
					path="gestao-orcamentaria/dre"
					element={<Navigate to={FINAN_ROUTES.DRE} replace />}
				/>
				<Route path="gestao-orcamentaria/aprovacoes" element={<FinanFinanceiroPage page="orcamentoAprovacoes" />} />
				<Route path="gestao-orcamentaria/configuracoes" element={<FinanFinanceiroPage page="orcamentoConfiguracoes" />} />
				<Route
					path="relatorios-financeiros"
					element={
						<RequirePermission permission="relatorios_financeiros:visualizar">
							<FinanFinancialReportsPage />
						</RequirePermission>
					}
				/>
				<Route
					path="relatorios-financeiros/dre"
					element={
						<RequirePermission permission="relatorios_financeiros:visualizar">
							<FinanFinanceiroPage page="orcamentoDre" />
						</RequirePermission>
					}
				/>
				<Route
					path="relatorios-financeiros/fluxo-de-caixa"
					element={
						<RequirePermission permission="relatorios_financeiros:visualizar">
							<FinanFinancialReportsPage report="fluxoCaixa" />
						</RequirePermission>
					}
				/>
				<Route
					path="relatorios-financeiros/balanco-patrimonial"
					element={
						<RequirePermission permission="relatorios_financeiros:visualizar">
							<FinanFinancialReportsPage report="balancoPatrimonial" />
						</RequirePermission>
					}
				/>
				<Route
					path="relatorios-financeiros/conciliacao-bancaria"
					element={
						<RequirePermission permission="relatorios_financeiros:visualizar">
							<FinanFinancialReportsPage report="conciliacaoBancaria" />
						</RequirePermission>
					}
				/>
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
				<Route path="configuracao-geral" element={<ConfiguracaoGeralRoute />} />
				<Route
					path="configuracao-geral/notificacoes"
					element={<FinanSettingsPage section="notificacoes" />}
				/>
				<Route
					path="configuracao-geral/usuarios"
					element={<FinanUsersPage initialTab="usuarios" />}
				/>
				<Route
					path="configuracao-geral/cargos-permissoes"
					element={<FinanUsersPage initialTab="cargos" />}
				/>
				<Route
					path="configuracao-geral/integracoes-apis"
					element={<FinanSettingsPage section="integracoes" />}
				/>
				<Route
					path="configuracao-geral/hubsoft"
					element={<FinanSettingsPage section="hubsoft" />}
				/>
				<Route
					path="configuracao-geral/cvortex"
					element={<FinanSettingsPage section="cvortex" />}
				/>
				<Route
					path="configuracao-geral/senior"
					element={<FinanSettingsPage section="senior" />}
				/>
				<Route
					path="configuracao-geral/banco-de-dados"
					element={<FinanSettingsPage section="banco" />}
				/>
				<Route
					path="configuracao-geral/email"
					element={<FinanSettingsPage section="email" />}
				/>
				<Route
					path="configuracao-geral/logs-auditoria"
					element={<FinanSettingsPage section="auditoria" />}
				/>
				<Route path="usuarios" element={<Navigate to={FINAN_ROUTES.CONFIG_USUARIOS} replace />} />
				</Route>
			</Routes>
		</Suspense>
	);
}

function hasFinanPermission(user, permission) {
	if (!permission) return true;
	if (user?.isAdmin) return true;
	const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
	if (permissions.includes("*") || permissions.includes(permission)) return true;
	return (
		permission === "relatorios_financeiros:visualizar" &&
		permissions.includes("relatorios_financeiros:gerenciar")
	);
}
