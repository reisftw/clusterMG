import { ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
	confirmFinanTotpSetup,
	disableFinanTotp,
	fetchFinanTotpStatus,
	startFinanTotpSetup,
} from "../api/finanApi";

const buttonClass =
	"inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition disabled:cursor-wait disabled:opacity-60";

export default function FinanAuthenticatorModal({ open, onClose, onChanged }) {
	const [status, setStatus] = useState(null);
	const [setup, setSetup] = useState(null);
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		if (!open) return undefined;
		let active = true;
		setSetup(null);
		setCode("");
		setMessage("");
		setError("");
		fetchFinanTotpStatus()
			.then((nextStatus) => {
				if (active) setStatus(nextStatus);
			})
			.catch((err) => {
				if (active) setError(err?.message || "Não foi possível consultar o MFA.");
			});
		return () => {
			active = false;
		};
	}, [open]);

	if (!open) return null;

	const startSetup = async () => {
		setBusy(true);
		setError("");
		setMessage("");
		try {
			setSetup(await startFinanTotpSetup());
			setCode("");
		} catch (err) {
			setError(err?.message || "Não foi possível gerar o QR Code.");
		} finally {
			setBusy(false);
		}
	};

	const confirmSetup = async () => {
		if (!setup?.setupToken || code.length !== 6) return;
		setBusy(true);
		setError("");
		try {
			await confirmFinanTotpSetup(setup.setupToken, code);
			setStatus({ totpEnabled: true, method: "totp" });
			setSetup(null);
			setCode("");
			setMessage("Autenticador habilitado. O MFA por e-mail foi desabilitado.");
			await onChanged?.();
		} catch (err) {
			setError(err?.message || "Código inválido.");
		} finally {
			setBusy(false);
		}
	};

	const disableSetup = async () => {
		if (code.length !== 6) return;
		setBusy(true);
		setError("");
		try {
			await disableFinanTotp(code);
			setStatus({ totpEnabled: false, method: "email" });
			setCode("");
			setMessage("Autenticador desabilitado. O MFA por e-mail voltou a ser usado.");
			await onChanged?.();
		} catch (err) {
			setError(err?.message || "Código inválido.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
			<div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-start gap-3">
						<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
							<ShieldCheck size={20} />
						</span>
						<div>
							<h2 className="text-lg font-black text-slate-950">Autenticador</h2>
							<p className="mt-1 text-sm font-semibold text-slate-500">
								Use Google Authenticator, Microsoft Authenticator, 1Password ou similar.
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
						aria-label="Fechar"
					>
						<X size={18} />
					</button>
				</div>

				<div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700">
					Método atual: {status?.totpEnabled ? "App autenticador" : "E-mail"}
				</div>

				{setup ? (
					<div className="mt-5 grid gap-4">
						<img
							src={setup.qrDataUrl}
							alt="QR Code do autenticador"
							className="h-48 w-48 rounded-xl border border-slate-200 bg-white p-2"
						/>
						<p className="break-all rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-500">
							{setup.secret}
						</p>
						<input
							value={code}
							onChange={(event) =>
								setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
							}
							inputMode="numeric"
							maxLength={6}
							placeholder="000000"
							className="h-12 rounded-xl border border-slate-200 px-4 text-center text-xl font-black tracking-[0.25em] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						/>
						<button
							type="button"
							disabled={busy || code.length !== 6}
							onClick={confirmSetup}
							className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
						>
							Habilitar autenticador
						</button>
					</div>
				) : status?.totpEnabled ? (
					<div className="mt-5 grid gap-3">
						<input
							value={code}
							onChange={(event) =>
								setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
							}
							inputMode="numeric"
							maxLength={6}
							placeholder="Código atual"
							className="h-12 rounded-xl border border-slate-200 px-4 text-center text-xl font-black tracking-[0.25em] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						/>
						<button
							type="button"
							disabled={busy || code.length !== 6}
							onClick={disableSetup}
							className={`${buttonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
						>
							Desabilitar e voltar para e-mail
						</button>
					</div>
				) : (
					<button
						type="button"
						disabled={busy}
						onClick={startSetup}
						className={`${buttonClass} mt-5 bg-blue-600 text-white hover:bg-blue-700`}
					>
						Adicionar autenticador
					</button>
				)}

				{message ? (
					<p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
						{message}
					</p>
				) : null}
				{error ? (
					<p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
						{error}
					</p>
				) : null}
			</div>
		</div>
	);
}
