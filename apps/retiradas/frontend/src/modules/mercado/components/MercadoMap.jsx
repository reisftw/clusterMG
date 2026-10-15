import "leaflet/dist/leaflet.css";
import { geoJSON as createGeoJson } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, useMap } from "react-leaflet";

const MINAS_CENTER = [-18.55, -44.55];
const MINAS_ZOOM = 6;

function normalize(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase("pt-BR")
		.trim();
}

function fillFor(total, max) {
	if (!total) return "#DCE5EE";
	const ratio = total / Math.max(max, 1);
	if (ratio >= 0.75) return "#0B4E8A";
	if (ratio >= 0.45) return "#009FF5";
	if (ratio >= 0.18) return "#61C9F5";
	return "#BEEBFA";
}

function FocusCity({ feature, dataVersion }) {
	const map = useMap();
	useEffect(() => {
		if (!feature) return;
		const layer = createGeoJson(feature);
		map.fitBounds(layer.getBounds(), { padding: [36, 36], maxZoom: 10 });
	}, [map, feature, dataVersion]);
	return null;
}

export default function MercadoMap({ cities = [], selectedCity = "", onSelectCity }) {
	const [geoJson, setGeoJson] = useState(null);
	const [loadError, setLoadError] = useState("");
	const cityMap = useMemo(() => new Map(cities.map((city) => [normalize(city.cidade), city])), [cities]);
	const max = useMemo(() => Math.max(...cities.map((city) => Number(city.total || 0)), 0), [cities]);
	const selectedFeature = useMemo(
		() => geoJson?.features?.find((feature) => normalize(feature.properties?.nome) === normalize(selectedCity)) || null,
		[geoJson, selectedCity],
	);

	useEffect(() => {
		let active = true;
		fetch("/geodata/ibge/mg-municipios.geojson", { cache: "force-cache" })
			.then((response) => {
				if (!response.ok) throw new Error("Não foi possível carregar a malha municipal.");
				return response.json();
			})
			.then((data) => active && setGeoJson(data))
			.catch((error) => active && setLoadError(error.message));
		return () => { active = false; };
	}, []);

	if (loadError) return <div className="mercado-map-error">{loadError}</div>;

	return (
		<div className="mercado-map" aria-label="Mapa de oportunidades em Minas Gerais">
			<MapContainer center={MINAS_CENTER} zoom={MINAS_ZOOM} minZoom={5} maxZoom={12} scrollWheelZoom className="mercado-map__canvas">
				{selectedFeature ? <FocusCity feature={selectedFeature} dataVersion={selectedCity} /> : null}
				{geoJson ? (
					<GeoJSON
						key={`${cities.length}-${selectedCity}`}
						data={geoJson}
						style={(feature) => {
							const city = cityMap.get(normalize(feature?.properties?.nome));
							const isSelected = normalize(selectedCity) === normalize(feature?.properties?.nome);
							return {
								color: isSelected ? "#081426" : "#FFFFFF",
								weight: isSelected ? 2.5 : 0.55,
								fillColor: fillFor(Number(city?.total || 0), max),
								fillOpacity: isSelected ? 0.98 : city ? 0.88 : 0.58,
							};
						}}
						onEachFeature={(feature, layer) => {
							const city = cityMap.get(normalize(feature.properties?.nome));
							layer.bindTooltip(
								`${feature.properties?.nome || "Município"}${city ? ` · ${city.total} OS elegíveis` : " · Sem oportunidades"}`,
								{ sticky: true, direction: "top", className: "mercado-map__tooltip" },
							);
							layer.on({
								click: (event) => {
									if (!city) return;
									onSelectCity?.(city.cidade);
									event.target._map.fitBounds(event.target.getBounds(), { padding: [36, 36], maxZoom: 10 });
								},
								mouseover: (event) => event.target.setStyle({ weight: 1.8, color: "#009FF5" }),
								mouseout: (event) => event.target.setStyle({ weight: normalize(selectedCity) === normalize(feature.properties?.nome) ? 2.5 : 0.55, color: normalize(selectedCity) === normalize(feature.properties?.nome) ? "#081426" : "#FFFFFF" }),
							});
						}}
					/>
				) : null}
			</MapContainer>
			<div className="mercado-map__legend" aria-label="Legenda do mapa">
				<span><i className="is-none" />Sem oportunidades</span>
				<span><i className="is-low" />Poucas</span>
				<span><i className="is-medium" />Médias</span>
				<span><i className="is-high" />Altas</span>
			</div>
			{!geoJson ? <div className="mercado-map__loading">Carregando os 853 municípios de Minas Gerais...</div> : null}
		</div>
	);
}
