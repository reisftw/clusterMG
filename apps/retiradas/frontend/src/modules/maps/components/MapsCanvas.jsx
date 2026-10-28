import { AttributionControl, Map, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

const SOURCE_ID = "retiradas-maps-orders";
const USER_SOURCE_ID = "retiradas-maps-user";
const DEFAULT_CENTER = [-44.1, -18.8];
const DEFAULT_STYLE = "https://tiles.openfreemap.org/styles/liberty";

function featureCollection(points = []) {
	return {
		type: "FeatureCollection",
		features: points.filter((point) => (
			Number.isFinite(Number(point.latitude)) &&
			Number.isFinite(Number(point.longitude)) &&
			Math.abs(Number(point.latitude)) > 0.000001 &&
			Math.abs(Number(point.longitude)) > 0.000001
		)).map((point) => ({
			type: "Feature",
			geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
			properties: {
				id: point.id,
				category: point.category,
				scheduled: Boolean(point.scheduled),
				orderNumber: point.orderNumber,
				label: point.category === "opportunity" ? point.neighborhood : point.clientName || point.orderNumber,
			},
		})),
	};
}

function userFeature(position) {
	return {
		type: "FeatureCollection",
		features: position
			? [{ type: "Feature", geometry: { type: "Point", coordinates: [position.longitude, position.latitude] }, properties: {} }]
			: [],
	};
}

function installLayers(map, points) {
	map.addSource(SOURCE_ID, {
		type: "geojson",
		data: featureCollection(points),
		cluster: true,
		clusterMaxZoom: 14,
		clusterRadius: 48,
	});
	map.addLayer({
		id: "maps-clusters",
		type: "circle",
		source: SOURCE_ID,
		filter: ["has", "point_count"],
		paint: {
			"circle-color": "#0f5fd7",
			"circle-radius": ["step", ["get", "point_count"], 20, 20, 26, 80, 32],
			"circle-stroke-color": "#ffffff",
			"circle-stroke-width": 3,
		},
	});
	map.addLayer({
		id: "maps-cluster-count",
		type: "symbol",
		source: SOURCE_ID,
		filter: ["has", "point_count"],
		layout: {
			"text-field": ["get", "point_count_abbreviated"],
			"text-font": ["Noto Sans Bold"],
			"text-size": 13,
		},
		paint: { "text-color": "#ffffff" },
	});
	map.addLayer({
		id: "maps-points",
		type: "circle",
		source: SOURCE_ID,
		filter: ["!", ["has", "point_count"]],
		paint: {
			"circle-color": [
				"case",
				["==", ["get", "scheduled"], true], "#f5b800",
				["==", ["get", "category"], "assigned"], "#16a36a",
				["==", ["get", "category"], "opportunity"], "#0877e8",
				"#78869a",
			],
			"circle-radius": 9,
			"circle-stroke-color": "#ffffff",
			"circle-stroke-width": 3,
		},
	});
	map.addLayer({
		id: "maps-point-labels",
		type: "symbol",
		source: SOURCE_ID,
		filter: ["!", ["has", "point_count"]],
		minzoom: 13,
		layout: {
			"text-field": ["get", "label"],
			"text-font": ["Noto Sans Regular"],
			"text-size": 11,
			"text-offset": [0, 1.45],
			"text-anchor": "top",
		},
		paint: { "text-color": "#0b1734", "text-halo-color": "#ffffff", "text-halo-width": 2 },
	});
	map.addSource(USER_SOURCE_ID, { type: "geojson", data: userFeature(null) });
	map.addLayer({
		id: "maps-user-position",
		type: "circle",
		source: USER_SOURCE_ID,
		paint: {
			"circle-color": "#1468ff",
			"circle-radius": 8,
			"circle-stroke-color": "#ffffff",
			"circle-stroke-width": 4,
		},
	});
}

export default function MapsCanvas({ points, userPosition, focusPoint, onViewportChange, onSelect, onError }) {
	const containerRef = useRef(null);
	const mapRef = useRef(null);
	const pointsRef = useRef(points);
	const callbacksRef = useRef({ onViewportChange, onSelect, onError });

	useEffect(() => {
		callbacksRef.current = { onViewportChange, onSelect, onError };
	}, [onViewportChange, onSelect, onError]);

	useEffect(() => {
		pointsRef.current = points;
	}, [points]);

	useEffect(() => {
		if (!containerRef.current || mapRef.current) return undefined;
		const map = new Map({
			container: containerRef.current,
			style: import.meta.env.VITE_MAPS_STYLE_URL || DEFAULT_STYLE,
			center: DEFAULT_CENTER,
			zoom: 6,
			attributionControl: false,
		});
		mapRef.current = map;
		let loaded = false;
		let userMovedMap = false;
		map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
		map.addControl(new AttributionControl({ compact: true }), "bottom-right");
		map.on("load", () => {
			loaded = true;
			installLayers(map, pointsRef.current);
			map.resize();
		});
		map.on("error", (event) => {
			if (!loaded) callbacksRef.current.onError?.(event?.error?.message || "Nao foi possivel abrir o mapa.");
		});
		map.on("movestart", (event) => {
			if (event?.originalEvent) userMovedMap = true;
		});
		let viewportTimer = null;
		map.on("moveend", () => {
			if (!userMovedMap) return;
			window.clearTimeout(viewportTimer);
			viewportTimer = window.setTimeout(() => {
				const bounds = map.getBounds();
				callbacksRef.current.onViewportChange?.({
					minLat: bounds.getSouth(), maxLat: bounds.getNorth(),
					minLng: bounds.getWest(), maxLng: bounds.getEast(),
				});
			}, 350);
		});
		const resizeObserver = typeof ResizeObserver !== "undefined"
			? new ResizeObserver(() => map.resize())
			: null;
		resizeObserver?.observe(containerRef.current);
		const resizeMap = () => map.resize();
		window.addEventListener("resize", resizeMap);
		window.addEventListener("orientationchange", resizeMap);
		map.on("click", "maps-points", (event) => {
			const id = event.features?.[0]?.properties?.id;
			if (id) callbacksRef.current.onSelect?.(id);
		});
		map.on("click", "maps-clusters", async (event) => {
			const feature = event.features?.[0];
			const clusterId = feature?.properties?.cluster_id;
			if (clusterId === undefined) return;
			const zoom = await map.getSource(SOURCE_ID).getClusterExpansionZoom(clusterId);
			map.easeTo({ center: feature.geometry.coordinates, zoom });
		});
		for (const layerId of ["maps-points", "maps-clusters"]) {
			map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
			map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
		}
		return () => {
			window.clearTimeout(viewportTimer);
			resizeObserver?.disconnect();
			window.removeEventListener("resize", resizeMap);
			window.removeEventListener("orientationchange", resizeMap);
			map.remove();
			mapRef.current = null;
		};
	}, []);

	useEffect(() => {
		const map = mapRef.current;
		const source = map?.getSource(SOURCE_ID);
		if (source) source.setData(featureCollection(points));
	}, [points]);

	useEffect(() => {
		const source = mapRef.current?.getSource(USER_SOURCE_ID);
		if (source) source.setData(userFeature(userPosition));
	}, [userPosition]);

	useEffect(() => {
		if (!focusPoint || !mapRef.current) return;
		mapRef.current.easeTo({ center: [focusPoint.longitude, focusPoint.latitude], zoom: Math.max(mapRef.current.getZoom(), 14), duration: 650 });
	}, [focusPoint]);

	return <div ref={containerRef} className="maps-v2-canvas" aria-label="Mapa interativo de retiradas" />;
}
