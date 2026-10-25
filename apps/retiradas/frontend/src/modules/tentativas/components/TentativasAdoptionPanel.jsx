import { BellRing, CalendarDays, Eye, RefreshCw, Smartphone, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import {
	buscarAdocaoTentativas,
	buscarHistoricoAlertasTentativas,
	executarAlertasTentativas,
} from "../services/tentativasService";

const isoDate = (date) => date.toISOString().slice(0, 10);
const initialStart = () => { const date = new Date(); date.setDate(date.getDate() - 29); return isoDate(date); };
const number = (value) => new Intl.NumberFormat("pt-BR").format(Number(value || 0));
const dateTime = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Nunca";

function Pager({ page, total, limit, onChange }) {
	const pages = Math.max(1, Math.ceil(Number(total || 0) / Number(limit || 20)));
	return <div className="flex items-center justify-between text-sm font-bold text-slate-500"><span>Página {page} de {pages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Anterior</button><button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Próxima</button></div></div>;
}

export default function TentativasAdoptionPanel() {
	const [filters, setFilters] = useState({ startDate: initialStart(), endDate: isoDate(new Date()), search: "" });
	const [draft, setDraft] = useState("");
	const [usagePage, setUsagePage] = useState(1);
	const [alertPage, setAlertPage] = useState(1);
	const [usage, setUsage] = useState(null);
	const [alerts, setAlerts] = useState(null);
	const [loading, setLoading] = useState(true);
	const [running, setRunning] = useState(false);
	const params = useMemo(() => ({ ...filters, page: usagePage, limit: 15 }), [filters, usagePage]);
	const alertParams = useMemo(() => ({ startDate: filters.startDate, endDate: filters.endDate, page: alertPage, limit: 15 }), [alertPage, filters.endDate, filters.startDate]);
	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [usageData, alertData] = await Promise.all([buscarAdocaoTentativas(params), buscarHistoricoAlertasTentativas(alertParams)]);
			setUsage(usageData); setAlerts(alertData);
		} finally { setLoading(false); }
	}, [alertParams, params]);
	useEffect(() => { void load(); }, [load]);
	if (loading && !usage) return <Spinner />;
	const sent = (usage?.items || []).reduce((sum, item) => sum + Number(item.alerts_sent || 0), 0);
	const opened = (usage?.items || []).reduce((sum, item) => sum + Number(item.alerts_opened || 0), 0);
	return (
		<div className="space-y-5">
			<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
					<div><p className="text-xs font-black uppercase text-blue-700">Adoção e alertas</p><h3 className="text-xl font-black text-slate-950">Uso real da Central de Tentativas</h3><p className="text-sm font-semibold text-slate-500">Acessos, entrega de push e abertura por técnico.</p></div>
					<div className="flex flex-wrap gap-2"><label className="grid gap-1 text-xs font-black">De<input type="date" value={filters.startDate} onChange={(e) => { setUsagePage(1); setAlertPage(1); setFilters((value) => ({ ...value, startDate: e.target.value })); }} className="min-h-11 rounded-lg border px-3" /></label><label className="grid gap-1 text-xs font-black">Até<input type="date" value={filters.endDate} onChange={(e) => { setUsagePage(1); setAlertPage(1); setFilters((value) => ({ ...value, endDate: e.target.value })); }} className="min-h-11 rounded-lg border px-3" /></label><button type="button" disabled={running} onClick={async () => { setRunning(true); try { await executarAlertasTentativas(); await load(); } finally { setRunning(false); } }} className="mt-auto inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white"><BellRing className="h-4 w-4" />{running ? "Processando" : "Executar alertas"}</button></div>
				</div>
			</section>
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				{[[Users,"Técnicos cadastrados",usage?.total],[Smartphone,"Acessaram Tentativas",usage?.summary?.users_accessed],[CalendarDays,"Acessos no período",usage?.summary?.visits],[Eye,"Alertas abertos",`${number(opened)} de ${number(sent)}`]].map(([Icon,label,value]) => <article key={label} className="rounded-xl border bg-white p-4 shadow-sm"><Icon className="h-5 w-5 text-blue-600" /><p className="mt-3 text-xs font-black uppercase text-slate-500">{label}</p><strong className="text-2xl font-black text-slate-950">{typeof value === "string" ? value : number(value)}</strong></article>)}
			</div>
			<section className="space-y-3">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-lg font-black">Utilização por técnico</h3><p className="text-sm font-semibold text-slate-500">Cada carregamento da página é registrado com data e hora.</p></div><form onSubmit={(e) => { e.preventDefault(); setUsagePage(1); setFilters((value) => ({ ...value, search: draft.trim() })); }} className="flex gap-2"><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Buscar técnico" className="min-h-11 rounded-lg border px-3" /><button className="min-h-11 rounded-lg border px-4 font-black">Buscar</button><button type="button" onClick={() => void load()} className="grid min-h-11 min-w-11 place-items-center rounded-lg border"><RefreshCw className="h-4 w-4" /></button></form></div>
				<div className="overflow-x-auto rounded-xl border bg-white"><table className="min-w-[850px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Técnico","Último acesso","Acessos","Dias ativos","Alertas","Abertos","Taxa de abertura"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{(usage?.items || []).map((item) => <tr key={item.user_id} className="border-t"><td className="px-4 py-3"><strong className="block">{item.user_name}</strong><span className="text-xs text-slate-500">{item.user_email}</span></td><td className="px-4">{dateTime(item.last_visit_at)}</td><td className="px-4 font-black">{number(item.visits)}</td><td className="px-4">{number(item.active_days)}</td><td className="px-4">{number(item.alerts_sent)}</td><td className="px-4">{number(item.alerts_opened)}</td><td className="px-4 font-black text-blue-700">{Number(item.alerts_sent) ? `${Math.round(Number(item.alerts_opened) * 100 / Number(item.alerts_sent))}%` : "-"}</td></tr>)}</tbody></table></div>
				<Pager page={usage?.page || 1} total={usage?.total || 0} limit={usage?.limit || 15} onChange={setUsagePage} />
			</section>
			<section className="space-y-3">
				<div><h3 className="text-lg font-black">Histórico de alertas</h3><p className="text-sm font-semibold text-slate-500">Confirma se o alerta foi entregue por push, lido e aberto pelo técnico.</p></div>
				<div className="overflow-x-auto rounded-xl border bg-white"><table className="min-w-[920px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Enviado em","Técnico","Alerta","Push","Leitura","Abertura"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{(alerts?.items || []).map((item) => <tr key={`${item.notification_id}-${item.user_id}`} className="border-t"><td className="px-4">{dateTime(item.created_at)}</td><td className="px-4 font-bold">{item.meta?.technicianName || item.user_email || item.user_id}</td><td className="px-4"><strong className="block">{item.title}</strong><span className="text-xs text-slate-500">{item.message}</span></td><td className="px-4">{item.push_delivered_at ? "Entregue" : "Sem assinatura"}</td><td className="px-4">{item.read_at ? dateTime(item.read_at) : "Não lido"}</td><td className="px-4 font-bold">{item.opened_at ? dateTime(item.opened_at) : "Não abriu"}</td></tr>)}</tbody></table>{!(alerts?.items || []).length ? <p className="p-8 text-center font-semibold text-slate-500">Nenhum alerta no período.</p> : null}</div>
				<Pager page={alerts?.page || 1} total={alerts?.total || 0} limit={alerts?.limit || 15} onChange={setAlertPage} />
			</section>
		</div>
	);
}
