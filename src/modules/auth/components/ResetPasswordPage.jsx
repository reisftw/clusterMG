import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import { ROUTES } from "../../../router/routes";
import { obterConfigAntiBot, redefinirSenhaComToken } from "../services/authService";
import TurnstileWidget from "./TurnstileWidget";

const ResetPasswordPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => params.get("token") || "", [params]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [antiBotConfig, setAntiBotConfig] = useState({ enabled: false, provider: "turnstile", siteKey: "" });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  useEffect(() => {
    let active = true;
    obterConfigAntiBot()
      .then((config) => {
        if (active) setAntiBotConfig(config || { enabled: false, provider: "turnstile", siteKey: "" });
      })
      .catch(() => {
        if (active) setAntiBotConfig({ enabled: false, provider: "turnstile", siteKey: "" });
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setMessage("As senhas nao conferem.");
      return;
    }
    if (antiBotConfig.enabled && !turnstileToken) {
      setMessage("Conclua a verificacao anti-bot para continuar.");
      return;
    }
    setLoading(true);
    try {
      await redefinirSenhaComToken(token, password, turnstileToken);
      setDone(true);
      setMessage("Senha definida com sucesso. Voce ja pode entrar.");
      setTimeout(() => navigate(ROUTES.LOGIN), 1800);
    } catch (error) {
      setMessage(error?.message || "Nao foi possivel redefinir a senha.");
    } finally {
      setLoading(false);
      if (antiBotConfig.enabled) {
        setTurnstileToken("");
        setTurnstileResetKey((current) => current + 1);
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#082b55,#061f3f_48%,#04162c)] px-5 py-10">
      <section className="w-full max-w-lg rounded-[28px] border border-white/80 bg-white/95 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.32)]">
        <Link to={ROUTES.LOGIN} className="inline-flex items-center gap-2 text-sm font-black text-blue-700 hover:text-blue-800">
          <ArrowLeft size={17} />
          Voltar para login
        </Link>
        <div className="mt-8 text-center">
          <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${done ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
            {done ? <CheckCircle2 size={26} /> : <Lock size={26} />}
          </span>
          <h1 className="mt-5 text-3xl font-black text-slate-950">Criar nova senha</h1>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
            Defina uma senha segura para acessar o Retiradas.
          </p>
        </div>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Nova senha"
            className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-bold text-slate-900 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
          <input
            type="password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Confirmar senha"
            className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-bold text-slate-900 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
          {message ? (
            <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${done ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-blue-100 bg-blue-50 text-blue-800"}`}>
              {message}
            </div>
          ) : null}
          <TurnstileWidget
            config={antiBotConfig}
            resetKey={turnstileResetKey}
            onTokenChange={setTurnstileToken}
          />
          <button
            type="submit"
            disabled={loading || done || !token}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 text-base font-black text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600 disabled:opacity-60"
          >
            <Lock size={20} />
            {loading ? "Salvando..." : "Definir senha"}
          </button>
        </form>
      </section>
    </div>
  );
};

export default ResetPasswordPage;
