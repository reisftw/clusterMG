import {
	AlertTriangle,
	BarChart3,
	BriefcaseBusiness,
	CalendarDays,
	ClipboardCheck,
	FileText,
	ReceiptText,
	RefreshCw,
	Star,
	Tag,
	TrendingUp,
	UsersRound,
	WalletCards,
} from "lucide-react";
import { decimal, integer } from "../../modules/financeiro/utils/financeiroFormatters";
import { tariffBudgetMonthName } from "../../modules/financeiro/utils/tariffsViewModels";
import { useAcompanhamentoFinanceiroData } from "./useAcompanhamentoFinanceiroData";
import "./AcompanhamentoFinanceiroPage.css";

const KPI_ICONS = {
	coin: WalletCards,
	invoice: ReceiptText,
	revenue: BarChart3,
	tag: Tag,
	users: UsersRound,
};

const SMALL_CARD_ICONS = {
	alert: AlertTriangle,
	calendar: CalendarDays,
	clipboard: ClipboardCheck,
	invoice: FileText,
	money: WalletCards,
	star: Star,
	trend: TrendingUp,
	user: UsersRound,
	wallet: BriefcaseBusiness,
};

const PAYMENT_COLORS = ["#2f82ff", "#ff8a2a", "#45d06f", "#9863ff", "#38d6ff"];

function formatUpdatedAt(value) {
	if (!value) return "Sem atualização";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "Sem atualização";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatCardValue(card) {
	if (card.type === "number") return integer.format(Number(card.value || 0));
	if (card.type === "percent") return `${decimal.format(Number(card.value || 0))}%`;
	return card.value || "-";
}

function trendClass(card) {
	const trend = Number(card.trend || 0);
	if (!trend) return "is-neutral";
	const positive = card.invertedTrend ? trend < 0 : trend > 0;
	return positive ? "is-up" : "is-down";
}

function trendLabel(card) {
	const trend = Number(card.trend || 0);
	if (!Number.isFinite(trend) || trend === 0) return "Sem comparativo";
	return `${trend > 0 ? "▲" : "▼"} ${decimal.format(Math.abs(trend))}% vs. mês anterior`;
}

function SvgIcon({ name }) {
	const Icon = KPI_ICONS[name] || BarChart3;
	return <Icon aria-hidden="true" size={34} strokeWidth={1.8} />;
}

function SmallIcon({ name }) {
	const Icon = SMALL_CARD_ICONS[name] || BarChart3;
	return <Icon aria-hidden="true" size={24} strokeWidth={1.9} />;
}

function MonthYearSelector({ availableYears, reference, setReference }) {
	const updateReference = (key, value) => {
		setReference((current) => ({ ...current, [key]: Number(value) }));
	};

	return (
		<div className="finance-panel-period">
			<CalendarDays aria-hidden="true" size={18} />
			<label className="sr-only" htmlFor="finance-panel-month">
				Mês do painel financeiro
			</label>
			<select
				id="finance-panel-month"
				value={reference.month}
				onChange={(event) => updateReference("month", event.target.value)}
			>
				{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
					<option key={month} value={month}>
						{tariffBudgetMonthName(month)}
					</option>
				))}
			</select>
			<label className="sr-only" htmlFor="finance-panel-year">
				Ano do painel financeiro
			</label>
			<select
				id="finance-panel-year"
				value={reference.year}
				onChange={(event) => updateReference("year", event.target.value)}
			>
				{availableYears.map((year) => (
					<option key={year} value={year}>
						{year}
					</option>
				))}
			</select>
		</div>
	);
}

