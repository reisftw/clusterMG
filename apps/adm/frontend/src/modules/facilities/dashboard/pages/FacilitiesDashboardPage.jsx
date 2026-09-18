import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
	Activity,
	AlertTriangle,
	BarChart3,
	Building2,
	Check,
	ClipboardCheck,
	FileText,
	KeyRound,
	PackageSearch,
	Plus,
	ShieldCheck,
	Wrench,
	Zap,
} from "lucide-react";
import { ROUTES } from "../../../../router/routes";
import { obterDashboardFacilities } from "../../services/facilitiesService";

const numberFormatter = new Intl.NumberFormat("pt-BR");
const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function toFiniteNumber(...values) {
	for (const value of values) {
		if (value === null || value === undefined || value === "") continue;
		const numeric = Number(value);
		if (Number.isFinite(numeric)) return numeric;
	}
	return 0;
}

function formatNumber(value) {
	return numberFormatter.format(toFiniteNumber(value));
}

function formatCurrency(value) {
	return currencyFormatter.format(toFiniteNumber(value));
}

function EmptyState({ title = "Sem dados para exibir", description = "Os dados aparecerão aqui assim que forem cadastrados ou integrados." }) {
	return (
		<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
			<p className="text-sm font-black text-slate-700">{title}</p>
			<p className="mt-1 text-sm font-semibold text-slate-500">{description}</p>
		</div>
	);
}

