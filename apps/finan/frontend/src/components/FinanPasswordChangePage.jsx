import { AlertTriangle, Lock as LockIcon, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { changeFinanPassword } from "../api/finanApi";

const inputClass =
	"w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

// Modal centralizado de troca da propria senha (mesmo padrao visual do
// FinanWelcomeModal/FinanPinSetupPage). Exige a senha atual — diferente do
// fluxo "esqueci minha senha" da tela de login, que usa token por e-mail.
export default function FinanPasswordChangePage({ onDone, onClose }) {
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(false);
	const [saving, setSaving] = useState(false);

	const submit = async (event) => {
		event.preventDefault();
		setError("");
		if (newPassword.length < 8) {
			setError("A nova senha precisa ter pelo menos 8 caracteres.");
			return;
		}
		if (newPassword !== confirmPassword) {
			setError("A confirmação da senha não confere.");
			return;
		}
		setSaving(true);
		try {
			await changeFinanPassword({ currentPassword, newPassword });
			setSuccess(true);
			onDone?.();
		} catch (err) {
			setError(err?.message || "Não foi possível trocar a senha.");
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
				aria-label="Trocar senha"
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
						<LockIcon size={24} />
					</div>
					<h2 className="text-lg font-black text-slate-950">Trocar senha</h2>
					<p className="text-sm text-slate-500">
						Informe sua senha atual e escolha uma nova senha para acessar o Finan.
					</p>
				</div>

				<form onSubmit={submit} className="flex flex-col gap-4 px-6 py-6">
					<Field label="Senha atual">
						<input
							type="password"
							className={inputClass}
							value={currentPassword}
							onChange={(event) => setCurrentPassword(event.target.value)}
							autoComplete="current-password"
						/>
					</Field>
					<Field label="Nova senha (mínimo 8 caracteres)">
						<input
							type="password"
							className={inputClass}
							value={newPassword}
							onChange={(event) => setNewPassword(event.target.value)}
							autoComplete="new-password"
						/>
					</Field>
					<Field label="Confirme a nova senha">
						<input
							type="password"
							className={inputClass}
							value={confirmPassword}
							onChange={(event) => setConfirmPassword(event.target.value)}
							autoComplete="new-password"
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
							<span>Senha alterada com sucesso.</span>
						</div>
					) : null}

					<button
						type="submit"
						disabled={saving}
						className="mt-1 w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:from-orange-600 hover:to-orange-700 disabled:opacity-60"
					>
						{saving ? "Salvando..." : "Salvar nova senha"}
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
