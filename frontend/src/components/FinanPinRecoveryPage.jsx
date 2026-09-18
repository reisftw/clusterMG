import { AlertTriangle, KeyRound } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { confirmFinanPinRecovery, requestFinanPinRecovery } from "../api/finanApi";
import { FINAN_ROUTES } from "../routes";
import FinanPinDigitsInput from "./FinanPinDigitsInput";

const inputClass =
	"w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

// Rota publica /pin-recovery. Sem ?token= pede o e-mail (dispara o link);
// com ?token= pede a palavra secreta + PIN novo para concluir. Mesmo padrao
// visual de modal centralizado do FinanWelcomeModal, ja que essa tela nao
// tem o cabecalho/menu do Finan em volta (usuario ainda esta deslogado ou
// com a conta bloqueada).
export default function FinanPinRecoveryPage() {
	const [searchParams] = useSearchParams();
	const token = searchParams.get("token") || "";
	return (
		<div className="fixed inset-0 z-layout-modal flex min-h-screen items-center justify-center bg-slate-100 p-3 sm:p-4">
			<section
				role="dialog"
				aria-label="Recuperar acesso do Finan"
				className="relative w-[min(92vw,480px)] overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-3xl"
			>
				<div className="flex flex-col items-center gap-2 border-b border-slate-100 px-6 pb-5 pt-8 text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<KeyRound size={24} />
					</div>
					<h2 className="text-lg font-black text-slate-950">
						{token ? "Definir novo PIN" : "Recuperar acesso do Finan"}
					</h2>
					<p className="text-sm text-slate-500">
						{token
							? "Informe a palavra secreta cadastrada e escolha um novo PIN de 6 dígitos."
							: "Informe o e-mail da conta bloqueada por tentativas de PIN inválidas."}
					</p>
				</div>
				{token ? <ConfirmStep token={token} /> : <RequestStep />}
			</section>
		</div>
	);
}

function RequestStep() {
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState("");
	const [sending, setSending] = useState(false);

	const submit = async (event) => {
		event.preventDefault();
		setSending(true);
		try {
			const result = await requestFinanPinRecovery(email);
			setMessage(
				result.message || "Se a conta estiver bloqueada, enviaremos instruções por e-mail.",
			);
		} catch (err) {
			setMessage(err?.message || "Não foi possível processar a solicitação.");
		} finally {
			setSending(false);
		}
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-4 px-6 py-6">
			<Field label="E-mail">
				<input
					type="email"
					className={inputClass}
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					placeholder="seu@email.com"
					required
				/>
			</Field>
			<button
				type="submit"
				disabled={sending}
				className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:from-orange-600 hover:to-orange-700 disabled:opacity-60"
			>
				{sending ? "Enviando..." : "Enviar instruções"}
			</button>
			{message ? <p className="text-center text-sm text-slate-500">{message}</p> : null}
		</form>
	);
}

function ConfirmStep({ token }) {
	const navigate = useNavigate();
	const [secretWord, setSecretWord] = useState("");
	const [newPin, setNewPin] = useState("");
	const [confirmPin, setConfirmPin] = useState("");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);

	const submit = async (event) => {
		event.preventDefault();
		setError("");
		if (!/^\d{6}$/.test(newPin)) {
			setError("O PIN novo deve ter exatamente 6 dígitos.");
			return;
		}
		if (newPin !== confirmPin) {
			setError("A confirmação do PIN não confere.");
			return;
		}
		setSaving(true);
		try {
			await confirmFinanPinRecovery({ token, secretWord, newPin });
			navigate(FINAN_ROUTES.LOGIN, { replace: true });
		} catch (err) {
			setError(err?.message || "Não foi possível concluir a recuperação.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-4 px-6 py-6">
			<Field label="Palavra secreta">
				<input
					type="text"
					className={inputClass}
					value={secretWord}
					onChange={(event) => setSecretWord(event.target.value)}
				/>
			</Field>
			<Field label="Novo PIN">
				<FinanPinDigitsInput value={newPin} onChange={setNewPin} label="Novo PIN" />
			</Field>
			<Field label="Confirme o novo PIN">
				<FinanPinDigitsInput value={confirmPin} onChange={setConfirmPin} label="Confirmar novo PIN" />
			</Field>
			{error ? (
				<div className="finan-error" role="alert">
					<AlertTriangle size={17} />
					<span>{error}</span>
				</div>
			) : null}
			<button
				type="submit"
				disabled={saving}
				className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:from-orange-600 hover:to-orange-700 disabled:opacity-60"
			>
				{saving ? "Salvando..." : "Definir novo PIN"}
			</button>
		</form>
	);
}

function Field({ label, children }) {
	return (
		<label className="flex flex-col gap-1.5 text-left">
			<span className="text-xs font-bold uppercase tracking-wide text-slate-500">
				{label}
			</span>
			{children}
		</label>
	);
}
