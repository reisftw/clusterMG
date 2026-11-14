export function mapPointFingerprint(point) {
	return [
		Number(point.latitude),
		Number(point.longitude),
		point.category,
		point.clientName,
		point.clientCode,
		point.orderNumber,
		point.technician,
		Boolean(point.assignedToCurrentUser),
	].join("|");
}

export function reconcileMapMarkers({ points, markersById, cluster, createMarker, updateMarker }) {
	const nextPoints = new Map(points.map((point) => [point.id, point]));
	const removedMarkers = [];
	const addedMarkers = [];
	let added = 0;
	let removed = 0;
	let updated = 0;

	for (const [id, entry] of markersById) {
		if (nextPoints.has(id)) continue;
		removedMarkers.push(entry.marker);
		markersById.delete(id);
		removed += 1;
	}

	for (const [id, point] of nextPoints) {
		const fingerprint = mapPointFingerprint(point);
		const entry = markersById.get(id);
		if (!entry) {
			const marker = createMarker(point);
			markersById.set(id, { marker, point, fingerprint });
			addedMarkers.push(marker);
			added += 1;
			continue;
		}

		if (entry.fingerprint === fingerprint) continue;
		const moved = Number(entry.point.latitude) !== Number(point.latitude) || Number(entry.point.longitude) !== Number(point.longitude);
		if (moved) removedMarkers.push(entry.marker);
		updateMarker(entry.marker, point, entry);
		entry.point = point;
		entry.fingerprint = fingerprint;
		if (moved) addedMarkers.push(entry.marker);
		updated += 1;
	}

	if (removedMarkers.length) cluster.removeLayers(removedMarkers);
	if (addedMarkers.length) cluster.addLayers(addedMarkers);

	return { added, updated, removed };
}
