import {
	AlertTriangle,
	CalendarClock,
	CheckCircle2,
	Clock3,
	Download,
	FileUp,
	PackageCheck,
	RefreshCw,
	Search,
	ShieldCheck,
	TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import {
	atualizarRecuperacaoTentativas,
	atualizarRetornoTentativas,
	baixarAnalyticsTentativasCsv,
	buscarAnalyticsTentativas,
	buscarAuditoriaTentativas,
	buscarInteligenciaTentativas,
	buscarMinhaProdutividadeTentativas,
	enviarEvidenciaRecuperacaoTentativas,
	listarRecuperacoesTentativas,
	listarRetornosTentativas,
	recalcularPrioridadesTentativas,
} from "../services/tentativasService";

const RECOVERY_STATUS = {
	AWAITING_DEFINITION: "Aguardando definição",
	AWAITING_SCHEDULE: "Aguardando agendamento",
	COLLECTION_SCHEDULED: "Coleta agendada",
	STORE_DELIVERY_EXPECTED: "Entrega em loja prevista",
	AWAITING_EXECUTION: "Aguardando execução",
	AWAITING_CONFIRMATION: "Aguardando conferência",
	PARTIALLY_RECOVERED: "Recuperação parcial",
	RECOVERY_CONFIRMED: "Recuperação confirmada",
	NOT_RECOVERED: "Não recuperado",
	CLOSED_EXCEPTION: "Encerrado por exceção",
};

const TRANSITIONS = {
	AWAITING_DEFINITION: ["AWAITING_SCHEDULE", "STORE_DELIVERY_EXPECTED", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	AWAITING_SCHEDULE: ["COLLECTION_SCHEDULED", "STORE_DELIVERY_EXPECTED", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	COLLECTION_SCHEDULED: ["AWAITING_EXECUTION", "AWAITING_CONFIRMATION", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	STORE_DELIVERY_EXPECTED: ["AWAITING_CONFIRMATION", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	AWAITING_EXECUTION: ["AWAITING_CONFIRMATION", "PARTIALLY_RECOVERED", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	AWAITING_CONFIRMATION: ["PARTIALLY_RECOVERED", "RECOVERY_CONFIRMED", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	PARTIALLY_RECOVERED: ["AWAITING_CONFIRMATION", "RECOVERY_CONFIRMED", "NOT_RECOVERED", "CLOSED_EXCEPTION"],
	NOT_RECOVERED: ["AWAITING_DEFINITION"],
	CLOSED_EXCEPTION: ["AWAITING_DEFINITION"],
};

function formatNumber(value) {
	return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function formatDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return new Intl.DateTimeFormat("pt-BR", {
		timeZone: "America/Sao_Paulo",
		dateStyle: "short",
		timeStyle: "short",
	}).format(date);
}

function todayMinus(days) {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return date.toISOString().slice(0, 10);
}

function Feedback({ type = "error", children }) {
	if (!children) return null;
	return (
		<div className={`rounded-xl px-4 py-3 text-sm font-bold ${type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
			{children}
		</div>
	);
}

function Empty({ children }) {
	return <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-bold text-slate-500">{children}</div>;
}

export function CallbacksPanel({ period = "all", title = "Retornos agendados" }) {
	const [data, setData] = useState({ items: [], total: 0, page: 1, limit: 20 });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState("");
	const load = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			setData(await listarRetornosTentativas({ period, limit: 50 }));
		} catch (err) {
			setError(err.message || "Falha ao carregar retornos.");
		} finally {
			setLoading(false);
		}
	}, [period]);
	useEffect(() => { void load(); }, [load]);
	const update = async (item, payload) => {
		setBusy(item.id);
		setError("");
		try {
			await atualizarRetornoTentativas(item.id, payload);
			await load();
		} catch (err) {
			setError(err.message || "Falha ao atualizar retorno.");
		} finally {
			setBusy("");
		}
	};
	return (
		<section className="space-y-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">Agenda de contatos</p>
					<h2 className="text-2xl font-black text-slate-950">{title}</h2>
					<p className="text-sm font-semibold text-slate-500">{formatNumber(data.total)} compromisso(s) encontrado(s).</p>
				</div>
				<button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700">
					<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
				</button>
			</div>
			<Feedback>{error}</Feedback>
			{loading && !data.items.length ? <Spinner /> : null}
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{data.items.map((item) => {
					const overdue = item.status === "PENDING" && new Date(item.scheduled_at) < new Date();
					return (
						<article key={item.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${overdue ? "border-red-200" : "border-slate-200"}`}>
							<div className="flex items-start justify-between gap-3">
								<div>
									<strong className="block text-slate-950">{item.cliente || "Cliente"}</strong>
									<span className="text-xs font-bold text-slate-500">({item.codigo_cliente}) · OS {item.os}</span>
								</div>
								<span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${overdue ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
									{overdue ? "Vencido" : item.status === "COMPLETED" ? "Concluído" : "Programado"}
								</span>
							</div>
							<p className="mt-3 flex items-center gap-2 text-sm font-black text-slate-700"><CalendarClock className="h-4 w-4 text-blue-600" /> {formatDateTime(item.scheduled_at)}</p>
							<p className="mt-1 text-sm font-semibold text-slate-500">{item.cidade}{item.bairro ? ` · ${item.bairro}` : ""} · {item.preferred_channel}</p>
							{item.observation ? <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{item.observation}</p> : null}
							{item.status === "PENDING" ? (
								<div className="mt-4 grid grid-cols-2 gap-2">
									<button type="button" disabled={busy === item.id} onClick={() => void update(item, { status: "COMPLETED" })} className="min-h-11 rounded-xl bg-emerald-600 px-3 text-sm font-black text-white disabled:opacity-50">Concluir</button>
									<button type="button" disabled={busy === item.id} onClick={() => void update(item, { status: "CANCELLED" })} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-700 disabled:opacity-50">Cancelar</button>
								</div>
							) : null}
						</article>
					);
				})}
			</div>
			{!loading && !data.items.length ? <Empty>Nenhum retorno neste período.</Empty> : null}
		</section>
	);
}

export function RecoveriesPanel({ scheduledOnly = false }) {
	const [data, setData] = useState({ items: [], total: 0 });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [evidence, setEvidence] = useState({});
	const [evidenceFiles, setEvidenceFiles] = useState({});
	const [equipment, setEquipment] = useState({});
	const load = useCallback(async () => {
		setLoading(true);
		try {
			const response = await listarRecuperacoesTentativas({ limit: 100 });
			setData({ ...response, items: scheduledOnly ? (response.items || []).filter((item) => ["COLLECTION_SCHEDULED", "STORE_DELIVERY_EXPECTED", "AWAITING_EXECUTION"].includes(item.status)) : response.items || [] });
		} catch (err) {
			setError(err.message || "Falha ao carregar recuperações.");
		} finally { setLoading(false); }
	}, [scheduledOnly]);
	useEffect(() => { void load(); }, [load]);
	const changeStatus = async (item, status) => {
		setError("");
		try {
			const currentEquipment = equipment[item.id] || {};
			let evidenceReference = evidence[item.id] || item.evidence_reference || "";
			const evidenceFile = evidenceFiles[item.id];
			if (evidenceFile) {
				const uploaded = await enviarEvidenciaRecuperacaoTentativas(item.id, evidenceFile);
				evidenceReference = uploaded.path;
				setEvidence((current) => ({ ...current, [item.id]: uploaded.path }));
			}
			await atualizarRecuperacaoTentativas(item.id, {
				status,
				evidenceReference,
				equipments: status === "RECOVERY_CONFIRMED" ? [{
					type: currentEquipment.type || "",
					macSerial: currentEquipment.macSerial || "",
					quantity: Number(currentEquipment.quantity || 1),
					evidenceReference,
				}] : [],
			});
			await load();
		} catch (err) { setError(err.message || "Falha ao atualizar recuperação."); }
	};
	return (
		<section className="space-y-4">
			<div>
				<p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Recuperação assistida</p>
				<h2 className="text-2xl font-black text-slate-950">{scheduledOnly ? "Agendamentos" : "Recuperações em andamento"}</h2>
				<p className="text-sm font-semibold text-slate-500">Intenção e contato não contam como equipamento recuperado; a confirmação exige evidência.</p>
			</div>
			<Feedback>{error}</Feedback>
			{loading ? <Spinner /> : null}
			<div className="grid gap-3 lg:grid-cols-2">
				{data.items.map((item) => (
					<article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<div className="flex items-start justify-between gap-3">
							<div><strong className="block text-slate-950">{item.cliente}</strong><span className="text-xs font-bold text-slate-500">({item.codigo_cliente}) · OS {item.os}</span></div>
							<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">{RECOVERY_STATUS[item.status] || item.status}</span>
						</div>
						<p className="mt-3 text-sm font-semibold text-slate-600">{item.modality === "STORE_DELIVERY" ? "Entrega em loja" : "Coleta por técnico"} · {item.cidade}</p>
						{item.scheduled_at ? <p className="mt-1 text-sm font-bold text-slate-700">Previsto: {formatDateTime(item.scheduled_at)}</p> : null}
						{(TRANSITIONS[item.status] || []).includes("RECOVERY_CONFIRMED") ? (
							<div className="mt-3 grid gap-2 sm:grid-cols-2">
								<input value={equipment[item.id]?.type || ""} onChange={(event) => setEquipment((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), type: event.target.value } }))} placeholder="Tipo do equipamento" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-emerald-400" />
								<input value={equipment[item.id]?.macSerial || ""} onChange={(event) => setEquipment((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), macSerial: event.target.value } }))} placeholder="MAC ou serial" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold uppercase outline-none focus:border-emerald-400" />
								<input type="number" min="1" value={equipment[item.id]?.quantity || 1} onChange={(event) => setEquipment((current) => ({ ...current, [item.id]: { ...(current[item.id] || {}), quantity: event.target.value } }))} aria-label="Quantidade recuperada" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-emerald-400" />
				<label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:border-emerald-300">
					<FileUp className="h-4 w-4 text-emerald-600" />
					<span className="min-w-0 truncate">{evidenceFiles[item.id]?.name || (evidence[item.id] || item.evidence_reference ? "Evidência anexada" : "Anexar evidência")}</span>
					<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" onChange={(event) => setEvidenceFiles((current) => ({ ...current, [item.id]: event.target.files?.[0] || null }))} />
				</label>
							</div>
						) : null}
						{(TRANSITIONS[item.status] || []).length ? (
							<label className="mt-3 grid gap-1 text-xs font-black uppercase tracking-[0.08em] text-slate-500">
								Atualizar etapa
								<select defaultValue="" onChange={(event) => event.target.value && void changeStatus(item, event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-700">
									<option value="">Selecione</option>
									{TRANSITIONS[item.status].map((status) => <option key={status} value={status}>{RECOVERY_STATUS[status]}</option>)}
								</select>
							</label>
						) : null}
					</article>
				))}
			</div>
			{!loading && !data.items.length ? <Empty>Nenhum acompanhamento neste momento.</Empty> : null}
		</section>
	);
}

