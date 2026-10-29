import { CalendarClock, ChevronUp, MapPin, PackageCheck, Route, Target } from "lucide-react";
import { useState } from "react";
import { formatMapClientLabel } from "../utils/pointLabels";

const LIST_PAGE_SIZE = 150;

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
					<strong>{formatMapClientLabel(item)}</strong>
					<small>{item.neighborhood} · {item.city} · {item.assignedToCurrentUser ? "Minha OS" : item.technician || "Disponivel"}</small>
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
	const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
	const visibleItems = items.slice(0, visibleCount);
	const remaining = Math.max(items.length - visibleItems.length, 0);

	return (
		<section className={`maps-v2-sheet ${open ? "is-open" : ""}`}>
			<button type="button" className="maps-v2-sheet-handle" onClick={onToggle} aria-expanded={open}>
				<span />
				<ChevronUp size={18} />
			</button>
			<div className="maps-v2-sheet-summary">
				<div><PackageCheck size={18} /><strong>{summary.assigned || 0}</strong><span>Minhas</span></div>
				<div><Target size={18} /><strong>{summary.opportunities || 0}</strong><span>Outras OS</span></div>
				<div><CalendarClock size={18} /><strong>{summary.scheduled || 0}</strong><span>Agendadas</span></div>
			</div>
			<div className="maps-v2-list" aria-live="polite">
				{items.length ? visibleItems.map((item) => (
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
				{remaining ? (
					<button
						type="button"
						className="maps-v2-list-more"
						onClick={() => setVisibleCount((current) => current + LIST_PAGE_SIZE)}
					>
						Mostrar mais {Math.min(remaining, LIST_PAGE_SIZE)} de {items.length}
					</button>
				) : null}
			</div>
		</section>
	);
}
