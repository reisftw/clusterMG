import { CheckCircle2, DoorOpen, Download, History, Loader2, Search, Settings2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { hasAnyPermission } from "../../../../constants/roles";
import { useAuthContext } from "../../../../context/AuthContext";
import {
	createPortReleaseBatch, getPortReleaseBatch, getPortReleaseCatalog, getPortReleaseConfig, getPortReleaseSearch,
	getPortReleaseStats, listPortReleaseHistory, portReleaseExportUrl, savePortReleaseConfig, searchPortReleaseOrders,
} from "../services/portReleaseService";

const REASONS = ["Classificação incorreta pelo Comercial", "Solicitação do Comercial", "Correção operacional", "Outros"];
const STATUS_LABEL = { ELIGIBLE: "Apta", NOT_FOUND: "Sem O.S.", REVIEW_REQUIRED: "Requer análise", ALREADY_CLASSIFIED: "Já classificada" };

function Card({ title, value, detail }) {
	return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase text-slate-500">{title}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p><p className="text-xs text-slate-500">{detail}</p></div>;
}

function Pager({ pagination, onPage }) {
	return <div className="flex items-center justify-end gap-2 text-sm"><button type="button" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)} className="rounded border px-3 py-2 disabled:opacity-40">Anterior</button><span>{pagination.page} de {pagination.totalPages}</span><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)} className="rounded border px-3 py-2 disabled:opacity-40">Próxima</button></div>;
}

