import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { ROUTES } from "../../../router/routes";
import { obterConfigAntiBot, solicitarRedefinicaoSenha } from "../services/authService";
import TurnstileWidget from "./TurnstileWidget";

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
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
    if (antiBotConfig.enabled && !turnstileToken) {
      setMessage("Conclua a verificacao anti-bot para continuar.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await solicitarRedefinicaoSenha(email, turnstileToken);
      setMessage("Se o e-mail estiver cadastrado, enviamos um link de redefinicao.");
    } catch (error) {
      setMessage(error?.message || "Nao foi possivel solicitar a redefinicao.");
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
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <Mail size={26} />
          </span>
          <h1 className="mt-5 text-3xl font-black text-slate-950">Redefinir senha</h1>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
            Informe seu e-mail cadastrado. Enviaremos um link seguro com validade de 30 minutos.
          </p>
        </div>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="seu@email.com"
            className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-bold text-slate-900 outline-none focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
          {message ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
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
            disabled={loading}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 text-base font-black text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600 disabled:opacity-60"
          >
            <Send size={20} />
            {loading ? "Enviando..." : "Enviar link"}
          </button>
        </form>
      </section>
    </div>
  );
};

export default ForgotPasswordPage;
