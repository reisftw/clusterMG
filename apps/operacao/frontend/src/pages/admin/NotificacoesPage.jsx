import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, Mail, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { fetchRotNotifications, saveRotMfaPreference } from "../../api/rotApi";
import { useRotAuth } from "../../state/RotAuthContext";
import Spinner from "../../components/ui/Spinner";

const TYPE_LABEL = {
	welcome_first_access: "Boas-vindas / primeiro acesso",
	mfa_login_code: "Código de login (MFA)",
	password_reset: "Redefinição de senha",
	password_changed: "Senha alterada",
	smtp_test: "Teste de e-mail",
};

// O Operação ainda não tem um sininho de notificações internas (o Finan/
// Retiradas têm um sistema próprio pra isso). Em vez de simular um que
// não faz nada, esta página mostra o que já existe de verdade: os
// e-mails reais enviados pra sua conta, e deixa você controlar o MFA por
// e-mail — mesmo espírito da aba "Notificações" do Retiradas, aplicado
// ao que a Operação realmente tem hoje.
export default function NotificacoesPage() {
	const { user, refreshUser } = useRotAuth();
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [mfaBusy, setMfaBusy] = useState(false);
	const [mfaError, setMfaError] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showConfirm, setShowConfirm] = useState(false);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setItems(await fetchRotNotifications());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar suas notificações.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleToggleMfa = async () => {
		setMfaError("");
		if (user?.mfaEnabled !== false) {
			// Desativar exige confirmar a senha atual.
			setShowConfirm(true);
			return;
		}
		setMfaBusy(true);
		try {
			await saveRotMfaPreference(true);
			await refreshUser?.();
		} catch (err) {
			setMfaError(err?.message || "Não foi possível atualizar a preferência.");
		} finally {
			setMfaBusy(false);
		}
	};

	const confirmDisableMfa = async (event) => {
		event.preventDefault();
		setMfaBusy(true);
		setMfaError("");
		try {
			await saveRotMfaPreference(false, confirmPassword);
			await refreshUser?.();
			setShowConfirm(false);
			setConfirmPassword("");
		} catch (err) {
			setMfaError(err?.message || "Não foi possível desativar o MFA.");
		} finally {
			setMfaBusy(false);
		}
	};

	if (loading) return <Spinner fullScreen />;

	const mfaOn = user?.mfaEnabled !== false;

	return (
		<div className="space-y-5">
			<section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-4">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white">
						<BellRing size={24} />
					</div>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Notificações</h1>
						<p className="text-sm font-semibold text-slate-500">Segurança de login e histórico de e-mails enviados para você.</p>
					</div>
				</div>
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${mfaOn ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
							{mfaOn ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
						</div>
						<div>
							<h2 className="text-lg font-black text-slate-950">Código de segurança por e-mail (MFA)</h2>
							<p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
								{mfaOn
									? "Ativado: a cada login, enviamos um código de 6 dígitos para o seu e-mail."
									: "Desativado: o login não pede código extra por e-mail."}
								{!user?.email ? " Cadastre um e-mail no seu perfil para poder usar essa proteção." : ""}
							</p>
						</div>
					</div>
					<button
						type="button"
						disabled={mfaBusy || !user?.email}
						onClick={handleToggleMfa}
						className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white shadow-sm transition disabled:opacity-60 ${
							mfaOn ? "bg-slate-700 hover:bg-slate-800" : "bg-emerald-600 hover:bg-emerald-700"
						}`}
					>
						{mfaBusy ? "Aguarde..." : mfaOn ? "Desativar MFA" : "Ativar MFA"}
					</button>
				</div>
				{mfaError ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{mfaError}</p> : null}

				{showConfirm ? (
					<form onSubmit={confirmDisableMfa} className="mt-4 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-end">
						<label className="flex-1">
							<span className="mb-1 block text-xs font-black uppercase text-amber-800">Confirme sua senha para desativar o MFA</span>
							<input
								type="password"
								value={confirmPassword}
								onChange={(event) => setConfirmPassword(event.target.value)}
								className="h-10 w-full rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
								required
							/>
						</label>
						<div className="flex gap-2">
							<button type="button" onClick={() => setShowConfirm(false)} className="h-10 rounded-lg border border-amber-300 bg-white px-4 text-xs font-black text-amber-800 hover:bg-amber-100">
								Cancelar
							</button>
							<button type="submit" disabled={mfaBusy} className="h-10 rounded-lg bg-amber-600 px-4 text-xs font-black text-white hover:bg-amber-700 disabled:opacity-60">
								Confirmar
							</button>
						</div>
					</form>
				) : null}
			</section>

			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
						<Mail size={20} />
					</div>
					<div>
						<h2 className="text-lg font-black text-slate-950">E-mails recentes</h2>
						<p className="text-sm font-semibold text-slate-500">Últimos e-mails enviados para {user?.email || "sua conta"}.</p>
					</div>
				</div>

				{error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p> : null}

				<div className="mt-4 space-y-2">
					{items.map((item) => (
						<div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
							<div className="min-w-0">
								<p className="truncate text-sm font-black text-slate-900">{TYPE_LABEL[item.type] || item.subject || item.type}</p>
								<p className="text-xs font-semibold text-slate-500">
									{new Date(item.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
								</p>
							</div>
							{item.status === "enviado" ? (
								<span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
									<CheckCircle2 size={13} /> Enviado
								</span>
							) : (
								<span className="flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-black text-red-700">
									<XCircle size={13} /> Falhou
								</span>
							)}
						</div>
					))}
					{!items.length ? <p className="text-sm font-semibold text-slate-400">Nenhum e-mail enviado para você ainda.</p> : null}
				</div>
			</section>
		</div>
	);
}
