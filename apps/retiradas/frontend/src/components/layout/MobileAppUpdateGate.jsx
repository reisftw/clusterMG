import { Download, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { getApiBaseUrl, getAppClientContext } from "../../services/vpsApiClient";

export default function MobileAppUpdateGate() {
	const [update, setUpdate] = useState(null);

	useEffect(() => {
		const context = getAppClientContext();
		if (context.mode !== "android") return undefined;
		let active = true;
		const check = async () => {
			try {
				const response = await fetch(
					`${getApiBaseUrl()}/maintenance/app/version?currentCode=${encodeURIComponent(context.code || 0)}`,
					{ cache: "no-store", credentials: "include" },
				);
				if (!response.ok) return;
				const data = await response.json();
				if (active) setUpdate(data?.updateRequired ? data : null);
			} catch {
				// A indisponibilidade temporaria nao bloqueia o trabalho do tecnico.
			}
		};
		void check();
		const onFocus = () => void check();
		window.addEventListener("focus", onFocus);
		return () => {
			active = false;
			window.removeEventListener("focus", onFocus);
		};
	}, []);

	if (!update) return null;
	const downloadUrl = new URL(update.downloadUrl, window.location.origin).href;
	return (
		<div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mobile-update-title">
			<section className="w-full max-w-md overflow-hidden rounded-lg border border-blue-200 bg-white shadow-2xl">
				<header className="flex items-center gap-3 bg-blue-700 px-5 py-5 text-white">
					<span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white/15"><Smartphone size={25} /></span>
					<div><small className="font-bold uppercase tracking-normal text-blue-100">Atualizacao obrigatoria</small><h1 id="mobile-update-title" className="mt-1 text-xl font-bold">Nova versao do Retiradas</h1></div>
				</header>
				<div className="space-y-4 p-5">
					<p className="text-sm leading-6 text-slate-600">A versao <strong>{update.release?.versionName}</strong> esta disponivel. Atualize agora para continuar usando os recursos mais recentes e manter a localizacao e as notificacoes funcionando corretamente.</p>
					<div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800"><ShieldCheck className="mt-0.5 shrink-0" size={18} /><span>O arquivo vem do link oficial do Retiradas e possui assinatura digital da Brasil Tecpar.</span></div>
					<a href={downloadUrl} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-bold text-white no-underline transition hover:bg-blue-700"><Download size={19} />Atualizar aplicativo</a>
				</div>
			</section>
		</div>
	);
}
