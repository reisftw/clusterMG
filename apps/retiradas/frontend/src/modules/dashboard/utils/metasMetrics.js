export function parsePercentValue(value) {
	const parsed = Number(
		String(value ?? 0)
			.replace("%", "")
			.replace(",", "."),
	);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function getGoalPercent(metaMes) {
	if (!metaMes) return 0;

	const total = Number(metaMes.totalOS || 0);
	const meta = Number(metaMes.meta || 0);
	if (meta > 0) return (total / meta) * 100;

	return parsePercentValue(metaMes.percentAchieved);
}

export function getCancellationPercent(metaMes) {
	if (!metaMes) return 0;

	const total = Number(metaMes.totalOS || 0);
	const cancelamentos =
		Number(metaMes.cancelamentos || 0) ||
		Number(metaMes.totalCancelamentos || 0);
	if (cancelamentos > 0) return (total / cancelamentos) * 100;

	return parsePercentValue(metaMes.percentCancelamentos);
}

export function getDeliveredCancellationPercent(metaMes) {
	return getCancellationPercent(metaMes);
}
