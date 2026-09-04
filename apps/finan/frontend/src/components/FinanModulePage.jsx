import { useEffect, useMemo, useState } from "react";
import {
	ArrowDownRight,
	ArrowUpRight,
	Banknote,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Eye,
	FileText,
	ReceiptText,
	TrendingUp,
} from "lucide-react";
import {
	requestFinanApi,
	requestFinanFinanceiroApi,
} from "../api/finanApi";

const PAGE_META = {
	dashboard: {
		title: "Dashboard",
		subtitle: "Indicadores financeiros reais do mês atual.",
	},
};

const BUDGET_CLASSES = [
	{ id: "basal", label: "BASAL", color: "#2563eb" },
	{ id: "nao_basal", label: "NÃO BASAL", color: "#f97316" },
	{ id: "projetos", label: "PROJETOS", color: "#10b981" },
];

const PAGE_SIZE = 5;

export default function FinanModulePage({ page }) {
	const meta = PAGE_META[page] || PAGE_META.dashboard;
	const [dashboard, setDashboard] = useState({
		budgetSummary: null,
		budgetDetails: null,
		serasa: null,
		tarifas: null,
	});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [expandedClass, setExpandedClass] = useState(null);
	const [pages, setPages] = useState({});
	const period = useMemo(() => currentPeriod(), []);

	useEffect(() => {
		let active = true;
		setLoading(true);
		setError("");
		Promise.allSettled([
			requestFinanApi(`/orcamento/resumo?ano=${period.year}&mes=${period.month}`),
			requestFinanApi(`/orcamento/detalhes?ano=${period.year}&mes=${period.month}`),
			requestFinanFinanceiroApi("/reports/serasa"),
			requestFinanFinanceiroApi("/reports/tarifas"),
		])
			.then(([budgetSummary, budgetDetails, serasa, tarifas]) => {
				if (!active) return;
				setDashboard({
					budgetSummary: fulfilledValue(budgetSummary)?.resumo || null,
					budgetDetails: fulfilledValue(budgetDetails)?.detalhes || null,
					serasa: fulfilledValue(serasa)?.data || null,
					tarifas: fulfilledValue(tarifas)?.data || null,
				});
				if ([budgetSummary, budgetDetails, serasa, tarifas].every((item) => item.status === "rejected")) {
					setError("Não foi possível carregar os indicadores financeiros.");
				}
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [period.month, period.year]);

	const budgetTotals = useMemo(
		() => normalizeBudgetTotals(dashboard.budgetSummary),
		[dashboard.budgetSummary],
	);
	const serasaKpi = useMemo(
		() => buildSerasaKpi(dashboard.serasa, period),
		[dashboard.serasa, period],
	);
	const tarifasKpi = useMemo(
		() => buildTarifasKpi(dashboard.tarifas, period),
		[dashboard.tarifas, period],
	);
	const faturasKpi = useMemo(
		() => buildFaturasKpi(dashboard.tarifas, period),
		[dashboard.tarifas, period],
	);
	const budgetClasses = useMemo(
		() => buildBudgetClasses(dashboard.budgetDetails),
		[dashboard.budgetDetails],
	);
	const chartRows = useMemo(
		() =>
			BUDGET_CLASSES.map((item) => {
				const current = budgetClasses[item.id] || {};
				return {
					name: item.label,
					orcado: current.orcado || 0,
					realizado: current.realizado || 0,
				};
			}),
		[budgetClasses],
	);

	function toggleClass(classId) {
		setExpandedClass((current) => (current === classId ? null : classId));
		setPages((current) => ({ ...current, [classId]: current[classId] || 0 }));
	}

	function changePage(classId, direction, total) {
		setPages((current) => {
			const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
			const nextPage = Math.min(
				maxPage,
				Math.max(0, Number(current[classId] || 0) + direction),
			);
			return { ...current, [classId]: nextPage };
		});
	}

	return (
		<section className="finan-dashboard-page">
			<div className="finan-page-title">
				<div>
					<h1>{meta.title}</h1>
					<p>
						{meta.subtitle} {period.label}.
					</p>
				</div>
				<span>{loading ? "Atualizando" : period.label}</span>
			</div>

			{error ? <div className="finan-dashboard-alert">{error}</div> : null}

			<div className="finan-dashboard-kpis">
				<KpiCard
					icon={Banknote}
					label="Receita líquida Serasa"
					value={formatMoney(serasaKpi.value)}
					meta={serasaKpi.monthLabel}
					tone="blue"
				/>
				<KpiCard
					icon={ReceiptText}
					label="Custo médio da Tarifa"
					value={formatMoney(tarifasKpi.value)}
					meta={tarifasKpi.monthLabel}
					tone="orange"
				/>
				<KpiCard
					icon={FileText}
					label="Faturas no mês"
					value={`${formatInteger(faturasKpi.ativas)} ativas`}
					meta={`${formatInteger(faturasKpi.canceladas)} canceladas · ${faturasKpi.monthLabel}`}
					tone="slate"
				/>
			</div>

			<BudgetTotalChart budgetTotals={budgetTotals} period={period} />

			<div className="finan-dashboard-budget-grid">
				<article className="finan-dashboard-chart-card">
					<div>
						<span>Orçamento por classe</span>
						<h2>Basal, Não Basal e Projetos</h2>
					</div>
					<div className="finan-dashboard-chart">
						{chartRows.map((row) => {
							const max = Math.max(row.orcado, row.realizado, 1);
							return (
								<div key={row.name} className="finan-dashboard-bar-row">
									<strong>{row.name}</strong>
									<div>
										<span>Orçado</span>
										<div>
											<i style={{ width: `${(row.orcado / max) * 100}%` }} />
										</div>
										<em>{compactMoney(row.orcado)}</em>
									</div>
									<div>
										<span>Realizado</span>
										<div>
											<i
												className="realizado"
												style={{ width: `${(row.realizado / max) * 100}%` }}
											/>
										</div>
										<em>{compactMoney(row.realizado)}</em>
									</div>
								</div>
							);
						})}
					</div>
				</article>

				<div className="finan-dashboard-class-stack">
					{BUDGET_CLASSES.map((item) => {
						const data = budgetClasses[item.id] || {
							orcado: 0,
							realizado: 0,
							rows: [],
						};
						const usage = data.orcado > 0 ? (data.realizado / data.orcado) * 100 : 0;
						const pageIndex = Number(pages[item.id] || 0);
						const start = pageIndex * PAGE_SIZE;
						const pageRows = data.rows.slice(start, start + PAGE_SIZE);
						const totalPages = Math.max(1, Math.ceil(data.rows.length / PAGE_SIZE));
						return (
							<article
								key={item.id}
								className={`finan-dashboard-class-card ${budgetStatus(usage)}`}
								style={{ "--class-color": item.color }}
							>
								<button type="button" onClick={() => toggleClass(item.id)}>
									<div>
										<span>{item.label}</span>
										<strong>{formatMoney(data.realizado)}</strong>
										<small>
											Orçado {formatMoney(data.orcado)} · {formatPercent(usage)} consumido
										</small>
									</div>
									<Eye size={18} />
								</button>
								<div className="finan-dashboard-mini-progress">
									<span style={{ width: `${Math.min(100, Math.max(0, usage))}%` }} />
								</div>
								{expandedClass === item.id ? (
									<div className="finan-dashboard-class-details">
										{pageRows.map((row) => (
											<div key={row.id} className="finan-dashboard-class-row">
												<div>
													<strong>{row.label}</strong>
													<span>{row.category || "Sem categoria"}</span>
												</div>
												<div>
													<span>{formatMoney(row.orcado)}</span>
													<strong>{formatMoney(row.realizado)}</strong>
												</div>
											</div>
										))}
										{!data.rows.length ? (
											<p>Nenhuma conta com orçamento ou realizado no período.</p>
										) : null}
										{data.rows.length > PAGE_SIZE ? (
											<div className="finan-dashboard-pager">
												<button
													type="button"
													onClick={() => changePage(item.id, -1, data.rows.length)}
													disabled={pageIndex === 0}
												>
													<ChevronLeft size={16} />
												</button>
												<span>
													{pageIndex + 1} / {totalPages}
												</span>
												<button
													type="button"
													onClick={() => changePage(item.id, 1, data.rows.length)}
													disabled={pageIndex + 1 >= totalPages}
												>
													<ChevronRight size={16} />
												</button>
											</div>
										) : null}
									</div>
								) : null}
							</article>
						);
					})}
				</div>
			</div>
		</section>
	);
}

function BudgetTotalChart({ budgetTotals, period }) {
	const max = Math.max(budgetTotals.orcado, budgetTotals.realizado, 1);
	const status = budgetStatus(budgetTotals.usage);
	const saldo = budgetTotals.orcado - budgetTotals.realizado;
	return (
		<article className={`finan-dashboard-total-chart ${status}`}>
			<div className="finan-dashboard-total-chart-head">
				<div>
					<span>Orçado x Realizado no mês</span>
					<h2>{period.label}</h2>
				</div>
				<strong>{formatPercent(budgetTotals.usage)} consumido</strong>
			</div>
			<div className="finan-dashboard-total-bars">
				<BudgetTotalBar
					label="Orçado"
					value={budgetTotals.orcado}
					max={max}
					className="orcado"
				/>
				<BudgetTotalBar
					label="Realizado"
					value={budgetTotals.realizado}
					max={max}
					className="realizado"
				/>
			</div>
			<div className="finan-dashboard-total-foot">
				<span>Saldo do período</span>
				<strong className={saldo >= 0 ? "positive" : "negative"}>
					{formatMoney(saldo)}
				</strong>
			</div>
		</article>
	);
}

function BudgetTotalBar({ label, value, max, className }) {
	return (
		<div className="finan-dashboard-total-bar">
			<div>
				<span>{label}</span>
				<strong>{formatMoney(value)}</strong>
			</div>
			<div>
				<i className={className} style={{ width: `${(Number(value || 0) / max) * 100}%` }} />
			</div>
		</div>
	);
}

function KpiCard({ icon: Icon, label, value, meta, tone = "blue", status = "" }) {
	const trendUp = status === "danger";
	return (
		<article className={`finan-dashboard-kpi ${tone} ${status}`}>
			<div className="finan-dashboard-kpi-icon">
				<Icon size={22} />
			</div>
			<div>
				<span>{label}</span>
				<strong>{value}</strong>
				<p>
					{status ? (
						trendUp ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />
					) : (
						<CalendarDays size={15} />
					)}
					{meta}
				</p>
			</div>
		</article>
	);
}

function fulfilledValue(result) {
	return result.status === "fulfilled" ? result.value : null;
}

function currentPeriod() {
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth() + 1;
	return {
		year,
		month,
		key: `${year}-${String(month).padStart(2, "0")}`,
		label: `${year} - ${monthName(month)}`,
	};
}

function buildSerasaKpi(data, period) {
	const monthly = Array.isArray(data?.monthly) ? data.monthly : [];
	const current = monthly.find((item) => String(item.key) === period.key);
	return {
		value: Number(current?.receitaLiquida ?? data?.summary?.receitaLiquida ?? 0),
		monthLabel: current?.label || period.label,
	};
}

function buildTarifasKpi(data, period) {
	const monthly = Array.isArray(data?.tarifasMensais) ? data.tarifasMensais : [];
	const currentRows = monthly.filter(
		(item) =>
			Number(item.year) === period.year &&
			Number(item.month) === period.month,
	);
	const total = currentRows.reduce((sum, item) => sum + Number(item.value || 0), 0);
	return {
		value: currentRows.length ? total / currentRows.length : 0,
		monthLabel: period.label,
	};
}

function buildFaturasKpi(data, period) {
	const rows = Array.isArray(data?.faturas) ? data.faturas : [];
	const currentRows = rows.filter(
		(item) =>
			Number(item.year) === period.year &&
			Number(item.month) === period.month,
	);
	return currentRows.reduce(
		(acc, item) => {
			const metric = normalizeText(item.metric);
			const value = Math.abs(Number(item.value || item.quantity || item.count || 0));
			if (/cancelad|outros lan/.test(metric)) acc.canceladas += value;
			if (/ativa|faturamento/.test(metric)) acc.ativas += value;
			return acc;
		},
		{ ativas: 0, canceladas: 0, monthLabel: period.label },
	);
}

function normalizeBudgetTotals(summary) {
	const orcado = Number(summary?.orcado || 0);
	const realizado = Number(summary?.realizado || 0);
	return {
		orcado,
		realizado,
		usage: orcado > 0 ? (realizado / orcado) * 100 : 0,
	};
}

function buildBudgetClasses(details) {
	const classes = Object.fromEntries(
		BUDGET_CLASSES.map((item) => [
			item.id,
			{ orcado: 0, realizado: 0, rows: [] },
		]),
	);
	for (const row of details?.classes || []) {
		const key = normalizeClass(row.classe);
		if (!classes[key]) continue;
		classes[key].orcado = Number(row.orcado || 0);
		classes[key].realizado = Number(row.realizado || 0);
	}
	for (const account of details?.contas || []) {
		const key = normalizeClass(account.classe);
		if (!classes[key]) continue;
		classes[key].rows.push({
			id: account.id || `${key}-${classes[key].rows.length}`,
			label: [account.codigo, account.nome].filter(Boolean).join(" - ") || "Conta não informada",
			category: account.categoria,
			orcado: Number(account.orcado || 0),
			realizado: Number(account.realizado || 0),
		});
	}
	for (const key of Object.keys(classes)) {
		classes[key].rows.sort(
			(a, b) => Math.abs(b.realizado) - Math.abs(a.realizado),
		);
	}
	return classes;
}

function normalizeClass(value) {
	const normalized = normalizeText(value);
	if (normalized === "nao basal" || normalized === "nao_basal") return "nao_basal";
	if (normalized === "projeto" || normalized === "projetos") return "projetos";
	if (normalized === "basal") return "basal";
	return String(value || "").toLowerCase();
}

function budgetStatus(usage) {
	if (Number(usage || 0) >= 100) return "danger";
	if (Number(usage || 0) >= 80) return "warning";
	return "success";
}

function normalizeText(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function formatMoney(value) {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(Number(value || 0));
}

function compactMoney(value) {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(Number(value || 0));
}

function formatPercent(value) {
	return `${Number(value || 0).toLocaleString("pt-BR", {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	})}%`;
}

function formatInteger(value) {
	return Number(value || 0).toLocaleString("pt-BR", {
		maximumFractionDigits: 0,
	});
}

function monthName(month) {
	return [
		"Janeiro",
		"Fevereiro",
		"Março",
		"Abril",
		"Maio",
		"Junho",
		"Julho",
		"Agosto",
		"Setembro",
		"Outubro",
		"Novembro",
		"Dezembro",
	][Number(month || 1) - 1] || "";
}
