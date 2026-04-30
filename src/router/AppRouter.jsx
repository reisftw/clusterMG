import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { lazy, Suspense } from "react";
import { ROUTES } from "./routes";
import ProtectedRoute from "./ProtectedRoute";
import LoginForm from "../modules/auth/components/LoginForm";
import AccessDenied from "../modules/auth/components/AccessDenied";
import Spinner from "../components/ui/Spinner";
import PageWrapper from "../components/layout/PageWrapper";

const Dashboard = lazy(
  () => import("../modules/dashboard/components/DashboardPage"),
);
const Colaboradores = lazy(
  () => import("../modules/colaboradores/components/ColaboradoresPage"),
);
const Presenca = lazy(
  () => import("../modules/presenca/components/PresencaPage"),
);
const Ferias = lazy(() => import("../modules/ferias/components/FeriasPage"));
const Frota = lazy(() => import("../modules/frota/components/FrotaPage"));
const Comissao = lazy(
  () => import("../modules/comissao/components/ComissaoPage"),
);
const BancoHoras = lazy(
  () => import("../modules/bancoHoras/components/BancoHorasPage"),
);
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
const GestaoDuvidas = lazy(
  () => import("../modules/duvidas/components/DuvidasPage"),
);
const Feriados = lazy(
  () => import("../modules/feriados/components/FeriadosPage"),
);
const Usuarios = lazy(() => import("../modules/auth/components/UsuariosPage"));
const Metas = lazy(() => import("../modules/metas/components/MetasPage"));
const RegrasConfig = lazy(
  () => import("../modules/relatorios/components/RegrasConfig"),
);

const FSDashboardPage = lazy(
  () => import("../modules/fieldService/components/FSDashboardPage"),
);
const FSColaboradores = lazy(
  () => import("../modules/fieldService/components/FSColaboradoresPage"),
);
const FSBancoHoras = lazy(
  () => import("../modules/fieldService/components/FSBancoHorasPage"),
);
const FSFerias = lazy(
  () => import("../modules/fieldService/components/FSFeriasPage"),
);
const FSFrota = lazy(
  () => import("../modules/fieldService/components/FSFrotaPage"),
);
const FSFerramentas = lazy(
  () => import("../modules/fieldService/components/FSFerramentasPage"),
);
const FSReclamacoes = lazy(
  () => import("../modules/fieldService/components/FSReclamacoesPage"),
);
const FSReunioes = lazy(
  () => import("../modules/fieldService/components/FSReunioesPage"),
);
const FSEscala = lazy(
  () => import("../modules/fieldService/components/FSEscalaPage"),
);

const Mapa = lazy(() => import("../pages/Mapa/MapaPage"));

const PainelPublico = lazy(
  () => import("../pages/PainelPublico/PainelPublico"),
);
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

const AppRouter = () => (
  <BrowserRouter>
    <Suspense fallback={<Spinner fullScreen />}>
      <Routes>
        <Route path={ROUTES.LOGIN} element={<LoginForm />} />
        <Route path={ROUTES.ACCESS_DENIED} element={<AccessDenied />} />

        <Route path={ROUTES.PAINEL_PUBLICO} element={<PainelPublico />} />
        <Route path={ROUTES.DUVIDAS_PUBLICO} element={<DuvidasPublicoPage />} />
        <Route path={ROUTES.PAINEL_MAPA} element={<MapaPublicoPage />} />
        <Route path={ROUTES.PAINEL_MATCH} element={<MatchPublicoPage />} />
        <Route
          path={ROUTES.AGENTES_MATCH_PUBLICO}
          element={<AgentesMatchPage />}
        />

        <Route element={<PageWrapper />}>
          <Route
            path={ROUTES.DASHBOARD}
            element={
              <ProtectedRoute requiredPermission="view_dashboard">
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.MAPA}
            element={
              <ProtectedRoute requiredPermission="view_mapa">
                <Mapa />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.COLABORADORES}
            element={
              <ProtectedRoute requiredPermission="manage_colaboradores">
                <Colaboradores />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.PRESENCA}
            element={
              <ProtectedRoute requiredPermission="manage_presenca">
                <Presenca />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.FERIAS}
            element={
              <ProtectedRoute requiredPermission="request_ferias">
                <Ferias />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.FROTA}
            element={
              <ProtectedRoute requiredPermission="checklist_frota">
                <Frota />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.COMISSAO}
            element={
              <ProtectedRoute requiredPermission="view_comissao">
                <Comissao />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.BANCO_HORAS}
            element={
              <ProtectedRoute requiredPermission="view_banco_horas">
                <BancoHoras />
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
              <ProtectedRoute requiredPermission="view_regionais">
                <Regionais />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.AGENTES}
            element={
              <ProtectedRoute requiredPermission="view_agentes">
                <Agentes />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.AGENDA}
            element={
              <ProtectedRoute requiredPermission="view_agenda">
                <Agenda />
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
              <ProtectedRoute requiredPermission="manage_feriados">
                <Feriados />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.USUARIOS}
            element={
              <ProtectedRoute requiredPermission="manage_users">
                <Usuarios />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.METAS}
            element={
              <ProtectedRoute requiredPermission="view_metas">
                <Metas />
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

          <Route
            path={ROUTES.FS_DASHBOARD}
            element={
              <ProtectedRoute requiredPermission="view_fs_dashboard">
                <FSDashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.FS_COLABORADORES}
            element={
              <ProtectedRoute requiredPermission="manage_fs_colaboradores">
                <FSColaboradores />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.FS_BANCO_HORAS}
            element={
              <ProtectedRoute requiredPermission="view_fs_banco_horas">
                <FSBancoHoras />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.FS_FERIAS}
            element={
              <ProtectedRoute requiredPermission="view_fs_ferias">
                <FSFerias />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.FS_FROTA}
            element={
              <ProtectedRoute requiredPermission="view_fs_frota">
                <FSFrota />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.FS_FERRAMENTAS}
            element={
              <ProtectedRoute requiredPermission="manage_fs_ferramentas">
                <FSFerramentas />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.FS_RECLAMACOES}
            element={
              <ProtectedRoute requiredPermission="view_fs_reclamacoes">
                <FSReclamacoes />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.FS_REUNIOES}
            element={
              <ProtectedRoute requiredPermission="view_fs_reunioes">
                <FSReunioes />
              </ProtectedRoute>
            }
          />
          <Route
            path={ROUTES.FS_ESCALA}
            element={
              <ProtectedRoute requiredPermission="view_fs_escala">
                <FSEscala />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
      </Routes>
    </Suspense>
  </BrowserRouter>
);

export default AppRouter;
