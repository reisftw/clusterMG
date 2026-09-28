import { Chart } from "chart.js/auto";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveVpsDate } from "../../../services/vpsDate";
import CityModal from "../components/CityModal";
import CityTable from "../components/CityTable";
import EmptyState from "../components/EmptyState";
import KpiCard from "../components/KpiCard";
import RankingList from "../components/RankingList";
import { MONTH_ORDER } from "../utils/constants";
import { isDiaUtil } from "../utils/diasUteis";
import { gerarPDFMetaMensal } from "../utils/pdfAgentes";

const STATUS_CONFIG = {
	over: {
		label: "Acima da Meta",
		shortLabel: "Acima",
		tone: "over",
		icon: "⚡",
		weight: 0,
	},
	done: {
		label: "Meta Atingida",
		shortLabel: "Meta",
		tone: "done",
		icon: "✅",
		weight: 1,
	},
	progress: {
		label: "Em Andamento",
		shortLabel: "Ritmo",
		tone: "progress",
		icon: "⏳",
		weight: 2,
	},
	attention: {
		label: "Atenção",
		shortLabel: "Atenção",
		tone: "attention",
		icon: "⚠️",
		weight: 3,
	},
	below: {
		label: "Abaixo",
		shortLabel: "Abaixo",
		tone: "below",
		icon: "⚠️",
		weight: 4,
	},
	critical: {
		label: "Crítico",
		shortLabel: "Crítico",
		tone: "critical",
		icon: "🚨",
		weight: 5,
	},
};

function safeNumber(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
}

function calculateAchievement(realizado, meta) {
	const target = safeNumber(meta);
	if (target <= 0) return 0;
	return Number(((safeNumber(realizado) / target) * 100).toFixed(1));
}

function calculateGap(realizado, meta) {
	return Math.round(safeNumber(realizado) - safeNumber(meta));
}

function formatSigned(value, formatter) {
	const rounded = Math.round(safeNumber(value));
	if (rounded > 0) return `+${formatter.format(rounded)}`;
	if (rounded < 0) return `-${formatter.format(Math.abs(rounded))}`;
	return "0";
}

function getMonthInfo(month) {
	const year = new Date().getFullYear();
	const monthIndex = MONTH_ORDER.findIndex(
		(item) => normalizeMonthName(item) === normalizeMonthName(month),
	);
	if (monthIndex < 0) {
		return {
			year,
			monthIndex: -1,
			totalDays: 31,
			isCurrentMonth: false,
			isPastMonth: false,
			currentDay: 31,
		};
	}

	const now = new Date();
	const totalDays = new Date(year, monthIndex + 1, 0).getDate();
	const isCurrentMonth =
		now.getFullYear() === year && now.getMonth() === monthIndex;
	const isPastMonth =
		new Date(year, monthIndex + 1, 0).getTime() <
		new Date(now.getFullYear(), now.getMonth(), 1).getTime();
	return {
		year,
		monthIndex,
		totalDays,
		isCurrentMonth,
		isPastMonth,
		currentDay: isCurrentMonth ? Math.min(now.getDate(), totalDays) : totalDays,
	};
}

function buildBusinessDayContext(month, lastDataDay = 0) {
	const info = getMonthInfo(month);
	const days = Array.from({ length: info.totalDays }, (_, index) => index + 1);
	const businessDays = days.filter((day) =>
		isDiaUtil(month, day, new Set(), info.year),
	);
	const cutoffDay = info.isCurrentMonth
		? Math.max(1, Math.min(info.currentDay, info.totalDays))
		: info.totalDays;
	const elapsedBusinessDays = businessDays.filter((day) => day <= cutoffDay);
	const remainingBusinessDays = info.isPastMonth
		? []
		: businessDays.filter((day) => day > Math.max(cutoffDay, lastDataDay));

	return {
		...info,
		days,
		businessDays,
		totalBusinessDays: businessDays.length,
		elapsedBusinessDays: elapsedBusinessDays.length,
		remainingBusinessDays: remainingBusinessDays.length,
		progressRatio:
			businessDays.length > 0
				? Math.min(elapsedBusinessDays.length / businessDays.length, 1)
				: 1,
		cutoffDay,
	};
}

function calculateExpectedToDate(meta, businessContext) {
	return Math.round(safeNumber(meta) * safeNumber(businessContext.progressRatio));
}

function calculateCityStatus(city, businessContext) {
	const realizado = safeNumber(city.realizado);
	const meta = safeNumber(city.meta80);
	const expected = calculateExpectedToDate(meta, businessContext);
	const gap = calculateGap(realizado, meta);
	const desvio = Math.round(realizado - expected);
	const achievement = calculateAchievement(realizado, meta);

	if (meta <= 0 && realizado > 0) return { ...STATUS_CONFIG.over, expected, gap, desvio, achievement };
	if (meta <= 0) return { ...STATUS_CONFIG.progress, expected, gap, desvio, achievement };
	if (realizado > meta) return { ...STATUS_CONFIG.over, expected, gap, desvio, achievement };
	if (realizado === meta) return { ...STATUS_CONFIG.done, expected, gap, desvio, achievement };

	const expectedRatio = expected > 0 ? realizado / expected : achievement / 100;
	if (businessContext.elapsedBusinessDays >= 3 && realizado === 0)
		return { ...STATUS_CONFIG.critical, expected, gap, desvio, achievement };
	if (expectedRatio >= 0.96) return { ...STATUS_CONFIG.progress, expected, gap, desvio, achievement };
	if (expectedRatio >= 0.78) return { ...STATUS_CONFIG.attention, expected, gap, desvio, achievement };
	if (expectedRatio >= 0.5) return { ...STATUS_CONFIG.below, expected, gap, desvio, achievement };
	return { ...STATUS_CONFIG.critical, expected, gap, desvio, achievement };
}

