function fingerprint(record) {
	return JSON.stringify([record.number, record.status, record.type, record.city, record.cityId,
		record.sourceDate ? new Date(record.sourceDate).toISOString() : "", record.technicianId, record.technicianName]);
}

function buildSnapshotDiff(previous, current) {
	const previousById = new Map(previous.filter((record) => record.id).map((record) => [record.id, record]));
	const currentById = new Map(current.filter((record) => record.id).map((record) => [record.id, record]));
	const records = [...currentById.values()];
	return {
		previous: [...previousById.values()],
		current: records,
		added: records.filter((record) => !previousById.has(record.id)),
		removed: [...previousById.values()].filter((record) => !currentById.has(record.id)),
		updated: records.filter((record) => previousById.has(record.id) && fingerprint(previousById.get(record.id)) !== fingerprint(record)),
	};
}

module.exports = { buildSnapshotDiff };
