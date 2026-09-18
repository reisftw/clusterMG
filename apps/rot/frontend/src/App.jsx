import { Route, Routes } from "react-router-dom";
import LoginScreen from "./components/LoginScreen";
import PrivateRoute from "./components/PrivateRoute";
import Shell from "./components/Shell";
import DashboardPage from "./pages/DashboardPage";
import AprPage from "./pages/admin/AprPage";
import ProfilePage from "./pages/ProfilePage";
import PublicAssetPage from "./pages/PublicAssetPage";
import PublicQrPage from "./pages/PublicQrPage";
import AbsencesPage from "./pages/admin/AbsencesPage";
import ActivitiesPage from "./pages/admin/ActivitiesPage";
import AgentsPage from "./modules/regionais/components/AgentesPage";
import AuditReportsPage from "./modules/tecnicosAuditoria/components/TecnicosAuditoriaRelatoriosPage";
import AuditLogsPage from "./pages/admin/AuditLogsPage";
import AssetsSecurityPage from "./pages/admin/AssetsSecurityPage";
import BagAuditPage from "./modules/tecnicosAuditoria/components/TecnicosBolsaAuditoriaPage";
import CompaniesPage from "./modules/empresasTecnicos/components/EmpresasTecnicosPage";
import CommandCenterPage from "./pages/admin/CommandCenterPage";
import EquipmentsPage from "./pages/admin/EquipmentsPage";
import EmailPage from "./pages/admin/EmailPage";
import FleetPage from "./pages/admin/FleetPage";
import FleetVehicleDetailPage from "./pages/admin/FleetVehicleDetailPage";
import GeralPage from "./pages/admin/GeralPage";
import HolidaysPage from "./pages/admin/HolidaysPage";
import IntegrationsPage from "./modules/integracoes/components/IntegracoesPage";
import KeysPage from "./pages/admin/KeysPage";
import MaterialsPage from "./pages/admin/MaterialsPage";
import NoticesPage from "./pages/admin/NoticesPage";
import NotificacoesPage from "./pages/admin/NotificacoesPage";
import QrCodesPage from "./pages/admin/QrCodesPage";
import RainPage from "./pages/admin/RainPage";
import RankingPage from "./pages/admin/RankingPage";
import RegionaisPage from "./modules/regionais/components/RegionaisPage";
import RolesPage from "./pages/admin/RolesPage";
import RompimentosPage from "./pages/admin/RompimentosPage";
import SegurancaTrabalhoPage from "./pages/admin/SegurancaTrabalhoPage";
import DssDashboardPage from "./pages/admin/DssDashboardPage";
import DssCalendarPage from "./pages/admin/DssCalendarPage";
import DssReportsPage from "./pages/admin/DssReportsPage";
import DssThemesPage from "./pages/admin/DssThemesPage";
import DssThemeDetailPage from "./pages/admin/DssThemeDetailPage";
import DssSchedulesPage from "./pages/admin/DssSchedulesPage";
import DssScheduleDetailPage from "./pages/admin/DssScheduleDetailPage";
import DssExecutionsPage from "./pages/admin/DssExecutionsPage";
import DssExecutionDetailPage from "./pages/admin/DssExecutionDetailPage";
import SstProtocolsPage from "./pages/admin/SstProtocolsPage";
import SstProtocolDetailPage from "./pages/admin/SstProtocolDetailPage";
import SstReportsPage from "./pages/admin/SstReportsPage";
import ServiceTypesPage from "./pages/admin/ServiceTypesPage";
import ShiftsPage from "./pages/admin/ShiftsPage";
import StockAdjustmentsPage from "./modules/acertoEstoque/components/AcertoEstoquePage";
import TechDeliveriesPage from "./pages/admin/TechDeliveriesPage";
import TechniciansPage from "./pages/admin/TechniciansPage";
import TicketsPage from "./pages/admin/TicketsPage";
import UsersPage from "./pages/admin/UsersPage";

