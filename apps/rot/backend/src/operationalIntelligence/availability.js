const AVAILABILITY = Object.freeze({
	AVAILABLE: "AVAILABLE",
	PARTIAL: "PARTIAL",
	WAITING_INTEGRATION: "WAITING_INTEGRATION",
	UNAVAILABLE: "UNAVAILABLE",
});

function unavailableMetric({ code, name, domain, source = "Hubsoft", provider = "HubsoftOrderProvider", reason }) {
	return {
		code,
		name,
		domain,
		value: null,
		unit: "count",
		source,
		provider,
		availability: AVAILABILITY.WAITING_INTEGRATION,
		reason: reason || "Integração Hubsoft ainda não configurada para ordens de serviço.",
	};
}

module.exports = {
	AVAILABILITY,
	unavailableMetric,
};
