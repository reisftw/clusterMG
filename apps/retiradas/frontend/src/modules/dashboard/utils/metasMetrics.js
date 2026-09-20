export function getDeliveredCancellationPercent(metaMes) {
	if (!metaMes) return 0;

	const total = Number(metaMes.totalOS || 0);
	const cancelamentos =
		Number(metaMes.cancelamentos || 0) ||
		Number(metaMes.totalCancelamentos || 0);
	if (cancelamentos > 0) return (total / cancelamentos) * 100;

	const fallback = Number(
		String(metaMes.percentAchieved ?? 0)
			.replace("%", "")
			.replace(",", "."),
	);
	return Number.isFinite(fallback) ? fallback : 0;
}
