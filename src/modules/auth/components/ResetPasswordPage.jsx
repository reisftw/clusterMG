import { CheckCircle2, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ROUTES } from "../../../router/routes";
import { useAntiBotChallenge } from "../hooks/useAntiBotChallenge";
import { redefinirSenhaComToken } from "../services/authService";
import AuthRecoveryCard from "./AuthRecoveryCard";
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
	const {
		antiBotConfig,
		turnstileToken,
		turnstileResetKey,
		setTurnstileToken,
		resetAntiBot,
	} = useAntiBotChallenge();

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
			resetAntiBot();
		}
	};

	return (
		<AuthRecoveryCard
			icon={done ? <CheckCircle2 size={26} /> : <Lock size={26} />}
			iconClassName={
				done ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
			}
			title="Criar nova senha"
			description="Defina uma senha segura para acessar o Retiradas."
		>
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
						<div
							className={`rounded-2xl border px-4 py-3 text-sm font-bold ${done ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-blue-100 bg-blue-50 text-blue-800"}`}
						>
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
		</AuthRecoveryCard>
	);
};

export default ResetPasswordPage;
