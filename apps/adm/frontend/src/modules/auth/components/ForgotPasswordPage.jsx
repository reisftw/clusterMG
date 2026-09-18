import { Mail, Send } from "lucide-react";
import { useState } from "react";
import { useAntiBotChallenge } from "../hooks/useAntiBotChallenge";
import { solicitarRedefinicaoSenha } from "../services/authService";
import AuthRecoveryCard from "./AuthRecoveryCard";
import TurnstileWidget from "./TurnstileWidget";

const ForgotPasswordPage = () => {
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const [message, setMessage] = useState("");
	const {
		antiBotConfig,
		turnstileToken,
		turnstileResetKey,
		setTurnstileToken,
		resetAntiBot,
	} = useAntiBotChallenge();

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
			setMessage(
				"Se o e-mail estiver cadastrado, enviamos um link de redefinicao.",
			);
		} catch (error) {
			setMessage(error?.message || "Nao foi possivel solicitar a redefinicao.");
		} finally {
			setLoading(false);
			resetAntiBot();
		}
	};

	return (
		<AuthRecoveryCard
			icon={<Mail size={26} />}
			title="Redefinir senha"
			description="Informe seu e-mail cadastrado. Enviaremos um link seguro com validade de 30 minutos."
		>
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
		</AuthRecoveryCard>
	);
};

export default ForgotPasswordPage;
