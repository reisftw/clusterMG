import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { ROUTES } from "../../router/routes";
import { useAuthContext } from "../../context/AuthContext";
import TrocarSenhaModal from "../../modules/auth/components/TrocarSenhaModal";

const PAGE_TITLES = {
  [ROUTES.DASHBOARD]: "Dashboard",
  [ROUTES.COLABORADORES]: "Colaboradores",
  [ROUTES.PRESENCA]: "Lista de Presenca",
  [ROUTES.FERIAS]: "Gestao de Ferias",
  [ROUTES.FROTA]: "Gestao de Frota",
  [ROUTES.COMISSAO]: "Comissao de Tecnicos",
  [ROUTES.BANCO_HORAS]: "Banco de Horas",
  [ROUTES.EQUIPAMENTOS]: "Equipamentos",
  [ROUTES.REGIONAIS]: "Regionais",
  [ROUTES.AGENTES]: "Agentes Autorizados",
  [ROUTES.AGENDA]: "Agenda",
  [ROUTES.FERIADOS]: "Feriados e Calendario",
  [ROUTES.USUARIOS]: "Usuarios",
};

const PageWrapper = ({ children }) => {
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] ?? "Gestao Retiradas";
  const { trocarSenhaObrigatorio } = useAuthContext();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <div className="h-full w-60 shrink-0 shadow-sm">
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar title={title} />
        <main className="flex-1 overflow-y-auto p-6">
          {children || <Outlet />}
        </main>
      </div>

      {trocarSenhaObrigatorio && (
        <TrocarSenhaModal obrigatorio={true} onClose={() => {}} />
      )}
    </div>
  );
};

export default PageWrapper;
