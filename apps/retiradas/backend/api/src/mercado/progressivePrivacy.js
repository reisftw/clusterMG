const TERMINAL_STATUSES = new Set(["SUBMITTED", "APPROVED", "REJECTED", "CORRECTION_REQUESTED", "CANCELED"]);

function currentGroup(rows = []) {
	const pendingGroups = rows
		.filter((row) => !TERMINAL_STATUSES.has(String(row.status || "")))
		.map((row) => Number(row.grupo_liberacao || 1))
		.filter(Number.isFinite);
	return pendingGroups.length ? Math.min(...pendingGroups) : null;
}

function visibleRows(rows = []) {
	const group = currentGroup(rows);
	if (!group) return [];
	return rows.filter((row) => Number(row.grupo_liberacao || 1) === group && Boolean(row.liberada_em));
}

function canAccessOs(row, empresaId) {
	return Boolean(row && row.accepted_by_empresa_id === empresaId && row.liberada_em);
}

module.exports = { TERMINAL_STATUSES, currentGroup, visibleRows, canAccessOs };
