import { KeyRound, Lock, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	confirmFinanTotpSetup,
	disableFinanTotp,
	fetchFinanTotpStatus,
	startFinanTotpSetup,
	uploadFinanOwnAvatar,
} from "../api/finanApi";
import { FINAN_ROUTES } from "../routes";
import { useFinanAuth } from "../state/FinanAuthContext";
import UserAvatar from "./UserAvatar";

const cardClass = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";
const actionButtonClass =
	"inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 sm:w-auto";

// Pagina "Geral" para quem NAO tem finan.configuracoes.view — ao contrario
// da pagina admin (compartilhada com o app principal, nunca tocada aqui
// pra evitar instabilidade cruzada), esta e 100% propria do Finan e so
// mexe nos dados do PROPRIO usuario: avatar, senha e PIN de bloqueio.
// Layout todo em Tailwind (flex-col por padrao, linha so a partir de sm) —
// as classes legadas finan-card-heading/finan-user-row esperam um icone de
// 44px como primeiro filho, nao um avatar de foto, e quebravam no mobile.
export default function FinanMyAccountPage() {
	const { user, refresh } = useFinanAuth();
	const navigate = useNavigate();
	const fileInputRef = useRef(null);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState("");
	const [totpStatus, setTotpStatus] = useState(null);
	const [totpSetup, setTotpSetup] = useState(null);
	const [totpCode, setTotpCode] = useState("");
	const [totpBusy, setTotpBusy] = useState(false);
	const [totpMessage, setTotpMessage] = useState("");
	const [totpError, setTotpError] = useState("");

	useEffect(() => {
		let active = true;
		fetchFinanTotpStatus()
			.then((status) => {
				if (active) setTotpStatus(status);
			})
			.catch(() => null);
		return () => {
			active = false;
		};
	}, []);

	const pickAvatar = () => fileInputRef.current?.click();

	const onAvatarSelected = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setError("");
		setUploading(true);
		try {
			await uploadFinanOwnAvatar(file);
			await refresh();
		} catch (err) {
			setError(err?.message || "Não foi possível enviar o avatar.");
		} finally {
			setUploading(false);
		}
	};

	const startAuthenticator = async () => {
		setTotpBusy(true);
		setTotpError("");
		setTotpMessage("");
		try {
			setTotpSetup(await startFinanTotpSetup());
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
			await confirmFinanTotpSetup(totpSetup.setupToken, totpCode);
			setTotpStatus({ totpEnabled: true, method: "totp" });
			setTotpSetup(null);
			setTotpCode("");
			setTotpMessage("Autenticador habilitado. O MFA por e-mail foi desabilitado para sua conta.");
			await refresh?.();
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
			await disableFinanTotp(totpCode);
			setTotpStatus({ totpEnabled: false, method: "email" });
			setTotpCode("");
			setTotpMessage("Autenticador desabilitado. O MFA por e-mail voltou a ser usado.");
			await refresh?.();
		} catch (err) {
			setTotpError(err?.message || "Código inválido.");
		} finally {
			setTotpBusy(false);
		}
	};

	return (
		<section className="mx-auto flex max-w-2xl flex-col gap-5">
			<div>
				<h1 className="text-xl font-black text-slate-950">Minha conta</h1>
				<p className="text-sm text-slate-500">Seu avatar, sua senha e seu PIN de bloqueio.</p>
			</div>

			<div className={cardClass}>
				<div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
					<UserAvatar
						src={user?.avatarUrl}
						name={user?.name}
						email={user?.email}
						className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-blue-600 text-sm font-black text-white"
					/>
					<div className="min-w-0">
						<p className="truncate font-black text-slate-950">{user?.name || "Usuário"}</p>
						<p className="truncate text-sm text-slate-500">{user?.email}</p>
					</div>
					<div className="w-full sm:ml-auto sm:w-auto">
						<input
							ref={fileInputRef}
							type="file"
							accept="image/png,image/jpeg,image/webp,image/gif"
							hidden
							onChange={onAvatarSelected}
						/>
						<button
							type="button"
							onClick={pickAvatar}
							disabled={uploading}
							className={actionButtonClass}
						>
							<Upload size={16} />
							{uploading ? "Enviando..." : "Trocar avatar"}
						</button>
					</div>
				</div>
				{error ? <div className="finan-error mt-4">{error}</div> : null}
			</div>

			<div className={cardClass}>
				<h2 className="font-black text-slate-950">Segurança</h2>
				<p className="mt-1 text-sm text-slate-500">
					Troque sua senha ou seu PIN de bloqueio quando quiser.
				</p>
				<div className="mt-4 flex flex-col gap-3 sm:flex-row">
					<button
						type="button"
						onClick={() => navigate(FINAN_ROUTES.PASSWORD_CHANGE)}
						className={actionButtonClass}
					>
						<Lock size={16} />
						Trocar senha
					</button>
					<button
						type="button"
						onClick={() => navigate(FINAN_ROUTES.PIN_SETUP)}
						className={actionButtonClass}
					>
						<KeyRound size={16} />
						Configurar / trocar PIN
					</button>
				</div>
			</div>

			<div className={cardClass}>
				<div className="flex items-start gap-3">
					<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
						<ShieldCheck size={20} />
					</span>
					<div>
						<h2 className="font-black text-slate-950">Autenticador</h2>
						<p className="mt-1 text-sm text-slate-500">
							Use Google Authenticator, Microsoft Authenticator, 1Password ou similar. Ao habilitar, o MFA por e-mail é desligado automaticamente.
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
						<button type="button" disabled={totpBusy || totpCode.length !== 6} onClick={confirmAuthenticator} className={actionButtonClass}>Habilitar autenticador</button>
					</div>
				) : totpStatus?.totpEnabled ? (
					<div className="mt-4 grid gap-3">
						<input value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="Código atual" className="h-12 rounded-xl border border-slate-200 px-4 text-center text-xl font-black tracking-[0.25em]" />
						<button type="button" disabled={totpBusy || totpCode.length !== 6} onClick={disableAuthenticator} className={actionButtonClass}>Desabilitar e voltar para e-mail</button>
					</div>
				) : (
					<button type="button" disabled={totpBusy} onClick={startAuthenticator} className={`${actionButtonClass} mt-4`}>
						Adicionar autenticador
					</button>
				)}
				{totpMessage ? <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{totpMessage}</p> : null}
				{totpError ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{totpError}</p> : null}
			</div>
		</section>
	);
}
