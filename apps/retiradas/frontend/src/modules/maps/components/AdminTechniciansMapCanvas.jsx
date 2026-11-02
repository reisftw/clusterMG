import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { House, Target } from "lucide-react";
import { useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import retorninhoMapMarker from "../../../assets/retorninho-map-marker-color.png";
import { technicianPreviewContent } from "./technicianPreview";

const DEFAULT_CENTER = [-18.8, -44.1];
const DEFAULT_ZOOM = 6;
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const MINAS_BOUNDS = L.latLngBounds([-23.1, -51.2], [-14, -39.5]);

function validPoint(item) {
	const latitude = Number(item?.latitude);
	const longitude = Number(item?.longitude);
	return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -34 && latitude <= 6 && longitude >= -74 && longitude <= -33;
}

function technicianIcon(item, selected) {
	const status = ["active", "recent", "stale"].includes(item?.status) ? item.status : "stale";
	return L.divIcon({
		className: `maps-admin-technician-marker is-${status}${selected ? " is-selected" : ""}`,
		html: `<span><img src="${retorninhoMapMarker}" alt="" /></span>`,
		iconSize: [54, 60],
		iconAnchor: [27, 56],
		tooltipAnchor: [25, -28],
	});
}

const ORDER_ICON = renderToStaticMarkup(<House size={15} strokeWidth={2.5} />);
const PRIORITY_ICON = renderToStaticMarkup(<Target size={15} strokeWidth={2.7} />);
function orderIcon(item, selected) {
	const assigned = Boolean(item.technician && !/^(FILA|NENHUM|NAO INFORMADO)$/i.test(String(item.technician).trim()));
	const priority = item.priority === "high";
	return L.divIcon({
		className: `maps-command-order-marker${assigned ? " is-assigned" : ""}${priority ? " is-priority" : ""}${selected ? " is-selected" : ""}`,
		html: `<span>${priority ? PRIORITY_ICON : ORDER_ICON}</span>`,
		iconSize: [30, 34],
		iconAnchor: [15, 32],
		tooltipAnchor: [0, -28],
	});
}

function orderTooltip(item, privacyMode) {
	const element = document.createElement("div");
	element.className = "maps-command-order-tooltip";
	const title = document.createElement("strong");
	title.textContent = `O.S. ${item.orderNumber || "não informada"}`;
	const location = document.createElement("span");
	location.textContent = `${item.city || "Cidade não informada"} · ${item.neighborhood || "Bairro não informado"}`;
	const technician = document.createElement("small");
	technician.textContent = item.technician ? `Técnico: ${item.technician}` : "O.S. disponível";
	element.append(title, location, technician);
	if (!privacyMode) {
		const code = document.createElement("small");
		code.textContent = `Cliente ${item.clientCode || "sem código"}`;
		element.append(code);
	}
	return element;
}

function commandBounds(command) {
	const bounds = command?.bounds;
	if (!bounds) return null;
	const values = [bounds.minLatitude, bounds.minLongitude, bounds.maxLatitude, bounds.maxLongitude].map(Number);
	if (!values.every(Number.isFinite)) return null;
	return L.latLngBounds([values[0], values[1]], [values[2], values[3]]);
}

export default function AdminTechniciansMapCanvas({
	items,
	visibleTechnicianIds,
	orders = [],
	selectedId,
	selectedOrderId,
	trackPoints = [],
	orderPoint = null,
	layers = {},
	cameraCommand,
	privacyMode = false,
	onSelect,
	onOrderSelect,
	onUserInteraction,
	onError,
}) {
	const containerRef = useRef(null);
	const mapRef = useRef(null);
	const technicianLayerRef = useRef(null);
	const orderClusterRef = useRef(null);
	const trackLayerRef = useRef(null);
	const callbacksRef = useRef({});
	const cameraRevisionRef = useRef(null);

	useEffect(() => {
		callbacksRef.current = { onSelect, onOrderSelect, onUserInteraction, onError };
	}, [onError, onOrderSelect, onSelect, onUserInteraction]);

	useEffect(() => {
		if (!containerRef.current || mapRef.current) return undefined;
		let map;
		try {
			map = L.map(containerRef.current, {
				zoomControl: false,
				attributionControl: false,
				preferCanvas: true,
				minZoom: 5,
			}).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
			mapRef.current = map;
			L.control.zoom({ position: "bottomright" }).addTo(map);
			L.control.attribution({ position: "bottomleft", prefix: false })
				.addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')
				.addTo(map);
			L.tileLayer(TILE_URL, { maxZoom: 19, crossOrigin: true, updateWhenIdle: true, keepBuffer: 3 }).addTo(map);
			technicianLayerRef.current = L.layerGroup().addTo(map);
			trackLayerRef.current = L.layerGroup().addTo(map);
			orderClusterRef.current = L.markerClusterGroup({
				showCoverageOnHover: false,
				maxClusterRadius: 52,
				spiderfyOnMaxZoom: true,
				disableClusteringAtZoom: 17,
				chunkedLoading: true,
				chunkInterval: 80,
				chunkDelay: 20,
				removeOutsideVisibleBounds: true,
			});
			map.addLayer(orderClusterRef.current);
			map.on("dragstart zoomstart", (event) => {
				if (event?.originalEvent) callbacksRef.current.onUserInteraction?.();
			});
			map.on("click", (event) => {
				if (event?.originalEvent) callbacksRef.current.onUserInteraction?.();
			});
		} catch (error) {
			callbacksRef.current.onError?.(error?.message || "Não foi possível abrir o mapa da equipe.");
			return undefined;
		}

		const resizeObserver = typeof ResizeObserver !== "undefined"
			? new ResizeObserver(() => map.invalidateSize({ pan: false }))
			: null;
		resizeObserver?.observe(containerRef.current);
		const resizeMap = () => map.invalidateSize({ pan: false });
		window.addEventListener("resize", resizeMap);
		window.setTimeout(resizeMap, 0);
		return () => {
			resizeObserver?.disconnect();
			window.removeEventListener("resize", resizeMap);
			map.remove();
			mapRef.current = null;
			technicianLayerRef.current = null;
			orderClusterRef.current = null;
			trackLayerRef.current = null;
		};
	}, []);

	useEffect(() => {
		const layer = technicianLayerRef.current;
		if (!layer) return;
		layer.clearLayers();
		if (layers.technicians === false) return;
		for (const item of items || []) {
			if (!validPoint(item) || (visibleTechnicianIds && !visibleTechnicianIds.has(item.userId))) continue;
			const marker = L.marker([Number(item.latitude), Number(item.longitude)], {
				icon: technicianIcon(item, item.userId === selectedId),
				title: item.displayName || item.technicianName || "Técnico",
				riseOnHover: true,
				zIndexOffset: item.userId === selectedId ? 900 : 500,
			});
			marker.bindTooltip(() => technicianPreviewContent(item), {
				direction: "right",
				offset: [7, 0],
				opacity: 1,
				permanent: item.userId === selectedId,
				interactive: false,
				className: `maps-admin-tooltip-shell maps-admin-preview-card-shell is-${item.status || "stale"}${item.userId === selectedId ? " is-selected" : ""}`,
			});
			marker.on("click", () => callbacksRef.current.onSelect?.(item.userId));
			marker.addTo(layer);
		}
	}, [items, layers.technicians, selectedId, visibleTechnicianIds]);

	useEffect(() => {
		const cluster = orderClusterRef.current;
		if (!cluster) return;
		cluster.clearLayers();
		if (layers.openOrders === false) return;
		const markers = [];
		for (const item of orders || []) {
			if (!validPoint(item)) continue;
			const assigned = Boolean(item.technician && !/^(FILA|NENHUM|NAO INFORMADO)$/i.test(String(item.technician).trim()));
			if (assigned && layers.assignedOrders === false) continue;
			if (item.priority === "high" && layers.priorityOrders === false) continue;
			const marker = L.marker([Number(item.latitude), Number(item.longitude)], {
				icon: orderIcon(item, item.id === selectedOrderId),
				title: `O.S. ${item.orderNumber || ""}`,
				riseOnHover: true,
			});
			marker.bindTooltip(() => orderTooltip(item, privacyMode), { direction: "top", opacity: 0.98 });
			marker.on("click", () => callbacksRef.current.onOrderSelect?.(item.id));
			markers.push(marker);
		}
		if (markers.length) cluster.addLayers(markers);
	}, [layers.assignedOrders, layers.openOrders, layers.priorityOrders, orders, privacyMode, selectedOrderId]);

	useEffect(() => {
		const map = mapRef.current;
		const layer = trackLayerRef.current;
		if (!map || !layer) return;
		layer.clearLayers();
		if (layers.routes === false) return;
		const coordinates = (trackPoints || []).filter(validPoint).map((point) => [Number(point.latitude), Number(point.longitude)]);
		if (coordinates.length >= 2) {
			L.polyline(coordinates, { color: "#ffffff", weight: 10, opacity: 0.82, lineCap: "round", lineJoin: "round", interactive: false }).addTo(layer);
			L.polyline(coordinates, { color: "#f97316", weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(layer);
		}
		if (coordinates.length) {
			L.circleMarker(coordinates[0], { radius: 7, color: "#fff", weight: 3, fillColor: "#109765", fillOpacity: 1 }).bindTooltip("Início da rota").addTo(layer);
			L.circleMarker(coordinates.at(-1), { radius: 7, color: "#fff", weight: 3, fillColor: "#f97316", fillOpacity: 1 }).bindTooltip("Última posição").addTo(layer);
		}
		if (validPoint(orderPoint)) {
			const target = [Number(orderPoint.latitude), Number(orderPoint.longitude)];
			if (coordinates.length) {
				const closest = coordinates.reduce((best, point) => {
					const distance = L.latLng(point).distanceTo(L.latLng(target));
					return !best || distance < best.distance ? { point, distance } : best;
				}, null);
				const reported = Number(orderPoint.proximityDistanceMeters);
				const distance = Number.isFinite(reported) ? reported : closest.distance;
				const label = distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1).replace(".", ",")} km`;
				L.polyline([closest.point, target], { color: "#0e8ff1", weight: 4, opacity: 0.95, dashArray: "9 8", lineCap: "round" })
					.bindTooltip(`Menor aproximação: ${label}`, { permanent: true, direction: "center", className: "maps-visit-distance-tooltip" })
					.addTo(layer);
				L.circleMarker(closest.point, { radius: 8, color: "#fff", weight: 3, fillColor: "#0e8ff1", fillOpacity: 1 })
					.bindTooltip("Ponto de maior proximidade").addTo(layer);
			}
			coordinates.push(target);
			L.circleMarker(target, { radius: 10, color: "#fff", weight: 4, fillColor: "#0e8ff1", fillOpacity: 1 })
				.bindTooltip(`O.S. ${orderPoint.orderNumber || "selecionada"}`, { permanent: true, direction: "top" }).addTo(layer);
		}
		if (coordinates.length) map.flyToBounds(L.latLngBounds(coordinates), { padding: [64, 64], maxZoom: 16, duration: 1.6 });
	}, [layers.routes, orderPoint, trackPoints]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !cameraCommand || cameraRevisionRef.current === cameraCommand.revision) return;
		cameraRevisionRef.current = cameraCommand.revision;
		if (cameraCommand.type === "point" && validPoint(cameraCommand)) {
			map.flyTo([Number(cameraCommand.latitude), Number(cameraCommand.longitude)], Number(cameraCommand.zoom || 14), { animate: true, duration: 1.8 });
			return;
		}
		if (cameraCommand.type === "bounds") {
			const bounds = commandBounds(cameraCommand);
			if (bounds) map.flyToBounds(bounds, { padding: [54, 54], maxZoom: 13, duration: 1.8 });
			return;
		}
		map.flyToBounds(MINAS_BOUNDS, { padding: [28, 28], maxZoom: 7, duration: 1.8 });
	}, [cameraCommand]);

	return <div ref={containerRef} className="maps-admin-canvas" aria-label="Mapa ao vivo da operação" />;
}
