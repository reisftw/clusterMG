import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import PageWrapper from "../components/layout/PageWrapper";
import ErrorPage from "../components/ui/ErrorPage";
import Spinner from "../components/ui/Spinner";
import { AuthProvider } from "../context/AuthContext";
import AccessDenied from "../modules/auth/components/AccessDenied";
import ForgotPasswordPage from "../modules/auth/components/ForgotPasswordPage";
import LoginForm from "../modules/auth/components/LoginForm";
import ResetPasswordPage from "../modules/auth/components/ResetPasswordPage";
import HomeRoute from "./HomeRoute";
import ProtectedRoute from "./ProtectedRoute";
import { ROUTES } from "./routes";

const Dashboard = lazy(
	() => import("../modules/dashboard/components/DashboardPage"),
);
const Diario = lazy(() => import("../modules/diario/components/DiarioPage"));
const AcertoEstoque = lazy(
	() => import("../modules/acertoEstoque/components/AcertoEstoquePage"),
);
const EstoqueIntegrado = lazy(
	() => import("../modules/estoqueIntegrado/components/EstoqueIntegradoPage"),
);
const EstoqueConsulta = lazy(
	() => import("../modules/estoqueIntegrado/components/EstoqueConsultaPage"),
);
const BolsaTecnico = lazy(
	() => import("../modules/estoqueIntegrado/components/BolsaTecnicoPage"),
);
const TecnicosBolsaAuditoria = lazy(
	() =>
		import(
			"../modules/tecnicosAuditoria/components/TecnicosBolsaAuditoriaPage"
		),
);
const TecnicosAuditoriaRelatorios = lazy(
	() =>
		import(
			"../modules/tecnicosAuditoria/components/TecnicosAuditoriaRelatoriosPage"
		),
);
const Colaboradores = lazy(
	() => import("../modules/colaboradores/components/ColaboradoresPage"),
);
const Ferias = lazy(() => import("../modules/ferias/components/FeriasPage"));
const Equipamentos = lazy(
	() => import("../modules/equipamentos/components/EquipamentosPage"),
);
const Ferramentas = lazy(
	() => import("../modules/ferramentas/components/FerramentasPage"),
);
const Regionais = lazy(
	() => import("../modules/regionais/components/RegionaisPage"),
);
const Agentes = lazy(
	() => import("../modules/regionais/components/AgentesPage"),
);
const Agenda = lazy(() => import("../modules/agenda/components/AgendaPage"));
const Agendamentos = lazy(
	() => import("../modules/agendamentos/components/AgendamentosPage"),
);
const Acompanhamento = lazy(
	() => import("../pages/Acompanhamento/AcompanhamentoPage"),
);
const Visitas = lazy(() => import("../modules/visitas/components/VisitasPage"));
const GestaoDuvidas = lazy(
	() => import("../modules/duvidas/components/DuvidasPage"),
);
const Feriados = lazy(
	() => import("../modules/feriados/components/FeriadosPage"),
);
const Usuarios = lazy(() => import("../modules/auth/components/UsuariosPage"));
const CargosPermissoes = lazy(
	() => import("../modules/auth/components/CargosPermissoesPage"),
);
const Notificacoes = lazy(
	() => import("../modules/notificacoes/components/NotificacoesPage"),
);
const Metas = lazy(() => import("../modules/metas/components/MetasPage"));
const RegrasConfig = lazy(
	() => import("../modules/relatorios/components/RegrasConfig"),
);
const Relatorios = lazy(
	() => import("../modules/relatorios/components/RelatoriosPage"),
);
const Mapa = lazy(() => import("../pages/Mapa/MapaPage"));
const MapaHistorico = lazy(() => import("../pages/Mapa/MapaHistoricoPage"));
const PainelPublico = lazy(
	() => import("../pages/PainelPublico/PainelPublico"),
);
const DevolucaoPage = lazy(() => import("../pages/Devolucao/DevolucaoPage"));
const DuvidasPublicoPage = lazy(
	() => import("../pages/DuvidasPublico/DuvidasPublicoPage"),
);
const MapaPublicoPage = lazy(
	() => import("../pages/PainelPublico/MapaPublicoPage"),
);
const MatchPublicoPage = lazy(
	() => import("../pages/PainelPublico/MatchPublicoPage"),
);
const AgentesMatchPage = lazy(
	() => import("../pages/PainelPublico/AgentesMatchPage"),
);
const RelatoriosPublicoPage = lazy(
	() => import("../pages/PainelPublico/RelatoriosPublicoPage"),
);
const TerceirosHomePage = lazy(
	() => import("../pages/Terceiros/TerceirosHomePage"),
);
const TerceirosConsultaMacPage = lazy(
	() => import("../pages/Terceiros/TerceirosConsultaMacPage"),
);
const TerceirizadosDocumentosPage = lazy(
	() => import("../pages/Terceiros/TerceirizadosDocumentosPage"),
);
const Retiradas = lazy(
	() => import("../modules/retiradas/components/RetiradasPage"),
);
const EntregasTecnicos = lazy(
	() => import("../modules/entregasTecnicos/components/EntregasTecnicosPage"),
);
const Movimentacoes = lazy(
	() => import("../modules/movimentacoes/components/MovimentacoesPage"),
);
const Logistica = lazy(
	() => import("../modules/logistica/components/LogisticaPage"),
);
const Atendimento = lazy(
	() => import("../modules/atendimento/components/AtendimentoPage"),
);
const Integracoes = lazy(
	() => import("../modules/integracoes/components/IntegracoesPage"),
);
const Mensageria = lazy(
	() => import("../modules/mensageria/components/MensageriaPage"),
);
const MensageriaApi = lazy(
	() => import("../modules/mensageria/components/MensageriaApiPage"),
);
const MensageriaFila = lazy(
	() => import("../modules/mensageria/components/MensageriaFilaPage"),
);
const MensageriaEnviados = lazy(
	() => import("../modules/mensageria/components/MensageriaEnviadosPage"),
);
const MensageriaRelatorios = lazy(
	() => import("../modules/mensageria/components/MensageriaRelatoriosPage"),
);
const AgendamentoConfirmacao = lazy(
	() => import("../modules/mensageria/components/AgendamentoConfirmacaoPage"),
);
const MensageriaBacklog = lazy(
	() => import("../modules/mensageria/components/MensageriaBacklogPage"),
);
const MensageriaCallback = lazy(
	() => import("../modules/mensageria/components/MensageriaCallbackPage"),
);
const ApiStatus = lazy(
	() => import("../modules/apiStatus/components/ApiStatusPage"),
);
const HubsoftSettings = lazy(
	() => import("../modules/hubsoft/components/HubsoftSettingsPage"),
);
const CvortexSettings = lazy(
	() => import("../modules/cvortex/components/CvortexSettingsPage"),
);
const SeniorSettings = lazy(
	() => import("../modules/senior/components/SeniorSettingsPage"),
);
const DatabaseBackups = lazy(
	() => import("../modules/databaseBackups/components/DatabaseBackupsPage"),
);
const EmailSettings = lazy(
	() => import("../modules/emailSettings/components/EmailSettingsPage"),
);
const ConfiguracoesGerais = lazy(
	() => import("../modules/configuracoes/components/ConfiguracoesGeraisPage"),
);
const AuditoriaLogs = lazy(
	() => import("../modules/auditoria/components/AuditoriaLogsPage"),
);
const EmpresasTecnicos = lazy(
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

const AuthenticatedRoutes = () => (
	<AuthProvider>
		<Outlet />
	</AuthProvider>
);

const FINAN_BASE_URL = "https://finan.retiradas.tech";

function buildFinanRedirectUrl(pathname, search = "") {
	const normalizedPath = String(pathname || "/financeiro")
		.replace(/\/+$/g, "")
		.toLowerCase();
	const targetPath =
		{
			"/financeiro": "/",
			"/financeiro/contas-a-pagar": "/contas-a-pagar",
			"/financeiro/contas-a-receber": "/contas-a-receber",
			"/financeiro/faturamento": "/faturamento",
			"/financeiro/notas": "/notas",
			"/financeiro/reports/serasa": "/reports/serasa",
			"/financeiro/reports/tarifas": "/reports/tarifas",
			"/financeiro/reports/tarifas/faturas": "/reports/faturas",
			"/financeiro/reports/tarifas/rec-cliente": "/reports/receitas",
			"/financeiro/reports/tarifas/formas-pagamento":
				"/reports/formas-pagamento",
			"/financeiro/gestao-orcamento": "/gestao-orcamentaria/visao-geral",
			"/financeiro/gestao-orcamento/dados": "/gestao-orcamentaria/dados",
			"/financeiro/gestao-orcamento/centros-custo":
				"/gestao-orcamentaria/orcamento",
			"/financeiro/gestao-orcamento/dre": "/gestao-orcamentaria/dre",
			"/financeiro/gestao-orcamento/aprovacoes":
				"/gestao-orcamentaria/aprovacoes",
			"/financeiro/gestao-orcamento/configuracoes":
				"/gestao-orcamentaria/configuracoes",
			"/financeiro/configuracoes": "/configuracao-geral",
			"/financeiro/equipe": "/equipe",
		}[normalizedPath] || "/";
	return `${FINAN_BASE_URL}${targetPath}${search || ""}`;
}

function FinanceiroRedirect() {
	useEffect(() => {
		window.location.replace(
			buildFinanRedirectUrl(window.location.pathname, window.location.search),
		);
	}, []);

	return (
		<div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
			<div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
				<Spinner size="md" text="Abrindo Finan..." />
				<p className="mt-3 text-sm font-semibold text-slate-500">
					O Financeiro agora fica em finan.retiradas.tech.
				</p>
			</div>
		</div>
	);
}

const AppRouter = () => (
	<BrowserRouter>
		<Suspense fallback={<Spinner fullScreen />}>
			<Routes>
				<Route path={ROUTES.PAINEL_PUBLICO} element={<PainelPublico />} />
				<Route
					path={ROUTES.PAINEL_AGENTES}
					element={<PainelPublico initialTab="agentes" />}
				/>
				<Route path={ROUTES.DEVOLUCAO_PUBLICO} element={<DevolucaoPage />} />
				<Route path={ROUTES.DUVIDAS_PUBLICO} element={<DuvidasPublicoPage />} />
				<Route path={ROUTES.PAINEL_MAPA} element={<MapaPublicoPage />} />
				<Route path={ROUTES.PAINEL_MATCH} element={<MatchPublicoPage />} />
				<Route
					path={ROUTES.PAINEL_RELATORIOS}
					element={<RelatoriosPublicoPage />}
				/>
				<Route
					path={ROUTES.AGENTES_MATCH_PUBLICO}
					element={<AgentesMatchPage />}
				/>
				<Route path={ROUTES.TERCEIROS} element={<TerceirosHomePage />} />
				<Route
					path={ROUTES.TERCEIRIZADOS}
					element={<TerceirosHomePage portal="terceirizados" />}
				/>
				<Route
					path={ROUTES.TERCEIROS_CONSULTA_MAC}
					element={<TerceirosConsultaMacPage />}
				/>
				<Route
					path={ROUTES.TERCEIRIZADOS_CONSULTA_MAC}
					element={<TerceirosConsultaMacPage portal="terceirizados" />}
				/>

				<Route
					path={ROUTES.TERCEIRIZADOS_LOGIN}
					element={
						<AuthProvider>
							<TerceirizadosDocumentosPage />
						</AuthProvider>
					}
				/>

				<Route element={<AuthenticatedRoutes />}>
					<Route path={ROUTES.LOGIN} element={<LoginForm />} />
					<Route
						path={ROUTES.FORGOT_PASSWORD}
						element={<ForgotPasswordPage />}
					/>
					<Route path={ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />
					<Route path={ROUTES.ACCESS_DENIED} element={<AccessDenied />} />
					<Route
						path={ROUTES.ACOMPANHAMENTO}
						element={
							<ProtectedRoute
								requiredPermission={[
									"view_agendamentos",
									"cliente.agendamentos.view",
									"cliente.agendamentos.manage",
								]}
							>
								<Acompanhamento />
							</ProtectedRoute>
						}
					/>

					<Route element={<PageWrapper />}>
						<Route
							path={ROUTES.DASHBOARD}
							element={
								<ProtectedRoute>
									<HomeRoute dashboard={Dashboard} />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.ACERTO_ESTOQUE}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_acerto_estoque",
										"estoque.acerto_estoque.view",
										"estoque.acerto_estoque.manage",
									]}
								>
									<AcertoEstoque />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.ESTOQUE_INTEGRADO}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_estoque_integrado",
										"estoque.equipamentos.view",
										"estoque.equipamentos.manage",
									]}
								>
									<EstoqueIntegrado />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.ESTOQUE_EQUIPAMENTOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_estoque_integrado",
										"estoque.equipamentos.view",
										"estoque.equipamentos.manage",
									]}
								>
									<EstoqueIntegrado />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.ESTOQUE_BOLSA_TECNICO}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_estoque_integrado",
										"tecnicos.bolsa_tecnico.view",
										"tecnicos.bolsa_tecnico.manage",
									]}
								>
									<BolsaTecnico />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.TECNICOS_AUDITORIA_BOLSA}
							element={
								<ProtectedRoute
									requiredPermission={[
										"tecnicos.auditoria_bolsa.view",
										"tecnicos.auditoria_bolsa.manage",
									]}
								>
									<TecnicosBolsaAuditoria />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.TECNICOS_AUDITORIA_RELATORIOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"tecnicos.auditoria_bolsa.view",
										"tecnicos.auditoria_bolsa.manage",
									]}
								>
									<TecnicosAuditoriaRelatorios />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.ESTOQUE_CONSULTA}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_estoque_integrado",
										"estoque.consulta.view",
									]}
								>
									<EstoqueConsulta />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.DIARIO}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_diario",
										"destaque.diario.view",
										"destaque.diario.manage",
									]}
								>
									<Diario />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.MAPA}
							element={
								<ProtectedRoute
									requiredPermission={["view_mapa", "destaque.mapa_os.view"]}
								>
									<Mapa />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.MAPA_HISTORICO}
							element={
								<ProtectedRoute
									requiredPermission={["view_mapa", "destaque.mapa_os.view"]}
								>
									<MapaHistorico />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.RETIRADAS}
							element={
								<ProtectedRoute requiredPermission="view_retiradas">
									<Retiradas />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.ENTREGAS_TECNICOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_entregas_tecnicos",
										"tecnicos.entrega_tecnicos.view",
										"tecnicos.entrega_tecnicos.manage",
									]}
								>
									<EntregasTecnicos />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.MOVIMENTACOES}
							element={
								<ProtectedRoute
									requiredPermission={["movimentacoes.view", "movimentacoes.manage"]}
								>
									<Movimentacoes />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.LOGISTICA}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_logistica",
										"logistica.logistica.view",
										"logistica.logistica.manage",
									]}
								>
									<Logistica />
								</ProtectedRoute>
							}
						/>
						<Route
							path="/financeiro/*"
							element={<FinanceiroRedirect />}
						/>
						<Route
							path={ROUTES.ATENDIMENTO_CASOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"atendimento.casos.view",
										"atendimento.casos.manage",
									]}
								>
									<Atendimento page="cases" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.ATENDIMENTO_TECNICOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"atendimento.tecnicos.view",
										"atendimento.tecnicos.manage",
									]}
								>
									<Atendimento page="technicians" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.ATENDIMENTO_AVALIACOES}
							element={
								<ProtectedRoute
									requiredPermission={["atendimento.avaliacoes.manage"]}
								>
									<Atendimento page="ratings" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.ATENDIMENTO_CONFIGURACOES}
							element={
								<ProtectedRoute
									requiredPermission={[
										"atendimento.configuracoes.view",
										"atendimento.configuracoes.manage",
									]}
								>
									<Atendimento page="config" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.ATENDIMENTO_TEMPLATES}
							element={
								<ProtectedRoute
									requiredPermission={["atendimento.templates.manage"]}
								>
									<Atendimento page="templates" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.ATENDIMENTO_LOGS}
							element={
								<ProtectedRoute requiredPermission={["atendimento.logs.view"]}>
									<Atendimento page="logs" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.ATENDIMENTO_MENSAGENS}
							element={
								<ProtectedRoute requiredPermission={["atendimento.logs.view"]}>
									<Atendimento page="messages" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.INTEGRACOES}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_integracoes",
										"configuracao.integracoes.view",
										"configuracao.integracoes.manage",
									]}
								>
									<Integracoes />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.MENSAGERIA}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_mensageria",
										"mensageria.email_config.view",
										"mensageria.email_config.manage",
									]}
								>
									<Mensageria />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.MENSAGERIA_API}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_mensageria",
										"mensageria.api.view",
										"mensageria.api.manage",
									]}
								>
									<MensageriaApi />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.MENSAGERIA_FILA}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_mensageria",
										"mensageria.fila.view",
										"mensageria.fila.manage",
									]}
								>
									<MensageriaFila />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.MENSAGERIA_ENVIADOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_mensageria",
										"mensageria.enviados.view",
									]}
								>
									<MensageriaEnviados />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.MENSAGERIA_RELATORIOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_mensageria_relatorios",
										"mensageria.relatorios.view",
									]}
								>
									<MensageriaRelatorios />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.MENSAGERIA_CONFIRMACAO_AGENDAMENTOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_confirmacao_agendamentos",
										"mensageria.confirmacao_agendamentos.view",
										"mensageria.confirmacao_agendamentos.manage",
									]}
								>
									<AgendamentoConfirmacao />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.MENSAGERIA_BACKLOG}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_mensageria",
										"mensageria.backlog.view",
										"mensageria.backlog.manage",
									]}
								>
									<MensageriaBacklog />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.MENSAGERIA_CALLBACK}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_mensageria",
										"mensageria.callback.view",
										"mensageria.callback.manage",
									]}
								>
									<MensageriaCallback />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.CONFIGURACOES_GERAIS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_general_settings",
										"configuracao.geral.view",
										"configuracao.geral.manage",
									]}
								>
									<ConfiguracoesGerais />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.API_STATUS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_api_status",
										"configuracao.apis.view",
										"configuracao.apis.manage",
									]}
								>
									<ApiStatus />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.HUBSOFT_SETTINGS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_integracoes",
										"configuracao.hubsoft.view",
										"configuracao.hubsoft.manage",
									]}
								>
									<HubsoftSettings />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.CVORTEX_SETTINGS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_integracoes",
										"configuracao.cvortex.view",
										"configuracao.cvortex.manage",
									]}
								>
									<CvortexSettings />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.SENIOR_SETTINGS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_integracoes",
										"configuracao.senior.view",
										"configuracao.senior.manage",
									]}
								>
									<SeniorSettings />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.DATABASE_BACKUPS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_database_backups",
										"configuracao.banco_dados.view",
										"configuracao.banco_dados.manage",
									]}
								>
									<DatabaseBackups />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.EMAIL_SETTINGS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_email",
										"configuracao.email.view",
										"configuracao.email.manage",
									]}
								>
									<EmailSettings />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.AUDITORIA_LOGS}
							element={
								<ProtectedRoute requiredPermission={["configuracao.auditoria.view"]}>
									<AuditoriaLogs />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.EMPRESAS_TECNICOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_empresas_tecnicos",
										"empresas.cadastro.view",
										"empresas.cadastro.manage",
									]}
								>
									<EmpresasTecnicos />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.EMPRESA_PERFIL}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_empresas_tecnicos",
										"empresas.cadastro.view",
										"empresas.cadastro.manage",
									]}
								>
									<EmpresasTecnicos />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.DOCUMENTOS_PENDENTES}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_documentos",
										"administrativo.documentos.view",
										"administrativo.documentos.manage",
									]}
								>
									<Documentos status="pendente" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.DOCUMENTOS_TRATATIVAS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_documentos_tratativas",
										"administrativo.documentos.view",
										"administrativo.documentos.manage",
									]}
								>
									<DocumentosTratativas />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.DOCUMENTOS_HISTORICO}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_documentos",
										"administrativo.documentos.view",
										"administrativo.documentos.manage",
									]}
								>
									<Documentos status="historico" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.DOCUMENTOS_APROVADOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_documentos",
										"administrativo.documentos.view",
										"administrativo.documentos.manage",
									]}
								>
									<Documentos status="aprovado" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.DOCUMENTOS_CONFIGURACAO}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_documentos",
										"administrativo.documentos.manage",
									]}
								>
									<DocumentosConfig />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.DOCUMENTOS_RELATORIOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_documentos_relatorios",
										"administrativo.relatorios.view",
									]}
								>
									<DocumentosRelatorios />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.INSUMOS_ADMINISTRATIVOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_insumos_administrativos",
										"administrativo.insumos.manage",
									]}
								>
									<InsumosAdministrativos />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.INSUMOS_REQUISICOES}
							element={
								<ProtectedRoute>
									<InsumosRequisicoes />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.IMOVEIS_ADMINISTRATIVOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_imoveis_administrativos",
										"administrativo.imoveis.view",
										"administrativo.imoveis.manage",
									]}
								>
									<ImoveisAdministrativos page="dashboard" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.IMOVEL_ADMINISTRATIVO_DETALHE}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_imoveis_administrativos",
										"administrativo.imoveis.view",
										"administrativo.imoveis.manage",
									]}
								>
									<ImoveisAdministrativos page="detalhe" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.IMOVEIS_ADMINISTRATIVOS_CONTRATOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_imoveis_administrativos",
										"administrativo.imoveis.view",
										"administrativo.imoveis.manage",
									]}
								>
									<ImoveisAdministrativos page="contratos" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.IMOVEIS_ADMINISTRATIVOS_HISTORICO}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_imoveis_administrativos",
										"administrativo.imoveis.view",
										"administrativo.imoveis.manage",
									]}
								>
									<ImoveisAdministrativos page="historico" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.IMOVEIS_ADMINISTRATIVOS_RELATORIOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_imoveis_administrativos",
										"administrativo.imoveis.view",
										"administrativo.imoveis.manage",
									]}
								>
									<ImoveisAdministrativos page="relatorios" />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.COLABORADORES}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_colaboradores",
										"equipe.colaboradores.view",
										"equipe.colaboradores.manage",
									]}
								>
									<Colaboradores />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.FERIAS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"request_ferias",
										"equipe.ferias.view",
										"equipe.ferias.manage",
									]}
								>
									<Ferias />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.EQUIPAMENTOS}
							element={
								<ProtectedRoute requiredPermission="view_equipamentos">
									<Equipamentos />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.FERRAMENTAS}
							element={
								<ProtectedRoute requiredPermission="view_ferramentas">
									<Ferramentas />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.REGIONAIS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_regionais",
										"configuracao.regionais.view",
										"configuracao.regionais.manage",
									]}
								>
									<Regionais />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.AGENTES}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_agentes",
										"configuracao.agentes.view",
										"configuracao.agentes.manage",
									]}
								>
									<Agentes />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.AGENDA}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_agenda",
										"equipe.agenda.view",
										"equipe.agenda.manage",
									]}
								>
									<Agenda />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.AGENDAMENTOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_agendamentos",
										"cliente.agendamentos.view",
										"cliente.agendamentos.manage",
									]}
								>
									<Agendamentos />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.VISITAS}
							element={
								<ProtectedRoute requiredPermission="view_visitas">
									<Visitas />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.GESTAO_DUVIDAS}
							element={
								<ProtectedRoute requiredPermission="view_duvidas">
									<GestaoDuvidas />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.FERIADOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_feriados",
										"equipe.feriados.view",
										"equipe.feriados.manage",
									]}
								>
									<Feriados />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.USUARIOS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_users",
										"configuracao.usuarios.view",
										"configuracao.usuarios.manage",
									]}
								>
									<Usuarios />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.CARGOS_PERMISSOES}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_roles",
										"configuracao.cargos_permissoes.view",
										"configuracao.cargos_permissoes.manage",
									]}
								>
									<CargosPermissoes />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.NOTIFICACOES}
							element={
								<ProtectedRoute
									requiredPermission={[
										"manage_general_settings",
										"configuracao.notificacoes.view",
										"configuracao.notificacoes.manage",
									]}
								>
									<Notificacoes />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.METAS}
							element={
								<ProtectedRoute
									requiredPermission={[
										"view_metas",
										"destaque.metas.view",
										"destaque.metas.manage",
									]}
								>
									<Metas />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.RELATORIOS}
							element={
								<ProtectedRoute requiredPermission="view_relatorios">
									<Relatorios />
								</ProtectedRoute>
							}
						/>
						<Route
							path={ROUTES.REGRAS}
							element={
								<ProtectedRoute requiredPermission="manage_users">
									<RegrasConfig />
								</ProtectedRoute>
							}
						/>
					</Route>
				</Route>

				<Route path="*" element={<ErrorPage code="404" />} />
			</Routes>
		</Suspense>
	</BrowserRouter>
);

export default AppRouter;
