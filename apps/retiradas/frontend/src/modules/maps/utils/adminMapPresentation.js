export const PRESENTATION_PHASES = Object.freeze({
	OVERVIEW_MG: "OVERVIEW_MG",
	REGIONAL_FOCUS: "REGIONAL_FOCUS",
	CITY_FOCUS: "CITY_FOCUS",
	TOP_TECHNICIAN: "TOP_TECHNICIAN",
	TECHNICIAN_ROUTE: "TECHNICIAN_ROUTE",
	OPERATION_ALERT: "OPERATION_ALERT",
	RETURN_OVERVIEW: "RETURN_OVERVIEW",
});

const PHASE_DURATION_KEYS = Object.freeze({
	[PRESENTATION_PHASES.OVERVIEW_MG]: "overviewSeconds",
	[PRESENTATION_PHASES.REGIONAL_FOCUS]: "regionalSeconds",
	[PRESENTATION_PHASES.CITY_FOCUS]: "citySeconds",
	[PRESENTATION_PHASES.TOP_TECHNICIAN]: "technicianSeconds",
	[PRESENTATION_PHASES.TECHNICIAN_ROUTE]: "routeSeconds",
	[PRESENTATION_PHASES.OPERATION_ALERT]: "citySeconds",
	[PRESENTATION_PHASES.RETURN_OVERVIEW]: "overviewSeconds",
});

export function phaseDurationMs(step, settings = {}) {
	const key = PHASE_DURATION_KEYS[step?.phase] || "overviewSeconds";
	return Math.max(5, Number(settings[key] || 10)) * 1000;
}

function withLocation(items = []) {
	return items.filter((item) => Number.isFinite(Number(item?.latitude)) && Number.isFinite(Number(item?.longitude)));
}

function chooseTechnicians(items = [], limit = 3, recentIds = []) {
	const recent = new Set(recentIds);
	const active = withLocation(items).filter((item) => item.status === "active" || item.status === "recent");
	const ranked = [...active].sort((left, right) =>
		Number(right.completedToday || 0) - Number(left.completedToday || 0) ||
		new Date(right.lastSeenAt || 0) - new Date(left.lastSeenAt || 0),
	);
	return [...ranked.filter((item) => !recent.has(item.userId)), ...ranked.filter((item) => recent.has(item.userId))]
		.slice(0, Math.max(1, Number(limit || 3)));
}

export function buildPresentationPlan(data = {}, options = {}) {
	const settings = data.settings || {};
	const recentTechnicianIds = options.recentTechnicianIds || [];
	const steps = [{ phase: PRESENTATION_PHASES.OVERVIEW_MG, key: "overview" }];
	const regionals = (data.regionals || []).filter((item) => item.openOrders > 0 || item.locatedTechnicians > 0);
	const regionalSelection = settings.rotateRegionals === false ? regionals.slice(0, 1) : regionals.slice(0, 8);
	for (const regional of regionalSelection) {
		steps.push({ phase: PRESENTATION_PHASES.REGIONAL_FOCUS, key: `regional:${regional.name}`, regional });
		const city = (data.cities || []).find((item) => item.regional === regional.name && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));
		if (city) steps.push({ phase: PRESENTATION_PHASES.CITY_FOCUS, key: `city:${regional.name}:${city.city}`, city });
	}
	for (const technician of chooseTechnicians(data.rankings?.daily || data.technicians, settings.rankingLimit, recentTechnicianIds)) {
		steps.push({ phase: PRESENTATION_PHASES.TOP_TECHNICIAN, key: `technician:${technician.userId}`, technician });
		if (settings.showDailyRoute !== false && Number(technician.positionsToday || 0) > 1) {
			steps.push({ phase: PRESENTATION_PHASES.TECHNICIAN_ROUTE, key: `route:${technician.userId}`, technician });
		}
	}
	const alert = (data.alerts || [])[0];
	if (alert) steps.push({ phase: PRESENTATION_PHASES.OPERATION_ALERT, key: `alert:${alert.type}`, alert });
	steps.push({ phase: PRESENTATION_PHASES.RETURN_OVERVIEW, key: "return" });
	return steps;
}

export function nextPresentationIndex(currentIndex, planLength) {
	if (!Number.isFinite(planLength) || planLength <= 0) return 0;
	return (Math.max(-1, Number(currentIndex) || 0) + 1) % planLength;
}