export default function FacilitiesDashboardPage() {
	const [dashboard, setDashboard] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		setLoading(true);
		setError("");
		obterDashboardFacilities()
			.then((data) => {
				if (active) setDashboard(data || {});
			})
			.catch((err) => {
				if (active) setError(err?.message || "Não foi possível carregar Facilities.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	if (loading) return <FacilitiesOverviewSkeleton />;
	if (error) {
		return <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700">{error}</div>;
	}

	return <FacilitiesOverviewCockpit dashboard={dashboard || {}} metrics={(dashboard || {}).metrics || {}} />;
}

function FacilitiesOverviewCockpit({ dashboard = {}, metrics = {} }) {
	const [unitFilter, setUnitFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const health = dashboard.health || {};
	const operations = dashboard.operations || {};
	const assets = dashboard.assetsSummary || {};
	const contracts = dashboard.contractsSummary || {};
	const costs = dashboard.costsSummary || {};
	const compliance = dashboard.complianceSummary || {};
	const recentActivity = dashboard.recentActivity || dashboard?.highlights?.ultimosItens || [];
	const attentionUnits = health.attentionUnits || [];
	const unitOptions = Array.from(new Set(attentionUnits.map((item) => item.unit).filter(Boolean))).slice(0, 40);
	const filteredAttentionUnits = attentionUnits.filter((item) => {
		if (unitFilter && item.unit !== unitFilter) return false;
		if (statusFilter && item.severity !== statusFilter) return false;
		return true;
	});
	const score = health.score || metrics.facilityScore || {};
	const scoreValue = toFiniteNumber(score.value, score.rawValue);
	const imoveisAtivos = toFiniteNumber(metrics.imoveisAtivos, metrics.imoveis, metrics.unidadesAtivas, health.unitsTotal, dashboard?.kpis?.imoveisAtivos);
	const contratosVencendo = toFiniteNumber(metrics.contratosVencendo, metrics.contratosAVencer, contracts.due45, contracts.due30, contracts.expiring, dashboard?.kpis?.contratosVencendo);
	const ativosPatrimoniais = toFiniteNumber(metrics.ativosPatrimoniais, metrics.patrimonioAtivos, assets.total, dashboard?.kpis?.ativosPatrimoniais);
	const inventariosPendentes = toFiniteNumber(metrics.inventariosPendentes, operations.pendingInventories, assets.withoutInventory, dashboard?.kpis?.inventariosPendentes);
	const documentosPendentes = toFiniteNumber(metrics.documentosPendentes, compliance.documentsPending, dashboard?.kpis?.documentosPendentes);
	const requisicoesPendentes = toFiniteNumber(metrics.requisicoesPendentes, operations.openRequests, dashboard?.kpis?.requisicoesPendentes);
	const segurancaPendencias = toFiniteNumber(dashboard?.kpis?.segurancaPendencias, compliance.inspectionsPending, compliance.avcbExpired, compliance.reportsExpired);
	const consumosAnomalias = toFiniteNumber(dashboard?.kpis?.consumosAnomalias);
	const criticalCount = inventariosPendentes + contratosVencendo + documentosPendentes + requisicoesPendentes + segurancaPendencias + consumosAnomalias;
	const updatedAt = dashboard.generatedAt ? relativeDateTime(dashboard.generatedAt) : "Atualizado agora";
	const kpis = [
		{
			label: "Imóveis ativos",
			value: formatNumber(imoveisAtivos),
			detail: "Unidades cadastradas",
			icon: Building2,
			tone: "blue",
			to: ROUTES.FACILITIES_IMOVEIS,
		},
		{
			label: "Contratos vencendo",
			value: formatNumber(contratosVencendo),
			detail: "Próximos 45 dias",
			icon: FileText,
			tone: contratosVencendo > 0 ? "orange" : "emerald",
			to: ROUTES.FACILITIES_FORNECEDORES_CONTRATOS,
		},
		{
			label: "Ativos patrimoniais",
			value: formatNumber(ativosPatrimoniais),
			detail: "Patrimônio controlado",
			icon: PackageSearch,
			tone: "violet",
			to: ROUTES.FACILITIES_PATRIMONIO_INVENTARIO,
		},
		{
			label: "Pendências críticas",
			value: formatNumber(criticalCount),
			detail: "Itens que exigem atenção",
			icon: AlertTriangle,
			tone: criticalCount > 0 ? "red" : "emerald",
			to: ROUTES.FACILITIES_SCORE,
		},
		{
			label: "Saúde das unidades",
			value: scoreValue ? `${formatNumber(scoreValue)}/100` : "--",
			detail: "Índice geral de Facilities",
			icon: Activity,
			tone: scoreValue >= 90 ? "emerald" : scoreValue >= 75 ? "blue" : scoreValue >= 60 ? "orange" : "red",
			to: ROUTES.FACILITIES_SCORE,
		},
	];
	const attentionItems = [
		{
			title: `${formatNumber(inventariosPendentes)} inventário(s) pendente(s)`,
			description: inventariosPendentes ? "Unidades com inventário em aberto" : "Nenhuma ação necessária",
			count: inventariosPendentes,
			tone: "orange",
			to: ROUTES.FACILITIES_PATRIMONIO_INVENTARIO,
		},
		{
			title: `${formatNumber(contratosVencendo)} contrato(s) próximos do vencimento`,
			description: contratosVencendo ? "Acompanhar renovação ou encerramento" : "Nenhuma ação necessária",
			count: contratosVencendo,
			tone: "orange",
			to: ROUTES.FACILITIES_FORNECEDORES_CONTRATOS,
		},
		{
			title: `${formatNumber(documentosPendentes)} documento(s) pendente(s)`,
			description: documentosPendentes ? "Pendências documentais aguardando tratativa" : "Nenhuma ação necessária",
			count: documentosPendentes,
			tone: "blue",
			to: ROUTES.DOCUMENTOS_PENDENTES,
		},
		{
			title: `${formatNumber(requisicoesPendentes)} requisição(ões) em andamento`,
			description: requisicoesPendentes ? "Pedidos ainda não finalizados" : "Nenhuma ação necessária",
			count: requisicoesPendentes,
			tone: "blue",
			to: ROUTES.INSUMOS_REQUISICOES,
		},
		{
			title: `${formatNumber(segurancaPendencias)} item(ns) de conformidade`,
			description: segurancaPendencias ? "Revisar segurança e documentação predial" : "Nenhuma ação necessária",
			count: segurancaPendencias,
			tone: "red",
			to: ROUTES.FACILITIES_SEGURANCA_CONFORMIDADE,
		},
	];
	const quickLinks = [
		{ title: "Imóveis & Espaços", description: "Unidades, contratos e espaços administrativos.", icon: Building2, to: ROUTES.FACILITIES_IMOVEIS },
		{ title: "Patrimônio & Inventário", description: "Ativos, inventários e QR Codes.", icon: PackageSearch, to: ROUTES.FACILITIES_PATRIMONIO_INVENTARIO },
		{ title: "Acessos & Chaves", description: "Retirada, devolução e histórico de chaves.", icon: KeyRound, to: ROUTES.FACILITIES_ACESSOS_CHAVES },
		{ title: "Operação Predial", description: "Manutenção, checklists e ocorrências.", icon: Wrench, to: ROUTES.FACILITIES_OPERACAO_PREDIAL },
		{ title: "Segurança & Conformidade", description: "Laudos, inspeções e vencimentos.", icon: ShieldCheck, to: ROUTES.FACILITIES_SEGURANCA_CONFORMIDADE },
		{ title: "Fornecedores & Contratos", description: "Contratos, SLAs e fornecedores.", icon: FileText, to: ROUTES.FACILITIES_FORNECEDORES_CONTRATOS },
		{ title: "Consumos & Custos", description: "Utilidades, custos e variações.", icon: Zap, to: ROUTES.FACILITIES_CONSUMOS },
		{ title: "Saúde das Unidades", description: "Indicadores de risco e saúde operacional.", icon: Activity, to: ROUTES.FACILITIES_SCORE },
		{ title: "Relatórios", description: "Análises consolidadas de Facilities.", icon: BarChart3, to: ROUTES.FACILITIES_RELATORIOS },
	];

	return (
		<section className="space-y-5">
			<div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<h1 className="text-3xl font-black text-slate-950">Facilities</h1>
						<p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
							Gestão predial, patrimônio, contratos, acessos e conformidade das unidades administrativas.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Link to={ROUTES.INSUMOS_REQUISICOES} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700">
							<Plus size={17} /> Nova requisição
						</Link>
						<Link to={ROUTES.FACILITIES_RELATORIOS} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
							<BarChart3 size={17} /> Relatórios
						</Link>
					</div>
				</div>
			</div>

			<div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:flex-row lg:items-center">
				<select className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 outline-none">
					<option>Todas as empresas</option>
				</select>
				<select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 outline-none">
					<option value="">Todas as unidades</option>
					{unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
				</select>
				<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 outline-none">
					<option value="">Todos os status</option>
					<option value="Crítica">Crítico</option>
					<option value="Alta">Alta</option>
					<option value="Média">Média</option>
					<option value="Baixa">Baixa</option>
				</select>
				<span className="inline-flex h-10 items-center rounded-xl bg-slate-50 px-3 text-xs font-black text-slate-500">{updatedAt}</span>
			</div>

			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
				{kpis.map((item) => <ExecutiveKpiCard key={item.label} {...item} />)}
			</div>

			<div className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
				<HealthOverviewCard health={health} score={score} />
				<AttentionUnitsCard items={filteredAttentionUnits.slice(0, 5)} total={filteredAttentionUnits.length} />
			</div>

			<AttentionCenter items={attentionItems} />

			<OperationsToday operations={operations} />

			<div className="grid gap-5 xl:grid-cols-2">
				<PatrimonySummary assets={assets} />
				<ContractsSummary contracts={contracts} />
			</div>

			<div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
				<CostsSummary costs={costs} />
				<ComplianceSummary compliance={compliance} />
			</div>

			<RecentActivityFeed items={recentActivity.slice(0, 8)} />

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-black text-slate-950">Acesso rápido</h2>
				<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{quickLinks.map((item) => <QuickAccessCard key={item.title} {...item} />)}
				</div>
			</section>
		</section>
	);
}

function ExecutiveKpiCard({ label, value, detail, tone = "blue", icon: Icon, to }) {
	const toneClass = {
		blue: "border-blue-100 bg-blue-50 text-blue-700",
		emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
		orange: "border-orange-100 bg-orange-50 text-orange-700",
		red: "border-red-100 bg-red-50 text-red-700",
		violet: "border-violet-100 bg-violet-50 text-violet-700",
	}[tone] || "border-slate-100 bg-slate-50 text-slate-700";
	const content = (
		<>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-[11px] font-black uppercase text-slate-500">{label}</p>
					<p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
					<p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
				</div>
				<span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${toneClass}`}>
					<Icon size={19} />
				</span>
			</div>
		</>
	);
	if (!to) return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{content}</article>;
	return <Link to={to} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">{content}</Link>;
}

function HealthOverviewCard({ health = {}, score = {} }) {
	const scoreValue = Number(score.value ?? score.rawValue ?? 0);
	const label = score.label || (scoreValue >= 90 ? "Saudável" : scoreValue >= 75 ? "Estável" : scoreValue >= 60 ? "Atenção" : "Crítico");
	const percent = Math.max(0, Math.min(100, scoreValue));
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
				<div>
					<h2 className="text-lg font-black text-slate-950">Saúde das unidades</h2>
					<p className="mt-1 text-sm font-semibold text-slate-500">Índice de risco e acompanhamento operacional das unidades.</p>
					<div className="mt-5 flex items-end gap-2">
						<p className="text-5xl font-black text-slate-950">{scoreValue ? formatNumber(scoreValue) : "--"}</p>
						<p className="pb-2 text-lg font-black text-slate-400">/ 100</p>
					</div>
					<span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black ${scoreValue >= 90 ? "bg-emerald-50 text-emerald-700" : scoreValue >= 60 ? "bg-orange-50 text-orange-700" : "bg-red-50 text-red-700"}`}>{label}</span>
				</div>
				<div className="min-w-0 flex-1 lg:max-w-md">
					<div className="h-3 overflow-hidden rounded-full bg-slate-100">
						<div className={`h-full rounded-full ${scoreValue >= 90 ? "bg-emerald-500" : scoreValue >= 60 ? "bg-orange-400" : "bg-red-500"}`} style={{ width: `${percent}%` }} />
					</div>
					<p className="mt-3 text-sm font-black text-slate-700">{numberFormatter.format(Number(health.unitsTotal || 0))} unidades monitoradas</p>
					<div className="mt-4 grid gap-2 sm:grid-cols-3">
						<StatusPill label="Saudáveis" value={health.unitsHealthy || 0} tone="emerald" />
						<StatusPill label="Atenção" value={health.unitsAttention || 0} tone="orange" />
						<StatusPill label="Críticas" value={health.unitsCritical || 0} tone="red" />
					</div>
				</div>
			</div>
		</section>
	);
}

function StatusPill({ label, value, tone }) {
	const className = {
		emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
		orange: "border-orange-100 bg-orange-50 text-orange-700",
		red: "border-red-100 bg-red-50 text-red-700",
	}[tone];
	return <div className={`rounded-2xl border px-3 py-2 ${className}`}><p className="text-lg font-black">{numberFormatter.format(Number(value || 0))}</p><p className="text-xs font-black">{label}</p></div>;
}

function AttentionUnitsCard({ items = [], total = 0 }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h2 className="text-lg font-black text-slate-950">Unidades que precisam de atenção</h2>
					<p className="mt-1 text-sm font-semibold text-slate-500">Prioridade por severidade.</p>
				</div>
				<Link to={ROUTES.FACILITIES_SCORE} className="text-xs font-black text-blue-700">Ver todas →</Link>
			</div>
			<div className="mt-4 space-y-2">
				{items.length ? items.map((item) => (
					<div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
						<div className="min-w-0">
							<p className="truncate text-sm font-black text-slate-950">{item.unit}</p>
							<p className="truncate text-xs font-semibold text-slate-500">{item.reason}</p>
						</div>
						<SeverityBadge severity={item.severity} />
					</div>
				)) : <PositiveEmptyState text="Nenhuma unidade com atenção no filtro atual." />}
			</div>
			{total > items.length ? <p className="mt-3 text-xs font-bold text-slate-500">+ {numberFormatter.format(total - items.length)} item(ns) no filtro atual.</p> : null}
		</section>
	);
}

function SeverityBadge({ severity = "Baixa" }) {
	const tone = severity === "Crítica" ? "bg-red-50 text-red-700" : severity === "Alta" ? "bg-orange-50 text-orange-700" : severity === "Média" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
	return <span className={`self-center rounded-full px-3 py-1 text-xs font-black ${tone}`}>{severity}</span>;
}

function PositiveEmptyState({ text }) {
	return <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700"><Check size={16} className="mr-2 inline" />{text}</div>;
}

function AttentionCenter({ items = [] }) {
	const sorted = [...items].sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<h2 className="text-lg font-black text-slate-950">Precisa da sua atenção</h2>
			<div className="mt-4 grid gap-3 xl:grid-cols-5">
				{sorted.map((item) => <AttentionAction key={item.title} item={item} />)}
			</div>
		</section>
	);
}

function AttentionAction({ item }) {
	const active = Number(item.count || 0) > 0;
	const toneClass = item.tone === "red" ? "border-red-100 bg-red-50" : item.tone === "orange" ? "border-orange-100 bg-orange-50" : "border-slate-100 bg-slate-50";
	return (
		<Link to={item.to} className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${active ? toneClass : "border-slate-100 bg-white"}`}>
			<div className="flex items-start gap-3">
				<span className={`mt-0.5 h-2.5 w-2.5 rounded-full ${active ? item.tone === "red" ? "bg-red-500" : "bg-orange-400" : "bg-emerald-500"}`} />
				<div className="min-w-0">
					<p className="text-sm font-black text-slate-950">{item.title}</p>
					<p className="mt-1 text-xs font-semibold text-slate-500">{item.description}</p>
				</div>
			</div>
		</Link>
	);
}

function OperationsToday({ operations = {} }) {
	const items = [
		{ label: "Ocorrências abertas", value: operations.openIncidents, icon: AlertTriangle, tone: operations.openIncidents ? "orange" : "slate" },
		{ label: "Manutenções programadas", value: operations.scheduledMaintenance, icon: Wrench, tone: "blue" },
		{ label: "Checklists atrasados", value: operations.overdueChecklists, icon: ClipboardCheck, tone: operations.overdueChecklists ? "red" : "slate" },
		{ label: "Requisições abertas", value: operations.openRequests, icon: FileText, tone: operations.openRequests ? "blue" : "slate" },
		{ label: "Chaves em uso", value: operations.keysInUse, icon: KeyRound, tone: operations.keysInUse ? "orange" : "slate" },
		{ label: "Inventários pendentes", value: operations.pendingInventories, icon: PackageSearch, tone: operations.pendingInventories ? "orange" : "slate" },
	];
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<h2 className="text-lg font-black text-slate-950">Operação hoje</h2>
			<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
				{items.map((item) => <MiniStat key={item.label} {...item} />)}
			</div>
		</section>
	);
}

function MiniStat({ label, value = 0, icon: Icon, tone = "slate" }) {
	const toneClass = {
		slate: "bg-slate-50 text-slate-600",
		blue: "bg-blue-50 text-blue-700",
		orange: "bg-orange-50 text-orange-700",
		red: "bg-red-50 text-red-700",
	}[tone];
	return <div className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-center justify-between gap-2"><p className="text-2xl font-black text-slate-950">{numberFormatter.format(Number(value || 0))}</p><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClass}`}><Icon size={17} /></span></div><p className="mt-2 text-xs font-black text-slate-500">{label}</p></div>;
}

function PatrimonySummary({ assets = {} }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div><h2 className="text-lg font-black text-slate-950">Patrimônio</h2><p className="text-sm font-semibold text-slate-500">Ativos, estoque e inventário.</p></div>
				<Link to={ROUTES.FACILITIES_PATRIMONIO_INVENTARIO} className="text-xs font-black text-blue-700">Abrir Patrimônio →</Link>
			</div>
			<div className="mt-4 grid gap-3 sm:grid-cols-3">
				<MetricLine label="Ativos cadastrados" value={assets.total} />
				<MetricLine label="Em uso" value={assets.inUse} />
				<MetricLine label="Em estoque" value={assets.stock} />
				<MetricLine label="Em manutenção" value={assets.maintenance} />
				<MetricLine label="Baixados" value={assets.decommissioned} />
				<MetricLine label="Sem inventário" value={assets.withoutInventory} tone={assets.withoutInventory ? "orange" : "slate"} />
			</div>
			{assets.categories?.length ? <BarList title="Ativos por categoria" items={assets.categories} /> : null}
		</section>
	);
}

function ContractsSummary({ contracts = {} }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div><h2 className="text-lg font-black text-slate-950">Contratos</h2><p className="text-sm font-semibold text-slate-500">Vigências e documentos contratuais.</p></div>
				<Link to={ROUTES.FACILITIES_FORNECEDORES_CONTRATOS} className="text-xs font-black text-blue-700">Ver contratos →</Link>
			</div>
			<div className="mt-4 grid gap-3 sm:grid-cols-3">
				<MetricLine label="Ativos" value={contracts.active} />
				<MetricLine label="Vencem em 30 dias" value={contracts.due30} tone={contracts.due30 ? "orange" : "slate"} />
				<MetricLine label="Vencem em 60 dias" value={contracts.due60} tone={contracts.due60 ? "orange" : "slate"} />
				<MetricLine label="Vencidos" value={contracts.expired} tone={contracts.expired ? "red" : "slate"} />
				<MetricLine label="Sem documento" value={contracts.withoutDocument} tone={contracts.withoutDocument ? "orange" : "slate"} />
				<MetricLine label="Aguardando renovação" value={contracts.awaitingRenewal} />
			</div>
		</section>
	);
}

