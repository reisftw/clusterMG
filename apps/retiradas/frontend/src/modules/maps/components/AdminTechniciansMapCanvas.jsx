import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import retorninhoMapMarker from "../../../assets/retorninho-map-marker-color.png";

const DEFAULT_CENTER = [-18.8, -44.1];
const DEFAULT_ZOOM = 6;
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

function validPoint(item) {
	const latitude = Number(item?.latitude);
	const longitude = Number(item?.longitude);
	return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -34 && latitude <= 6 && longitude >= -74 && longitude <= -33;
}

function markerIcon(item, selected) {
	const status = ["active", "recent", "stale"].includes(item?.status) ? item.status : "stale";
	return L.divIcon({
		className: `maps-admin-technician-marker is-${status}${selected ? " is-selected" : ""}`,
		html: `<span><img src="${retorninhoMapMarker}" alt="" /></span>`,
		iconSize: [58, 64],
		iconAnchor: [29, 59],
		tooltipAnchor: [0, -52],
	});
}

function tooltipContent(item) {
	const container = document.createElement("div");
	container.className = "maps-admin-technician-tooltip";
	const name = document.createElement("strong");
	name.textContent = item.displayName || item.technicianName || "Tecnico";
	const hubsoft = document.createElement("span");
	const sameName = item.technicianName === item.displayName;
	 hubsoft.textContent = sameName ? "Tecnico de retiradas" : `HubSoft: ${item.technicianName || "nao associado"}`;
	const production = document.createElement("span");
	production.textContent = `${Number(item.completedToday || 0)} retiradas hoje · ${Number(item.openOrders || 0)} OS abertas`;
	const route = document.createElement("span");
	route.textContent = `${Number(item.routeStops || 0)} paradas no roteiro · precisao ${Math.round(Number(item.accuracyMeters || 0))} m`;
	container.append(name, hubsoft, production, route);
	return container;
}

export default function AdminTechniciansMapCanvas({ items, selectedId, focusId, frameRevision, onSelect, onError }) {
	const containerRef = useRef(null);
	const mapRef = useRef(null);
	const layerRef = useRef(null);
	const markersRef = useRef(new Map());
	const itemsRef = useRef(items);
	const framedRef = useRef(false);
	const callbacksRef = useRef({ onSelect, onError });

	useEffect(() => {
		callbacksRef.current = { onSelect, onError };
	}, [onError, onSelect]);

	useEffect(() => {
		itemsRef.current = items;
	}, [items]);

	useEffect(() => {
		if (!containerRef.current || mapRef.current) return undefined;
		let map;
		const markers = markersRef.current;
		try {
			map = L.map(containerRef.current, {
				zoomControl: false,
				attributionControl: false,
				preferCanvas: true,
			}).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
			mapRef.current = map;
			L.control.zoom({ position: "bottomright" }).addTo(map);
			L.control.attribution({ position: "bottomleft", prefix: false })
				.addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')
				.addTo(map);
			L.tileLayer(TILE_URL, { maxZoom: 19, crossOrigin: true, updateWhenIdle: true, keepBuffer: 3 }).addTo(map);
			layerRef.current = L.layerGroup().addTo(map);
		} catch (error) {
			callbacksRef.current.onError?.(error?.message || "Nao foi possivel abrir o mapa da equipe.");
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
			layerRef.current = null;
			markers.clear();
		};
	}, []);

	useEffect(() => {
		const map = mapRef.current;
		const layer = layerRef.current;
		if (!map || !layer) return;
		layer.clearLayers();
		markersRef.current.clear();
		const coordinates = [];
		for (const item of items || []) {
			if (!validPoint(item)) continue;
			const position = [Number(item.latitude), Number(item.longitude)];
			coordinates.push(position);
			const marker = L.marker(position, {
				icon: markerIcon(item, item.userId === selectedId),
				title: item.displayName || item.technicianName || "Tecnico",
				riseOnHover: true,
			});
			marker.bindTooltip(() => tooltipContent(item), { direction: "top", opacity: 0.98, className: "maps-admin-tooltip-shell" });
			marker.on("click", () => callbacksRef.current.onSelect?.(item.userId));
			marker.addTo(layer);
			markersRef.current.set(item.userId, marker);
		}
		if (!framedRef.current && coordinates.length) {
			framedRef.current = true;
			map.fitBounds(L.latLngBounds(coordinates), { padding: [70, 70], maxZoom: 15, animate: false });
		}
	}, [items, selectedId]);

	useEffect(() => {
		const map = mapRef.current;
		const valid = (itemsRef.current || []).filter(validPoint);
		if (!map || !valid.length) return;
		map.fitBounds(
			L.latLngBounds(valid.map((item) => [Number(item.latitude), Number(item.longitude)])),
			{ padding: [70, 70], maxZoom: 15, animate: true },
		);
	}, [frameRevision]);

	useEffect(() => {
		const marker = markersRef.current.get(focusId);
		const map = mapRef.current;
		if (!marker || !map) return;
		map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16), { animate: true });
		marker.openTooltip();
	}, [focusId]);

	return <div ref={containerRef} className="maps-admin-canvas" aria-label="Mapa ao vivo dos tecnicos" />;
}
