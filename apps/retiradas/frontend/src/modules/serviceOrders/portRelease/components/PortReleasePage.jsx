import { AlertTriangle, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, DoorOpen, Download, History, Loader2, Play, RefreshCw, Settings2, Square, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { hasAnyPermission } from "../../../../constants/roles";
import { useAuthContext } from "../../../../context/AuthContext";
import {
	getPortReleaseCatalog, getPortReleaseConfig, getPortReleaseScan, getPortReleaseStats, listPortReleaseHistory,
	listPortReleaseScans, portReleaseExportUrl, retryPortReleaseOperation, savePortReleaseConfig, startPortReleaseScan, stopPortReleaseScan,
} from "../services/portReleaseService";

const ACTIVE_SCAN_STATUSES = ["QUEUED", "DISCOVERING", "PROCESSING"];

function localDay(date = new Date()) {
	const offset = date.getTimezoneOffset() * 60_000;
	return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatPeriodDay(value) {
	const day = String(value || "").slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "Data não informada";
	return new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR");
}

function currentMonthRange() {
	const endDate = localDay();
	return { startDate: `${endDate.slice(0, 7)}-01`, endDate };
}

function scanStatusLabel(scan) {
	if (!scan) return "";
	return ({ QUEUED: "Na fila", DISCOVERING: "Pesquisando", PROCESSING: "Atualizando O.S.", COMPLETE: "Concluída", PARTIAL: "Concluída com falhas", FAILED: "Falhou" })[scan.status] || scan.status;
}

function Card({ title, value, detail }) {
	return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">{title}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p><p className="text-xs text-slate-500">{detail}</p></div>;
}

function Pager({ pagination, onPage }) {
	if (!pagination || pagination.totalPages <= 1) return null;
	return <div className="flex items-center justify-between gap-3 border-t p-4 text-sm"><span>Página {pagination.page} de {pagination.totalPages} · {pagination.total} registro(s)</span><div className="flex gap-2"><button type="button" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)} className="rounded-lg border p-2 disabled:opacity-40" title="Página anterior"><ChevronLeft size={18} /></button><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)} className="rounded-lg border p-2 disabled:opacity-40" title="Próxima página"><ChevronRight size={18} /></button></div></div>;
}

