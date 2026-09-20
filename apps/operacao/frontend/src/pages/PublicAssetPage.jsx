import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, LogIn, PackageCheck, ShieldCheck } from "lucide-react";
import { checkoutPublicAsset, fetchPublicAsset } from "../api/rotApi";
import Spinner from "../components/ui/Spinner";

export default function PublicAssetPage() {
	const { token } = useParams();
	const [asset, setAsset] = useState(null);
	const [loading, setLoading] = useState(true);
	const [checkoutLoading, setCheckoutLoading] = useState(false);
	const [error, setError] = useState("");
	const [actionMessage, setActionMessage] = useState("");
	const [actionError, setActionError] = useState("");

	const isAvailable = asset?.statusId === "disponivel" && !asset?.hasCustody && !asset?.blockedForUse;

	async function handleCheckout() {
		setCheckoutLoading(true);
		setActionError("");
		setActionMessage("");
		try {
			const updated = await checkoutPublicAsset(token);
			setAsset(updated);
			setActionMessage("Equipamento retirado para sua utilização. A visão geral já vai mostrar este ativo em uso.");
		} catch (err) {
			if (err?.status === 401) {
				setActionError("Faça login na Operação para retirar este equipamento.");
			} else {
				setActionError(err?.message || "Não foi possível retirar este equipamento.");
			}
		} finally {
			setCheckoutLoading(false);
		}
	}

	useEffect(() => {
		let active = true;
		fetchPublicAsset(token)
			.then((data) => {
				if (active) setAsset(data);
			})
			.catch((err) => {
				if (active) setError(err?.message || "Ativo não encontrado.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [token]);

	if (loading) return <Spinner fullScreen />;

	return (
		<main className="min-h-dvh bg-[linear-gradient(180deg,#061b38_0%,#0f3a69_55%,#eef3f8_55%,#eef3f8_100%)] px-4 py-6">
			<div className="mx-auto max-w-lg">
				<div className="mb-6 flex justify-center">
					<img src="/rot-menu.webp" alt="Operação" className="h-20 w-auto object-contain drop-shadow-2xl" />
				</div>
				<section className="overflow-hidden rounded-3xl border border-white/40 bg-white shadow-2xl">
					<div className="bg-slate-950 px-6 py-5 text-white">
						<p className="text-xs font-black uppercase tracking-[0.25em] text-blue-200">Ativo operacional</p>
						<h1 className="mt-2 text-2xl font-black">{asset?.code || "Não encontrado"}</h1>
					</div>
					{error ? (
						<div className="p-6 text-center">
							<AlertTriangle className="mx-auto text-red-500" size={34} />
							<p className="mt-3 text-sm font-black text-red-700">{error}</p>
						</div>
					) : (
						<div className="space-y-4 p-6">
							<div>
								<h2 className="text-xl font-black text-slate-950">{asset.name}</h2>
								<p className="text-sm font-semibold text-slate-500">{asset.operationScope} · {asset.regionalName || "Regional não informada"}</p>
							</div>
							<div className="grid gap-3">
								<Info label="Categoria" value={asset.categoryName || "N/D"} />
								<Info label="Tipo" value={asset.typeName || "N/D"} />
								<Info label="Status" value={asset.statusName || "N/D"} color={asset.statusColor} />
								<Info label="Criticidade" value={asset.criticalityName || "N/D"} color={asset.criticalityColor} />
							</div>
							<div className={`rounded-2xl border p-4 ${asset.blockedForUse ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
								<div className="flex items-center gap-3">
									{asset.blockedForUse ? <AlertTriangle className="text-red-600" size={24} /> : <CheckCircle2 className="text-emerald-600" size={24} />}
									<div>
										<p className={`text-sm font-black ${asset.blockedForUse ? "text-red-700" : "text-emerald-700"}`}>{asset.condition}</p>
										<p className="text-xs font-semibold text-slate-600">{asset.blockedForUse ? "Ativo com restrição de uso." : "Sem bloqueio público registrado."}</p>
									</div>
								</div>
							</div>
							<div className={`rounded-2xl border p-4 ${isAvailable ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
								<div className="flex flex-col gap-3">
									<div className="flex items-start gap-3">
										<PackageCheck className={isAvailable ? "text-blue-600" : "text-slate-400"} size={24} />
										<div>
											<p className={`text-sm font-black ${isAvailable ? "text-blue-800" : "text-slate-600"}`}>
												{isAvailable ? "Equipamento disponível para retirada" : asset.hasCustody ? "Equipamento em uso" : "Retirada indisponível"}
											</p>
											<p className="text-xs font-semibold text-slate-600">
												{isAvailable
													? "Ao retirar, este ativo entra em uso no seu nome até ser devolvido no módulo Ativos & Segurança."
													: "Acompanhe a custódia e a devolução na visão geral de Ativos & Segurança."}
											</p>
										</div>
									</div>
									{isAvailable ? (
										<button
											type="button"
											onClick={handleCheckout}
											disabled={checkoutLoading}
											className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
										>
											{checkoutLoading ? <Loader2 className="animate-spin" size={18} /> : <PackageCheck size={18} />}
											Retirar equipamento
										</button>
									) : null}
									{actionError === "Faça login na Operação para retirar este equipamento." ? (
										<a
											href="/login"
											className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-50"
										>
											<LogIn size={18} />
											Entrar na Operação
										</a>
									) : null}
									{actionMessage ? <p className="rounded-xl bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">{actionMessage}</p> : null}
									{actionError ? <p className="rounded-xl bg-red-100 px-3 py-2 text-xs font-black text-red-700">{actionError}</p> : null}
								</div>
							</div>
							<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
								<div className="flex items-center gap-3">
									<ShieldCheck className="text-blue-600" size={22} />
									<p className="text-xs font-semibold text-slate-600">Informações restritas como responsável, valor, documentos e histórico exigem login autorizado.</p>
								</div>
							</div>
						</div>
					)}
				</section>
			</div>
		</main>
	);
}

function Info({ label, value, color }) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3">
			<span className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</span>
			<span className="text-right text-sm font-black text-slate-900" style={color ? { color } : undefined}>{value}</span>
		</div>
	);
}