function MetricLine({ label, value = 0, tone = "slate" }) {
	const toneClass = tone === "red" ? "text-red-700" : tone === "orange" ? "text-orange-700" : "text-slate-950";
	return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className={`text-xl font-black ${toneClass}`}>{numberFormatter.format(Number(value || 0))}</p><p className="mt-1 text-xs font-black text-slate-500">{label}</p></div>;
}

function BarList({ title, items = [] }) {
	const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);
	return <div className="mt-5"><p className="text-sm font-black text-slate-950">{title}</p><div className="mt-3 space-y-2">{items.map((item) => <div key={item.label}><div className="mb-1 flex justify-between gap-3 text-xs font-black text-slate-600"><span className="truncate">{item.label}</span><span>{numberFormatter.format(Number(item.value || 0))}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(6, (Number(item.value || 0) / max) * 100)}%` }} /></div></div>)}</div></div>;
}

function CostsSummary({ costs = {} }) {
	const hasCosts = Number(costs.total || 0) > 0 || costs.evolution?.some((item) => Number(item.value || 0) > 0);
	const max = Math.max(...(costs.evolution || []).map((item) => Number(item.value || 0)), 1);
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div><h2 className="text-lg font-black text-slate-950">Custos de Facilities</h2><p className="text-sm font-semibold text-slate-500">Custo mensal e composição por tipo.</p></div>
				<Link to={ROUTES.FACILITIES_CONSUMOS} className="text-xs font-black text-blue-700">Ver consumos →</Link>
			</div>
			{hasCosts ? (
				<>
					<div className="mt-4 flex flex-wrap items-end gap-3">
						<p className="text-3xl font-black text-slate-950">{formatCurrency(costs.total)}</p>
						{costs.variationPercent !== null && costs.variationPercent !== undefined ? <span className={`mb-1 rounded-full px-3 py-1 text-xs font-black ${Number(costs.variationPercent) > 0 ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>{Number(costs.variationPercent) > 0 ? "+" : ""}{Number(costs.variationPercent).toFixed(1)}% vs. mês anterior</span> : null}
					</div>
					<div className="mt-5 flex h-36 items-end gap-2 rounded-2xl bg-slate-50 p-4">
						{(costs.evolution || []).map((item) => <div key={item.month} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-lg bg-blue-600" style={{ height: `${Math.max(6, (Number(item.value || 0) / max) * 112)}px` }} /><span className="text-[10px] font-black text-slate-500">{String(item.month || "").slice(5)}</span></div>)}
					</div>
					{costs.composition?.length ? <BarList title="Composição do mês" items={costs.composition} /> : null}
				</>
			) : <EmptyState title="Ainda não existem dados suficientes para análise de custos." description="Os custos aparecerão aqui após lançamentos de consumo ou encargos." />}
		</section>
	);
}

