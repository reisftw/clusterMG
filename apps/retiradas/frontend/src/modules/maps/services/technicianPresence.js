import { mapsService } from "./mapsService";

const MIN_SEND_INTERVAL_MS = 30_000;
const MIN_MOVEMENT_METERS = 20;

let lastSentAt = 0;
let lastPosition = null;
let inFlight = null;

function distanceMeters(first, second) {
	if (!first || !second) return Number.POSITIVE_INFINITY;
	const radians = (value) => (value * Math.PI) / 180;
	const lat1 = radians(first.latitude);
	const lat2 = radians(second.latitude);
	const deltaLat = lat2 - lat1;
	const deltaLng = radians(second.longitude - first.longitude);
	const value =
		Math.sin(deltaLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
	return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function updateTechnicianPresence(position, { force = false } = {}) {
	if (!position || !Number.isFinite(Number(position.latitude)) || !Number.isFinite(Number(position.longitude))) {
		return Promise.resolve(null);
	}
	const now = Date.now();
	const recentlySent = now - lastSentAt < MIN_SEND_INTERVAL_MS;
	const barelyMoved = distanceMeters(lastPosition, position) < MIN_MOVEMENT_METERS;
	if (!force && recentlySent && barelyMoved) return Promise.resolve(null);
	if (inFlight) return inFlight;

	inFlight = mapsService
		.saveTechnicianPresence({
			latitude: Number(position.latitude),
			longitude: Number(position.longitude),
			accuracy: Number.isFinite(Number(position.accuracy)) ? Number(position.accuracy) : null,
			heading: Number.isFinite(Number(position.heading)) ? Number(position.heading) : null,
			speed: Number.isFinite(Number(position.speed)) ? Number(position.speed) : null,
		})
		.then((response) => {
			lastSentAt = Date.now();
			lastPosition = position;
			return response;
		})
		.finally(() => {
			inFlight = null;
		});
	return inFlight;
}

export const technicianPresenceTestables = { distanceMeters };