export default function PortReleasePage() {
	const { currentUser } = useAuthContext();
	const canManage = hasAnyPermission(currentUser, ["liberacao_portas.manage"]);
	const canExecute = hasAnyPermission(currentUser, ["liberacao_portas.execute"]);
	const canHistory = hasAnyPermission(currentUser, ["liberacao_portas.history"]);
	const canExport = hasAnyPermission(currentUser, ["liberacao_portas.export"]);
	const [tab, setTab] = useState("operation");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [range, setRange] = useState(currentMonthRange);
	const [scan, setScan] = useState(null);
	const [scans, setScans] = useState([]);
	const [history, setHistory] = useState({ items: [] });
	const [failures, setFailures] = useState({ items: [] });
	const [historyPage, setHistoryPage] = useState(1);
	const [failurePage, setFailurePage] = useState(1);
	const [stats, setStats] = useState({ total: 0, clients: 0, today: 0, month: 0, failures: 0, topSourceTypes: [] });
	const [config, setConfig] = useState(null);
	const [configItems, setConfigItems] = useState([]);
	const [catalog, setCatalog] = useState([]);

	async function loadOverview(nextHistoryPage = historyPage, nextFailurePage = failurePage) {
		const [nextStats, nextHistory, nextFailures, nextScans] = await Promise.all([
			getPortReleaseStats(),
			canHistory ? listPortReleaseHistory({ page: nextHistoryPage, limit: 25 }) : Promise.resolve(history),
			canHistory ? listPortReleaseHistory({ failures: 1, page: nextFailurePage, limit: 25 }) : Promise.resolve(failures),
			listPortReleaseScans({ limit: 12 }),
		]);
		setStats(nextStats);
		setHistory(nextHistory);
		setFailures(nextFailures);
		setScans(nextScans.items || []);
		setScan((current) => current || (nextScans.items || []).find((item) => ACTIVE_SCAN_STATUSES.includes(item.status)) || null);
	}

	async function changeHistoryPage(page) { setHistoryPage(page); setLoading(true); try { setHistory(await listPortReleaseHistory({ page, limit: 25 })); } catch (err) { setError(err.message); } finally { setLoading(false); } }
	async function changeFailurePage(page) { setFailurePage(page); setLoading(true); try { setFailures(await listPortReleaseHistory({ failures: 1, page, limit: 25 })); } catch (err) { setError(err.message); } finally { setLoading(false); } }

	useEffect(() => { void loadOverview().catch((err) => setError(err.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => {
		if (!scan?.id || !ACTIVE_SCAN_STATUSES.includes(scan.status)) return undefined;
		const timer = setInterval(async () => {
			const current = await getPortReleaseScan(scan.id);
			setScan(current);
			if (!ACTIVE_SCAN_STATUSES.includes(current.status)) {
				clearInterval(timer);
				void loadOverview().catch((err) => setError(err.message));
			}
		}, 2500);
		return () => clearInterval(timer);
	}, [scan?.id, scan?.status]); // eslint-disable-line react-hooks/exhaustive-deps

	async function executeScan() {
		if (!window.confirm(`Iniciar a verificação automática de ${new Date(`${range.startDate}T12:00:00`).toLocaleDateString("pt-BR")} até ${new Date(`${range.endDate}T12:00:00`).toLocaleDateString("pt-BR")}?`)) return;
		setLoading(true); setError("");
		try {
			const created = await startPortReleaseScan(range);
			setScan(created); setMessage("Verificação iniciada no servidor. Você pode sair desta página sem interromper o processamento.");
		} catch (err) { setError(err.message); } finally { setLoading(false); }
	}

	async function stopCurrentScan() {
		if (!scan?.id || !window.confirm("Parar esta varredura? Nenhuma nova O.S. será processada.")) return;
		setLoading(true); setError("");
		try {
			const stopped = await stopPortReleaseScan(scan.id);
			setScan(stopped); setMessage("Varredura interrompida. Nenhuma nova O.S. será processada.");
			await loadOverview();
		} catch (err) { setError(err.message); } finally { setLoading(false); }
	}

	async function retry(operation) {
		if (!window.confirm(`Reenviar a O.S. ${operation.serviceOrderNumber || operation.serviceOrderId}?`)) return;
		setLoading(true); setError(""); setMessage("");
		try {
			await retryPortReleaseOperation(operation.id);
			setTab("operation"); setMessage("Reenvio iniciado no servidor. O resultado aparecerá no histórico e na lista de erros.");
		} catch (err) { setError(err.message); } finally { setLoading(false); }
	}

	async function openConfig() {
		setTab("config"); setLoading(true); setError("");
		try {
			const [saved, available] = await Promise.all([getPortReleaseConfig(), getPortReleaseCatalog()]);
			setConfigItems(saved.items || []);
			setConfig(saved.items?.[0] || { companyKey: "DEFAULT", companyName: "Padrão", source_types: [], target_type: null, open_statuses: ["aguardando_agendamento", "pendente"], batch_limit: 500, concurrency: 2 });
			setCatalog(available.types || []);
		} catch (err) { setError(err.message); } finally { setLoading(false); }
	}

	async function saveConfig() {
		setLoading(true); setError("");
		try {
			await savePortReleaseConfig({ companyKey: config.company_key || config.companyKey || "DEFAULT", companyName: config.company_name || config.companyName || "Padrão",
				sourceTypes: config.source_types || [], targetType: config.target_type, openStatuses: config.open_statuses || [], batchLimit: config.batch_limit || 500, concurrency: config.concurrency || 2 });
			setMessage("Configuração validada e salva."); setTab("operation");
		} catch (err) { setError(err.message); } finally { setLoading(false); }
	}

	return <div className="space-y-5 p-4 sm:p-6">
		<header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-blue-600">Ordem de Serviço</p><h1 className="flex items-center gap-2 text-2xl font-black"><DoorOpen className="text-blue-600" /> Liberação de Portas</h1><p className="text-sm text-slate-600">Corrija classificações com confirmação e histórico no HubSoft.</p></div>
			{canManage && <button type="button" onClick={openConfig} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 font-bold"><Settings2 size={17} /> Configuração</button>}</header>
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Card title="OS corrigidas" value={stats.total} detail="Confirmadas" /><Card title="Clientes" value={stats.clients} detail="Impactados" /><Card title="Hoje" value={stats.today} detail="Alterações" /><Card title="Mês" value={stats.month} detail="Alterações" /><Card title="Falhas" value={stats.failures} detail="Erro ou indeterminada" /></div>
		<nav className="flex gap-2 overflow-x-auto border-b"><button onClick={() => setTab("operation")} className={`whitespace-nowrap px-4 py-3 font-bold ${tab === "operation" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`}>Operação</button>{canHistory && <button onClick={() => setTab("history")} className={`whitespace-nowrap px-4 py-3 font-bold ${tab === "history" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`}>Histórico e relatórios</button>}{canHistory && <button onClick={() => setTab("errors")} className={`inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 font-bold ${tab === "errors" ? "border-b-2 border-red-600 text-red-700" : "text-slate-500"}`}><AlertTriangle size={17} /> Erros {stats.failures > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{stats.failures}</span>}</button>}</nav>
		{error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}{message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</div>}
		{tab === "operation" && <>
			<section className="rounded-lg border bg-white p-5 shadow-sm">
				<div className="flex items-start gap-3"><div className="rounded-lg bg-blue-50 p-3 text-blue-700"><CalendarRange size={22} /></div><div><h2 className="font-black">Verificação automática</h2><p className="mt-1 text-sm text-slate-600">O servidor cruza atendimentos finalizados com O.S. abertas e normaliza tipo, agenda, técnico, status e horários sem depender desta página.</p></div></div>
				<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto]">
					<label><span className="text-sm font-bold">De</span><input type="date" max={range.endDate} value={range.startDate} onChange={(event) => setRange({ ...range, startDate: event.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label>
					<label><span className="text-sm font-bold">Até</span><input type="date" min={range.startDate} max={localDay()} value={range.endDate} onChange={(event) => setRange({ ...range, endDate: event.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label>
					<button type="button" onClick={() => setRange(currentMonthRange())} className="self-end rounded-lg border px-4 py-3 font-bold">Mês atual</button>
					<button type="button" disabled={!canExecute || loading || (scan && ACTIVE_SCAN_STATUSES.includes(scan.status))} onClick={executeScan} className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">{loading ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />} Iniciar</button>
				</div>
			</section>
			{scan && <section className="rounded-lg border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase text-slate-500">Execução atual</p><h2 className="mt-1 font-black">{scanStatusLabel(scan)} · {scan.phase}</h2></div>{ACTIVE_SCAN_STATUSES.includes(scan.status) && <div className="flex items-center gap-3"><Loader2 className="animate-spin text-blue-600" size={22} /><button type="button" disabled={loading || !canExecute} onClick={stopCurrentScan} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 font-bold text-red-700 disabled:opacity-50"><Square size={15} fill="currentColor" /> Parar varredura</button></div>}</div><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4"><Card title="Atendimentos" value={(scan.attendances_scanned || 0).toLocaleString("pt-BR")} detail="Entregas em loja resolvidas" /><Card title="Clientes" value={scan.customers_matched || 0} detail="Com O.S. de retirada aberta" /><Card title="Ordens" value={scan.orders_found || 0} detail="Encontradas" /><Card title="Concluídas" value={(scan.succeeded || 0) + (scan.skipped || 0)} detail={`${scan.failed || 0} falha(s)`} /></div>{scan.error_message && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{scan.error_message}</p>}</section>}
			{scans.length > 0 && <section className="overflow-hidden rounded-lg border bg-white shadow-sm"><div className="border-b p-4"><h2 className="font-black">Verificações recentes</h2></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left"><tr>{["Período", "Status", "Atendimentos", "Clientes", "Ordens", "Concluídas", "Falhas", "Iniciada por"].map((item) => <th key={item} className="whitespace-nowrap p-3">{item}</th>)}</tr></thead><tbody>{scans.map((item) => <tr key={item.id} className="border-t"><td className="whitespace-nowrap p-3">{formatPeriodDay(item.start_date)} a {formatPeriodDay(item.end_date)}</td><td className="p-3 font-bold">{scanStatusLabel(item)}</td><td className="p-3">{item.attendances_scanned}</td><td className="p-3">{item.customers_matched}</td><td className="p-3">{item.orders_found}</td><td className="p-3">{(item.succeeded || 0) + (item.skipped || 0)}</td><td className="p-3">{(item.failed || 0) + (item.indeterminate || 0)}</td><td className="p-3">{item.requested_by_name}</td></tr>)}</tbody></table></div></section>}
		</>}
		{tab === "history" && <section className="rounded-lg border bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><h2 className="flex items-center gap-2 font-black"><History size={18} /> Histórico de liberações <span className="text-sm font-medium text-slate-500">({history.pagination?.total || 0})</span></h2>{canExport && <div className="flex gap-2"><a href={portReleaseExportUrl("csv")} className="inline-flex items-center gap-2 rounded border px-3 py-2 font-bold"><Download size={16} /> CSV</a><a href={portReleaseExportUrl("xlsx")} className="inline-flex items-center gap-2 rounded border px-3 py-2 font-bold"><Download size={16} /> XLSX</a></div>}</div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left"><tr>{["Resultado", "Cliente", "O.S.", "Empresa", "De", "Para", "Responsável", "Data", "Motivo"].map((item) => <th key={item} className="p-3">{item}</th>)}</tr></thead><tbody>{history.items.map((item) => <tr key={item.id} className="border-t"><td className="p-3">{item.status === "SUCCESS" ? <CheckCircle2 className="text-emerald-600" size={18} /> : <XCircle className="text-red-500" size={18} />}</td><td className="p-3"><b>{item.clientName}</b><br />{item.clientCode}</td><td className="p-3">{item.serviceOrderNumber}</td><td className="p-3">{item.companyName}</td><td className="p-3">{item.sourceTypeName}</td><td className="p-3">{item.targetTypeName}</td><td className="p-3">{item.requestedByName}</td><td className="p-3 whitespace-nowrap">{new Date(item.requestedAt).toLocaleString("pt-BR")}</td><td className="p-3">{item.reason}</td></tr>)}</tbody></table></div><Pager pagination={history.pagination} onPage={changeHistoryPage} /></section>}
		{tab === "errors" && canHistory && <section className="rounded-lg border border-red-200 bg-white shadow-sm"><div className="border-b border-red-100 p-4"><h2 className="flex items-center gap-2 font-black text-red-800"><AlertTriangle size={18} /> Erros para tratamento <span className="text-sm font-medium">({failures.pagination?.total || 0})</span></h2><p className="mt-1 text-sm text-slate-600">Falhas e resultados não confirmados ficam separados para consulta e reenvio.</p></div>{failures.items.length === 0 ? <p className="p-6 text-sm text-slate-500">Nenhum erro pendente.</p> : <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-red-50 text-left"><tr>{["Status", "Cliente", "O.S.", "Empresa", "Erro", "Data", "Ação"].map((item) => <th key={item} className="p-3">{item}</th>)}</tr></thead><tbody>{failures.items.map((item) => <tr key={item.id} className="border-t"><td className="p-3 font-bold text-red-700">{item.status === "INDETERMINATE" ? "Não confirmado" : "Erro"}</td><td className="p-3"><b>{item.clientName || "-"}</b><br />{item.clientCode}</td><td className="p-3">{item.serviceOrderNumber || item.serviceOrderId}</td><td className="p-3">{item.companyName || "-"}</td><td className="min-w-72 p-3 text-red-700">{item.errorMessage || "Falha sem detalhe informado."}</td><td className="whitespace-nowrap p-3">{new Date(item.requestedAt).toLocaleString("pt-BR")}</td><td className="p-3"><button type="button" disabled={!canExecute || loading} onClick={() => retry(item)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 font-bold text-red-700 disabled:opacity-40"><RefreshCw size={16} /> Reenviar</button></td></tr>)}</tbody></table></div>}<Pager pagination={failures.pagination} onPage={changeFailurePage} /></section>}
		{tab === "config" && canManage && config && <section className="space-y-4 rounded-lg border bg-white p-5 shadow-sm"><div><h2 className="font-black">Contrato real do HubSoft</h2><p className="text-sm text-slate-600">A execução permanece bloqueada sem origem, destino e status configurados por ID.</p></div><div className="flex flex-wrap gap-2"><select value={config.company_key || config.companyKey || "DEFAULT"} onChange={(event) => setConfig(configItems.find((item) => item.company_key === event.target.value) || config)} className="min-w-64 rounded-lg border p-3">{configItems.map((item) => <option key={item.company_key} value={item.company_key}>{item.company_name}</option>)}{!configItems.length && <option value="DEFAULT">Padrão</option>}</select><button type="button" onClick={() => setConfig({ companyKey: "", companyName: "", source_types: [], target_type: null, open_statuses: ["aguardando_agendamento", "pendente"], batch_limit: 500, concurrency: 2 })} className="rounded-lg border px-4 py-2 font-bold">Nova configuração</button></div><div className="grid gap-3 md:grid-cols-2"><label><span className="font-bold">ID da empresa/contexto</span><input value={config.company_key || config.companyKey || ""} onChange={(event) => setConfig({ ...config, company_key: event.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label><label><span className="font-bold">Nome da empresa/contexto</span><input value={config.company_name || config.companyName || ""} onChange={(event) => setConfig({ ...config, company_name: event.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label></div><label className="block"><span className="font-bold">Tipo de destino</span><select value={config.target_type?.id || ""} onChange={(event) => { const type = catalog.find((item) => item.id === Number(event.target.value)); setConfig({ ...config, target_type: type || null }); }} className="mt-1 w-full rounded-lg border p-3"><option value="">Selecione Liberação de Portas no catálogo real</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}</select></label><fieldset><legend className="font-bold">Tipos de origem elegíveis</legend><div className="mt-2 grid max-h-72 gap-2 overflow-y-auto rounded-lg border p-3 md:grid-cols-2">{catalog.map((item) => { const checked = (config.source_types || []).some((type) => Number(type.id) === item.id); return <label key={item.id} className="flex gap-2 text-sm"><input type="checkbox" checked={checked} onChange={() => setConfig({ ...config, source_types: checked ? config.source_types.filter((type) => Number(type.id) !== item.id) : [...(config.source_types || []), item] })} /> {item.id} · {item.name}</label>; })}</div></fieldset><label className="block"><span className="font-bold">Status abertos (identificadores do HubSoft)</span><input value={(config.open_statuses || []).join(", ")} onChange={(event) => setConfig({ ...config, open_statuses: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} className="mt-1 w-full rounded-lg border p-3" /></label><div className="flex justify-end"><button disabled={loading} onClick={saveConfig} className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white">Salvar configuração</button></div></section>}
	</div>;
}