export default function App() {
	return (
		<Routes>
			<Route path="/login" element={<LoginScreen />} />
			<Route path="/qr/:id" element={<PublicQrPage />} />
			<Route path="/ativo/:token" element={<PublicAssetPage />} />
			<Route
				path="/"
				element={
					<PrivateRoute>
						<Shell />
					</PrivateRoute>
				}
			>
				<Route index element={<DashboardPage />} />
				<Route
					path="comando-operacional"
					element={
						<PrivateRoute permission="command_center.view">
							<CommandCenterPage />
						</PrivateRoute>
					}
				/>
				<Route path="apr" element={<AprPage />} />
				<Route path="perfil" element={<ProfilePage />} />
				<Route path="admin/geral" element={<GeralPage />} />
				<Route path="admin/notificacoes" element={<NotificacoesPage />} />
				<Route
					path="admin/email"
					element={
						<PrivateRoute permission="rot.settings.manage">
							<EmailPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="admin/usuarios"
					element={
						<PrivateRoute permission="rot.users.manage">
							<UsersPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="admin/cargos"
					element={
						<PrivateRoute permission="rot.users.manage">
							<RolesPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="admin/regionais"
					element={
						<PrivateRoute permission="rot.regionals.manage">
							<RegionaisPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="admin/agentes"
					element={
						<PrivateRoute permission={["rot.agents.view", "rot.agents.manage"]}>
							<AgentsPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="admin/empresas"
					element={
						<PrivateRoute permission={["rot.companies.view", "rot.companies.manage"]}>
							<CompaniesPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="admin/empresas/:slug"
					element={
						<PrivateRoute permission={["rot.companies.view", "rot.companies.manage"]}>
							<CompaniesPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="empresas/:slug"
					element={
						<PrivateRoute permission={["rot.companies.view", "rot.companies.manage"]}>
							<CompaniesPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="admin/tecnicos"
					element={
						<PrivateRoute permission={["rot.technicians.view", "rot.technicians.manage"]}>
							<TechniciansPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="admin/integracoes"
					element={
						<PrivateRoute permission="rot.settings.manage">
							<IntegrationsPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="admin/qrcodes"
					element={
						<PrivateRoute>
							<QrCodesPage />
						</PrivateRoute>
					}
				/>
				<Route
					path="admin/logs"
					element={
						<PrivateRoute permission="rot.logs.view">
							<AuditLogsPage />
						</PrivateRoute>
					}
				/>
				<Route path="feriados" element={<HolidaysPage />} />
				<Route path="avisos" element={<NoticesPage />} />
				<Route path="chaves" element={<KeysPage />} />
				<Route path="materiais" element={<MaterialsPage />} />
				<Route path="acerto-estoque" element={<PrivateRoute permission={["rot.stock_adjustments.view","rot.stock_adjustments.manage"]}><StockAdjustmentsPage /></PrivateRoute>} />
				<Route path="entrega-tecnicos" element={<PrivateRoute permission={["rot.tech_deliveries.view","rot.tech_deliveries.manage"]}><TechDeliveriesPage /></PrivateRoute>} />
				<Route path="auditoria-bolsa" element={<PrivateRoute permission={["rot.bag_audit.view","rot.bag_audit.manage"]}><BagAuditPage /></PrivateRoute>} />
				<Route path="frota" element={<FleetPage />} />
				<Route path="frota/:id" element={<FleetVehicleDetailPage />} />
				<Route path="equipamentos" element={<EquipmentsPage />} />
				<Route path="ativos-seguranca/*" element={<PrivateRoute permission={["ativos.visualizar","checklists.visualizar","ocorrencias.visualizar","manutencoes.visualizar"]}><AssetsSecurityPage /></PrivateRoute>} />
				<Route path="seguranca-trabalho" element={<PrivateRoute permission="sst.dashboard.visualizar"><SegurancaTrabalhoPage /></PrivateRoute>} />
				<Route path="seguranca-trabalho/protocolos" element={<SstProtocolsPage />} />
				<Route path="seguranca-trabalho/protocolos/:id" element={<SstProtocolDetailPage />} />
				<Route path="seguranca-trabalho/dss" element={<PrivateRoute permission="dss.dashboard.visualizar"><DssDashboardPage /></PrivateRoute>} />
				<Route path="seguranca-trabalho/dss/calendario" element={<DssCalendarPage />} />
				<Route path="seguranca-trabalho/dss/relatorios" element={<PrivateRoute permission="dss.relatorio.visualizar"><DssReportsPage /></PrivateRoute>} />
				<Route path="seguranca-trabalho/dss/temas" element={<PrivateRoute permission="dss.tema.visualizar"><DssThemesPage /></PrivateRoute>} />
				<Route path="seguranca-trabalho/dss/temas/:id" element={<PrivateRoute permission="dss.tema.visualizar"><DssThemeDetailPage /></PrivateRoute>} />
				<Route path="seguranca-trabalho/dss/programacao" element={<PrivateRoute permission="dss.programacao.visualizar"><DssSchedulesPage /></PrivateRoute>} />
				<Route path="seguranca-trabalho/dss/programacao/:id" element={<PrivateRoute permission="dss.programacao.visualizar"><DssScheduleDetailPage /></PrivateRoute>} />
				<Route path="seguranca-trabalho/dss/execucoes" element={<DssExecutionsPage />} />
				<Route path="seguranca-trabalho/dss/execucoes/:id" element={<DssExecutionDetailPage />} />
				<Route path="seguranca-trabalho/relatorios" element={<SstReportsPage />} />
				<Route path="chamados" element={<PrivateRoute permission={["rot.tickets.view","rot.tickets.manage"]}><TicketsPage /></PrivateRoute>} />
				<Route path="ausencias" element={<PrivateRoute permission={["rot.absences.view","rot.absences.manage","rot.timeoff.view","rot.timeoff.approve","rot.vacations.view","rot.vacations.approve"]}><AbsencesPage /></PrivateRoute>} />
				<Route path="turnos" element={<PrivateRoute permission={["rot.shifts.view","rot.shifts.manage"]}><ShiftsPage /></PrivateRoute>} />
				<Route path="chuva" element={<RainPage />} />
				<Route path="rompimentos" element={<RompimentosPage />} />
				<Route path="atividades" element={<PrivateRoute permission={["rot.activities.view","rot.activities.manage"]}><ActivitiesPage /></PrivateRoute>} />
				<Route path="ranking" element={<PrivateRoute permission={["rot.ranking.view"]}><RankingPage /></PrivateRoute>} />
				<Route path="relatorios-auditoria" element={<PrivateRoute permission={["rot.audit_reports.view","rot.bag_audit.view","rot.bag_audit.manage"]}><AuditReportsPage /></PrivateRoute>} />
				<Route
					path="admin/tipos-servico"
					element={
						<PrivateRoute permission="rot.service_types.manage">
							<ServiceTypesPage />
						</PrivateRoute>
					}
				/>
			</Route>
		</Routes>
	);
}