function ComplianceSummary({ compliance = {} }) {
	const regular = compliance.regularPercent;
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div><h2 className="text-lg font-black text-slate-950">Conformidade</h2><p className="text-sm font-semibold text-slate-500">Documentos, inspeções e vencimentos.</p></div>
				<Link to={ROUTES.FACILITIES_SEGURANCA_CONFORMIDADE} className="text-xs font-black text-blue-700">Ver conformidade →</Link>
			</div>
			<div className="mt-4">
				{regular !== null && regular !== undefined ? <p className="text-3xl font-black text-slate-950">{numberFormatter.format(Number(regular))}% regular</p> : <p className="text-sm font-black text-slate-500">Sem base suficiente para percentual geral.</p>}
			</div>
			<div className="mt-4 space-y-2">
				<CompactCheck label="AVCB vencidos" value={compliance.avcbExpired} />
				<CompactCheck label="Laudos vencidos" value={compliance.reportsExpired} />
				<CompactCheck label="Inspeções pendentes" value={compliance.inspectionsPending} />
				<CompactCheck label="Extintores vencendo" value={compliance.extinguishersDue} />
			</div>
		</section>
	);
}

function CompactCheck({ label, value = 0 }) {
	const active = Number(value || 0) > 0;
	return <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"><span className="text-sm font-black text-slate-700">{label}</span><span className={`rounded-full px-3 py-1 text-xs font-black ${active ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{numberFormatter.format(Number(value || 0))}</span></div>;
}