function Header({ availableYears, error, lastRefresh, loading, reference, refresh, setReference }) {
	return (
		<header className="finance-panel-header">
			<img
				alt="Sempre Internet"
				className="finance-panel-logo"
				src="/sempre-logo.webp"
			/>
			<div className="finance-panel-divider" />
			<div className="finance-panel-title">
				<h1>Painel Financeiro</h1>
				<p>Visão geral de indicadores financeiros</p>
			</div>
			<div className="finance-panel-actions">
				<MonthYearSelector
					availableYears={availableYears}
					reference={reference}
					setReference={setReference}
				/>
				<div className="finance-panel-updated">
					Última atualização: {formatUpdatedAt(lastRefresh)}
				</div>
				<button
					aria-label="Atualizar painel financeiro"
					className="finance-panel-refresh"
					disabled={loading}
					onClick={refresh}
					type="button"
				>
					<RefreshCw aria-hidden="true" size={18} />
				</button>
				<div className="finance-panel-live">
					<span />
					{error || "AO VIVO"}
				</div>
			</div>
		</header>
	);
}

function KpiCard({ card }) {
	return (
		<article className={`finance-kpi-card ${card.featured ? "is-featured" : ""}`}>
			<div className="finance-kpi-icon">
				<SvgIcon name={card.icon} />
			</div>
			<div>
				<h2>{card.title}</h2>
				<strong>{formatCardValue(card)}</strong>
				<p className={trendClass(card)}>{trendLabel(card)}</p>
			</div>
		</article>
	);
}

function BillingClientsChart({ series = [] }) {
	const values = series.map((item) => Number(item.value || 0));
	const max = Math.max(...values, 1);
	const width = 720;
	const height = 260;
	const barWidth = Math.max(
		32,
		Math.min(68, (width - 96) / Math.max(series.length, 1) - 14),
	);

	return (
		<div className="finance-chart-card is-wide">
			<div className="finance-chart-head">
				<h2>Clientes por forma de cobrança</h2>
				<div className="finance-chart-tabs" aria-label="Tipo de período">
					<span className="is-active">Mensal</span>
					<span>Trimestral</span>
					<span>Anual</span>
				</div>
			</div>
			<svg className="finance-line-chart" viewBox={`0 0 ${width} ${height}`} role="img">
				<title>Clientes por forma de cobrança no mês</title>
				{[0.2, 0.4, 0.6, 0.8, 1].map((tick) => (
					<line
						key={tick}
						x1="28"
						x2={width - 20}
						y1={24 + (1 - tick) * (height - 70)}
						y2={24 + (1 - tick) * (height - 70)}
					/>
				))}
				{series.map((item, index) => {
					const x = 44 + index * ((width - 88) / Math.max(series.length, 1));
					const barHeight = (Number(item.value || 0) / max) * (height - 80);
					const y = height - 42 - barHeight;
					return (
						<g key={item.key || item.label}>
							<rect
								className="finance-client-bar"
								x={x}
								y={y}
								width={barWidth}
								height={Math.max(2, barHeight)}
								rx="8"
							/>
							<text className="finance-client-bar-value" x={x + barWidth / 2} y={y - 8}>
								{integer.format(Number(item.value || 0))}
							</text>
							<text x={x + barWidth / 2} y={height - 14}>
								{item.label}
							</text>
						</g>
					);
				})}
				{series.length ? null : (
					<text x={width / 2} y={height / 2}>
						Nenhum cliente encontrado
					</text>
				)}
			</svg>
		</div>
	);
}

