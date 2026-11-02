import { CalendarClock, ChevronDown, ChevronUp, Eye, MapPin, Navigation, PackageCheck, Route, SlidersHorizontal, Target } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatMapClientLabel } from "../utils/pointLabels";
import { nextSheetPosition, sortMapPoints } from "../utils/mobileMapPresentation";

const LIST_PAGE_SIZE = 100;

function distanceLabel(value) {
	if (value === null || value === undefined || value === "") return "Distância indisponível";
	const meters = Number(value);
	if (!Number.isFinite(meters)) return "Distância indisponível";
	if (meters < 1000) return `${Math.round(meters)} m em linha reta`;
	return `${(meters / 1000).toFixed(1).replace(".", ",")} km em linha reta`;
}

function navigationUrl(item) {
	if (!item?.locationAvailable) return "";
	return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${item.latitude},${item.longitude}`)}`;
}

function PointCard({ item, selected, selectedForRoute, onSelect, onToggleRoute }) {
	const routeUrl = navigationUrl(item);
	return (
		<article className={`maps-v2-order-card${selected ? " is-selected" : ""}`} data-map-order-id={item.id}>
			<div className="maps-v2-order-card-head">
				<span className={`maps-v2-order-icon is-${item.category}`}>{item.category === "assigned" ? <PackageCheck size={18} /> : <Target size={18} />}</span>
				<span className="maps-v2-order-copy">
					<small>OS {item.orderNumber || "não informada"}</small>
					<strong>{formatMapClientLabel(item)}</strong>
					<span>{item.type || (item.category === "assigned" ? "Minha retirada" : "Oportunidade")}</span>
				</span>
				<span className={`maps-v2-order-badge is-${item.category}`}>{item.category === "assigned" ? "Minha OS" : "Oportunidade"}</span>
			</div>
			<div className="maps-v2-order-meta">
				<span><MapPin size={14} /> {item.neighborhood || "Bairro não informado"} · {item.city}</span>
				<span><Navigation size={14} /> {distanceLabel(item.distanceMeters)}</span>
				{item.scheduled ? <span><CalendarClock size={14} /> Agendada</span> : null}
			</div>
			<footer>
				<button type="button" className="maps-v2-card-view" onClick={() => onSelect(item)}><Eye size={16} /> Ver</button>
				{routeUrl ? <a className="maps-v2-card-route" href={routeUrl} target="_blank" rel="noreferrer"><Navigation size={16} /> Rota</a> : null}
				{item.category === "assigned" && item.locationAvailable ? <button type="button" className={`maps-v2-route-toggle ${selectedForRoute ? "is-active" : ""}`} onClick={() => onToggleRoute(item.id)} aria-label={selectedForRoute ? "Remover do roteiro" : "Adicionar ao roteiro"}><Route size={16} /><span>{selectedForRoute ? "Na rota" : "Roteiro"}</span></button> : null}
			</footer>
		</article>
	);
}

export default function MapsBottomSheet({ items, summary, position = "peek", onPositionChange, onSelect, selectedId, selectedRouteIds, onToggleRoute, sortMode, onSortChange }) {
	const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
	const dragRef = useRef(null);
	const listRef = useRef(null);
	const sortedItems = useMemo(() => sortMapPoints(items, sortMode), [items, sortMode]);
	const visibleItems = sortedItems.slice(0, visibleCount);
	const remaining = Math.max(sortedItems.length - visibleItems.length, 0);

	useEffect(() => {
		if (!selectedId || position === "collapsed") return;
		listRef.current?.querySelector(`[data-map-order-id="${CSS.escape(String(selectedId))}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [position, selectedId]);

	function handlePointerDown(event) {
		dragRef.current = { pointerId: event.pointerId, startY: event.clientY };
		event.currentTarget.setPointerCapture?.(event.pointerId);
	}

	function handlePointerUp(event) {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const delta = event.clientY - drag.startY;
		dragRef.current = null;
		if (Math.abs(delta) < 18) {
			onPositionChange(position === "expanded" ? "peek" : nextSheetPosition(position, 1));
			return;
		}
		onPositionChange(nextSheetPosition(position, delta < 0 ? 1 : -1));
	}

	return (
		<section className={`maps-v2-sheet is-${position}`} aria-label="Ordens próximas">
			<button type="button" className="maps-v2-sheet-handle" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} aria-label="Arrastar painel de ordens" aria-expanded={position === "expanded"}>
				<span />
				<strong>{summary.assigned + summary.opportunities} ordens próximas</strong>
				{position === "expanded" ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
			</button>
			<div className="maps-v2-sheet-summary">
				<div><PackageCheck size={18} /><strong>{summary.assigned || 0}</strong><span>Minhas</span></div>
				<div><Target size={18} /><strong>{summary.opportunities || 0}</strong><span>Oportunidades</span></div>
				<div><CalendarClock size={18} /><strong>{summary.scheduled || 0}</strong><span>Agendadas</span></div>
			</div>
			<div className="maps-v2-list-toolbar"><strong>Ordens encontradas</strong><label><SlidersHorizontal size={15} /><select aria-label="Ordenar ordens" value={sortMode} onChange={(event) => onSortChange(event.target.value)}><option value="nearest">Mais próximas</option><option value="farthest">Mais distantes</option><option value="priority">Prioridade</option><option value="scheduled">Agendadas</option></select></label></div>
			<div className="maps-v2-list" ref={listRef} aria-live="polite">
				{sortedItems.length ? visibleItems.map((item) => <PointCard key={item.id} item={item} selected={selectedId === item.id} selectedForRoute={selectedRouteIds.includes(item.id)} onSelect={onSelect} onToggleRoute={onToggleRoute} />) : <div className="maps-v2-empty"><MapPin size={24} /><strong>Nenhuma retirada nesta área</strong><span>Mova o mapa e toque em “Buscar nesta área”.</span></div>}
				{remaining ? <button type="button" className="maps-v2-list-more" onClick={() => setVisibleCount((current) => current + LIST_PAGE_SIZE)}>Mostrar mais {Math.min(remaining, LIST_PAGE_SIZE)} de {sortedItems.length}</button> : null}
			</div>
		</section>
	);
}
