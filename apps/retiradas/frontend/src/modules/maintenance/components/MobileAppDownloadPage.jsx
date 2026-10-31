import { useCallback, useEffect, useRef, useState } from "react";
import {
	CheckCircle2,
	Download,
	Loader2,
	RefreshCw,
	ShieldCheck,
	Smartphone,
} from "lucide-react";
import { getApiBaseUrl } from "../../../services/vpsApiClient";

function fileNameFromResponse(response) {
	const disposition = response.headers.get("content-disposition") || "";
	const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
	if (encoded) return decodeURIComponent(encoded);
	return disposition.match(/filename="?([^";]+)"?/i)?.[1] || "Retiradas.apk";
}

export default function MobileAppDownloadPage() {
	const startedRef = useRef(false);
	const [state, setState] = useState("idle");
	const [message, setMessage] = useState("");

	const download = useCallback(async () => {
		if (state === "loading") return;
		setState("loading");
		setMessage("");
		try {
			const response = await fetch(`${getApiBaseUrl()}/maintenance/app/download`, {
				cache: "no-store",
			});
			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				throw new Error(payload?.error || "Nao foi possivel baixar o aplicativo agora.");
			}
			const blob = await response.blob();
			const objectUrl = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = objectUrl;
			anchor.download = fileNameFromResponse(response);
			anchor.rel = "noopener";
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
			setState("success");
		} catch (error) {
			setMessage(error?.message || "Nao foi possivel baixar o aplicativo agora.");
			setState("error");
		}
	}, [state]);

	useEffect(() => {
		if (startedRef.current) return;
		startedRef.current = true;
		download();
	}, [download]);

	return (
		<main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 text-slate-950">
			<section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
				<div className="mb-6 flex items-center gap-4">
					<div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
						<Smartphone size={28} aria-hidden="true" />
					</div>
					<div>
						<p className="text-sm font-semibold text-blue-600">Aplicativo oficial</p>
						<h1 className="text-2xl font-black">Retiradas</h1>
					</div>
				</div>

				<div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
					<div className="flex items-start gap-3">
						<ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={22} />
						<div>
							<p className="font-bold">Instalador seguro para Android</p>
							<p className="mt-1 text-sm leading-6 text-slate-600">
								O download usa sempre a versao mais recente publicada pela equipe.
							</p>
						</div>
					</div>
				</div>

				{state === "loading" && (
					<div className="mb-5 flex items-center gap-3 text-sm font-semibold text-slate-600" role="status">
						<Loader2 className="animate-spin text-blue-600" size={20} />
						Preparando o download...
					</div>
				)}
				{state === "success" && (
					<div className="mb-5 flex items-center gap-3 text-sm font-semibold text-emerald-700" role="status">
						<CheckCircle2 size={20} />
						Download iniciado. Confira as notificacoes do aparelho.
					</div>
				)}
				{state === "error" && (
					<p className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
						{message}
					</p>
				)}

				<button
					type="button"
					onClick={download}
					disabled={state === "loading"}
					className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
				>
					{state === "error" ? <RefreshCw size={19} /> : <Download size={19} />}
					{state === "error" ? "Tentar novamente" : "Baixar aplicativo"}
				</button>
				<p className="mt-4 text-center text-xs leading-5 text-slate-500">
					Compativel com Android 7 ou superior.
				</p>
			</section>
		</main>
	);
}
