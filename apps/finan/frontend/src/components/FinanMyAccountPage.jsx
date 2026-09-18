import { KeyRound, Lock, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadFinanOwnAvatar } from "../api/finanApi";
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
		</section>
	);
}
