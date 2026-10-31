import { Loader2, LocateFixed, MapPinned, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { getAppClientContext, requestVpsApi } from "../../services/vpsApiClient";

const ENROLLED_KEY = "retiradas-native-location-enrolled-v1";

export default function NativeLocationEnrollment() {
	const context = getAppClientContext();
	const [visible] = useState(() => {
		if (context.mode !== "android") return false;
		const enrolledOnReturn = new URLSearchParams(window.location.search).get("nativeEnrolled") === "1";
		if (enrolledOnReturn) window.localStorage.setItem(ENROLLED_KEY, "1");
		return !enrolledOnReturn && window.localStorage.getItem(ENROLLED_KEY) !== "1";
	});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	async function activate() {
		setBusy(true);
		setError("");
		try {
			const enrollment = await requestVpsApi("/maintenance/app/enrollment", {
				method: "POST",
				body: "{}",
			});
			const target = new URL("retiradas://enroll");
			target.searchParams.set("code", enrollment.code);
			target.searchParams.set("version", context.version || "1.0.2");
			window.location.href = target.toString();
		} catch (caught) {
			setError(caught?.message || "Nao foi possivel ativar a localizacao em tempo real.");
			setBusy(false);
		}
	}

	if (!visible || context.mode !== "android") return null;
	return (
		<div className="fixed inset-0 z-[10040] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="native-location-title">
			<section className="w-full max-w-md overflow-hidden rounded-lg border border-blue-200 bg-white shadow-2xl">
				<header className="flex items-center gap-3 bg-[linear-gradient(135deg,#0b1f6a_0%,#1447b8_100%)] px-5 py-5 text-white">
					<span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white/15"><MapPinned size={25} /></span>
					<div><small className="font-bold uppercase tracking-normal text-blue-100">Configuracao inicial</small><h1 id="native-location-title" className="mt-1 text-xl font-bold">Ativar localizacao em tempo real</h1></div>
				</header>
				<div className="space-y-4 p-5">
					<p className="text-sm leading-6 text-slate-600">Autorize uma unica vez para que a operacao veja sua posicao durante o expediente, inclusive quando o aplicativo estiver minimizado.</p>
					<div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800"><ShieldCheck className="mt-0.5 shrink-0" size={18} /><span>O Android exibira um aviso permanente enquanto o rastreamento estiver ativo. A permissao pode ser removida nas configuracoes do aparelho.</span></div>
					{error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
					<button type="button" onClick={activate} disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70">
						{busy ? <Loader2 className="animate-spin" size={19} /> : <LocateFixed size={19} />}{busy ? "Ativando..." : "Autorizar e ativar"}
					</button>
				</div>
			</section>
		</div>
	);
}
