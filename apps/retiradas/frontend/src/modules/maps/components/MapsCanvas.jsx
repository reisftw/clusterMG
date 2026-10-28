import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { House } from "lucide-react";
import { useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

function pointIcon(point) {
	const categoryClass = point?.scheduled
		? "is-scheduled"
		: point?.category === "assigned"
			? "is-assigned"
			: "is-opportunity";
	return L.divIcon({
		className: `maps-v2-property-marker ${categoryClass}`,
		html: `<span>${renderToStaticMarkup(<House size={17} strokeWidth={2.5} />)}</span>`,
		iconSize: [36, 42],
		iconAnchor: [18, 40],
		tooltipAnchor: [0, -37],
	});
}

function pointLabel(point) {
	return point?.category === "opportunity"
		? point?.neighborhood || point?.orderNumber || "Oportunidade"
		: point?.clientName || point?.orderNumber || "Retirada";
}

export default function MapsCanvas({ points, userPosition, focusPoint, onViewportChange, onSelect, onError }) {
	const containerRef = useRef(null);
	const mapRef = useRef(null);
	const clusterRef = useRef(null);
	const userLayerRef = useRef(null);
	const initialFrameAppliedRef = useRef(false);
	const callbacksRef = useRef({ onViewportChange, onSelect, onError });

	useEffect(() => {
		callbacksRef.current = { onViewportChange, onSelect, onError };
	}, [onViewportChange, onSelect, onError]);

	useEffect(() => {
		if (!containerRef.current || mapRef.current) return undefined;
		let map;
		try {
			map = L.map(containerRef.current, {
				zoomControl: false,
				attributionControl: false,
				preferCanvas: true,
			}).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
			mapRef.current = map;
			L.control.zoom({ position: "topright" }).addTo(map);
			L.control.attribution({ position: "bottomright", prefix: false })
				.addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')
				.addTo(map);
			L.tileLayer(TILE_URL, {
				maxZoom: 19,
				crossOrigin: true,
				updateWhenIdle: true,
				keepBuffer: 2,
			}).addTo(map);
			clusterRef.current = L.markerClusterGroup({
				showCoverageOnHover: false,
				maxClusterRadius: 48,
				spiderfyOnMaxZoom: true,
				disableClusteringAtZoom: 17,
			});
			map.addLayer(clusterRef.current);
		} catch (error) {
			callbacksRef.current.onError?.(error?.message || "Nao foi possivel abrir o mapa.");
			return undefined;
		}

		let userMovedMap = false;
		let viewportTimer = null;
		map.on("movestart", (event) => {
			if (event?.originalEvent) userMovedMap = true;
		});
		map.on("moveend", () => {
			if (!userMovedMap) return;
			window.clearTimeout(viewportTimer);
			viewportTimer = window.setTimeout(() => {
				const bounds = map.getBounds();
				callbacksRef.current.onViewportChange?.({
					minLat: bounds.getSouth(),
					maxLat: bounds.getNorth(),
					minLng: bounds.getWest(),
					maxLng: bounds.getEast(),
				});
			}, 350);
		});

		const resizeObserver = typeof ResizeObserver !== "undefined"
			? new ResizeObserver(() => map.invalidateSize({ pan: false }))
			: null;
		resizeObserver?.observe(containerRef.current);
		const resizeMap = () => map.invalidateSize({ pan: false });
		window.addEventListener("resize", resizeMap);
		window.addEventListener("orientationchange", resizeMap);
		window.setTimeout(resizeMap, 0);

		return () => {
			window.clearTimeout(viewportTimer);
			resizeObserver?.disconnect();
			window.removeEventListener("resize", resizeMap);
			window.removeEventListener("orientationchange", resizeMap);
			map.remove();
			mapRef.current = null;
			clusterRef.current = null;
			userLayerRef.current = null;
		};
	}, []);

	useEffect(() => {
		const cluster = clusterRef.current;
		const map = mapRef.current;
		if (!cluster || !map) return;
		cluster.clearLayers();
		const validCoordinates = [];
		for (const point of points || []) {
			if (!validOrderPoint(point)) continue;
			validCoordinates.push([Number(point.latitude), Number(point.longitude)]);
			const marker = L.marker(
				[Number(point.latitude), Number(point.longitude)],
				{ icon: pointIcon(point), title: pointLabel(point), riseOnHover: true },
			);
			marker.bindTooltip(pointLabel(point), { direction: "top" });
			marker.on("click", () => callbacksRef.current.onSelect?.(point.id));
			cluster.addLayer(marker);
		}
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
		const map = mapRef.current;
		if (!map) return;
		if (userLayerRef.current) {
			map.removeLayer(userLayerRef.current);
			userLayerRef.current = null;
		}
		if (!validPoint(userPosition)) return;
		userLayerRef.current = L.circleMarker(
			[Number(userPosition.latitude), Number(userPosition.longitude)],
			{ radius: 8, color: "#ffffff", weight: 4, fillColor: "#1468ff", fillOpacity: 1 },
		).addTo(map);
	}, [userPosition]);

	useEffect(() => {
		if (!validPoint(focusPoint) || !mapRef.current) return;
		mapRef.current.setView(
			[Number(focusPoint.latitude), Number(focusPoint.longitude)],
			Math.max(mapRef.current.getZoom(), 14),
			{ animate: true, duration: 0.65 },
		);
	}, [focusPoint]);

	return <div ref={containerRef} className="maps-v2-canvas" aria-label="Mapa interativo de retiradas" />;
}
