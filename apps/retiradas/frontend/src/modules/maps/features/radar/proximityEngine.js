export function distanceMeters(left, right) {
	const earthRadius = 6371000;
	const toRad = (value) => (Number(value) * Math.PI) / 180;
	const deltaLat = toRad(Number(right.latitude) - Number(left.latitude));
	const deltaLon = toRad(Number(right.longitude) - Number(left.longitude));
	const lat1 = toRad(left.latitude);
	const lat2 = toRad(right.latitude);
	const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
	return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function shouldEvaluatePosition(previous, next, { minimumDistance = 25, maximumAgeMs = 20_000 } = {}) {
	if (!previous) return true;
	if (Number(next.timestamp || 0) - Number(previous.timestamp || 0) >= maximumAgeMs) return true;
	return distanceMeters(previous, next) >= minimumDistance;
}
