import { useEffect, useState } from "react";
import { Camera, Loader, ShieldCheck } from "lucide-react";
import {
	changeRotPassword,
	confirmRotTotpSetup,
	disableRotTotp,
	fetchRotTotpStatus,
	startRotTotpSetup,
	uploadRotAvatar,
} from "../api/rotApi";
import { useRotAuth } from "../state/useRotAuth";

export default function ProfilePage() {
	const { user, refreshUser } = useRotAuth();
	const [uploading, setUploading] = useState(false);
	const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [totpStatus, setTotpStatus] = useState(null);
	const [totpSetup, setTotpSetup] = useState(null);
	const [totpCode, setTotpCode] = useState("");
	const [totpBusy, setTotpBusy] = useState(false);
	const [totpMessage, setTotpMessage] = useState("");
	const [totpError, setTotpError] = useState("");

	useEffect(() => {
		let active = true;
		fetchRotTotpStatus()
			.then((status) => {
				if (active) setTotpStatus(status);
			})
			.catch(() => null);
		return () => {
			active = false;
		};
	}, []);

	const handleAvatarChange = async (event) => {
		const file = event.target.files?.[0];
		if (!file) return;
		setUploading(true);
		setError("");
		try {
			await uploadRotAvatar(file);
			setMessage("Avatar atualizado. Atualize a página para ver a mudança em todo o sistema.");
			await refreshUser?.();
		} catch (err) {
			setError(err?.message || "Não foi possível enviar o avatar.");
		} finally {
			setUploading(false);
		}
	};

	const handlePasswordSubmit = async (event) => {
		event.preventDefault();
		setError("");
		setMessage("");
		if (passwordForm.newPassword !== passwordForm.confirm) {
			setError("As senhas não conferem.");
			return;
		}
		setSaving(true);
		try {
			await changeRotPassword(passwordForm.currentPassword, passwordForm.newPassword);
			setMessage("Senha alterada com sucesso.");
			setPasswordForm({ currentPassword: "", newPassword: "", confirm: "" });
		} catch (err) {
			setError(err?.message || "Não foi possível alterar a senha.");
		} finally {
			setSaving(false);
		}
	};

	const startAuthenticator = async () => {
		setTotpBusy(true);
		setTotpError("");
		setTotpMessage("");
		try {
			setTotpSetup(await startRotTotpSetup());
			setTotpCode("");
		} catch (err) {
			setTotpError(err?.message || "Não foi possível gerar o QR Code.");
		} finally {
			setTotpBusy(false);
		}
	};

	const confirmAuthenticator = async () => {
		if (!totpSetup?.setupToken || totpCode.length !== 6) return;
		setTotpBusy(true);
		setTotpError("");
		try {
			const result = await confirmRotTotpSetup(totpSetup.setupToken, totpCode);
			setTotpStatus({ totpEnabled: true, method: "totp" });
			setTotpSetup(null);
			setTotpCode("");
			setTotpMessage("Autenticador habilitado. O MFA por e-mail foi desabilitado.");
			await refreshUser?.(result.user);
		} catch (err) {
			setTotpError(err?.message || "Código inválido.");
		} finally {
			setTotpBusy(false);
		}
	};

	const disableAuthenticator = async () => {
		if (totpCode.length !== 6) return;
		setTotpBusy(true);
		setTotpError("");
		try {
			await disableRotTotp(totpCode);
			setTotpStatus({ totpEnabled: false, method: "email" });
			setTotpCode("");
			setTotpMessage("Autenticador desabilitado. O MFA por e-mail voltou a ser usado.");
			await refreshUser?.();
		} catch (err) {
			setTotpError(err?.message || "Código inválido.");
		} finally {
			setTotpBusy(false);
		}
	};

	return (
		<div className="mx-auto max-w-2xl space-y-6">
			<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<h1 className="text-xl font-black text-slate-950">Meu perfil</h1>
				<div className="mt-4 flex items-center gap-4">
					<div className="relative">
						{user?.avatarUrl ? (
							<img src={user.avatarUrl} alt={user.name} className="h-20 w-20 rounded-full object-cover" />
						) : (
							<div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-2xl font-black text-blue-700">
								{user?.name?.charAt(0)}
							</div>
						)}
						<label className="absolute bottom-0 right-0 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-orange-500 text-white shadow-lg hover:bg-orange-600">
							{uploading ? <Loader size={14} className="animate-spin" /> : <Camera size={14} />}
							<input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} disabled={uploading} />
						</label>
					</div>
					<div>
						<p className="font-black text-slate-950">{user?.name}</p>
						<p className="text-sm font-semibold text-slate-500">@{user?.username}</p>
						<p className="text-xs font-bold uppercase text-blue-600">{user?.roleName}</p>
					</div>
				</div>
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
				<h2 className="text-lg font-black text-slate-950">Alterar senha</h2>
				{error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
				{message ? <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</p> : null}
				<form onSubmit={handlePasswordSubmit} className="mt-4 grid gap-3">
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Senha atual</span>
						<input
							type="password"
							required
							value={passwordForm.currentPassword}
							onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
							className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						/>
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Nova senha</span>
						<input
							type="password"
							required
							minLength={8}
							value={passwordForm.newPassword}
							onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
							className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						/>
					</label>
					<label>
						<span className="mb-1 block text-xs font-black uppercase text-slate-500">Confirmar nova senha</span>
						<input
							type="password"
							required
							minLength={8}
							value={passwordForm.confirm}
							onChange={(event) => setPasswordForm((current) => ({ ...current, confirm: event.target.value }))}
							className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						/>
					</label>
					<button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
						{saving ? "Salvando..." : "Alterar senha"}
					</button>
				</form>
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
				<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">
					Método atual: {totpStatus?.totpEnabled ? "App autenticador" : "E-mail"}
				</div>
				{totpSetup ? (
					<div className="mt-4 grid gap-4">
						<img src={totpSetup.qrDataUrl} alt="QR Code do autenticador" className="h-48 w-48 rounded-xl border border-slate-200 bg-white p-2" />
						<p className="break-all rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-500">{totpSetup.secret}</p>
						<input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="000000" className="h-12 rounded-xl border border-slate-200 px-4 text-center text-xl font-black tracking-[0.25em]" />
						<button type="button" disabled={totpBusy || totpCode.length !== 6} onClick={confirmAuthenticator} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">Habilitar autenticador</button>
					</div>
				) : totpStatus?.totpEnabled ? (
					<div className="mt-4 grid gap-3">
						<input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="Código atual" className="h-12 rounded-xl border border-slate-200 px-4 text-center text-xl font-black tracking-[0.25em]" />
						<button type="button" disabled={totpBusy || totpCode.length !== 6} onClick={disableAuthenticator} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">Desabilitar e voltar para e-mail</button>
					</div>
				) : (
					<button type="button" disabled={totpBusy} onClick={startAuthenticator} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
						Adicionar autenticador
					</button>
				)}
				{totpMessage ? <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{totpMessage}</p> : null}
				{totpError ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{totpError}</p> : null}
			</div>
		</div>
	);
}