function RecentActivityFeed({ items = [] }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div><h2 className="text-lg font-black text-slate-950">Atividade recente</h2><p className="text-sm font-semibold text-slate-500">Últimas movimentações operacionais de Facilities.</p></div>
				<Link to={ROUTES.FACILITIES_RELATORIOS} className="text-xs font-black text-blue-700">Ver histórico completo →</Link>
			</div>
			<div className="mt-4 space-y-2">
				{items.length ? items.map((item) => <ActivityRow key={`${item.tipo}-${item.id}`} item={item} />) : <EmptyState title="Nenhuma atividade recente." description="Eventos de patrimônio, chaves, contratos e operação aparecerão aqui." />}
			</div>
		</section>
	);
}

function ActivityRow({ item }) {
	const Icon = item.tipo === "Chave" ? KeyRound : item.tipo === "Contrato" ? FileText : item.tipo === "Consumo" ? Zap : item.tipo === "Manutenção" ? Wrench : item.tipo === "Ocorrência" ? AlertTriangle : PackageSearch;
	return <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={18} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-950">{item.titulo}</p><p className="truncate text-xs font-semibold text-slate-500">{item.subtitulo || item.tipo}</p></div><span className="shrink-0 text-xs font-black text-slate-400">{relativeDateTime(item.createdAt)}</span></div>;
}

