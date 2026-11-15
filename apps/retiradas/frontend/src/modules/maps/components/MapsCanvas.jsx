import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { House } from "lucide-react";
import { useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import retorninhoMapMarker from "../../../assets/retorninho-map-marker-color.png";
import { formatMapClientLabel } from "../utils/pointLabels";
import { reconcileMapMarkers } from "../utils/reconcileMapMarkers";

const DEFAULT_CENTER = [-18.8, -44.1];
const DEFAULT_ZOOM = 6;
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const MINAS_BOUNDS = L.latLngBounds([-23.1, -51.2], [-14, -39.5]);

function validPoint(point) {
	const latitude = Number(point?.latitude);
	const longitude = Number(point?.longitude);
	return Number.isFinite(latitude) && Number.isFinite(longitude) &&
		Math.abs(latitude) > 0.000001 && Math.abs(longitude) > 0.000001;
}

function validOrderPoint(point) {
	if (!validPoint(point)) return false;
	const latitude = Number(point.latitude);
	const longitude = Number(point.longitude);
	return latitude >= -34 && latitude <= 6 && longitude >= -74 && longitude <= -33;
}

const PROPERTY_MARKER_HTML = `<span>${renderToStaticMarkup(<House size={17} strokeWidth={2.5} />)}</span>`;
function pointIcon(point, selected = false) {
	return L.divIcon({
		className: `maps-v2-property-marker is-${point?.category === "assigned" ? "assigned" : "opportunity"}${selected ? " is-selected" : ""}`,
		html: PROPERTY_MARKER_HTML,
		iconSize: [36, 42],
		iconAnchor: [18, 40],
		tooltipAnchor: [0, -37],
	});
}

function pointLabel(point) {
	return formatMapClientLabel(point);
}

function pointTooltip(point) {
	const container = document.createElement("div");
	container.className = "maps-v2-property-tooltip";
	const client = document.createElement("strong");
	client.textContent = pointLabel(point);
	const order = document.createElement("span");
	order.textContent = `OS ${point?.orderNumber || "nao informada"}`;
	const clientCode = document.createElement("span");
	clientCode.textContent = `Codigo do cliente: ${point?.clientCode || "nao informado"}`;
	const technician = document.createElement("span");
	technician.textContent = point?.assignedToCurrentUser
		? `Tecnico: ${point?.technician || "voce"} (minha OS)`
		: `Tecnico: ${point?.technician || "disponivel"}`;
	container.append(client, order, clientCode, technician);
	return container;
}

function userPositionIcon() {
	return L.divIcon({
		className: "maps-v2-user-position-marker",
		html: renderToStaticMarkup(
			<span className="maps-v2-user-position-pulse" aria-hidden="true">
				<img src={retorninhoMapMarker} alt="" />
			</span>,
		),
		iconSize: [46, 48],
		iconAnchor: [23, 42],
	});
}

export default function MapsCanvas({ points, userPosition, focusPoint, focusZoom = 17, followUser, initialView, selectedId = "", selectionMode = "", selectedRouteIds = [], selectedRequestIds = [], navigationPath = [], onViewportChange, onSelect, onToggleRoute, onToggleRequest, onError }) {
	const containerRef = useRef(null);
	const mapRef = useRef(null);
	const clusterRef = useRef(null);
	const userLayerRef = useRef(null);
	const navigationLayerRef = useRef(null);
	const markersByIdRef = useRef(new Map());
	const selectedIdRef = useRef(selectedId);
	const selectedRouteIdsRef = useRef(new Set(selectedRouteIds));
	const selectedRequestIdsRef = useRef(new Set(selectedRequestIds));
	const initialFrameAppliedRef = useRef(Boolean(initialView));
	const callbacksRef = useRef({ onViewportChange, onSelect, onToggleRoute, onToggleRequest, onError, selectionMode });

	useEffect(() => {
		callbacksRef.current = { onViewportChange, onSelect, onToggleRoute, onToggleRequest, onError, selectionMode };
	}, [onViewportChange, onSelect, onToggleRoute, onToggleRequest, onError, selectionMode]);

	useEffect(() => {
		if (!containerRef.current || mapRef.current) return undefined;
		let map;
		const markersById = markersByIdRef.current;
		try {
			map = L.map(containerRef.current, {
				zoomControl: false,
				attributionControl: false,
				preferCanvas: true,
				minZoom: 3,
				maxBounds: [[-85, -180], [85, 180]],
				maxBoundsViscosity: 1,
			}).setView(
				initialView ? [Number(initialView.centerLat), Number(initialView.centerLng)] : DEFAULT_CENTER,
				initialView ? Number(initialView.zoom || DEFAULT_ZOOM) : DEFAULT_ZOOM,
			);
			mapRef.current = map;
			map.createPane("mapsUserPosition");
			map.getPane("mapsUserPosition").style.zIndex = "750";
			map.getPane("mapsUserPosition").style.pointerEvents = "none";
			L.control.zoom({ position: "topright" }).addTo(map);
			L.control.attribution({ position: "bottomright", prefix: false })
				.addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')
				.addTo(map);
			L.tileLayer(TILE_URL, {
				maxZoom: 19,
				minZoom: 3,
				noWrap: true,
				crossOrigin: true,
				updateWhenIdle: true,
				keepBuffer: 2,
			}).addTo(map);
			clusterRef.current = L.markerClusterGroup({
				showCoverageOnHover: false,
				maxClusterRadius: 48,
				spiderfyOnMaxZoom: true,
				disableClusteringAtZoom: 17,
				chunkedLoading: true,
				chunkInterval: 100,
				chunkDelay: 25,
			});
			map.addLayer(clusterRef.current);
		} catch (error) {
			callbacksRef.current.onError?.(error?.message || "Nao foi possivel abrir o mapa.");
			return undefined;
		}

		let userMovedMap = false;
		let viewportTimer = null;
		let initialViewportTimer = null;
		let initialResizeTimer = null;
		const markUserInteraction = (event) => {
			if (event?.originalEvent) userMovedMap = true;
		};
		const markDirectInteraction = (event) => {
			if (event?.target?.closest?.(".leaflet-marker-icon, .leaflet-control")) return;
			userMovedMap = true;
		};
		const emitViewport = (userInitiated = false) => {
			if (mapRef.current !== map || !map._loaded || !map._mapPane) return;
			const bounds = map.getBounds();
			const center = map.getCenter();
			callbacksRef.current.onViewportChange?.({
				minLat: bounds.getSouth(),
				maxLat: bounds.getNorth(),
				minLng: bounds.getWest(),
				maxLng: bounds.getEast(),
				centerLat: center.lat,
				centerLng: center.lng,
				zoom: map.getZoom(),
				userInitiated,
			});
		};
		map.on("movestart zoomstart", markUserInteraction);
		map.on("dragstart", markDirectInteraction);
		map.getContainer().addEventListener("wheel", markDirectInteraction, { passive: true });
		map.getContainer().addEventListener("pointerdown", markDirectInteraction, { passive: true });
		map.on("moveend", () => {
			const initiated = userMovedMap;
			userMovedMap = false;
			window.clearTimeout(viewportTimer);
			viewportTimer = window.setTimeout(() => emitViewport(initiated), initiated ? 220 : 0);
		});
		initialViewportTimer = window.setTimeout(() => emitViewport(false), 0);

		const resizeObserver = typeof ResizeObserver !== "undefined"
			? new ResizeObserver(() => map.invalidateSize({ pan: false }))
			: null;
		resizeObserver?.observe(containerRef.current);
		const resizeMap = () => map.invalidateSize({ pan: false });
		window.addEventListener("resize", resizeMap);
		window.addEventListener("orientationchange", resizeMap);
		initialResizeTimer = window.setTimeout(resizeMap, 0);

		return () => {
			window.clearTimeout(viewportTimer);
			window.clearTimeout(initialViewportTimer);
			window.clearTimeout(initialResizeTimer);
			resizeObserver?.disconnect();
			window.removeEventListener("resize", resizeMap);
			window.removeEventListener("orientationchange", resizeMap);
			map.getContainer().removeEventListener("wheel", markDirectInteraction);
			map.getContainer().removeEventListener("pointerdown", markDirectInteraction);
			map.remove();
			mapRef.current = null;
			clusterRef.current = null;
			userLayerRef.current = null;
			markersById.clear();
		};
	}, [initialView]);

	useEffect(() => {
		const cluster = clusterRef.current;
		const map = mapRef.current;
		if (!cluster || !map) return;
		const validCoordinates = [];
		const validPoints = (points || []).filter((point) => {
			if (!validOrderPoint(point) || point?.id == null) return false;
			validCoordinates.push([Number(point.latitude), Number(point.longitude)]);
			return true;
		});
		const isSelected = (id) => selectedIdRef.current === id || selectedRouteIdsRef.current.has(id) || selectedRequestIdsRef.current.has(id);
		const createMarker = (point) => {
			const marker = L.marker(
				[Number(point.latitude), Number(point.longitude)],
				{ icon: pointIcon(point, isSelected(point.id)), title: pointLabel(point), riseOnHover: true },
			);
			marker.bindTooltip(() => pointTooltip(markersByIdRef.current.get(point.id)?.point || point), { direction: "top", opacity: 0.98 });
			marker.on("click", () => {
				const currentPoint = markersByIdRef.current.get(point.id)?.point || point;
				if (callbacksRef.current.selectionMode === "route") {
					callbacksRef.current.onToggleRoute?.(currentPoint);
					return;
				}
				if (callbacksRef.current.selectionMode === "request") {
					callbacksRef.current.onToggleRequest?.(currentPoint);
					return;
				}
				callbacksRef.current.onSelect?.(point.id);
			});
			return marker;
		};
		const updateMarker = (marker, point) => {
			marker.setLatLng([Number(point.latitude), Number(point.longitude)]);
			marker.setIcon(pointIcon(point, isSelected(point.id)));
			marker.options.title = pointLabel(point);
			marker.getElement()?.setAttribute("title", pointLabel(point));
			marker.getTooltip()?.setContent(() => pointTooltip(markersByIdRef.current.get(point.id)?.point || point));
		};
		reconcileMapMarkers({
			points: validPoints,
			markersById: markersByIdRef.current,
			cluster,
			createMarker,
			updateMarker,
		});
		if (!initialFrameAppliedRef.current && (points || []).length > 0) {
			initialFrameAppliedRef.current = true;
			const minasCoordinates = validCoordinates.filter((coordinate) => MINAS_BOUNDS.contains(coordinate));
			const frameCoordinates = minasCoordinates.length ? minasCoordinates : validCoordinates;
			if (frameCoordinates.length === 1) {
				map.setView(frameCoordinates[0], 14, { animate: false });
			} else if (frameCoordinates.length > 1) {
				map.fitBounds(L.latLngBounds(frameCoordinates), {
					padding: [36, 36],
					maxZoom: 13,
					animate: false,
				});
			} else {
				map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false });
			}
			window.setTimeout(() => map.invalidateSize({ pan: false }), 0);
		}
	}, [points]);

	useEffect(() => {
		const previous = selectedIdRef.current;
		selectedIdRef.current = selectedId;
		for (const id of new Set([previous, selectedId])) {
			if (!id) continue;
			const entry = markersByIdRef.current.get(id);
			if (!entry) continue;
			const selected = id === selectedId || selectedRouteIdsRef.current.has(id) || selectedRequestIdsRef.current.has(id);
			entry.marker.setIcon(pointIcon(entry.point, selected));
			if (id === selectedId) entry.marker.openTooltip();
		}
	}, [selectedId]);

	useEffect(() => {
		const previous = selectedRouteIdsRef.current;
		const next = new Set(selectedRouteIds);
		const changed = new Set([...previous, ...next]);
		for (const id of changed) {
			if (previous.has(id) === next.has(id)) continue;
			const entry = markersByIdRef.current.get(id);
			if (entry) entry.marker.setIcon(pointIcon(entry.point, next.has(id) || selectedRequestIdsRef.current.has(id) || selectedIdRef.current === id));
		}
		selectedRouteIdsRef.current = next;
	}, [selectedRouteIds]);

	useEffect(() => {
		const previous = selectedRequestIdsRef.current;
		const next = new Set(selectedRequestIds);
		const changed = new Set([...previous, ...next]);
		for (const id of changed) {
			if (previous.has(id) === next.has(id)) continue;
			const entry = markersByIdRef.current.get(id);
			if (entry) entry.marker.setIcon(pointIcon(entry.point, next.has(id) || selectedRouteIdsRef.current.has(id) || selectedIdRef.current === id));
		}
		selectedRequestIdsRef.current = next;
	}, [selectedRequestIds]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		if (navigationLayerRef.current) {
			map.removeLayer(navigationLayerRef.current);
			navigationLayerRef.current = null;
		}
		const coordinates = (navigationPath || []).filter((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])));
		if (coordinates.length < 2) return;
		const line = L.polyline(coordinates, { color: "#0877e8", weight: 6, opacity: 0.9, lineCap: "round", lineJoin: "round" }).addTo(map);
		navigationLayerRef.current = line;
		map.fitBounds(line.getBounds(), { padding: [52, 52], maxZoom: 18, animate: true });
	}, [navigationPath]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		if (userLayerRef.current) {
			map.removeLayer(userLayerRef.current);
			userLayerRef.current = null;
		}
		if (!validPoint(userPosition)) return;
		const position = [Number(userPosition.latitude), Number(userPosition.longitude)];
		const accuracy = Math.max(8, Math.min(Number(userPosition.accuracy || 0), 500));
		const layer = L.layerGroup();
		L.circle(position, {
			pane: "mapsUserPosition",
			radius: accuracy,
			color: "#1468ff",
			weight: 1,
			fillColor: "#4d9dff",
			fillOpacity: 0.14,
			interactive: false,
		}).addTo(layer);
		L.marker(position, {
			pane: "mapsUserPosition",
			icon: userPositionIcon(),
			interactive: false,
			zIndexOffset: 2000,
		}).addTo(layer);
		layer.addTo(map);
		userLayerRef.current = layer;
		if (followUser) {
			map.setView(position, Math.max(map.getZoom(), 16), { animate: true, duration: 0.45 });
		}
	}, [followUser, userPosition]);

	useEffect(() => {
		if (!validPoint(focusPoint) || !mapRef.current) return;
		mapRef.current.setView(
			[Number(focusPoint.latitude), Number(focusPoint.longitude)],
			Math.max(mapRef.current.getZoom(), focusZoom),
			{ animate: true, duration: 0.65 },
		);
	}, [focusPoint, focusZoom]);

	return <div ref={containerRef} className={`maps-v2-canvas${selectionMode ? " is-route-selection" : ""}`} aria-label="Mapa interativo de retiradas" />;
}
