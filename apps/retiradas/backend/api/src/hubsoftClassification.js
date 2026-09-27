function cleanText(value) {
	return String(value || "").trim();
}

function normalizeText(value) {
	return cleanText(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, " ")
		.toUpperCase();
}

function normalizeCityKey(value) {
	return normalizeText(value).replace(/[^A-Z0-9]+/g, " ").trim();
}

function extractTechnicians(row = {}) {
	const list = Array.isArray(row.tecnicos)
		? row.tecnicos
		: Array.isArray(row.ordem_servico_tecnico)
			? row.ordem_servico_tecnico.map((item) => item.usuario || item)
			: [];
	return list
		.map((item) => ({
			id: Number(item.id || item.id_usuario || item.id_tecnico || 0) || null,
			name: cleanText(item.name || item.nome || item.display || item.descricao),
		}))
		.filter((item) => item.id || item.name);
}

function extractCity(row = {}) {
	return (
		row?.cliente_servico?.endereco_instalacao?.endereco_numero?.cidade?.nome ||
		row?.cliente_servico?.cliente_servico_endereco?.find?.(
			(item) => item?.tipo === "instalacao",
		)?.endereco_numero?.cidade?.nome ||
		row?.cliente_servico?.cliente_servico_endereco?.[0]?.endereco_numero?.cidade
			?.nome ||
		row?.cidade?.nome ||
		row?.cidade ||
		row?.endereco_instalacao?.cidade?.nome ||
		null
	);
}

function classifyOrder(row, maps) {
	const technicians = extractTechnicians(row);
	for (const technician of technicians) {
		const registered =
			maps.techById.get(Number(technician.id)) ||
			maps.techByName?.get(normalizeText(technician.name));
		if (registered) {
			return {
				production_channel: "RETIRADA",
				production_owner_id: String(registered.hubsoft_technician_id),
				production_owner_name:
					registered.nome_exibicao || registered.nome_hubsoft || technician.name,
				classification_rule: "WITHDRAWAL_TECHNICIAN_ID",
				classification_reason: "TECHNICIAN_MATCH",
			};
		}
	}
	if (technicians.length === 1) {
		const technician = technicians[0];
		return {
			production_channel: "RETIRADA",
			production_owner_id: technician.id ? String(technician.id) : normalizeText(technician.name),
			production_owner_name: technician.name || "Técnico de retirada",
			classification_rule: "HUBSOFT_TECHNICIAN_FALLBACK",
			classification_reason: "TECHNICIAN_PRESENT",
		};
	}
	if (technicians.length > 1) {
		return {
			production_channel: "UNCLASSIFIED",
			classification_rule: "UNCLASSIFIED",
			classification_reason: "MULTIPLE_TECHNICIANS",
		};
	}

	const city = extractCity(row);
	const cityKey = normalizeCityKey(city);
	if (!cityKey) {
		return {
			production_channel: "UNCLASSIFIED",
			classification_rule: "UNCLASSIFIED",
			classification_reason: "MISSING_CITY",
		};
	}
	const agent = maps.agentsByCity.get(cityKey);
	if (agent) {
		return {
			production_channel: "AA",
			production_owner_id: agent.ownerId || cityKey,
			production_owner_name: agent.cidade || city,
			classification_rule: "AUTHORIZED_AGENT_CITY",
			classification_reason: "AUTHORIZED_AGENT_CITY",
		};
	}
	if (maps.duplicateRegionalCities.has(cityKey)) {
		return {
			production_channel: "UNCLASSIFIED",
			classification_rule: "UNCLASSIFIED",
			classification_reason: "REGIONAL_AMBIGUOUS",
		};
	}
	const regional = maps.regionalsByCity.get(cityKey);
	if (regional) {
		return {
			production_channel: "REGIONAL",
			production_owner_id: regional.regionalId || regional.regional,
			production_owner_name: regional.regional,
			classification_rule: "REGIONAL_CITY",
			classification_reason: "REGIONAL_CITY",
		};
	}
	return {
		production_channel: "UNCLASSIFIED",
		classification_rule: "UNCLASSIFIED",
		classification_reason: "CITY_NOT_FOUND",
	};
}

module.exports = {
	classifyOrder,
	extractCity,
	extractTechnicians,
	normalizeCityKey,
	normalizeText,
};
