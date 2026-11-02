const SHEET_POSITIONS = Object.freeze(["collapsed", "peek", "expanded"]);

function text(value) {
	return String(value || "").trim();
}

function normalize(value) {
	return text(value).toLocaleLowerCase("pt-BR");
}

function suggestionKey(type, value) {
	return `${type}:${normalize(value)}`;
}

export function buildMapSearchSuggestions(items = [], query = "", limit = 8) {
	const needle = normalize(query);
	if (needle.length < 2) return [];
	const suggestions = [];
	const seen = new Set();
	const add = (type, label, value, point = null) => {
		const cleanLabel = text(label);
		const cleanValue = text(value);
		if (!cleanLabel || !cleanValue || !normalize(cleanLabel).includes(needle)) return;
		const key = suggestionKey(type, cleanValue);
		if (seen.has(key) || suggestions.length >= limit) return;
		seen.add(key);
		suggestions.push({ type, label: cleanLabel, query: cleanValue, point });
	};

	for (const item of items) {
		add("city", item.city, item.city);
		add("neighborhood", `${item.neighborhood} · ${item.city}`, item.neighborhood);
		add("client", `${item.clientCode ? `(${item.clientCode}) ` : ""}${item.clientName}`, item.clientCode || item.clientName, item);
		add("order", `OS ${item.orderNumber}`, item.orderNumber, item);
		if (suggestions.length >= limit) break;
	}
	return suggestions;
}

export function sortMapPoints(items = [], mode = "nearest") {
	const next = [...items];
	const distance = (item) => Number.isFinite(Number(item?.distanceMeters)) ? Number(item.distanceMeters) : Number.POSITIVE_INFINITY;
	if (mode === "farthest") return next.sort((left, right) => distance(right) - distance(left));
	if (mode === "priority") {
		return next.sort((left, right) => {
			const priority = Number(right?.priority === "high") - Number(left?.priority === "high");
			if (priority) return priority;
			return distance(left) - distance(right);
		});
	}
	if (mode === "scheduled") {
		return next.sort((left, right) => Number(Boolean(right?.scheduled)) - Number(Boolean(left?.scheduled)) || distance(left) - distance(right));
	}
	return next.sort((left, right) => distance(left) - distance(right));
}

export function nextSheetPosition(position = "peek", direction = 1) {
	const currentIndex = Math.max(0, SHEET_POSITIONS.indexOf(position));
	const nextIndex = Math.min(SHEET_POSITIONS.length - 1, Math.max(0, currentIndex + direction));
	return SHEET_POSITIONS[nextIndex];
}

export function readStoredMapView(storage = globalThis?.sessionStorage) {
	try {
		const value = JSON.parse(storage?.getItem("retiradas-maps-view-v2") || "null");
		if (!Number.isFinite(Number(value?.centerLat)) || !Number.isFinite(Number(value?.centerLng))) return null;
		return {
			centerLat: Number(value.centerLat),
			centerLng: Number(value.centerLng),
			zoom: Math.min(19, Math.max(5, Number(value.zoom) || 12)),
			minLat: Number(value.minLat),
			maxLat: Number(value.maxLat),
			minLng: Number(value.minLng),
			maxLng: Number(value.maxLng),
		};
	} catch {
		return null;
	}
}

export function storeMapView(view, storage = globalThis?.sessionStorage) {
	try {
		storage?.setItem("retiradas-maps-view-v2", JSON.stringify(view));
	} catch {
		// O mapa continua funcional quando o armazenamento da sessao nao esta disponivel.
	}
}
