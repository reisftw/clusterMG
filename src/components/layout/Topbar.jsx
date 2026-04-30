import { Sun, Moon, Bell } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { useSystem } from "../../context/SystemContext";
import { useAuthContext } from "../../context/AuthContext";

const Topbar = ({ title }) => {
  const { isDark, toggleTheme } = useTheme();
  const { sistema, trocarSistema } = useSystem();
  const { currentUser } = useAuthContext();

  const isAdmin = currentUser?.role?.toLowerCase() === "admin";
  const isFS = sistema === "fs";

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
      {/* Título */}
      <div className="flex items-center gap-3">
        <div
          className={`w-1 h-6 rounded-full bg-gradient-to-b ${isFS ? "from-blue-500 to-blue-300" : "from-orange-500 to-orange-300"}`}
        />
        <h2 className="text-lg font-bold text-blue-700">{title}</h2>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2">
        {/* Switcher — só admin vê */}
        {isAdmin && (
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1 mr-1">
            <button
              onClick={() => trocarSistema("retiradas")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !isFS
                  ? "bg-white text-orange-600 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              📦 Retiradas
            </button>
            <button
              onClick={() => trocarSistema("fs")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isFS
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              🔧 Field Service
            </button>
          </div>
        )}

        <button className="relative p-2.5 rounded-xl text-gray-400 hover:bg-orange-50 hover:text-orange-500 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full" />
        </button>

        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
            isFS
              ? "bg-gradient-to-r from-blue-50 to-blue-100 border-blue-100"
              : "bg-gradient-to-r from-orange-50 to-orange-100 border-orange-100"
          }`}
        >
          <img
            src="https://i.ibb.co/3mckLZfk/favicon.png"
            alt="Logo"
            className="w-6 h-6 rounded-full"
          />
          <span
            className={`text-xs font-semibold ${isFS ? "text-blue-700" : "text-orange-700"}`}
          >
            {isFS ? "Field Service" : "Retiradas"}
          </span>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
