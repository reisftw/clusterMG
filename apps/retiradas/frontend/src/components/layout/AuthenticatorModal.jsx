import { ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
	confirmarConfiguracaoAutenticador,
	desabilitarAutenticador,
	iniciarConfiguracaoAutenticador,
	obterStatusAutenticador,
} from "../../modules/auth/services/authService";

export default function AuthenticatorModal({ open, onClose }) {
	const [status, setStatus] = useState(null);
	const [setup, setSetup] = useState(null);
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		if (!open) return undefined;
		let active = true;
		setCode("");
		setSetup(null);
		setMessage("");
		setError("");
		obterStatusAutenticador()
			.then((nextStatus) => {
				if (active) setStatus(nextStatus);
			})
			.catch((err) => {
				if (active) setError(err?.message || "Não foi possível carregar o MFA.");
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
			setSetup(await iniciarConfiguracaoAutenticador());
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
			setStatus(await confirmarConfiguracaoAutenticador({ setupToken: setup.setupToken, code }));
			setSetup(null);
			setCode("");
			setMessage("Autenticador habilitado. O MFA por e-mail foi desabilitado.");
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
			setStatus(await desabilitarAutenticador(code));
			setCode("");
			setMessage("Autenticador desabilitado. O MFA por e-mail voltou a ser usado.");
		} catch (err) {
			setError(err?.message || "Código inválido.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-4">
			<div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-start gap-3">
						<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
							<ShieldCheck size={20} />
						</span>
						<div>
							<h2 className="text-lg font-black text-slate-950">Autenticador</h2>
							<p className="mt-1 text-sm font-semibold text-slate-500">
								Leia o QR Code no app autenticador. Ao habilitar, o MFA por e-mail é desligado automaticamente.
							</p>
						</div>
					</div>
					<button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
						<X size={18} />
					</button>
				</div>
				<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">
					Método atual: {status?.totpEnabled ? "App autenticador" : "E-mail"}
				</div>
				{setup ? (
					<div className="mt-4 grid gap-4">
						<img src={setup.qrDataUrl} alt="QR Code do autenticador" className="h-48 w-48 rounded-xl border border-slate-200 bg-white p-2" />
						<p className="break-all rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-500">{setup.secret}</p>
						<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="000000" className="h-12 rounded-xl border border-slate-200 px-4 text-center text-xl font-black tracking-[0.25em]" />
						<button type="button" disabled={busy || code.length !== 6} onClick={confirmSetup} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">Habilitar autenticador</button>
					</div>
				) : status?.totpEnabled ? (
					<div className="mt-4 grid gap-3">
						<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="Código atual" className="h-12 rounded-xl border border-slate-200 px-4 text-center text-xl font-black tracking-[0.25em]" />
						<button type="button" disabled={busy || code.length !== 6} onClick={disableSetup} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">Desabilitar e voltar para e-mail</button>
					</div>
				) : (
					<button type="button" disabled={busy} onClick={startSetup} className="mt-4 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
						Adicionar autenticador
					</button>
				)}
				{message ? <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</p> : null}
				{error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			</div>
		</div>
	);
}