function DonutChart({ items = [] }) {
	const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
	const radius = 74;
	const circumference = 2 * Math.PI * radius;
	const segments = items.reduce(
		(acc, item, index) => {
			const percent = total ? Number(item.value || 0) / total : 0;
			const dash = `${percent * circumference} ${circumference}`;
			return {
				offset: acc.offset - percent * circumference,
				circles: [
					...acc.circles,
					{
						dash,
						item,
						offset: acc.offset,
						stroke: PAYMENT_COLORS[index % PAYMENT_COLORS.length],
					},
				],
			};
		},
		{ offset: 25, circles: [] },
	).circles;

	return (
		<div className="finance-chart-card">
			<h2>Ranking por forma de pagamento no mês</h2>
			<div className="finance-payment-grid">
				<div className="finance-donut-wrap">
					<svg viewBox="0 0 200 200" role="img">
						<title>Ranking por forma de pagamento</title>
						<circle className="finance-donut-track" cx="100" cy="100" r={radius} />
						{segments.map((segment) => (
							<circle
								key={segment.item.label}
								cx="100"
								cy="100"
								r={radius}
								stroke={segment.stroke}
								strokeDasharray={segment.dash}
								strokeDashoffset={segment.offset}
							/>
						))}
					</svg>
					<div>
						<span>Total</span>
						<strong>{integer.format(total)}</strong>
					</div>
				</div>
				<div className="finance-payment-list">
					{items.map((item, index) => {
						const percent = total ? (Number(item.value || 0) / total) * 100 : 0;
						return (
							<div key={item.label} className="finance-payment-item">
								<div
									className="finance-payment-name"
									style={{ "--dot": PAYMENT_COLORS[index % PAYMENT_COLORS.length] }}
								>
									{item.label}
								</div>
								<div className="finance-payment-values">
									<strong>{integer.format(Number(item.value || 0))}</strong>
									<small>{decimal.format(percent)}%</small>
								</div>
								<i style={{ width: `${Math.min(100, percent)}%` }} />
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function Gauge({ label, value, total, tone }) {
	const percent = total ? Math.min(100, (Number(value || 0) / total) * 100) : 0;
	return (
		<div className={`finance-gauge is-${tone}`}>
			<div className="finance-gauge-ring" style={{ "--value": `${percent * 1.8}deg` }}>
				<strong>{decimal.format(percent)}%</strong>
				<span>{label}</span>
			</div>
			<div>
				<strong>{integer.format(Number(value || 0))}</strong>
				<span>de {integer.format(Number(total || 0))} faturas</span>
			</div>
		</div>
	);
}

function InvoiceGauges({ invoiceSnapshot }) {
	const total = Number(invoiceSnapshot.active || 0) + Number(invoiceSnapshot.canceled || 0);
	return (
		<div className="finance-chart-card">
			<h2>Faturas ativas / canceladas</h2>
			<div className="finance-gauge-list">
				<Gauge label="Ativas" tone="blue" total={total} value={invoiceSnapshot.active} />
				<Gauge label="Canceladas" tone="orange" total={total} value={invoiceSnapshot.canceled} />
			</div>
		</div>
	);
}

function SmallCard({ card }) {
	return (
		<article className={`finance-small-card is-${card.tone}`}>
			<div className="finance-small-icon">
				<SmallIcon name={card.icon} />
			</div>
			<div>
				<h3>{card.title}</h3>
				{card.hideValue ? null : <strong>{formatCardValue(card)}</strong>}
				{card.meta ? <p>{card.meta}</p> : null}
			</div>
		</article>
	);
}

export default function AcompanhamentoFinanceiroPage() {
	const {
		availableYears,
		error,
		lastRefresh,
		loading,
		reference,
		refresh,
		setReference,
		viewModel,
	} = useAcompanhamentoFinanceiroData();

	return (
		<main className="finance-panel-page">
			<div className="finance-panel-glow one" />
			<div className="finance-panel-glow two" />
			<div className="finance-panel-shell">
				<Header
					availableYears={availableYears}
					error={error}
					lastRefresh={lastRefresh || viewModel.lastUpdated}
					loading={loading}
					reference={reference}
					refresh={refresh}
					setReference={setReference}
				/>
				<section className="finance-kpi-grid" aria-label="Indicadores principais">
					{viewModel.kpis.map((card) => (
						<KpiCard card={card} key={card.id} />
					))}
				</section>
				<section className="finance-main-grid" aria-label="Gráficos financeiros">
					<BillingClientsChart series={viewModel.billingClientsSeries} />
					<DonutChart items={viewModel.paymentRanking} />
					<InvoiceGauges invoiceSnapshot={viewModel.invoiceSnapshot} />
				</section>
				<section className="finance-small-grid" aria-label="Indicadores complementares">
					{viewModel.compactCards.map((card) => (
						<SmallCard card={card} key={card.title} />
					))}
				</section>
			</div>
			<img
				alt="Retorninho financeiro"
				className="finance-panel-mascot"
				src="/retorninho-financeiro.png"
			/>
		</main>
	);
}
