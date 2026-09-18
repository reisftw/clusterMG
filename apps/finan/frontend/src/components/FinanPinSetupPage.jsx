import { AlertTriangle, KeyRound, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { setupFinanPin } from "../api/finanApi";
import { useFinanPinLock } from "../state/FinanPinLockContext";
import FinanPinDigitsInput from "./FinanPinDigitsInput";

const inputClass =
	"w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 tracking-widest outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

// Cadastro/troca do PIN de bloqueio pessoal, em modal centralizado (mesmo
// padrao visual do FinanWelcomeModal). Usado tanto no primeiro acesso
// (obrigatório, sem `onClose`/`currentPin`) quanto para trocar depois, pelo
// botao no cabecalho (com `requireCurrentPin` + `onClose` para cancelar).
export default function FinanPinSetupPage({ requireCurrentPin = false, onDone, onClose }) {
	const { refreshPinStatus } = useFinanPinLock();
	const [currentPin, setCurrentPin] = useState("");
	const [pin, setPin] = useState("");
	const [confirmPin, setConfirmPin] = useState("");
	const [secretWord, setSecretWord] = useState("");
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(false);
	const [saving, setSaving] = useState(false);

	const submit = async (event) => {
		event.preventDefault();
		setError("");
		if (!/^\d{6}$/.test(pin)) {
			setError("O PIN deve ter exatamente 6 dígitos.");
			return;
		}
		if (pin !== confirmPin) {
			setError("A confirmação do PIN não confere.");
			return;
		}
		if (secretWord.trim().length < 3) {
			setError("A palavra secreta precisa ter pelo menos 3 caracteres.");
			return;
		}
		setSaving(true);
		try {
			await setupFinanPin({
				pin,
				secretWord,
				currentPin: requireCurrentPin ? currentPin : undefined,
			});
			setSuccess(true);
			await refreshPinStatus();
			onDone?.();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o PIN.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className="fixed inset-0 z-layout-modal flex items-center justify-center p-3 sm:p-4"
			role="presentation"
		>
			<button
				type="button"
				className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
				onClick={onClose}
				aria-label="Fundo do modal"
				disabled={!onClose}
			/>
			<section
				role="dialog"
				aria-modal="true"
				aria-label={requireCurrentPin ? "Trocar PIN de bloqueio" : "Configure seu PIN de bloqueio"}
				className="relative w-[min(92vw,480px)] overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-3xl"
			>
				{onClose ? (
					<button
						type="button"
						onClick={onClose}
						className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
						aria-label="Cancelar"
					>
						<X size={18} />
					</button>
				) : null}

				<div className="flex flex-col items-center gap-2 border-b border-slate-100 px-6 pb-5 pt-8 text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<KeyRound size={24} />
					</div>
					<h2 className="text-lg font-black text-slate-950">
						{requireCurrentPin ? "Trocar PIN de bloqueio" : "Configure seu PIN de bloqueio"}
					</h2>
					<p className="text-sm text-slate-500">
						O PIN protege o Finan sempre que o app volta de segundo plano. Guarde
						também a palavra secreta — ela é exigida para recuperar a conta por
						e-mail.
					</p>
				</div>

				<form onSubmit={submit} className="flex flex-col gap-4 px-6 py-6">
					{requireCurrentPin ? (
						<Field label="PIN atual">
							<FinanPinDigitsInput value={currentPin} onChange={setCurrentPin} label="PIN atual" />
						</Field>
					) : null}
					<Field label="Novo PIN (6 dígitos)">
						<FinanPinDigitsInput value={pin} onChange={setPin} label="Novo PIN" />
					</Field>
					<Field label="Confirme o novo PIN">
						<FinanPinDigitsInput value={confirmPin} onChange={setConfirmPin} label="Confirmar novo PIN" />
					</Field>
					<Field label="Palavra secreta (usada para recuperar a conta)">
						<input
							type="text"
							className={inputClass}
							value={secretWord}
							onChange={(event) => setSecretWord(event.target.value)}
							placeholder="Ex.: uma palavra que só você saberia"
						/>
					</Field>

					{error ? (
						<div className="finan-error" role="alert">
							<AlertTriangle size={17} />
							<span>{error}</span>
						</div>
					) : null}
					{success ? (
						<div className="finan-success" role="status">
							<ShieldCheck size={17} />
							<span>PIN salvo com sucesso.</span>
						</div>
					) : null}

					<button
						type="submit"
						disabled={saving}
						className="mt-1 w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:from-orange-600 hover:to-orange-700 disabled:opacity-60"
					>
						{saving ? "Salvando..." : "Salvar PIN"}
					</button>
				</form>
			</section>
		</div>
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
