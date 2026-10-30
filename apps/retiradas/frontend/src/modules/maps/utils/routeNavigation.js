const GOOGLE_MAPS_DIRECTIONS_URL = "https://www.google.com/maps/dir/";
const MOBILE_MAX_STOPS_PER_LINK = 4;

function validCoordinate(value, min, max) {
	if (value === null || value === undefined || value === "") return false;
	const number = Number(value);
	return Number.isFinite(number) && number >= min && number <= max;
}

function normalizeCoordinate(item = {}) {
	if (!item) return null;
	if (!validCoordinate(item.latitude, -90, 90) || !validCoordinate(item.longitude, -180, 180)) return null;
	return {
		latitude: Number(item.latitude),
		longitude: Number(item.longitude),
	};
}

function coordinateText(item) {
	return `${item.latitude},${item.longitude}`;
}

export function buildGoogleMapsRouteLinks(route = {}, origin = null) {
	const stops = [...(Array.isArray(route.items) ? route.items : [])]
		.sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0))
		.map(normalizeCoordinate)
		.filter(Boolean);
	if (!stops.length) return [];

	const links = [];
	let segmentOrigin = normalizeCoordinate(origin);
	for (let index = 0; index < stops.length; index += MOBILE_MAX_STOPS_PER_LINK) {
		const segmentStops = stops.slice(index, index + MOBILE_MAX_STOPS_PER_LINK);
		const destination = segmentStops.at(-1);
		const params = new URLSearchParams({
			api: "1",
			destination: coordinateText(destination),
			travelmode: "driving",
			dir_action: "navigate",
		});
		if (segmentOrigin) params.set("origin", coordinateText(segmentOrigin));
		if (segmentStops.length > 1) {
			params.set("waypoints", segmentStops.slice(0, -1).map(coordinateText).join("|"));
		}
		links.push({
			url: `${GOOGLE_MAPS_DIRECTIONS_URL}?${params.toString()}`,
			start: index + 1,
			end: index + segmentStops.length,
		});
		segmentOrigin = destination;
	}
	return links;
}

export const __testables = { normalizeCoordinate };
