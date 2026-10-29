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

export function getConfiguredGoalPercent(metaMes) {
	if (!metaMes) return 0;

	const configured = parsePercentValue(metaMes.metaSazonal);
	if (configured > 0) return configured;

	const meta = Number(metaMes.meta || 0);
	const cancelamentos =
		Number(metaMes.cancelamentos || 0) ||
		Number(metaMes.totalCancelamentos || 0);
	if (meta > 0 && cancelamentos > 0) return (meta / cancelamentos) * 100;

	return 0;
}

export function getCancellationPerformance(metaMes) {
	const total = Number(metaMes?.totalOS || 0);
	const cancelamentos =
		Number(metaMes?.cancelamentos || 0) ||
		Number(metaMes?.totalCancelamentos || 0);
	const deliveredPercent = getCancellationPercent(metaMes);
	const targetPercent = getConfiguredGoalPercent(metaMes);
	const configuredTarget = Number(metaMes?.meta || 0);
	const targetOS =
		configuredTarget > 0
			? configuredTarget
			: Math.round(cancelamentos * (targetPercent / 100));

	return {
		total,
		cancelamentos,
		deliveredPercent,
		targetPercent,
		targetOS,
		missingOS: Math.max(0, targetOS - total),
		missingPercentagePoints: Math.max(0, targetPercent - deliveredPercent),
		goalProgressPercent:
			targetPercent > 0 ? (deliveredPercent / targetPercent) * 100 : 0,
		achieved:
			cancelamentos > 0 &&
			targetPercent > 0 &&
			deliveredPercent >= targetPercent,
	};
}
