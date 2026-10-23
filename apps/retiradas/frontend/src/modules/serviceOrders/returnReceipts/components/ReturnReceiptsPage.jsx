import {
	Building2,
	CheckCircle2,
	Download,
	FileCheck2,
	History,
	LoaderCircle,
	PackageCheck,
	Search,
	ShieldCheck,
	UserRoundCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { hasAnyPermission } from "../../../../constants/roles";
import { useAuthContext } from "../../../../context/AuthContext";
import {
	baixarComprovante,
	consultarComprovante,
	gerarComprovante,
	listarHistoricoComprovantes,
	listarMeusComprovantes,
} from "../services/returnReceiptsService";

function formatDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		timeZone: "America/Sao_Paulo",
		dateStyle: "short",
		timeStyle: "short",
	});
}

function DownloadButton({ item, onError }) {
	const [loading, setLoading] = useState(false);
	async function download() {
		setLoading(true);
		try {
			await baixarComprovante(item);
		} catch (error) {
			onError(error?.message || "Nao foi possivel baixar o comprovante.");
		} finally {
			setLoading(false);
		}
	}
	return (
		<button
			type="button"
			onClick={download}
			disabled={loading}
			title="Baixar comprovante em PDF"
			className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 text-sm font-black text-white transition hover:bg-blue-800 disabled:opacity-60"
		>
			{loading ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
			<span className="hidden sm:inline">Baixar PDF</span>
		</button>
	);
}

function ReceiptTable({ items, admin = false, onError }) {
	if (!items.length) {
		return (
			<div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm font-semibold text-slate-500">
				Nenhum comprovante gerado.
			</div>
		);
	}
	return (
		<div className="overflow-x-auto rounded-xl border border-slate-200">
			<table className="min-w-full divide-y divide-slate-200 text-sm">
				<thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
					<tr>
						<th className="px-4 py-3">Gerado em</th>
						{admin ? <th className="px-4 py-3">Gerado por</th> : null}
						<th className="px-4 py-3">Cliente</th>
						<th className="px-4 py-3">O.S</th>
						<th className="px-4 py-3">Tecnico</th>
						<th className="px-4 py-3">Empresa</th>
						<th className="px-4 py-3 text-right">Documento</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-100 bg-white">
					{items.map((item) => (
						<tr key={item.id} className="text-slate-700">
							<td className="whitespace-nowrap px-4 py-3 font-semibold">{formatDateTime(item.createdAt)}</td>
							{admin ? (
								<td className="px-4 py-3">
									<strong className="block text-slate-950">{item.generatedByName}</strong>
									<span className="text-xs text-slate-500">{item.generatedByEmail}</span>
								</td>
							) : null}
							<td className="px-4 py-3">
								<strong className="block text-slate-950">{item.clientName}</strong>
								<span className="text-xs text-slate-500">Codigo {item.clientCode}</span>
							</td>
							<td className="whitespace-nowrap px-4 py-3 font-black">{item.serviceOrderNumber}</td>
							<td className="min-w-48 px-4 py-3 font-semibold">{item.technicianName}</td>
							<td className="px-4 py-3 font-black">{item.company}</td>
							<td className="px-4 py-3 text-right"><DownloadButton item={item} onError={onError} /></td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default function ReturnReceiptsPage() {
	const { currentUser } = useAuthContext();
	const canViewHistory = hasAnyPermission(currentUser, ["service_orders.return_receipts.history"]);
	const [clientCode, setClientCode] = useState("");
	const [candidate, setCandidate] = useState(null);
	const [mine, setMine] = useState([]);
	const [history, setHistory] = useState([]);
	const [historyPage, setHistoryPage] = useState(1);
	const [historySearch, setHistorySearch] = useState("");
	const [historyPagination, setHistoryPagination] = useState({ page: 1, totalPages: 1, total: 0 });
	const [loading, setLoading] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [loadingHistory, setLoadingHistory] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");

	const loadMine = useCallback(async () => {
		const response = await listarMeusComprovantes();
		setMine(Array.isArray(response?.items) ? response.items : []);
	}, []);

	const loadHistory = useCallback(async () => {
		if (!canViewHistory) return;
		setLoadingHistory(true);
		try {
			const response = await listarHistoricoComprovantes({
				page: historyPage,
				q: historySearch,
			});
			setHistory(Array.isArray(response?.items) ? response.items : []);
			setHistoryPagination(response?.pagination || { page: 1, totalPages: 1, total: 0 });
		} finally {
			setLoadingHistory(false);
		}
	}, [canViewHistory, historyPage, historySearch]);

	useEffect(() => {
		loadMine().catch(() => {});
	}, [loadMine]);

	useEffect(() => {
		loadHistory().catch(() => {});
	}, [loadHistory]);

	async function submitLookup(event) {
		event.preventDefault();
		setError("");
		setMessage("");
		setCandidate(null);
		if (!/^\d+$/.test(clientCode)) {
			setError("Informe somente o codigo numerico do cliente.");
			return;
		}
		setLoading(true);
		try {
			const response = await consultarComprovante(clientCode);
			setCandidate(response?.item || null);
		} catch (lookupError) {
			setError(lookupError?.message || "Nao foi possivel consultar a devolucao.");
		} finally {
			setLoading(false);
		}
	}

	async function generate() {
		setGenerating(true);
		setError("");
		setMessage("");
		try {
			const response = await gerarComprovante(candidate.clientCode);
			setCandidate((current) => ({ ...current, existingReceipt: response.item }));
			setMessage(response.reused ? "Este comprovante ja existia e esta pronto para download." : "Comprovante gerado e salvo no historico.");
			await loadMine();
			await loadHistory();
		} catch (generateError) {
			setError(generateError?.message || "Nao foi possivel gerar o comprovante.");
		} finally {
			setGenerating(false);
		}
	}

	return (
		<div className="space-y-6 p-4 sm:p-6">
			<section className="border-b border-slate-200 bg-white pb-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Ordem de Servico</p>
						<h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Comprovante de devolucao</h1>
						<p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
							Consulte uma O.S finalizada, confirme os equipamentos devolvidos e gere o documento em PDF.
						</p>
					</div>
					<div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
						<ShieldCheck size={22} />
						<div><p className="text-xs font-black uppercase tracking-wide">Documento protegido</p><p className="text-sm font-semibold">Download autenticado</p></div>
					</div>
				</div>

				<form onSubmit={submitLookup} className="mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end">
					<label className="block min-w-0 flex-1">
						<span className="mb-2 block text-sm font-black text-slate-700">Codigo do cliente</span>
						<input
							value={clientCode}
							onChange={(event) => setClientCode(event.target.value.replace(/\D/g, ""))}
							inputMode="numeric"
							autoComplete="off"
							placeholder="Ex.: 336813"
							className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
						/>
					</label>
					<button type="submit" disabled={loading} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-black text-white transition hover:bg-blue-800 disabled:opacity-60">
						{loading ? <LoaderCircle size={18} className="animate-spin" /> : <Search size={18} />}
						Consultar
					</button>
				</form>
				{error ? <div className="mt-4 max-w-3xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div> : null}
				{message ? <div className="mt-4 max-w-3xl rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</div> : null}
			</section>

			{candidate ? (
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="flex items-start gap-3">
							<span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><CheckCircle2 size={23} /></span>
							<div><p className="text-xs font-black uppercase tracking-wide text-emerald-700">Devolucao confirmada</p><h2 className="mt-1 text-xl font-black text-slate-950">{candidate.clientName}</h2><p className="text-sm font-semibold text-slate-500">Codigo {candidate.clientCode}</p></div>
						</div>
						{candidate.existingReceipt ? (
							<DownloadButton item={candidate.existingReceipt} onError={setError} />
						) : (
							<button type="button" onClick={generate} disabled={generating} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white transition hover:bg-emerald-800 disabled:opacity-60">
								{generating ? <LoaderCircle size={17} className="animate-spin" /> : <FileCheck2 size={17} />}
								Gerar comprovante
							</button>
						)}
					</div>

					<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						<div className="rounded-xl bg-slate-50 p-4"><p className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><FileCheck2 size={15} /> Ordem de servico</p><p className="mt-2 font-black text-slate-950">{candidate.serviceOrderNumber}</p><p className="mt-1 text-xs font-semibold text-slate-500">{candidate.serviceOrderType}</p></div>
						<div className="rounded-xl bg-slate-50 p-4"><p className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><UserRoundCheck size={15} /> Tecnico</p><p className="mt-2 font-black text-slate-950">{candidate.technicianName}</p></div>
						<div className="rounded-xl bg-slate-50 p-4"><p className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><Building2 size={15} /> Empresa</p><p className="mt-2 font-black text-slate-950">{candidate.company}</p></div>
						<div className="rounded-xl bg-slate-50 p-4"><p className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><History size={15} /> Finalizacao</p><p className="mt-2 font-black text-slate-950">{formatDateTime(candidate.completedAt)}</p></div>
					</div>

					<div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
						<div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800"><PackageCheck size={18} className="text-blue-700" /> Equipamentos devolvidos</div>
						<div className="divide-y divide-slate-100">
							{candidate.equipment.map((item) => (
								<div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><div><p className="font-bold text-slate-950">{item.productName}</p><p className="text-xs font-semibold text-slate-500">Movimentacao {item.movementNumber || item.movementId || "-"}</p></div><span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-800">Serie/MAC: {item.serial || "Nao informado"}</span></div>
							))}
						</div>
					</div>
				</section>
			) : null}

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
				<div className="mb-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Meus documentos</p><h2 className="mt-1 text-xl font-black text-slate-950">Historico de comprovantes</h2></div>
				<ReceiptTable items={mine} onError={setError} />
			</section>

			{canViewHistory ? (
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
					<div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Administracao</p><h2 className="mt-1 text-xl font-black text-slate-950">Todos os comprovantes</h2></div><label className="block"><span className="mb-1 block text-xs font-black text-slate-500">Pesquisar</span><input value={historySearch} onChange={(event) => { setHistorySearch(event.target.value); setHistoryPage(1); }} placeholder="Cliente, O.S ou tecnico" className="h-10 w-64 max-w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500" /></label></div>
					{loadingHistory ? <div className="flex min-h-32 items-center justify-center"><LoaderCircle className="animate-spin text-blue-700" /></div> : <ReceiptTable items={history} admin onError={setError} />}
					<div className="mt-4 flex items-center justify-between text-sm font-semibold text-slate-500"><span>{historyPagination.total} registro(s)</span><div className="flex items-center gap-2"><button type="button" disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => page - 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Anterior</button><span>Pagina {historyPage} de {historyPagination.totalPages}</span><button type="button" disabled={historyPage >= historyPagination.totalPages} onClick={() => setHistoryPage((page) => page + 1)} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Proxima</button></div></div>
				</section>
			) : null}
		</div>
	);
}
