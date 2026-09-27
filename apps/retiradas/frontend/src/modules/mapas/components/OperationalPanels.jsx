import { useEffect, useMemo, useState } from "react";
import {
	BadgeCheck,
	CalendarPlus,
	Trophy,
	UserCheck,
	X,
} from "lucide-react";

const HIGHLIGHT_ROTATION_MS = 10000;

function numberValue(value) {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
	return new Intl.NumberFormat("pt-BR").format(numberValue(value));
}

function normalizeRankingItems(items = [], limit = 6) {
	return (Array.isArray(items) ? items : [])
		.map((item, index) => ({
			id: item.id || item.label || item.name || `item-${index}`,
			label: String(item.label || item.name || "Sem identificação").trim(),
			secondary: String(item.secondary || item.regional || item.type || "").trim(),
			type: String(item.type || item.channel || item.origem || "").trim(),
			total: numberValue(item.total ?? item.production ?? item.value),
		}))
		.filter((item) => item.label && item.total > 0)
		.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"))
		.slice(0, limit);
}

function HighlightMetric({ label, value }) {
	return (
		<div className="acomp-highlight-metric">
			<span>{label}</span>
			<strong>{formatNumber(value)}</strong>
		</div>
	);
}

function RankingEmptyState({ icon: Icon = Trophy, title, helper }) {
	return (
		<div className="acomp-highlight-empty">
			<Icon size={20} />
			<strong>{title}</strong>
			<span>{helper}</span>
		</div>
	);
}

