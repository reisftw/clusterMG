const ACTIVATION_HEALTH_STATUS = Object.freeze({
	HEALTHY: "SAUDAVEL",
	ATTENTION: "ATENCAO",
	CRITICAL: "CRITICO",
	NO_DATA: "SEM_DADOS",
});

const ACTIVATION_HEALTH_REASON = Object.freeze({
	NO_CONNECTION: "NO_CONNECTION",
	NO_TRAFFIC: "NO_TRAFFIC",
	LOW_TRAFFIC: "LOW_TRAFFIC",
	RECENT_SUPPORT: "RECENT_SUPPORT",
	REPEATED_SUPPORT: "REPEATED_SUPPORT",
	STALE_CONNECTION_DATA: "STALE_CONNECTION_DATA",
	SERVICE_INACTIVE: "SERVICE_INACTIVE",
	TECHNICIAN_UNMATCHED: "TECHNICIAN_UNMATCHED",
	CONNECTION_RECOVERED: "CONNECTION_RECOVERED",
	INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
	LIMITED_MONITORING: "LIMITED_MONITORING",
});

const ACTIVATION_DATA_QUALITY_ISSUE = Object.freeze({
	TECHNICIAN_UNMATCHED: "TECHNICIAN_UNMATCHED",
	COMPANY_UNMATCHED: "COMPANY_UNMATCHED",
	CITY_MISSING: "CITY_MISSING",
	BRAND_UNKNOWN: "BRAND_UNKNOWN",
});

const SUPPORT_CATEGORIES = Object.freeze({
	TECHNICAL_CONNECTION: { affectsActivationQuality: true },
	WIFI: { affectsActivationQuality: true },
	EQUIPMENT: { affectsActivationQuality: true },
	INFRASTRUCTURE: { affectsActivationQuality: true },
	INSTALLATION: { affectsActivationQuality: true },
	SPECIAL_SERVICE: { affectsActivationQuality: true },
	COMMERCIAL: { affectsActivationQuality: false },
	ADMINISTRATIVE: { affectsActivationQuality: false },
	UNKNOWN: { affectsActivationQuality: false },
});

const ACTIVATION_HEALTH_CONFIG = Object.freeze({
	monitoringWindowDays: 30,
	staleConnectionHours: 24,
	noTrafficGigabytesThreshold: 0.0001,
	lowTrafficGigabytesThreshold: 0.02,
	minObservationHoursForNoTraffic: 1,
	repeatedSupportCount: 2,
	windows: [1, 7, 15, 30],
});

function supportCategoryConfig(category) {
	return SUPPORT_CATEGORIES[category] || SUPPORT_CATEGORIES.UNKNOWN;
}

module.exports = {
	ACTIVATION_HEALTH_CONFIG,
	ACTIVATION_DATA_QUALITY_ISSUE,
	ACTIVATION_HEALTH_REASON,
	ACTIVATION_HEALTH_STATUS,
	SUPPORT_CATEGORIES,
	supportCategoryConfig,
};