export function ProductivityPanel() {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	useEffect(() => {
		buscarMinhaProdutividadeTentativas({ startDate: todayMinus(29) })
			.then(setData).catch((err) => setError(err.message || "Falha ao carregar produtividade."))
			.finally(() => setLoading(false));
	}, []);
	if (loading) return <Spinner />;
	const summary = data?.summary || {};
	const items = [
		["Carteira atribuída", summary.assigned], ["Clientes trabalhados", summary.worked],
		["Tentativas", summary.attempts], ["Contatos efetivos", summary.effective_contacts],
		["Agendamentos", summary.scheduled], ["Retornos pendentes", summary.pending_callbacks],
		["Retornos atrasados", summary.overdue_callbacks], ["Recuperações validadas", summary.recovered],
	];
	return (
		<section className="space-y-4">
			<div><p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">Últimos 30 dias</p><h2 className="text-2xl font-black text-slate-950">Minha produtividade</h2></div>
			<Feedback>{error}</Feedback>
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{items.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">{label}</span><strong className="mt-2 block text-2xl font-black text-slate-950">{formatNumber(value)}</strong></div>)}
			</div>
			<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-center justify-between"><strong className="text-slate-950">Progresso da carteira</strong><span className="font-black text-blue-700">{summary.progress || 0}%</span></div>
				<div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(Number(summary.progress || 0), 100)}%` }} /></div>
			</div>
		</section>
	);
}

function Metric({ label, value, accent = "blue" }) {
	const colors = accent === "emerald" ? "bg-emerald-50 text-emerald-700" : accent === "amber" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
	return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">{label}</span><strong className={`mt-3 block w-fit rounded-xl px-3 py-1 text-2xl font-black ${colors}`}>{value}</strong></div>;
}

export function ManagementPanel() {
	const [filters, setFilters] = useState({ startDate: todayMinus(29), endDate: new Date().toISOString().slice(0, 10), empresa: "", regional: "", cidade: "", bairro: "", tecnicoId: "", statusOs: "", resultado: "", modalidade: "", tipoEquipamento: "" });
	const [appliedFilters, setAppliedFilters] = useState(filters);
	const [data, setData] = useState(null);
	const [intelligence, setIntelligence] = useState({ alerts: [] });
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState("");
	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [analytics, rules] = await Promise.all([buscarAnalyticsTentativas(appliedFilters), buscarInteligenciaTentativas(appliedFilters)]);
			setData(analytics); setIntelligence(rules);
		} finally { setLoading(false); }
	}, [appliedFilters]);
	useEffect(() => { void load(); }, [load]);
	const indicators = data?.indicators || {};
	const metrics = [
		["Clientes elegíveis", indicators.eligible], ["Distribuídos", indicators.distributed], ["Trabalhados", indicators.worked],
		["Sem tentativa", indicators.withoutAttempt], ["Tentativas", indicators.attempts], ["Contatos efetivos", indicators.effective_contacts],
		["Retornos vencidos", indicators.overdue_callbacks], ["Agendamentos", indicators.scheduled], ["Equipamentos recuperados", indicators.recovered_equipment],
	];
	return (
		<section className="space-y-4">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div><p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">Gestão de Tentativas</p><h2 className="text-2xl font-black text-slate-950">Central de recuperação</h2><p className="text-sm font-semibold text-slate-500">Atividade, resultado e conversão permanecem separados.</p></div>
				<div className="flex flex-wrap gap-2">
					<input type="date" value={filters.startDate} onChange={(e) => setFilters((current) => ({ ...current, startDate: e.target.value }))} className="min-h-11 rounded-xl border border-slate-200 px-3 font-bold" />
					<input type="date" value={filters.endDate} onChange={(e) => setFilters((current) => ({ ...current, endDate: e.target.value }))} className="min-h-11 rounded-xl border border-slate-200 px-3 font-bold" />
					<button type="button" onClick={() => setAppliedFilters({ ...filters })} className="min-h-11 rounded-xl bg-blue-600 px-4 font-black text-white">Aplicar</button>
					<button type="button" onClick={() => baixarAnalyticsTentativasCsv(appliedFilters)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-black text-slate-700"><Download className="h-4 w-4" /> CSV</button>
				</div>
			</div>
			<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
				{["empresa", "regional", "cidade", "bairro", "tecnicoId", "tipoEquipamento"].map((key) => <input key={key} value={filters[key]} onChange={(e) => setFilters((current) => ({ ...current, [key]: e.target.value }))} placeholder={key === "tecnicoId" ? "ID do técnico" : key === "tipoEquipamento" ? "Tipo de equipamento" : key[0].toUpperCase() + key.slice(1)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 font-semibold" />)}
				<select value={filters.statusOs} onChange={(e) => setFilters((current) => ({ ...current, statusOs: e.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 font-semibold"><option value="">Todos os status da OS</option><option value="PENDING">Pendente</option><option value="CONTACT_STARTED">Contato iniciado</option><option value="SCHEDULED">Agendada</option><option value="COMPLETED">Concluída</option></select>
				<select value={filters.resultado} onChange={(e) => setFilters((current) => ({ ...current, resultado: e.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 font-semibold"><option value="">Todos os resultados</option><option value="NO_RESPONSE">Sem resposta</option><option value="RESPONDED_SCHEDULE">Deseja agendar</option><option value="STORE_DELIVERY">Devolverá na loja</option><option value="RESPONDED_CALLBACK">Pediu retorno</option><option value="REFUSED">Recusou</option><option value="INVALID_PHONE">Número inválido</option></select>
				<select value={filters.modalidade} onChange={(e) => setFilters((current) => ({ ...current, modalidade: e.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 font-semibold"><option value="">Todas as modalidades</option><option value="TECHNICIAN_COLLECTION">Coleta por técnico</option><option value="STORE_DELIVERY">Entrega em loja</option></select>
			</div>
			{loading ? <Spinner /> : null}
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">{metrics.map(([label, value]) => <Metric key={label} label={label} value={formatNumber(value)} />)}</div>
			<div className="grid gap-4 lg:grid-cols-[1fr_380px]">
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-600" /><h3 className="font-black text-slate-950">Evolução diária</h3></div>
					<div className="mt-5 flex min-h-52 items-end gap-1 overflow-x-auto border-b border-slate-200 pb-2">
						{(data?.daily || []).map((item) => {
							const max = Math.max(...(data?.daily || []).map((row) => Number(row.attempts || 0)), 1);
							return <div key={item.day} className="flex min-w-8 flex-1 flex-col items-center gap-1" title={`${item.day}: ${item.attempts} tentativas`}><span className="text-[10px] font-bold text-slate-500">{item.attempts}</span><div className="w-full max-w-7 rounded-t bg-blue-500" style={{ height: `${Math.max((Number(item.attempts || 0) / max) * 150, 2)}px` }} /><span className="text-[9px] text-slate-400">{String(item.day).slice(8, 10)}</span></div>;
						})}
					</div>
				</div>
				<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /><h3 className="font-black text-slate-950">Alertas operacionais</h3></div><button type="button" title="Recalcular prioridades" onClick={async () => { const result = await recalcularPrioridadesTentativas(); setMessage(`${result.updated} prioridades recalculadas.`); await load(); }} className="rounded-lg border border-slate-200 p-2 text-slate-600"><RefreshCw className="h-4 w-4" /></button></div>
					<Feedback type="success">{message}</Feedback>
					<div className="mt-3 space-y-2">{(intelligence.alerts || []).map((alert) => <div key={alert.type} className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800"><strong>{formatNumber(alert.value)}</strong> · {alert.message}</div>)}{!intelligence.alerts?.length ? <p className="text-sm font-semibold text-slate-500">Nenhum limite gerencial excedido.</p> : null}</div>
				</div>
			</div>
			<div className="grid gap-3 sm:grid-cols-3"><Metric label="Contato efetivo" value={`${indicators.effectiveContactRate || 0}%`} accent="emerald" /><Metric label="Agendamento / contato" value={`${indicators.scheduleRate || 0}%`} accent="amber" /><Metric label="Recuperação / trabalhados" value={`${indicators.recoveryRate || 0}%`} accent="emerald" /></div>
		</section>
	);
}

export function AuditPanel() {
	const [query, setQuery] = useState("");
	const [data, setData] = useState({ items: [], total: 0 });
	const [loading, setLoading] = useState(true);
	const load = useCallback(async () => {
		setLoading(true);
		try { setData(await buscarAuditoriaTentativas({ q: query, limit: 50 })); } finally { setLoading(false); }
	}, [query]);
	useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
	return (
		<section className="space-y-4">
			<div><p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">Rastreabilidade</p><h2 className="text-2xl font-black text-slate-950">Auditoria operacional</h2></div>
			<div className="flex gap-2"><label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search className="h-4 w-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cliente, código, OS ou responsável" className="min-w-0 flex-1 bg-transparent font-semibold outline-none" /></label><button type="button" onClick={() => void load()} className="rounded-xl bg-blue-600 px-4 font-black text-white">Buscar</button></div>
			{loading ? <Spinner /> : null}
			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				{data.items.map((item) => <div key={item.id} className="grid gap-1 border-b border-slate-100 p-4 last:border-b-0 sm:grid-cols-[180px_1fr_auto]"><span className="text-xs font-bold text-slate-500">{formatDateTime(item.occurred_at)}</span><div><strong className="text-sm text-slate-950">{item.event_type}</strong><p className="text-xs font-semibold text-slate-500">({item.codigo_cliente}) {item.cliente} · OS {item.os}</p></div><span className="text-xs font-black text-slate-600">{item.actor_name || "Sistema"}</span></div>)}
				{!loading && !data.items.length ? <Empty>Nenhum evento encontrado.</Empty> : null}
			</div>
		</section>
	);
}

export { RECOVERY_STATUS };