function HighlightRankingList({
	emptyHelper,
	emptyTitle,
	highlightTop3 = false,
	icon,
	items,
	mode = "city",
}) {
	const max = Math.max(1, ...items.map((item) => item.total));

	if (!items.length) {
		return (
			<RankingEmptyState icon={icon} title={emptyTitle} helper={emptyHelper} />
		);
	}

	return (
		<div className="acomp-highlight-body">
			<div className="acomp-highlight-ranking">
				{items.map((item, index) => {
					const width = Math.max(8, Math.round((item.total / max) * 100));
					return (
						<div
							className={`acomp-highlight-rank-row ${
								highlightTop3 ? `is-medal-${index + 1}` : ""
							}`}
							key={item.id}
						>
							<span className="acomp-highlight-rank-pos">{index + 1}</span>
							<div className="acomp-highlight-rank-main">
								<div className="acomp-highlight-rank-line">
									<div>
										<strong>{item.label}</strong>
										{item.secondary || item.type ? (
											<span>
												{item.secondary || item.type}
												{mode === "technician" && item.type ? (
													<em>{item.type}</em>
												) : null}
											</span>
										) : null}
									</div>
									<b>{formatNumber(item.total)}</b>
								</div>
								<div className="acomp-highlight-track" aria-hidden="true">
									<span style={{ width: `${width}%` }} />
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export function DashboardHighlights({
	closedCities = [],
	openedCities = [],
	technicians = [],
}) {
	const slides = useMemo(
		() => [
			{
				id: "closed",
				label: "Fechamentos",
				title: "Fechamentos por cidade",
				icon: BadgeCheck,
				items: normalizeRankingItems(closedCities, 5),
				emptyTitle: "Nenhum fechamento registrado hoje.",
				emptyHelper:
					"Os dados entram automaticamente quando novas entregas forem registradas.",
			},
			{
				id: "technicians",
				label: "Técnicos",
				title: "Técnicos que mais fecharam hoje",
				icon: UserCheck,
				items: normalizeRankingItems(technicians, 6),
				emptyTitle: "Nenhum técnico com fechamento até o momento.",
				emptyHelper:
					"A produtividade individual será exibida assim que houver produção no dia.",
				mode: "technician",
				highlightTop3: true,
			},
			{
				id: "opened",
				label: "Aberturas",
				title: "Cidades com mais aberturas hoje",
				icon: CalendarPlus,
				items: normalizeRankingItems(openedCities, 5),
				emptyTitle: "Nenhuma nova O.S. aberta hoje.",
				emptyHelper:
					"A lista será atualizada quando a sincronização do mapa encontrar novas O.S.",
			},
		],
		[closedCities, openedCities, technicians],
	);
	const [selected, setSelected] = useState(0);
	const active = slides[selected % slides.length] || slides[0];

	useEffect(() => {
		const timer = window.setTimeout(
			() => setSelected((index) => (index + 1) % slides.length),
			HIGHLIGHT_ROTATION_MS,
		);
		return () => window.clearTimeout(timer);
	}, [selected, slides.length]);

	const totalClosed = slides[0].items.reduce((sum, item) => sum + item.total, 0);
	const totalOpened = slides[2].items.reduce((sum, item) => sum + item.total, 0);
	const activeTechnicians = slides[1].items.length;
	const ActiveIcon = active.icon || Trophy;

	return (
		<section className="acomp-panel acomp-day-highlights">
			<div className="acomp-day-highlights-header">
				<div className="acomp-panel-title">
					<Trophy size={19} />
					<h2>DESTAQUES DO DIA</h2>
				</div>
				<div className="acomp-highlight-metrics" aria-label="Resumo do dia">
					<HighlightMetric label="Fechamentos" value={totalClosed} />
					<HighlightMetric label="Técnicos" value={activeTechnicians} />
					<HighlightMetric label="Novas O.S." value={totalOpened} />
				</div>
			</div>

			<div className="acomp-highlight-tabs" role="tablist" aria-label="Destaques do dia">
				{slides.map((slide, index) => {
					const Icon = slide.icon;
					const isActive = selected === index;
					return (
						<button
							aria-controls={`acomp-highlight-panel-${slide.id}`}
							aria-selected={isActive}
							className={isActive ? "is-active" : ""}
							id={`acomp-highlight-tab-${slide.id}`}
							key={slide.id}
							onClick={() => setSelected(index)}
							role="tab"
							tabIndex={isActive ? 0 : -1}
							type="button"
						>
							<Icon size={15} />
							<span>{slide.label}</span>
						</button>
					);
				})}
			</div>
			<div className="acomp-highlight-progress" key={active.id} aria-hidden="true">
				<span />
			</div>

			<div
				aria-labelledby={`acomp-highlight-tab-${active.id}`}
				className="acomp-highlight-panel"
				id={`acomp-highlight-panel-${active.id}`}
				role="tabpanel"
			>
				<div className="acomp-highlight-panel-title">
					<ActiveIcon size={18} />
					<strong>{active.title}</strong>
				</div>
				<HighlightRankingList
					emptyHelper={active.emptyHelper}
					emptyTitle={active.emptyTitle}
					highlightTop3={active.highlightTop3}
					icon={active.icon}
					items={active.items}
					mode={active.mode}
				/>
			</div>
		</section>
	);
}

export function OperationalRotation({ children, className = "" }) {
	const slides = Array.isArray(children) ? children.filter(Boolean) : [children];
	const [selected, setSelected] = useState(0);
	useEffect(() => {
		const timer = window.setTimeout(() => setSelected((index) => (index + 1) % slides.length), 60000);
		return () => window.clearTimeout(timer);
	}, [selected, slides.length]);
	return <div className={`acomp-operational-rotation ${className}`}>
		{slides[selected % slides.length]}
		<div className="acomp-operational-dots">
			{slides.map((_, index) => <button key={index} type="button" aria-label={`Indicador ${index + 1}`} aria-pressed={selected === index} onClick={() => setSelected(index)} style={{ width: 12, height: 12, borderRadius: "50%", border: 0, background: selected === index ? "#2563eb" : "#cbd5e1" }} />)}
		</div>
	</div>;
}

export function OperationalList({ title, items = [] }) {
	return <section className="acomp-panel acomp-operational-list">
		<div className="acomp-panel-title"><h2>{title}</h2></div>
		{items.length ? items.slice(0, 5).map((item, index) => <div key={item.id || item.label || index} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0", borderBottom: "1px solid #e2e8f0" }}>
			<span>{index + 1}. {item.label}</span><strong>{item.total}</strong>
		</div>) : <p>Sem registros no período.</p>}
	</section>;
}

export function AutomaticProduction({ summary }) {
	const daily = summary.dailyProduction;
	const weekly = summary.weeklyProduction;
	return <OperationalRotation>
		<section className="acomp-panel">
			<div className="acomp-panel-title"><h2>PRODUÇÃO DO DIA</h2><span>{summary.date}</span></div>
			<strong style={{ fontSize: 36 }}>{daily.total}</strong>
			{daily.meta != null ? <p>Meta: {daily.meta} · {daily.percent}% · Faltam {daily.remaining}</p> : null}
			{daily.updatedAt ? <p>Atualizado: {new Date(daily.updatedAt).toLocaleTimeString("pt-BR")}</p> : null}
		</section>
		<section className="acomp-panel">
			<div className="acomp-panel-title"><h2>PRODUÇÃO SEMANAL</h2></div>
			<strong style={{ fontSize: 36 }}>{weekly.total}</strong>
			<p>Média diária: {weekly.averagePerDay}</p>
			<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{weekly.days.map((day) => <div key={day.date}><span>{day.date.slice(8)}/{day.date.slice(5, 7)}</span><strong style={{ display: "block" }}>{day.total}</strong></div>)}</div>
		</section>
	</OperationalRotation>;
}

export function AutomaticHourly({ items = [] }) {
	return <section className="acomp-panel acomp-delivery-hours-panel">
		<div className="acomp-panel-title"><h2>ENTREGAS POR HORÁRIO</h2></div>
		<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(56px, 1fr))", gap: 10 }}>{items.map((item) => <div key={item.hour}><span>{item.hour}</span><strong style={{ display: "block", fontSize: 22 }}>{item.total}</strong></div>)}</div>
		{!items.length ? <p>Sem entregas registradas hoje.</p> : null}
	</section>;
}

export function MapUpdateNotice({ update, onClose }) {
	useEffect(() => {
		if (!update) return undefined;
		const timer = window.setTimeout(onClose, 20000);
		return () => window.clearTimeout(timer);
	}, [update, onClose]);
	if (!update) return null;
	return <div className="acomp-realtime-overlay" role="dialog" aria-modal="true" aria-label="Atualização do Mapa">
		<section className="acomp-realtime-card" style={{ width: "min(1000px, 92vw)", maxHeight: "90vh", overflow: "auto" }}>
			<button type="button" onClick={onClose} aria-label="Fechar atualização" style={{ float: "right" }}><X /></button>
			<h2>Atualização do Mapa</h2>
			<p>{new Date(update.detectedAt).toLocaleString("pt-BR")}</p>
			<div style={{ display: "flex", justifyContent: "space-around", gap: 24, flexWrap: "wrap", margin: "24px 0" }}>
				{[["Novas O.S.", update.addedCount], ["Executadas", update.executedCount], ["Outras saídas", update.otherRemovedCount], ["Saldo do mapa", update.currentTotal - update.previousTotal]].map(([label, value]) => <div key={label}><strong style={{ display: "block", fontSize: 40 }}>{value}</strong><span>{label}</span></div>)}
			</div>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
				<OperationalList title="Top fechamentos" items={update.topTechnicians} />
				<OperationalList title="Novas por cidade" items={update.topOpenedCities} />
				<OperationalList title="Fechamentos por cidade" items={update.topClosedCities} />
			</div>
		</section>
	</div>;
}
