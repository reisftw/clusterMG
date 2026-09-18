const { unavailableMetric } = require("../availability");

class HubsoftOrderProvider {
	constructor(domain) {
		this.domain = domain;
	}

	async getSummary() {
		const label = this.domain === "FIELD" ? "FIELD" : "DELIVERY";
		return [
			unavailableMetric({
				code: `${this.domain.toLowerCase()}.os.completed`,
				name: `O.S ${label} concluídas`,
				domain: this.domain,
			}),
			unavailableMetric({
				code: `${this.domain.toLowerCase()}.os.open`,
				name: `O.S ${label} abertas`,
				domain: this.domain,
			}),
		];
	}

	async getEvents() {
		return {
			availability: "WAITING_INTEGRATION",
			reason: "Eventos FIELD/DELIVERY dependem da integração Hubsoft de O.S.",
			items: [],
		};
	}
}

module.exports = HubsoftOrderProvider;