function buildMetaCumulative(totalMeta, month, businessContext) {
	let accumulated = 0;
	const meta = Math.round(safeNumber(totalMeta));
	const businessDaySet = new Set(businessContext.businessDays);
	const base =
		businessContext.totalBusinessDays > 0
			? Math.floor(meta / businessContext.totalBusinessDays)
			: 0;
	const remainder =
		businessContext.totalBusinessDays > 0
			? meta % businessContext.totalBusinessDays
			: 0;
	let utilIndex = 0;

	return businessContext.days.map((day) => {
		if (businessDaySet.has(day)) {
			accumulated += base + (utilIndex < remainder ? 1 : 0);
			utilIndex += 1;
		}
		return accumulated;
	});
}

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveDailyTotals(cityFilter, d, filteredCities) {
	if (cityFilter === "todas") {
		return Array.isArray(d.totalDaily)
			? d.totalDaily.map((v) => Math.round(Number(v) || 0))
			: [];
	}
	return filteredCities.reduce((acc, cidade) => {
		const cityDaily = Array.isArray(cidade.daily) ? cidade.daily : [];
		cityDaily.forEach((value, index) => {
			acc[index] = (acc[index] || 0) + Math.round(Number(value) || 0);
		});
		return acc;
	}, []);
}

function normalizeMonthName(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function getMonthsFromCurrent(month, allData) {
	const currentIndex = MONTH_ORDER.findIndex(
		(item) => normalizeMonthName(item) === normalizeMonthName(month),
	);

	if (currentIndex < 0) {
		return MONTH_ORDER.filter((item) => {
			const data = getMonthRecord(allData, item);
			return Number(data?.totalRealizado || 0) > 0;
		});
	}

	return Array.from(
		{ length: MONTH_ORDER.length },
		(_, offset) =>
			MONTH_ORDER[
				(currentIndex - offset + MONTH_ORDER.length) % MONTH_ORDER.length
			],
	).filter(
		(item) => Number(getMonthRecord(allData, item)?.totalRealizado || 0) > 0,
	);
}

function resolveMonthKey(allData = {}, month) {
	const normalizedMonth = normalizeMonthName(month);
	return (
		Object.keys(allData || {}).find(
			(key) => normalizeMonthName(key) === normalizedMonth,
		) || month
	);
}

function getMonthRecord(allData = {}, month) {
	const key = resolveMonthKey(allData, month);
	return allData?.[key] || null;
}

function getCityStatus(cidade) {
	if (cidade?.statusInfo?.tone) {
		return {
			key: cidade.statusInfo.tone,
			label: cidade.statusInfo.label,
		};
	}
	const pct = Number(cidade?.pct || 0);
	if (pct > 100) return { key: "over", label: "Acima da Meta" };
	if (pct >= 100) return { key: "done", label: "Meta Atingida" };
	if (pct >= 80) return { key: "progress", label: "Em Andamento" };
	if (pct >= 50) return { key: "below", label: "Abaixo" };
	return { key: "critical", label: "Crítico" };
}

function getFilteredSummary(cidades = [], fallback = {}) {
	if (!cidades.length) {
		return {
			totalRealizado: Number(fallback.totalRealizado || 0),
			totalMeta: Number(fallback.totalMeta || 0),
			totalCancelamentos: Number(fallback.totalCancelamentos || 0),
			totalFalta: Number(fallback.totalFalta || 0),
			percentAchieved: Number(fallback.percentAchieved || 0),
		};
	}

	const totals = cidades.reduce(
		(acc, cidade) => ({
			totalRealizado: acc.totalRealizado + Number(cidade.realizado || 0),
			totalMeta: acc.totalMeta + Number(cidade.meta80 || 0),
			totalCancelamentos:
				acc.totalCancelamentos + Number(cidade.cancelamentos || 0),
			totalFalta: acc.totalFalta + Number(cidade.falta || 0),
			expectedToday: acc.expectedToday + Number(cidade.expectedToday || 0),
			desvio: acc.desvio + Number(cidade.desvio || 0),
		}),
		{
			totalRealizado: 0,
			totalMeta: 0,
			totalCancelamentos: 0,
			totalFalta: 0,
			expectedToday: 0,
			desvio: 0,
		},
	);

	return {
		...totals,
		percentAchieved:
			totals.totalMeta > 0
				? (totals.totalRealizado / totals.totalMeta) * 100
				: 0,
	};
}

function formatLastUpdate(value) {
	if (!value) return "Sincronizado";
	const raw =
		typeof value === "object"
			? value.texto ||
				value.lastUpdate ||
				value.updatedAt ||
				value.data ||
				value.ultimaAtualizacao ||
				value.atualizadoEm
			: value;

	if (!raw) return "Sincronizado";
	const date = resolveVpsDate(raw);
	if (!date) return String(raw);

	return date.toLocaleDateString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getPeriodLabel(month) {
	const index = MONTH_ORDER.findIndex(
		(item) => normalizeMonthName(item) === normalizeMonthName(month),
	);
	if (index < 0) return "--";
	const year = new Date().getFullYear();
	const first = new Date(year, index, 1);
	const last = new Date(year, index + 1, 0);
	return `${first.toLocaleDateString("pt-BR")} - ${last.toLocaleDateString("pt-BR")}`;
}

function AgentsMetricCard({ label, value, sub, tone = "blue" }) {
	return (
		<div className={`agents-mini-kpi ${tone}`}>
			<span>{label}</span>
			<strong>{value}</strong>
			<small>{sub}</small>
		</div>
	);
}

function AgentsPortfolioHealth({ summary, stats, message, intFmt, pctFmt }) {
	const status = stats.portfolioStatus;
	return (
		<section className={`agents-health-card ${status.tone}`}>
			<div className="agents-section-header">
				<div>
					<span>Saúde da carteira</span>
					<h2>{status.icon} {status.label}</h2>
				</div>
				<strong>{pctFmt.format(summary.percentAchieved || 0)}%</strong>
			</div>
			<p>{message}</p>
			<div className="agents-health-grid">
				<AgentsMetricCard
					label="Realizado"
					value={intFmt.format(summary.totalRealizado || 0)}
					sub="retiradas"
				/>
				<AgentsMetricCard
					label="Meta"
					value={intFmt.format(Math.round(summary.totalMeta || 0))}
					sub="carteira"
					tone="orange"
				/>
				<AgentsMetricCard
					label="Faltam"
					value={intFmt.format(Math.max(0, summary.totalMeta - summary.totalRealizado))}
					sub="para meta"
					tone="red"
				/>
				<AgentsMetricCard
					label="Ritmo"
					value={`${pctFmt.format(stats.ritmoAtual)} /dia`}
					sub="atual"
					tone="green"
				/>
				<AgentsMetricCard
					label="Necessário"
					value={`${pctFmt.format(stats.requiredDaily)} /dia`}
					sub="ate fechamento"
					tone="purple"
				/>
				<AgentsMetricCard
					label="Cidades críticas"
					value={intFmt.format(stats.statusCounts.critical || 0)}
					sub={`${intFmt.format(stats.citiesAtRisk)} em risco`}
					tone="red"
				/>
			</div>
		</section>
	);
}

function AgentsClosingForecast({ stats, summary, intFmt, pctFmt }) {
	return (
		<section className="card agents-closing-card">
			<div className="card-title">Fechamento da carteira</div>
			<div className="agents-closing-grid">
				<div>
					<span>Realizado</span>
					<strong>{intFmt.format(summary.totalRealizado || 0)}</strong>
				</div>
				<div>
					<span>Meta</span>
					<strong>{intFmt.format(Math.round(summary.totalMeta || 0))}</strong>
				</div>
				<div>
					<span>Faltam</span>
					<strong>{intFmt.format(Math.max(0, summary.totalMeta - summary.totalRealizado))}</strong>
				</div>
				<div>
					<span>Dias úteis restantes</span>
					<strong>{intFmt.format(stats.remainingBusinessDays)}</strong>
				</div>
				<div>
					<span>Necessário/dia</span>
					<strong>{pctFmt.format(stats.requiredDaily)}</strong>
				</div>
				<div>
					<span>Projeção</span>
					<strong>{intFmt.format(stats.projection)}</strong>
				</div>
				<div>
					<span>Gap projetado</span>
					<strong className={stats.projectedGap >= 0 ? "positive" : "negative"}>
						{formatSigned(stats.projectedGap, intFmt)}
					</strong>
				</div>
				<div>
					<span>% projetado</span>
					<strong>{pctFmt.format(stats.projectedPct)}%</strong>
				</div>
			</div>
		</section>
	);
}

function AgentsPriorityActions({ items = [], intFmt }) {
	return (
		<section className="card agents-priority-card">
			<div className="card-title">Ações prioritárias</div>
			<div className="agents-action-list">
				{items.length ? (
					items.map((item) => (
						<button
							type="button"
							key={item.nome}
							className={`agents-action-item ${item.statusInfo.tone}`}
							onClick={item.onClick}
						>
							<span>{item.statusInfo.icon}</span>
							<div>
								<strong>{item.nome}</strong>
								<small>
									{intFmt.format(item.realizado)} / {intFmt.format(Math.round(item.meta80))} ·{" "}
									{item.realizado === 0
										? "Nenhuma retirada registrada."
										: "Produção abaixo do ritmo esperado."}
								</small>
							</div>
							<b>{formatSigned(item.gap, intFmt)}</b>
						</button>
					))
				) : (
					<p className="agents-empty-note">Nenhuma ação crítica para os filtros selecionados.</p>
				)}
			</div>
		</section>
	);
}

function AgentsRecoveryOpportunities({ items = [], totalDeficit, intFmt, pctFmt }) {
	const topShare =
		totalDeficit > 0
			? (items.reduce((sum, item) => sum + Math.abs(Math.min(0, item.gap)), 0) /
					totalDeficit) *
				100
			: 0;
	return (
		<section className="card agents-recovery-card">
			<div className="card-title card-title-split">
				<span>Oportunidades de recuperação</span>
				<span className="agentes-chart-caption">
					Top 5: {pctFmt.format(topShare)}% do déficit
				</span>
			</div>
			<div className="agents-recovery-list">
				{items.length ? (
					items.map((item) => {
						const deficit = Math.abs(Math.min(0, item.gap));
						const width = totalDeficit > 0 ? (deficit / totalDeficit) * 100 : 0;
						return (
							<div className="agents-recovery-row" key={item.nome}>
								<div>
									<strong>{item.nome}</strong>
									<span>
										{intFmt.format(item.realizado)} realizadas · meta{" "}
										{intFmt.format(Math.round(item.meta80))}
									</span>
								</div>
								<div className="agents-pareto-bar">
									<span style={{ width: `${Math.min(width, 100)}%` }} />
								</div>
								<b>{formatSigned(item.gap, intFmt)}</b>
							</div>
						);
					})
				) : (
					<p className="agents-empty-note">Sem déficit no período filtrado.</p>
				)}
			</div>
		</section>
	);
}

function AgentsPositiveHighlights({ items = [], intFmt }) {
	return (
		<section className="card agents-positive-card">
			<div className="card-title">Destaques positivos</div>
			<div className="agents-positive-list">
				{items.length ? (
					items.map((item) => (
						<div className="agents-positive-item" key={item.nome}>
							<span>✅</span>
							<div>
								<strong>{item.nome}</strong>
								<small>
									{intFmt.format(item.realizado)} realizadas ·{" "}
									{formatSigned(item.gap, intFmt)} sobre a meta
								</small>
							</div>
						</div>
					))
				) : (
					<p className="agents-empty-note">Nenhuma cidade acima da meta ainda.</p>
				)}
			</div>
		</section>
	);
}

function AgentsRanking({ cidades = [] }) {
	const [sortBy, setSortBy] = useState("producao");
	const ranked = useMemo(() => {
		const rows = [...cidades];
		const sorters = {
			producao: (a, b) => b.realizado - a.realizado,
			atingimento: (a, b) => b.pct - a.pct,
			gap: (a, b) => a.gap - b.gap,
			oportunidade: (a, b) =>
				Math.abs(Math.min(0, b.gap)) - Math.abs(Math.min(0, a.gap)),
		};
		return rows.sort(sorters[sortBy] || sorters.producao).map((item) => ({
			...item,
			name: item.nome,
			total: Math.round(Number(item.realizado) || 0),
			percent: Number(item.pct) || 0,
		}));
	}, [cidades, sortBy]);

	return (
		<section className="card">
			<div className="card-title card-title-split">
				<span>Ranking por cidade</span>
				<div className="agents-ranking-tabs">
					{[
						["producao", "Produção"],
						["atingimento", "Atingimento"],
						["gap", "Maior gap"],
						["oportunidade", "Oportunidade"],
					].map(([key, label]) => (
						<button
							type="button"
							key={key}
							className={sortBy === key ? "active" : ""}
							onClick={() => setSortBy(key)}
						>
							{label}
						</button>
					))}
				</div>
			</div>
			<RankingList items={ranked} metaRef={0} label="retiradas" />
			<div className="agents-ranking-note">
				Gap exibido na tabela: positivo significa acima da meta; negativo indica déficit.
			</div>
		</section>
	);
}

function StatusMap({ cidades = [], onStatusClick, activeStatus = "todos" }) {
	const groups = [
		{ key: "over", title: "Acima da Meta", tone: "over" },
		{ key: "done", title: "Meta atingida", tone: "done" },
		{ key: "progress", title: "Em andamento", tone: "progress" },
		{ key: "attention", title: "Atenção", tone: "attention" },
		{ key: "below", title: "Abaixo", tone: "below" },
		{ key: "critical", title: "Crítico", tone: "critical" },
	].map((group) => ({
		...group,
		items: cidades.filter((cidade) => {
			const status = getCityStatus(cidade).key;
			return status === group.key;
		}),
	}));

	return (
		<div className="agentes-status-map">
			{groups.map((group) => (
				<button
					type="button"
					className={`agentes-status-group ${group.tone} ${
						activeStatus === group.key ? "active" : ""
					}`}
					key={group.key}
					onClick={() => onStatusClick(group.key)}
				>
					<div className="agentes-status-heading">
						<span>{group.title}</span>
						<strong>{group.items.length}</strong>
					</div>
					<div className="agentes-city-chips">
						{(group.items.length ? group.items : [{ nome: "Sem cidades" }]).map(
							(cidade) => (
								<span key={`${group.key}-${cidade.nome}`}>{cidade.nome}</span>
							),
						)}
					</div>
				</button>
			))}
		</div>
	);
}

export default function TabAgentes({ allData, month, lastUpdate }) {
	const dataMonthKey = useMemo(
		() => resolveMonthKey(allData, month),
		[allData, month],
	);
	const d = getMonthRecord(allData, month);
	const [selectedCity, setSelectedCity] = useState(null);
	const [cityFilter, setCityFilter] = useState("todas");
	const [statusFilter, setStatusFilter] = useState("todos");

	const chartCidadesRef = useRef(null);
	const chartDailyRef = useRef(null);
	const chartMonthlyRef = useRef(null);
	const chartCidadesInst = useRef(null);
	const chartDailyInst = useRef(null);
	const chartMonthlyInst = useRef(null);

	const intFmt = useMemo(
		() =>
			new Intl.NumberFormat("pt-BR", {
				maximumFractionDigits: 0,
			}),
		[],
	);

	const pctFmt = useMemo(
		() =>
			new Intl.NumberFormat("pt-BR", {
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			}),
		[],
	);

	const rawCidades = useMemo(() => {
		const base = Array.isArray(d?.cidades) ? d.cidades : [];
		return [...base].sort(
			(a, b) => Number(b.realizado || 0) - Number(a.realizado || 0),
		);
	}, [d]);

	const lastDataDay = useMemo(() => {
		const totalDaily = Array.isArray(d?.totalDaily) ? d.totalDaily : [];
		return totalDaily.reduce(
			(last, value, index) => (Number(value || 0) > 0 ? index + 1 : last),
			0,
		);
	}, [d]);

	const businessContext = useMemo(
		() => buildBusinessDayContext(dataMonthKey, lastDataDay),
		[dataMonthKey, lastDataDay],
	);

	const cidades = useMemo(() => {
		return rawCidades
			.map((cidade) => {
				const realizado = Math.round(safeNumber(cidade.realizado));
				const meta80 = Math.round(safeNumber(cidade.meta80));
				const statusInfo = calculateCityStatus(
					{ ...cidade, realizado, meta80 },
					businessContext,
				);
				const gap = statusInfo.gap;
				return {
					...cidade,
					realizado,
					cancelamentos: Math.round(safeNumber(cidade.cancelamentos)),
					meta80,
					falta: meta80 - realizado,
					gap,
					pct: statusInfo.achievement,
					expectedToday: statusInfo.expected,
					desvio: statusInfo.desvio,
					statusInfo,
				};
			})
			.sort((a, b) => Number(b.realizado || 0) - Number(a.realizado || 0));
	}, [businessContext, rawCidades]);

	const filteredCities = useMemo(() => {
		return cidades.filter((cidade) => {
			const cityMatches =
				cityFilter === "todas" ||
				normalizeMonthName(cidade.nome) === cityFilter;
			const statusMatches =
				statusFilter === "todos" || getCityStatus(cidade).key === statusFilter;
			return cityMatches && statusMatches;
		});
	}, [cidades, cityFilter, statusFilter]);

	const summary = useMemo(
		() => getFilteredSummary(filteredCities, d),
		[d, filteredCities],
	);

	const operationalStats = useMemo(() => {
		const totalRealizado = safeNumber(summary.totalRealizado);
		const totalMeta = safeNumber(summary.totalMeta);
		const gap = calculateGap(totalRealizado, totalMeta);
		const elapsed = businessContext.elapsedBusinessDays || 0;
		const remaining = businessContext.remainingBusinessDays || 0;
		const ritmoAtual = elapsed > 0 ? totalRealizado / elapsed : 0;
		const requiredDaily = remaining > 0 ? Math.max(0, -gap) / remaining : 0;
		const projection = Math.round(totalRealizado + ritmoAtual * remaining);
		const projectedGap = calculateGap(projection, totalMeta);
		const projectedPct = calculateAchievement(projection, totalMeta);
		const statusCounts = cidades.reduce((acc, cidade) => {
			const key = getCityStatus(cidade).key;
			acc[key] = (acc[key] || 0) + 1;
			return acc;
		}, {});
		const citiesAtRisk =
			(statusCounts.attention || 0) +
			(statusCounts.below || 0) +
			(statusCounts.critical || 0);
		let portfolioStatus = STATUS_CONFIG.progress;
		if (summary.percentAchieved >= 100) portfolioStatus = STATUS_CONFIG.done;
		else if (projectedGap >= 0) portfolioStatus = STATUS_CONFIG.progress;
		else if (citiesAtRisk >= Math.ceil(cidades.length * 0.5))
			portfolioStatus = STATUS_CONFIG.below;
		else if ((statusCounts.critical || 0) > 0)
			portfolioStatus = STATUS_CONFIG.attention;

		return {
			gap,
			ritmoAtual,
			requiredDaily,
			remainingBusinessDays: remaining,
			elapsedBusinessDays: elapsed,
			projection,
			projectedGap,
			projectedPct,
			statusCounts,
			citiesAtRisk,
			portfolioStatus,
		};
	}, [businessContext, cidades, summary]);

	const priorityActions = useMemo(() => {
		return [...filteredCities]
			.filter((cidade) =>
				["attention", "below", "critical"].includes(cidade.statusInfo.tone),
			)
			.sort((a, b) => {
				if (a.realizado === 0 && b.realizado !== 0) return -1;
				if (b.realizado === 0 && a.realizado !== 0) return 1;
				if (a.statusInfo.weight !== b.statusInfo.weight)
					return b.statusInfo.weight - a.statusInfo.weight;
				return a.gap - b.gap;
			})
			.slice(0, 5)
			.map((cidade) => ({
				...cidade,
				onClick: () => setSelectedCity(cidade),
			}));
	}, [filteredCities]);

	const recoveryItems = useMemo(
		() =>
			[...filteredCities]
				.filter((cidade) => cidade.gap < 0)
				.sort((a, b) => a.gap - b.gap)
				.slice(0, 5),
		[filteredCities],
	);

	const positiveHighlights = useMemo(
		() =>
			[...filteredCities]
				.filter((cidade) => cidade.gap > 0)
				.sort((a, b) => b.gap - a.gap)
				.slice(0, 4),
		[filteredCities],
	);

	const totalDeficit = useMemo(
		() =>
			filteredCities.reduce(
				(sum, cidade) => sum + Math.abs(Math.min(0, cidade.gap)),
				0,
			),
		[filteredCities],
	);

	const healthMessage = useMemo(() => {
		const leader = [...filteredCities].sort(
			(a, b) => b.realizado - a.realizado,
		)[0];
		const critical = [...filteredCities]
			.filter((cidade) => cidade.statusInfo.tone === "critical")
			.sort((a, b) => a.gap - b.gap)
			.slice(0, 2);
		const over = positiveHighlights[0];
		if (!filteredCities.length) return "Nenhuma cidade disponível para os filtros selecionados.";
		if (critical.length) {
			return `${leader?.nome || "A carteira"} lidera a produção. ${critical
				.map((cidade) => cidade.nome)
				.join(" e ")} ${
				critical.length > 1 ? "ainda concentram" : "ainda concentra"
			} parte importante da oportunidade de recuperação.`;
		}
		if (over) {
			return `${over.nome} já superou a meta e puxa o resultado da carteira. Mantenha o acompanhamento das cidades em atenção para fechar o mês sem perda de ritmo.`;
		}
		return `${leader?.nome || "A carteira"} lidera a produção atual. Acompanhe o necessário por dia para sustentar a meta até o fechamento.`;
	}, [filteredCities, positiveHighlights]);

	const periodLabel = useMemo(
		() => getPeriodLabel(dataMonthKey),
		[dataMonthKey],
	);
	const lastUpdateText = useMemo(
		() => formatLastUpdate(lastUpdate),
		[lastUpdate],
	);

	useEffect(() => {
		if (!d || !chartCidadesRef.current) return;
		if (chartCidadesInst.current) chartCidadesInst.current.destroy();

		const all = filteredCities;
		const chartH = Math.max(360, all.length * 34 + 80);
		chartCidadesRef.current.parentElement.style.height = `${chartH}px`;

		chartCidadesInst.current = new Chart(chartCidadesRef.current, {
			type: "bar",
			data: {
				labels: all.map((c) => c.nome),
				datasets: [
					{
						label: "Realizado",
						data: all.map((c) => Math.round(Number(c.realizado) || 0)),
						backgroundColor: "#FF6B00",
						borderRadius: 5,
						barThickness: 12,
					},
					{
						label: "Meta 80%",
						data: all.map((c) => Math.round(Number(c.meta80) || 0)),
						backgroundColor: "rgba(0,48,135,0.55)",
						borderRadius: 5,
						barThickness: 12,
					},
				],
			},
			options: {
				indexAxis: "y",
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: "top" },
					tooltip: {
						callbacks: {
							label: (ctx) =>
								`${ctx.dataset.label}: ${intFmt.format(ctx.parsed.x || 0)}`,
						},
					},
				},
				scales: {
					x: {
						beginAtZero: true,
						grid: { color: "rgba(15, 23, 42, 0.06)" },
						ticks: {
							callback: (value) => intFmt.format(value),
						},
					},
					y: { grid: { display: false } },
				},
			},
		});
	}, [d, filteredCities, intFmt]);

	useEffect(() => {
		if (!d || !chartDailyRef.current) return;
		if (chartDailyInst.current) chartDailyInst.current.destroy();

		let daily = resolveDailyTotals(cityFilter, d, filteredCities);

		let lastActive = -1;
		daily.forEach((v, i) => {
			if (v > 0) lastActive = i;
		});

		if (lastActive >= 0) {
			daily = daily.slice(0, lastActive + 1);
		}

		const accumulated = [];
		let sum = 0;

		for (let i = 0; i < daily.length; i++) {
			sum += daily[i];
			accumulated.push(sum);
		}

		const labels = daily.map((_, i) => `Dia ${i + 1}`);
		const metaCumulative = buildMetaCumulative(
			summary.totalMeta,
			dataMonthKey,
			businessContext,
		).slice(0, labels.length);
		const projection = accumulated.map((value, index) => {
			if (index < accumulated.length - 1) return null;
			return value;
		});
		const lastAccumulated = accumulated[accumulated.length - 1] || 0;
		if (labels.length && businessContext.remainingBusinessDays > 0) {
			let projected = lastAccumulated;
			for (
				let day = labels.length + 1;
				day <= businessContext.totalDays;
				day += 1
			) {
				if (!isDiaUtil(dataMonthKey, day, new Set(), businessContext.year))
					continue;
				labels.push(`Dia ${day}`);
				projected += operationalStats.ritmoAtual;
				projection.push(Math.round(projected));
				metaCumulative.push(
					buildMetaCumulative(summary.totalMeta, dataMonthKey, businessContext)[
						day - 1
					] || summary.totalMeta,
				);
			}
		}

		chartDailyInst.current = new Chart(chartDailyRef.current, {
			type: "line",
			data: {
				labels,
				datasets: [
					{
						label: "Acumulado Geral",
						data: accumulated,
						borderColor: "#FF6B00",
						backgroundColor: "rgba(255,107,0,0.1)",
						fill: true,
						tension: 0.35,
						pointRadius: 3,
						borderWidth: 2,
					},
					{
						label: "Meta esperada",
						data: metaCumulative,
						borderColor: "#003087",
						backgroundColor: "transparent",
						borderDash: [6, 5],
						tension: 0.25,
						pointRadius: 0,
						borderWidth: 2,
					},
					{
						label: "Projeção",
						data: projection,
						borderColor: "#7c3aed",
						backgroundColor: "transparent",
						borderDash: [2, 5],
						tension: 0.25,
						pointRadius: 2,
						borderWidth: 2,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: "top" },
					tooltip: {
						callbacks: {
							label: (ctx) =>
								`${ctx.dataset.label}: ${intFmt.format(ctx.parsed.y || 0)}`,
						},
					},
				},
				scales: {
					y: {
						beginAtZero: true,
						grid: { color: "rgba(15, 23, 42, 0.06)" },
						ticks: {
							callback: (value) => intFmt.format(value),
						},
					},
					x: { grid: { display: false } },
				},
			},
		});
	}, [
		businessContext,
		cityFilter,
		d,
		dataMonthKey,
		filteredCities,
		intFmt,
		operationalStats.ritmoAtual,
		summary.totalMeta,
	]);

	useEffect(() => {
		if (!chartMonthlyRef.current) return;
		if (chartMonthlyInst.current) chartMonthlyInst.current.destroy();

		const mesesComDados = getMonthsFromCurrent(dataMonthKey, allData);

		chartMonthlyInst.current = new Chart(chartMonthlyRef.current, {
			type: "bar",
			data: {
				labels: mesesComDados,
				datasets: [
					{
						label: "Realizado",
						data: mesesComDados.map((m) =>
							Math.round(
								Number(getMonthRecord(allData, m)?.totalRealizado || 0),
							),
						),
						backgroundColor: "#FF6B00",
						borderRadius: 8,
					},
					{
						label: "Meta 80%",
						data: mesesComDados.map((m) =>
							Math.round(Number(getMonthRecord(allData, m)?.totalMeta || 0)),
						),
						backgroundColor: "rgba(0,48,135,0.5)",
						borderRadius: 8,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: "top" },
					tooltip: {
						callbacks: {
							label: (ctx) =>
								`${ctx.dataset.label}: ${intFmt.format(ctx.parsed.y || 0)}`,
						},
					},
				},
				scales: {
					y: {
						beginAtZero: true,
						grid: { color: "rgba(15, 23, 42, 0.06)" },
						ticks: {
							callback: (value) => intFmt.format(value),
						},
					},
					x: { grid: { display: false } },
				},
			},
		});
	}, [allData, dataMonthKey, intFmt]);

	useEffect(() => {
		return () => {
			if (chartCidadesInst.current) chartCidadesInst.current.destroy();
			if (chartDailyInst.current) chartDailyInst.current.destroy();
			if (chartMonthlyInst.current) chartMonthlyInst.current.destroy();
		};
	}, []);

	if (!d)
		return (
			<EmptyState
				icon="🏢"
				title="Sem dados para este mês"
				desc="Aguardando sincronização com a VPS."
			/>
		);

	const filterActive = cityFilter !== "todas" || statusFilter !== "todos";

	return (
		<div className="agentes-dashboard">
			<section className="agents-page-hero">
				<div>
					<span>Dashboard Agentes Autorizados</span>
					<h1>Central operacional da carteira</h1>
					<p>
						Visão consolidada da carteira, metas, recuperação e desempenho por
						cidade.
					</p>
				</div>
				<div className="agents-sync-status">
					<span>Última atualização</span>
					<strong>{lastUpdateText}</strong>
					<small>● Sincronizado</small>
				</div>
			</section>

			<div className="agentes-filterbar">
				<label>
					<span>Base do painel</span>
					<select defaultValue="sempre">
						<option value="sempre">SEMPRE</option>
					</select>
				</label>

				<label>
					<span>Período</span>
					<input type="text" value={periodLabel} readOnly />
				</label>

				<label>
					<span>Cidade</span>
					<select
						value={cityFilter}
						onChange={(event) => setCityFilter(event.target.value)}
					>
						<option value="todas">Todas</option>
						{cidades.map((cidade) => (
							<option key={cidade.nome} value={normalizeMonthName(cidade.nome)}>
								{cidade.nome}
							</option>
						))}
					</select>
				</label>

				<label>
					<span>Status</span>
					<select
						value={statusFilter}
						onChange={(event) => setStatusFilter(event.target.value)}
					>
						<option value="todos">Todos</option>
						<option value="over">Acima da Meta</option>
						<option value="done">Meta atingida</option>
						<option value="progress">Em andamento</option>
						<option value="attention">Atenção</option>
						<option value="below">Abaixo</option>
						<option value="critical">Crítico</option>
					</select>
				</label>

				<div className="agentes-filter-update">
					<span>Última atualização</span>
					<strong>{lastUpdateText}</strong>
				</div>
			</div>

			<div className="kpis agentes-kpis">
				<KpiCard
					label="Total realizado"
					value={intFmt.format(Number(summary.totalRealizado || 0))}
					sub={`Retiradas concluídas · ${pctFmt.format(
						summary.totalCancelamentos > 0
							? (summary.totalRealizado / summary.totalCancelamentos) * 100
							: 0,
					)}% dos cancelamentos`}
					color="orange"
				/>
				<KpiCard
					label="Meta 80%"
					value={intFmt.format(Math.round(Number(summary.totalMeta || 0)))}
					sub={`Cancelamentos: ${intFmt.format(Number(summary.totalCancelamentos || 0))}`}
					color="blue"
				/>
				<KpiCard
					label="% atingido da meta"
					value={`${pctFmt.format(Number(summary.percentAchieved || 0))}%`}
					sub={`${intFmt.format(Number(summary.totalRealizado || 0))} de ${intFmt.format(
						Math.round(Number(summary.totalMeta || 0)),
					)} O.S.`}
					color="green"
				/>
				<KpiCard
					label="Falta para meta"
					value={intFmt.format(
						Math.max(
							0,
							Math.round(
								Number(summary.totalMeta || 0) -
									Number(summary.totalRealizado || 0),
							),
						),
					)}
					sub={`Gap real: ${formatSigned(operationalStats.gap, intFmt)}`}
					color="red"
				/>
			</div>

			<div className="agents-operational-kpis">
				<AgentsMetricCard
					label="Ritmo atual"
					value={`${pctFmt.format(operationalStats.ritmoAtual)} O.S./dia`}
					sub={`${intFmt.format(operationalStats.elapsedBusinessDays)} dias úteis considerados`}
					tone="green"
				/>
				<AgentsMetricCard
					label="Dias úteis restantes"
					value={intFmt.format(operationalStats.remainingBusinessDays)}
					sub={
						businessContext.isPastMonth
							? "Mês encerrado"
							: "até o fechamento"
					}
					tone="blue"
				/>
				<AgentsMetricCard
					label="Necessário por dia"
					value={`${pctFmt.format(operationalStats.requiredDaily)} O.S.`}
					sub="Necessário até o fechamento"
					tone="purple"
				/>
				<AgentsMetricCard
					label="Cidades em risco"
					value={intFmt.format(operationalStats.citiesAtRisk)}
					sub="Atenção, abaixo ou crítico"
					tone="red"
				/>
			</div>

			<AgentsPortfolioHealth
				summary={summary}
				stats={operationalStats}
				message={healthMessage}
				intFmt={intFmt}
				pctFmt={pctFmt}
			/>

			<section className="card agentes-chart-wide agents-evolution-card">
				<div className="card-title card-title-split">
					<div>
						<span>Evolução da carteira</span>
						<p>Produção acumulada em relação à meta esperada.</p>
					</div>
					<span className="agentes-chart-caption">
						{filterActive ? "Filtros aplicados" : `${cidades.length} cidades`}
					</span>
				</div>
				<div className="chart-container">
					<canvas ref={chartDailyRef} />
				</div>
			</section>

			<div className="agents-work-grid">
				<AgentsClosingForecast
					stats={operationalStats}
					summary={summary}
					intFmt={intFmt}
					pctFmt={pctFmt}
				/>
				<AgentsPriorityActions items={priorityActions} intFmt={intFmt} />
			</div>

			<div className="agents-work-grid">
				<AgentsRecoveryOpportunities
					items={recoveryItems}
					totalDeficit={totalDeficit}
					intFmt={intFmt}
					pctFmt={pctFmt}
				/>
				<AgentsPositiveHighlights
					items={positiveHighlights}
					intFmt={intFmt}
				/>
			</div>

			<div className="agentes-focus-grid">
				<section className="card">
					<div className="card-title">Mapa de status das cidades</div>
					<StatusMap
						cidades={cidades}
						activeStatus={statusFilter}
						onStatusClick={(status) =>
							setStatusFilter(statusFilter === status ? "todos" : status)
						}
					/>
					{statusFilter !== "todos" ? (
						<button
							type="button"
							className="agents-clear-filter"
							onClick={() => setStatusFilter("todos")}
						>
							Limpar filtro de status
						</button>
					) : null}
				</section>

				<section className="card agentes-city-chart-card">
					<div className="card-title card-title-split">
						<span>Realizado vs Meta por Cidade</span>
						<span className="agentes-chart-caption">
							{filterActive ? "Filtros aplicados" : `${cidades.length} cidades`}
						</span>
					</div>
					<div className="chart-container agentes-city-chart">
						<canvas ref={chartCidadesRef} />
					</div>
				</section>
			</div>

			<AgentsRanking cidades={filteredCities} />

			<section className="card agentes-table-card">
				<div className="card-title-split">
					<div className="card-title">Detalhamento por Cidade</div>
					<button
						type="button"
						className="btn-meta-mensal"
						onClick={() => gerarPDFMetaMensal(dataMonthKey, filteredCities)}
						disabled={!filteredCities.length}
					>
						Meta Mensal
					</button>
				</div>
				{filteredCities.length ? (
					<CityTable cidades={filteredCities} onCityClick={setSelectedCity} />
				) : (
					<EmptyState
						icon="🏢"
						title="Nenhum dado disponível"
						desc="Nenhuma cidade encontrada para os filtros selecionados."
					/>
				)}
			</section>

			<section className="card agentes-chart-wide">
				<div className="card-title">Comparativo Mensal — Ano Completo</div>
				<div className="chart-container">
					<canvas ref={chartMonthlyRef} />
				</div>
			</section>

			{selectedCity && (
				<CityModal
					cidade={selectedCity}
					month={dataMonthKey}
					allData={allData}
					onClose={() => setSelectedCity(null)}
				/>
			)}
		</div>
	);
}
