import { CalendarClock, ChevronUp, MapPin, PackageCheck, Route, Target } from "lucide-react";

function distanceLabel(value) {
	if (value === null || value === undefined || value === "") return "Distancia indisponivel";
	const meters = Number(value);
	if (!Number.isFinite(meters)) return "Distancia indisponivel";
	if (meters < 1000) return `${Math.round(meters)} m`;
	return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

function PointCard({ item, selectedForRoute, onSelect, onToggleRoute }) {
	return (
		<article className="maps-v2-order-card">
			<button type="button" className="maps-v2-order-main" onClick={() => onSelect(item)}>
				<span className={`maps-v2-order-icon is-${item.category}`}>
					{item.category === "assigned" ? <PackageCheck size={18} /> : <Target size={18} />}
				</span>
				<span className="maps-v2-order-copy">
					<strong>{item.category === "assigned" ? item.clientName || item.orderNumber : item.neighborhood}</strong>
					<small>{item.city} · {item.type}</small>
					<span>{distanceLabel(item.distanceMeters)} {item.scheduled ? "· Agendada" : ""}</span>
				</span>
			</button>
			{item.category === "assigned" && item.locationAvailable ? (
				<button
					type="button"
					className={`maps-v2-route-toggle ${selectedForRoute ? "is-active" : ""}`}
					onClick={() => onToggleRoute(item.id)}
					aria-label={selectedForRoute ? "Remover do roteiro" : "Adicionar ao roteiro"}
				>
					<Route size={17} />
				</button>
			) : null}
		</article>
	);
}

export default function MapsBottomSheet({
	items,
	summary,
	open,
	onToggle,
	onSelect,
	selectedRouteIds,
	onToggleRoute,
}) {
	return (
		<section className={`maps-v2-sheet ${open ? "is-open" : ""}`}>
			<button type="button" className="maps-v2-sheet-handle" onClick={onToggle} aria-expanded={open}>
				<span />
				<ChevronUp size={18} />
			</button>
			<div className="maps-v2-sheet-summary">
				<div><PackageCheck size={18} /><strong>{summary.assigned || 0}</strong><span>Minhas</span></div>
				<div><Target size={18} /><strong>{summary.opportunities || 0}</strong><span>Oportunidades</span></div>
				<div><CalendarClock size={18} /><strong>{summary.scheduled || 0}</strong><span>Agendadas</span></div>
			</div>
			<div className="maps-v2-list" aria-live="polite">
				{items.length ? items.map((item) => (
					<PointCard
						key={item.id}
						item={item}
						selectedForRoute={selectedRouteIds.includes(item.id)}
						onSelect={onSelect}
						onToggleRoute={onToggleRoute}
					/>
				)) : (
					<div className="maps-v2-empty"><MapPin size={24} /><strong>Nenhuma retirada nesta area</strong><span>Mova o mapa ou altere os filtros.</span></div>
				)}
			</div>
		</section>
	);
}
