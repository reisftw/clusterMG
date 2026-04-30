import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../../../context/AuthContext";
import { useTheme } from "../../../context/ThemeContext";
import { ROUTES } from "../../../router/routes";
import { Eye, EyeOff, LogIn, Sun, Moon } from "lucide-react";

const LoginForm = () => {
  const { login, error } = useAuthContext();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate(ROUTES.DASHBOARD);
    } catch {
      // erro tratado no useAuth
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Painel esquerdo — decorativo */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-gradient-to-br from-blue-600 via-blue-500 to-orange-400 p-12 relative overflow-hidden">
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-white/10 rounded-full" />
        <div className="absolute top-40 -right-16 w-64 h-64 bg-orange-300/20 rounded-full" />
        <div className="absolute -bottom-16 left-10 w-96 h-96 bg-blue-400/20 rounded-full" />

        {/* Logo da empresa */}
        <div className="flex items-center gap-3 relative">
          <img
            src="https://i.ibb.co/wNzqPhf0/logo.webp"
            alt="Logo"
            className="h-10 object-contain drop-shadow-md"
          />
        </div>

        {/* Texto central */}
        <div className="relative">
          <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Controle total
            <br />
            <span className="text-orange-200">na palma da mão.</span>
          </h1>
          <p className="text-white/70 text-base leading-relaxed max-w-xs">
            Gerencie colaboradores, frotas, comissões e muito mais em um único
            lugar.
          </p>
        </div>

        {/* Badges */}
        <div className="flex gap-3 relative">
          {["Férias", "Frota", "Comissão", "Presença"].map((item) => (
            <span
              key={item}
              className="px-3 py-1.5 bg-white/10 backdrop-blur text-white text-xs font-medium rounded-lg border border-white/20"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex flex-col flex-1 items-center justify-center px-6 relative">
        <button
          onClick={toggleTheme}
          className="absolute top-5 right-5 p-2.5 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="w-full max-w-sm">
          {/* Logo mobile (visível só em telas pequenas) */}
          <div className="flex justify-center mb-6 lg:hidden">
            <img
              src="https://i.ibb.co/Xk2MjZLG/logosempre.png"
              alt="Logo"
              className="h-10 object-contain"
            />
          </div>

          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-100 rounded-full mb-5">
              <div className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
              <div className="flex justify-center mb-6 lg:hidden">
                <img
                  src="https://i.ibb.co/Xk2MjZLG/logosempre.png"
                  alt="Logo"
                  className="h-10 object-contain"
                />
              </div>
              <span className="text-orange-600 text-xs font-semibold">
                Acesso Interno
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-1">
              Bem-vindo de volta 👋
            </h2>
            <p className="text-gray-400 text-sm">
              Entre com suas credenciais para continuar.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="input-field pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogIn size={16} />
              {isSubmitting ? "Entrando..." : "Entrar no sistema"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-8">
            © {new Date().getFullYear()} Gestão Retiradas — Uso interno -
            Desenvolvido por Rodrigo Reis.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
