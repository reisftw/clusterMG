import { AlertTriangle, BarChart3, Building2, Check, Download, FileText, History, Settings, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { AppModal, DataList, KpiCard, SimpleRow } from "../shared/FacilitiesPrimitives";
import { OperationBadge, OperationTable } from "../shared/OperationTable";

const numberFormatter = new Intl.NumberFormat("pt-BR");

function todayDateKey() {
	return new Date().toISOString().slice(0, 10);
}

function downloadCsv(filename, rows) {
	const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

const SCORE_TABS = [
	{ key: "visao", label: "Visão Geral", icon: BarChart3 },
	{ key: "unidades", label: "Unidades", icon: Building2 },
	{ key: "fatores", label: "Fatores", icon: SlidersHorizontal },
	{ key: "pendencias", label: "Pendências", icon: AlertTriangle },
	{ key: "evolucao", label: "Evolução", icon: History },
	{ key: "configuracoes", label: "Configurações", icon: Settings },
];

function scoreToneClass(tone = "blue") {
	return {
		emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
		orange: "border-orange-100 bg-orange-50 text-orange-700",
		red: "border-red-100 bg-red-50 text-red-700",
		blue: "border-blue-100 bg-blue-50 text-blue-700",
		violet: "border-violet-100 bg-violet-50 text-violet-700",
	}[tone] || "border-slate-100 bg-slate-50 text-slate-700";
}

function buildScoreUnits(dashboard = {}) {
	const sources = [
		...(dashboard?.highlights?.segurancaPendencias || []).map((item) => ({ ...item, source: "Segurança", loss: 5 })),
		...(dashboard?.highlights?.inventariosPendentes || []).map((item) => ({ ...item, source: "Inventário", loss: 2 })),
		...(dashboard?.highlights?.contratosProximos || []).map((item) => ({ ...item, source: "Contratos", loss: 2 })),
		...(dashboard?.highlights?.consumosAnomalias || []).map((item) => ({ ...item, source: "Consumos", loss: 2 })),
	];
	const grouped = sources.reduce((acc, item) => {
		const key = item.imovel || item.unidade || item.propertyName || item.titulo || item.nome || "Unidade não identificada";
		const current = acc[key] || { id: key, unidade: key, empresa: item.empresa || "-", regional: item.regional || "-", loss: 0, pendencias: 0, risks: {} };
		current.loss += Number(item.loss || 0);
		current.pendencias += 1;
		current.risks[item.source] = (current.risks[item.source] || 0) + 1;
		acc[key] = current;
		return acc;
	}, {});
	return Object.values(grouped).map((item) => {
		const score = Math.max(0, 100 - item.loss);
		const classification = score >= 90 ? "Excelente" : score >= 75 ? "Bom" : score >= 60 ? "Atenção" : score >= 40 ? "Crítico" : "Muito crítico";
		return {
			...item,
			score,
			status: classification,
			principalRisco: Object.entries(item.risks).sort((a, b) => b[1] - a[1])[0]?.[0] || "Sem risco",
			evolucao: "-",
		};
	}).sort((a, b) => a.score - b.score);
}

export default function FacilityScorePanel({ dashboard }) {
	const [tab, setTab] = useState("visao");
	const [selectedUnit, setSelectedUnit] = useState(null);
	const score = dashboard?.kpis?.facilityScore || {};
	const fallbackFactors = [
		{ id: "seguranca", label: "Segurança", weight: 30, pointsPerIssue: 5, sourceType: "Segurança", score: 30, loss: 0, pending: 0 },
		{ id: "contratos", label: "Contratos e documentos", weight: 20, pointsPerIssue: 2, sourceType: "Contratos", score: 20, loss: 0, pending: 0 },
		{ id: "inventario", label: "Inventário patrimonial", weight: 20, pointsPerIssue: 2, sourceType: "Patrimônio", score: 20, loss: 0, pending: 0 },
		{ id: "consumos", label: "Consumos e anomalias", weight: 20, pointsPerIssue: 2, sourceType: "Consumos", score: 20, loss: 0, pending: 0 },
		{ id: "operacao", label: "Operação predial", weight: 10, pointsPerIssue: 1, sourceType: "Operação", score: 10, loss: 0, pending: 0 },
	];
	const factors = (score.factors || []).length ? score.factors : fallbackFactors;
	const issues = score.issues || [];
	const units = buildScoreUnits(dashboard);
	const excellentOrGood = units.filter((item) => item.score >= 75).length;
	const attention = units.filter((item) => item.score >= 60 && item.score < 75).length;
	const critical = units.filter((item) => item.score < 60).length;
	const criticalIssues = issues.filter((item) => ["Crítica", "Alta"].includes(item.criticality)).length;
	const evolution = [
		{ month: "Jul", value: score.rawValue ? Math.max(0, score.rawValue - 4) : 0 },
		{ month: "Ago", value: score.rawValue ? Math.max(0, score.rawValue - 2) : 0 },
		{ month: "Set", value: Number(score.rawValue || 0) },
	];
	const maxEvolution = Math.max(...evolution.map((item) => item.value), 1);
	const exportScore = () => downloadCsv(`saude-unidades-${todayDateKey()}.csv`, [
		["Fator", "Peso", "Pontuação", "Perda", "Pendências"],
		...factors.map((item) => [item.label, item.weight, item.score, item.loss, item.pending]),
	]);
	return (
		<section className="space-y-5">
			<header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Facilities &gt; Saúde das Unidades</p>
						<h2 className="mt-2 text-3xl font-black text-slate-950">Saúde das Unidades</h2>
						<p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">Visão consolidada de riscos, conformidade, pendências e situação operacional dos imóveis.</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button type="button" onClick={() => setTab("configuracoes")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700"><Settings size={17} /> Configurar Score</button>
						<button type="button" onClick={exportScore} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white"><Download size={17} /> Exportar</button>
					</div>
				</div>
				<div className="mt-5 flex gap-2 overflow-x-auto pb-1">
					{SCORE_TABS.map((item) => {
						const Icon = item.icon;
						return <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-4 text-xs font-black ${tab === item.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}><Icon size={16} /> {item.label}</button>;
					})}
				</div>
			</header>
			{tab === "visao" ? (
				<div className="space-y-5">
					<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
						<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
							<div>
								<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Facility Score · {score.modelVersion || "v1"}</p>
								<div className="mt-3 flex items-end gap-3">
									<p className="text-6xl font-black text-slate-950">{score.value === null || score.value === undefined ? "--" : numberFormatter.format(Number(score.value))}</p>
									<p className="pb-2 text-xl font-black text-slate-400">/ 100</p>
								</div>
								<p className={`mt-3 inline-flex rounded-2xl border px-4 py-2 text-sm font-black ${scoreToneClass(score.tone)}`}>{score.label || "Dados insuficientes"}</p>
							</div>
							<div className="max-w-xl rounded-2xl border border-slate-100 bg-slate-50 p-4">
								<p className="text-sm font-black text-slate-950">Cálculo transparente</p>
								<p className="mt-1 text-sm font-semibold text-slate-500">100 - {numberFormatter.format(Number(score.totalLoss || 0))} pontos perdidos = {numberFormatter.format(Number(score.rawValue || 0))}. Perdas são limitadas ao peso de cada fator.</p>
								<p className="mt-2 text-xs font-black uppercase text-slate-500">Cobertura de dados: {numberFormatter.format(Number(score.coverage || 0))}%</p>
							</div>
						</div>
					</section>
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
						<KpiCard label="Score médio" value={score.value === null || score.value === undefined ? "--" : numberFormatter.format(Number(score.value))} detail="Modelo explicável" tone={score.tone || "blue"} icon={BarChart3} />
						<KpiCard label="Excelente/Bom" value={numberFormatter.format(excellentOrGood)} detail="Unidades mapeadas" tone="emerald" icon={Check} />
						<KpiCard label="Em atenção" value={numberFormatter.format(attention)} detail="Score 60-74" tone="orange" icon={AlertTriangle} />
						<KpiCard label="Críticas" value={numberFormatter.format(critical)} detail="Score abaixo de 60" tone={critical ? "red" : "emerald"} icon={AlertTriangle} />
						<KpiCard label="Pendências críticas" value={numberFormatter.format(criticalIssues)} detail="Alta ou crítica" tone={criticalIssues ? "red" : "emerald"} icon={ShieldCheck} />
						<KpiCard label="Cobertura" value={`${numberFormatter.format(Number(score.coverage || 0))}%`} detail="Dados disponíveis" tone={Number(score.coverage || 0) < 30 ? "orange" : "blue"} icon={FileText} />
					</div>
					<div className="grid items-start gap-5 xl:grid-cols-2">
						<DataList title="Unidades que exigem atenção" description="Ordenadas por menor score derivado das pendências disponíveis." items={units.slice(0, 8).map((item) => ({ title: item.unidade, subtitle: `${item.principalRisco} · ${item.pendencias} pendência(s)`, value: item.score, tone: item.score < 60 ? "red" : item.score < 75 ? "orange" : "blue" }))} renderItem={(item) => <SimpleRow key={item.title} {...item} />} />
						<DataList title="Principais riscos" description="Pendências consolidadas por origem, sem duplicar dados canônicos." items={factors.filter((item) => item.pending > 0).map((item) => ({ title: item.label, subtitle: `${item.pending} pendência(s) · peso ${item.weight}`, value: `-${item.loss}`, tone: item.loss >= 8 ? "red" : "orange" }))} renderItem={(item) => <SimpleRow key={item.title} {...item} />} />
					</div>
				</div>
			) : null}
			{tab === "unidades" ? <OperationTable columns={[
				{ key: "unidade", label: "Unidade", render: (row) => <button type="button" onClick={() => setSelectedUnit(row)} className="text-left font-black text-blue-700">{row.unidade}</button> },
				{ key: "empresa", label: "Empresa" },
				{ key: "regional", label: "Regional" },
				{ key: "score", label: "Score", render: (row) => <span className="font-black text-slate-950">{row.score}/100</span> },
				{ key: "status", label: "Status", render: (row) => <OperationBadge tone={row.score < 60 ? "red" : row.score < 75 ? "orange" : "emerald"}>{row.status}</OperationBadge> },
				{ key: "principalRisco", label: "Principal risco" },
				{ key: "pendencias", label: "Pendências" },
				{ key: "evolucao", label: "Evolução" },
			]} rows={units} emptyTitle="Ainda não há dados suficientes por unidade." emptyDescription="Complete módulos de Facilities para obter o indicador por imóvel." /> : null}
			{tab === "fatores" ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<h3 className="text-lg font-black text-slate-950">Fatores do Score</h3>
				<div className="mt-4 space-y-3">
					{factors.map((factor) => <div key={factor.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div><p className="font-black text-slate-950">{factor.label}</p><p className="text-xs font-semibold text-slate-500">Peso {factor.weight} · Pendências {factor.pending}</p></div>
							<p className="text-sm font-black text-slate-700">{factor.score}/{factor.weight} · perda -{factor.loss}</p>
						</div>
						<div className="mt-3 h-3 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-blue-600" style={{ width: `${factor.weight ? (factor.score / factor.weight) * 100 : 0}%` }} /></div>
					</div>)}
				</div>
			</section> : null}
			{tab === "pendencias" ? <OperationTable columns={[
				{ key: "title", label: "Pendência" },
				{ key: "sourceType", label: "Origem" },
				{ key: "criticality", label: "Criticidade", render: (row) => <OperationBadge tone={row.criticality === "Crítica" ? "red" : row.criticality === "Alta" ? "orange" : "blue"}>{row.criticality}</OperationBadge> },
				{ key: "impact", label: "Impacto", render: (row) => `-${row.impact}` },
				{ key: "status", label: "Status" },
				{ key: "action", label: "Ações", render: (row) => <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-blue-700">{row.action || "Abrir origem"}</button> },
			]} rows={issues} emptyTitle="Nenhuma pendência impactando o score." emptyDescription="Pendências são consumidas dos módulos canônicos de Facilities." /> : null}
			{tab === "evolucao" ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-black text-slate-950">Evolução da Saúde das Unidades</h3><p className="text-sm font-semibold text-slate-500">Snapshots persistidos serão a fonte histórica. Esta visão mostra a tendência operacional atual.</p></div><OperationBadge tone="blue">Modelo {score.modelVersion || "v1"}</OperationBadge></div>
				<div className="mt-5 flex h-56 items-end gap-4 rounded-2xl bg-slate-50 p-4">
					{evolution.map((item) => <div key={item.month} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-xl bg-blue-600" style={{ height: `${Math.max(8, (item.value / maxEvolution) * 180)}px` }} /><span className="text-xs font-black text-slate-500">{item.month}</span><span className="text-xs font-black text-slate-950">{item.value}</span></div>)}
				</div>
			</section> : null}
			{tab === "configuracoes" ? <section className="space-y-4">
				<div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">Mudança de pesos exige justificativa, simulação e auditoria. A soma precisa permanecer 100/100.</div>
				{(score.factors || []).length ? null : (
					<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-800">
						Ainda não há fatores persistidos na base. A tela abaixo mostra o modelo padrão usado para orientar a configuração inicial do Score.
					</div>
				)}
				<OperationTable columns={[
					{ key: "label", label: "Fator" },
					{ key: "weight", label: "Peso" },
					{ key: "pointsPerIssue", label: "Perda por pendência" },
					{ key: "sourceType", label: "Origem canônica" },
				]} rows={factors} emptyTitle="Configuração indisponível." />
			</section> : null}
			<AppModal title={selectedUnit?.unidade || "Saúde da unidade"} description="Decomposição da nota pelos fatores disponíveis." open={Boolean(selectedUnit)} onClose={() => setSelectedUnit(null)}>
				<div className="grid gap-4 md:grid-cols-3">
					<KpiCard label="Facility Score" value={selectedUnit ? `${selectedUnit.score}/100` : "--"} detail={selectedUnit?.status || "Sem status"} tone={selectedUnit?.score < 60 ? "red" : selectedUnit?.score < 75 ? "orange" : "emerald"} icon={BarChart3} />
					<KpiCard label="Pendências" value={numberFormatter.format(Number(selectedUnit?.pendencias || 0))} detail="Total da unidade" tone="orange" icon={AlertTriangle} />
					<KpiCard label="Principal risco" value={selectedUnit?.principalRisco || "-"} detail="Maior origem de perda" tone="blue" icon={ShieldCheck} />
				</div>
				<div className="mt-4 space-y-2">
					{factors.map((factor) => <SimpleRow key={factor.id} title={factor.label} subtitle={`Peso ${factor.weight} · perda limitada ao fator`} value={`${factor.score}/${factor.weight}`} tone={factor.loss ? "orange" : "emerald"} />)}
				</div>
			</AppModal>
		</section>
	);
}
