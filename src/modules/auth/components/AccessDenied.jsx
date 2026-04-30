import { useNavigate } from "react-router-dom";
import { ShieldOff, ArrowLeft } from "lucide-react";
import { ROUTES } from "../../../router/routes";

const AccessDenied = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-950 text-center px-4">
      <img
        src="https://i.ibb.co/Xk2MjZLG/logosempre.png"
        alt="Logo"
        className="h-12 mb-8 object-contain"
      />

      <ShieldOff size={56} className="text-red-500 mb-4" />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Acesso Negado
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-xs">
        Você não tem permissão para acessar esta página. Contate o
        administrador.
      </p>
      <button
        onClick={() => navigate(ROUTES.DASHBOARD)}
        className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
      >
        <ArrowLeft size={16} /> Voltar ao início
      </button>
    </div>
  );
};

export default AccessDenied;
