import { useEffect, useMemo, useState } from "react";
import { BarChart3, ClipboardCheck, PackageCheck, ShieldCheck } from "lucide-react";
import { fetchRotAuditReports } from "../../api/rotApi";
import Spinner from "../../components/ui/Spinner";
import { Kpi, PageHeader } from "./TechniciansPage";

function CardList({ title, icon: Icon, items, render }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="mb-4 flex items-center gap-3">
				<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={22} /></span>
				<div>
					<h2 className="text-xl font-black text-slate-950">{title}</h2>
					<p className="text-sm font-semibold text-blue-600">{items.length} registro(s)</p>
				</div>
			</div>
			<div className="grid gap-3 xl:grid-cols-3">
				{items.slice(0, 9).map(render)}
			</div>
			{items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-400">Nenhum registro encontrado.</div> : null}
		</section>
	);
}

function SmallRecord({ title, subtitle, badge }) {
	return (
		<article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 className="truncate text-sm font-black text-slate-950">{title}</h3>
					<p className="mt-1 text-xs font-bold text-slate-500">{subtitle}</p>
				</div>
				<span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{badge}</span>
			</div>
		</article>
	);
}

export default function AuditReportsPage() {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			setData(await fetchRotAuditReports());
		} catch (err) {
			setError(err?.message || "Não foi possível carregar relatórios.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, []);

	const summary = data?.summary || {};
	const audits = data?.audits || [];
	const average = useMemo(() => audits.length ? Math.round(audits.reduce((sum, item) => sum + Number(item.score || 0), 0) / audits.length) : 0, [audits]);

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<PageHeader title="Relatórios de Auditoria" description="Consolidado de acertos, entregas e auditoria de bolsa." icon={BarChart3} onRefresh={load} createLabel="" />
			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
			<div className="grid gap-3 md:grid-cols-5">
				<Kpi label="Acertos" value={summary.stockAdjustments || 0} />
				<Kpi label="Entregas" value={summary.deliveries || 0} />
				<Kpi label="Auditorias" value={summary.audits || 0} />
				<Kpi label="Aprovadas" value={summary.approvedAudits || 0} />
				<Kpi label="Score médio" value={`${average}%`} />
			</div>
			<CardList
				title="Últimos acertos"
				icon={ClipboardCheck}
				items={data?.stockAdjustments || []}
				render={(item) => <SmallRecord key={item.id} title={item.code || item.technicianName || "Acerto"} subtitle={`${item.companyName || "Sem empresa"} · ${item.regionalName || "Sem regional"}`} badge={item.status} />}
			/>
			<CardList
				title="Últimas entregas"
				icon={PackageCheck}
				items={data?.deliveries || []}
				render={(item) => <SmallRecord key={item.id} title={item.technicianName || "Entrega"} subtitle={`${item.companyName || "Sem empresa"} · ${item.type}`} badge={item.status} />}
			/>
			<CardList
				title="Últimas auditorias"
				icon={ShieldCheck}
				items={audits}
				render={(item) => <SmallRecord key={item.id} title={item.technicianName || "Auditoria"} subtitle={`${item.regionalName || "Sem regional"} · ${item.date?.slice?.(0, 10) || "-"}`} badge={`${item.score}%`} />}
			/>
		</div>
	);
}
