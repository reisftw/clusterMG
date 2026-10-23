import {
	AlertCircle,
	Building2,
	CheckCircle2,
	Database,
	Download,
	FileCheck2,
	History,
	LoaderCircle,
	PackageCheck,
	Router,
	Search,
	ShieldCheck,
	UserRoundCheck,
	X,
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
	const [manualDialogOpen, setManualDialogOpen] = useState(false);
	const [manualEquipmentName, setManualEquipmentName] = useState("");
	const [manualEquipmentMac, setManualEquipmentMac] = useState("");
	const [manualError, setManualError] = useState("");

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
		setManualDialogOpen(false);
		setManualError("");
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

	async function generate(equipment = {}) {
		setGenerating(true);
		setError("");
		setMessage("");
		try {
			const response = await gerarComprovante(candidate.clientCode, equipment);
			setCandidate((current) => ({
				...current,
				equipment: response.item?.equipment || current?.equipment || [],
				requiresManualEquipment: false,
				existingReceipt: response.item,
			}));
			setMessage(response.reused ? "Este comprovante ja existia e esta pronto para download." : "Comprovante gerado e salvo no historico.");
			await loadMine();
			await loadHistory();
			return true;
		} catch (generateError) {
			const nextError = generateError?.message || "Nao foi possivel gerar o comprovante.";
			if (manualDialogOpen) setManualError(nextError);
			else setError(nextError);
			return false;
		} finally {
			setGenerating(false);
		}
	}

	function requestGenerate() {
		if (!candidate?.requiresManualEquipment) {
			generate();
			return;
		}
		setManualEquipmentName("");
		setManualEquipmentMac("");
		setManualError("");
		setManualDialogOpen(true);
	}

	async function confirmManualEquipment(event) {
		event.preventDefault();
		const name = manualEquipmentName.trim();
		const mac = manualEquipmentMac.trim().toUpperCase();
		if (name.length < 2) {
			setManualError("Informe o nome ou modelo do equipamento recolhido.");
			return;
		}
		if (mac.replace(/[^A-Z0-9]/g, "").length < 8) {
			setManualError("Informe um MAC ou serial válido.");
			return;
		}
		setManualError("");
		const created = await generate({ equipmentName: name, equipmentMac: mac });
		if (created) setManualDialogOpen(false);
	}

	return (
		<div className="space-y-6 p-4 sm:p-6">
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Ordem de Serviço</p>
						<h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Comprovante de devolução</h1>
						<p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
							Consulte uma O.S. finalizada e gere o documento de devolução em PDF.
						</p>
					</div>
					<div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
						<ShieldCheck size={22} />
						<div><p className="text-xs font-black uppercase tracking-wide">Documento protegido</p><p className="text-sm font-semibold">Download autenticado</p></div>
					</div>
				</div>

				<form onSubmit={submitLookup} className="mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end">
					<label className="block min-w-0 flex-1">
						<span className="mb-2 block text-sm font-black text-slate-700">Código do cliente</span>
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
				{error ? <div className="mt-4 flex max-w-3xl items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800"><AlertCircle className="mt-0.5 shrink-0" size={18} /><span>{error}</span></div> : null}
				{message ? <div className="mt-4 max-w-3xl rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{message}</div> : null}
			</section>

			{candidate ? (
				<section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
					<header className="flex flex-col gap-4 border-b border-emerald-100 bg-emerald-50 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
						<div className="flex min-w-0 items-center gap-4">
							<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm"><CheckCircle2 size={25} /></span>
							<div className="min-w-0">
								<p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">O.S. finalizada</p>
								<h2 className="mt-1 truncate text-xl font-black text-slate-950 sm:text-2xl">{candidate.clientName}</h2>
								<p className="mt-0.5 text-sm font-semibold text-slate-600">Cliente {candidate.clientCode}</p>
							</div>
						</div>
						{candidate.existingReceipt ? (
							<DownloadButton item={candidate.existingReceipt} onError={setError} />
						) : (
							<button type="button" onClick={requestGenerate} disabled={generating} className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-black text-white transition hover:bg-emerald-800 disabled:opacity-60 sm:w-auto">
								{generating ? <LoaderCircle size={17} className="animate-spin" /> : <FileCheck2 size={17} />}
								Gerar comprovante
							</button>
						)}
					</header>

					<div className="grid border-b border-slate-200 sm:grid-cols-2 xl:grid-cols-4">
						<div className="min-w-0 border-b border-slate-200 px-5 py-4 sm:border-r xl:border-b-0 sm:px-6"><p className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><FileCheck2 size={15} /> Ordem de serviço</p><p className="mt-2 break-all font-black text-slate-950">{candidate.serviceOrderNumber}</p><p className="mt-1 text-xs font-semibold text-slate-500">{candidate.serviceOrderType}</p></div>
						<div className="min-w-0 border-b border-slate-200 px-5 py-4 xl:border-b-0 xl:border-r sm:px-6"><p className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><UserRoundCheck size={15} /> Técnico</p><p className="mt-2 break-words font-black text-slate-950">{candidate.technicianName}</p></div>
						<div className="min-w-0 border-b border-slate-200 px-5 py-4 sm:border-b-0 sm:border-r sm:px-6"><p className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><Building2 size={15} /> Empresa</p><p className="mt-2 font-black text-slate-950">{candidate.company}</p></div>
						<div className="min-w-0 px-5 py-4 sm:px-6"><p className="flex items-center gap-2 text-xs font-black uppercase text-slate-500"><History size={15} /> Finalização</p><p className="mt-2 font-black text-slate-950">{formatDateTime(candidate.completedAt)}</p></div>
					</div>

					<div className="px-5 py-5 sm:px-6">
						<div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-black text-slate-900"><PackageCheck size={19} className="text-blue-700" /> Equipamento associado</div><span className="text-xs font-semibold text-slate-500">Informação complementar</span></div>
						<div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
							{candidate.equipment.map((item) => (
								<div key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
									<div className="min-w-0"><p className="font-black text-slate-950">{item.productName}</p><p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Database size={13} /> {item.sourceLabel || "O.S. finalizada"}</p></div>
									{item.serial ? <span className="w-fit rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-800">Série/MAC: {item.serial}</span> : <span className="w-fit rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">Serial não identificado</span>}
								</div>
							))}
						</div>
						<p className="mt-3 text-xs font-semibold leading-5 text-slate-500">A emissão considera a finalização da O.S. O estoque e as demais bases são consultados somente para complementar a identificação do equipamento.</p>
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

			{manualDialogOpen ? (
				<div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={() => !generating && setManualDialogOpen(false)}>
					<section className="w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-labelledby="manual-equipment-title" onMouseDown={(event) => event.stopPropagation()}>
						<header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-950 px-5 py-5 text-white sm:px-6">
							<div className="flex items-start gap-3">
								<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600"><Router size={22} /></span>
								<div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">Identificação obrigatória</p><h2 id="manual-equipment-title" className="mt-1 text-xl font-black">Equipamento recolhido</h2></div>
							</div>
							<button type="button" onClick={() => setManualDialogOpen(false)} disabled={generating} title="Fechar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"><X size={20} /></button>
						</header>

						<form onSubmit={confirmManualEquipment} className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
							<div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold leading-5 text-blue-900">
								Não encontramos movimentação de estoque para esta O.S. Informe exatamente o equipamento entregue pelo cliente antes de gerar o comprovante.
								{candidate?.equipment?.[0]?.productName ? <span className="mt-1 block text-xs font-black text-blue-700">Referência da O.S.: {candidate.equipment[0].productName}</span> : null}
							</div>

							<label className="block">
								<span className="mb-2 block text-sm font-black text-slate-800">Nome ou modelo do equipamento</span>
								<input autoFocus value={manualEquipmentName} onChange={(event) => setManualEquipmentName(event.target.value)} maxLength={120} placeholder="Ex.: ONU Huawei EG8145V5" className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
							</label>

							<label className="block">
								<span className="mb-2 block text-sm font-black text-slate-800">MAC ou número de série</span>
								<input value={manualEquipmentMac} onChange={(event) => setManualEquipmentMac(event.target.value.toUpperCase().replace(/\s/g, ""))} maxLength={64} autoCapitalize="characters" autoComplete="off" spellCheck="false" placeholder="Ex.: 54:4B:54:36:61:D8" className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-mono text-base font-bold uppercase text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
								<span className="mt-1.5 block text-xs font-semibold text-slate-500">Aceita MAC com separadores ou serial alfanumérico.</span>
							</label>

							{manualError ? <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800"><AlertCircle className="mt-0.5 shrink-0" size={17} /><span>{manualError}</span></div> : null}

							<div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
								<button type="button" onClick={() => setManualDialogOpen(false)} disabled={generating} className="h-11 rounded-xl border border-slate-300 px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
								<button type="submit" disabled={generating} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-black text-white transition hover:bg-emerald-800 disabled:opacity-60">{generating ? <LoaderCircle size={17} className="animate-spin" /> : <FileCheck2 size={17} />} Confirmar e gerar PDF</button>
							</div>
						</form>
					</section>
				</div>
			) : null}
		</div>
	);
}
