import { useState } from "react";
import { Camera, Loader } from "lucide-react";
import { changeRotPassword, uploadRotAvatar } from "../api/rotApi";
import { useRotAuth } from "../state/useRotAuth";

export default function ProfilePage() {
	const { user, refreshUser } = useRotAuth();
	const [uploading, setUploading] = useState(false);
	const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

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
		</div>
	);
}