function QuickAccessCard({ title, description, icon: Icon, to }) {
	return <Link to={to} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={18} /></span><div className="min-w-0"><p className="text-sm font-black text-slate-950 group-hover:text-blue-700">{title}</p><p className="mt-1 truncate text-xs font-semibold text-slate-500">{description}</p></div></div></Link>;
}

function FacilitiesOverviewSkeleton() {
	const block = "animate-pulse rounded-2xl bg-slate-100";
	return (
		<section className="space-y-5">
			<div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="space-y-3">
						<div className={`${block} h-8 w-44`} />
						<div className={`${block} h-4 w-full max-w-2xl`} />
					</div>
					<div className="flex gap-2">
						<div className={`${block} h-11 w-36`} />
						<div className={`${block} h-11 w-28`} />
					</div>
				</div>
			</div>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
				{Array.from({ length: 5 }).map((_, index) => <div key={index} className={`${block} h-32`} />)}
			</div>
			<div className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
				<div className={`${block} h-72`} />
				<div className={`${block} h-72`} />
			</div>
			<div className={`${block} h-36`} />
			<div className="grid gap-5 xl:grid-cols-2">
				<div className={`${block} h-72`} />
				<div className={`${block} h-72`} />
			</div>
		</section>
	);
}

function relativeDateTime(value) {
	if (!value) return "agora";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "agora";
	const diffMs = Date.now() - date.getTime();
	const minutes = Math.round(diffMs / 60000);
	if (minutes < 1) return "agora";
	if (minutes < 60) return `há ${minutes} min`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `há ${hours} h`;
	return date.toLocaleDateString("pt-BR");
}