export default function PortReleasePage() {
	const { currentUser } = useAuthContext();
	const canManage = hasAnyPermission(currentUser, ["liberacao_portas.manage"]);
	const canExecute = hasAnyPermission(currentUser, ["liberacao_portas.execute"]);
	const canHistory = hasAnyPermission(currentUser, ["liberacao_portas.history"]);
	const canExport = hasAnyPermission(currentUser, ["liberacao_portas.export"]);
	const [tab, setTab] = useState("operation");
	const [codes, setCodes] = useState("");
	const [results, setResults] = useState([]);
	const [searchSession, setSearchSession] = useState({ id: "", pagination: { page: 1, totalPages: 1, total: 0 } });
	const [selected, setSelected] = useState(new Set());
	const [invalid, setInvalid] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [reason, setReason] = useState("");
	const [note, setNote] = useState("");
	const [batch, setBatch] = useState(null);
	const [history, setHistory] = useState({ items: [], pagination: { page: 1, totalPages: 1 } });
	const [stats, setStats] = useState({ total: 0, clients: 0, today: 0, month: 0, failures: 0, topSourceTypes: [] });
	const [config, setConfig] = useState(null);
	const [configItems, setConfigItems] = useState([]);
	const [catalog, setCatalog] = useState([]);

	const parsedCount = useMemo(() => new Set(codes.split(/[\s,;]+/).filter((item) => /^\d{1,20}$/.test(item))).size, [codes]);
	const eligible = results.filter((item) => item.eligibility === "ELIGIBLE");

	async function loadOverview(page = 1) {
		const [nextStats, nextHistory] = await Promise.all([getPortReleaseStats(), canHistory ? listPortReleaseHistory({ page, limit: 25 }) : Promise.resolve(history)]);
		setStats(nextStats);
		setHistory(nextHistory);
	}

	useEffect(() => { loadOverview().catch((err) => setError(err.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => {
		if (!batch?.id || !["QUEUED", "RUNNING"].includes(batch.status)) return undefined;
		const timer = setInterval(async () => {
			const current = await getPortReleaseBatch(batch.id);
			setBatch(current);
			if (!["QUEUED", "RUNNING"].includes(current.status)) { clearInterval(timer); loadOverview(); }
		}, 1500);
		return () => clearInterval(timer);
	}, [batch?.id, batch?.status]); // eslint-disable-line react-hooks/exhaustive-deps

	async function verify() {
		setLoading(true); setError(""); setMessage("");
		try {
			const response = await searchPortReleaseOrders({ codes, page: 1, limit: 50 });
			setResults(response.items || []); setInvalid(response.invalidCodes || []); setSelected(new Set());
			setSearchSession({ id: response.searchId, pagination: response.pagination });
			setMessage(`${response.pagination?.total || 0} resultado(s) verificado(s), sem alterar o HubSoft.`);
		} catch (err) { setError(err.message); } finally { setLoading(false); }
	}

	async function changeSearchPage(page) {
		setLoading(true); setError("");
		try {
			const response = await getPortReleaseSearch(searchSession.id, { page, limit: 50 });
			setResults(response.items || []); setSelected(new Set());
			setSearchSession({ id: response.searchId, pagination: response.pagination });
		} catch (err) { setError(err.message); } finally { setLoading(false); }
	}

	async function execute() {
		if (!reason) return setError("Selecione o motivo da alteração.");
		if (!window.confirm(`Confirma a alteração de ${selected.size} O.S. para Liberação de Portas?`)) return;
		setLoading(true); setError("");
		try {
			const orders = results.filter((item) => selected.has(item.serviceOrderId));
			const created = await createPortReleaseBatch({ orders, reason, note });
			setBatch(created); setMessage("Lote recebido. O progresso será atualizado automaticamente."); setSelected(new Set());
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
		<nav className="flex gap-2 border-b"><button onClick={() => setTab("operation")} className={`px-4 py-3 font-bold ${tab === "operation" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`}>Operação</button>{canHistory && <button onClick={() => setTab("history")} className={`px-4 py-3 font-bold ${tab === "history" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`}>Histórico e relatórios</button>}</nav>
		{error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}{message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</div>}
		{tab === "operation" && <>
			<section className="rounded-lg border bg-white p-4 shadow-sm"><label className="font-bold">Códigos dos clientes</label><textarea value={codes} onChange={(event) => setCodes(event.target.value)} rows={5} placeholder="123456, 789012 ou um código por linha" className="mt-2 w-full resize-y rounded-lg border p-3" /><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{parsedCount} código(s) único(s){invalid.length ? ` · ${invalid.length} inválido(s)` : ""}</span><div className="flex gap-2"><button onClick={() => { setCodes(""); setResults([]); }} className="rounded-lg border px-4 py-2 font-bold">Limpar</button><button disabled={loading || !parsedCount} onClick={verify} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">{loading ? <Loader2 className="animate-spin" size={17} /> : <Search size={17} />} Verificar clientes</button></div></div></section>
			{results.length > 0 && <section className="overflow-hidden rounded-lg border bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3"><input type="checkbox" checked={eligible.length > 0 && selected.size === eligible.length} onChange={(event) => setSelected(event.target.checked ? new Set(eligible.map((item) => item.serviceOrderId)) : new Set())} /></th>{["Código", "Cliente", "O.S.", "Tipo atual", "Status", "Nova classificação", "Elegibilidade", "Observação"].map((label) => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead><tbody>{results.map((item, index) => <tr key={item.resultId || item.serviceOrderId || `${item.clientCode}-${index}`} className="border-t"><td className="p-3"><input type="checkbox" disabled={item.eligibility !== "ELIGIBLE"} checked={selected.has(item.serviceOrderId)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(item.serviceOrderId) ? next.delete(item.serviceOrderId) : next.add(item.serviceOrderId); return next; })} /></td><td className="p-3 font-bold">{item.clientCode}</td><td className="p-3">{item.clientName || "-"}</td><td className="p-3">{item.serviceOrderNumber || "-"}</td><td className="p-3">{item.sourceTypeName || "-"}</td><td className="p-3">{item.status || "-"}</td><td className="p-3 font-bold">{item.targetTypeName || "Liberação de Portas"}</td><td className="p-3">{item.eligibility === "ELIGIBLE" ? <span className="text-emerald-700">{STATUS_LABEL[item.eligibility]}</span> : <span className="text-amber-700">{STATUS_LABEL[item.eligibility]}</span>}</td><td className="min-w-64 p-3">{item.observation}</td></tr>)}</tbody></table></div><div className="p-4"><Pager pagination={searchSession.pagination} onPage={changeSearchPage} /></div></section>}
			{canExecute && selected.size > 0 && <section className="grid gap-3 rounded-lg border bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto]"><select value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-lg border p-3"><option value="">Motivo da alteração</option>{REASONS.map((item) => <option key={item}>{item}</option>)}</select><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Observação complementar" className="rounded-lg border p-3" /><button disabled={loading} onClick={execute} className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white">Alterar {selected.size} selecionada(s)</button></section>}
			{batch && <section className="rounded-lg border bg-white p-4"><h2 className="font-black">Lote {batch.id}</h2><p className="mt-1 text-sm">Status: {batch.status} · Processadas {batch.processed || 0}/{batch.total}</p><div className="mt-3 h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-blue-600" style={{ width: `${batch.total ? ((batch.processed || 0) / batch.total) * 100 : 0}%` }} /></div></section>}
		</>}
		{tab === "history" && <section className="rounded-lg border bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><h2 className="flex items-center gap-2 font-black"><History size={18} /> Histórico de liberações</h2>{canExport && <div className="flex gap-2"><a href={portReleaseExportUrl("csv")} className="inline-flex items-center gap-2 rounded border px-3 py-2 font-bold"><Download size={16} /> CSV</a><a href={portReleaseExportUrl("xlsx")} className="inline-flex items-center gap-2 rounded border px-3 py-2 font-bold"><Download size={16} /> XLSX</a></div>}</div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left"><tr>{["Resultado", "Cliente", "O.S.", "Empresa", "De", "Para", "Responsável", "Data", "Motivo"].map((item) => <th key={item} className="p-3">{item}</th>)}</tr></thead><tbody>{history.items.map((item) => <tr key={item.id} className="border-t"><td className="p-3">{item.status === "SUCCESS" ? <CheckCircle2 className="text-emerald-600" size={18} /> : <XCircle className="text-red-500" size={18} />}</td><td className="p-3"><b>{item.clientName}</b><br />{item.clientCode}</td><td className="p-3">{item.serviceOrderNumber}</td><td className="p-3">{item.companyName}</td><td className="p-3">{item.sourceTypeName}</td><td className="p-3">{item.targetTypeName}</td><td className="p-3">{item.requestedByName}</td><td className="p-3 whitespace-nowrap">{new Date(item.requestedAt).toLocaleString("pt-BR")}</td><td className="p-3">{item.reason}</td></tr>)}</tbody></table></div><div className="p-4"><Pager pagination={history.pagination} onPage={(page) => loadOverview(page)} /></div></section>}
		{tab === "config" && canManage && config && <section className="space-y-4 rounded-lg border bg-white p-5 shadow-sm"><div><h2 className="font-black">Contrato real do HubSoft</h2><p className="text-sm text-slate-600">A execução permanece bloqueada sem origem, destino e status configurados por ID.</p></div><div className="flex flex-wrap gap-2"><select value={config.company_key || config.companyKey || "DEFAULT"} onChange={(event) => setConfig(configItems.find((item) => item.company_key === event.target.value) || config)} className="min-w-64 rounded-lg border p-3">{configItems.map((item) => <option key={item.company_key} value={item.company_key}>{item.company_name}</option>)}{!configItems.length && <option value="DEFAULT">Padrão</option>}</select><button type="button" onClick={() => setConfig({ companyKey: "", companyName: "", source_types: [], target_type: null, open_statuses: ["aguardando_agendamento", "pendente"], batch_limit: 500, concurrency: 2 })} className="rounded-lg border px-4 py-2 font-bold">Nova configuração</button></div><div className="grid gap-3 md:grid-cols-2"><label><span className="font-bold">ID da empresa/contexto</span><input value={config.company_key || config.companyKey || ""} onChange={(event) => setConfig({ ...config, company_key: event.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label><label><span className="font-bold">Nome da empresa/contexto</span><input value={config.company_name || config.companyName || ""} onChange={(event) => setConfig({ ...config, company_name: event.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label></div><label className="block"><span className="font-bold">Tipo de destino</span><select value={config.target_type?.id || ""} onChange={(event) => { const type = catalog.find((item) => item.id === Number(event.target.value)); setConfig({ ...config, target_type: type || null }); }} className="mt-1 w-full rounded-lg border p-3"><option value="">Selecione Liberação de Portas no catálogo real</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}</select></label><fieldset><legend className="font-bold">Tipos de origem elegíveis</legend><div className="mt-2 grid max-h-72 gap-2 overflow-y-auto rounded-lg border p-3 md:grid-cols-2">{catalog.map((item) => { const checked = (config.source_types || []).some((type) => Number(type.id) === item.id); return <label key={item.id} className="flex gap-2 text-sm"><input type="checkbox" checked={checked} onChange={() => setConfig({ ...config, source_types: checked ? config.source_types.filter((type) => Number(type.id) !== item.id) : [...(config.source_types || []), item] })} /> {item.id} · {item.name}</label>; })}</div></fieldset><label className="block"><span className="font-bold">Status abertos (identificadores do HubSoft)</span><input value={(config.open_statuses || []).join(", ")} onChange={(event) => setConfig({ ...config, open_statuses: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} className="mt-1 w-full rounded-lg border p-3" /></label><div className="flex justify-end"><button disabled={loading} onClick={saveConfig} className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white">Salvar configuração</button></div></section>}
	</div>;
}
