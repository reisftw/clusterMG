function normalizeText(value) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

function isRetiradaTipo(tipo) {
	const normalized = normalizeText(tipo);
	return normalized.includes("retirada") || normalized.includes("cancelamento");
}

function normalizeStreet(value) {
	return normalizeText(value)
		.replace(/\b(rua|avenida|av|travessa|alameda|rodovia|estrada)\b/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function hasCoordinates(order) {
	const latitude = order?.latitude;
	const longitude = order?.longitude;
	if (
		typeof latitude !== "number" ||
		!Number.isFinite(latitude) ||
		latitude < -90 ||
		latitude > 90 ||
		typeof longitude !== "number" ||
		!Number.isFinite(longitude) ||
		longitude < -180 ||
		longitude > 180
	) {
		return false;
	}
	return !(Math.abs(latitude) < 0.000001 && Math.abs(longitude) < 0.000001);
}

function calcDistanceMeters(a, b) {
	if (!hasCoordinates(a) || !hasCoordinates(b)) return Number.POSITIVE_INFINITY;
	const radius = 6371000;
	const toRad = (value) => (value * Math.PI) / 180;
	const dLat = toRad(b.latitude - a.latitude);
	const dLng = toRad(b.longitude - a.longitude);
	const lat1 = toRad(a.latitude);
	const lat2 = toRad(b.latitude);
	const haversine =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return (
		2 * radius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
	);
}

function compactOrder(order = {}) {
	return {
		id: order.id || order.num_os || "",
		num_os: order.num_os || "",
		tipo: order.tipo || "",
		nome_cliente: order.nome_cliente || "",
		codigo_cliente: order.codigo_cliente || "",
		tecnico: order.tecnico || "",
		endereco: order.endereco || "",
		endereco_resumo: order.endereco_resumo || "",
		distanceMeters: order.distanceMeters ?? null,
		sameStreet: order.sameStreet === true,
	};
}

function buildMatchData(ordens = []) {
	const groupedRegionais = {};
	const groupedAgentes = {};
	let ignoradasSemRegional = 0;

	ordens.forEach((order) => {
		const regional = String(order?.regional || "").trim();
		const city = String(order?.cidade || "").trim();
		if (!regional || regional === "Sem Regional" || !city) {
			ignoradasSemRegional += 1;
			return;
		}
		const target = order?.agente ? groupedAgentes : groupedRegionais;
		const group = order?.agente ? "Agentes autorizados" : regional;
		if (!target[group]) target[group] = {};
		if (!target[group][city]) target[group][city] = [];
		target[group][city].push(order);
	});

	function buildSection(grouped, isAgente = false) {
		return Object.entries(grouped)
			.map(([group, cities]) => {
				const cidades = Object.entries(cities)
					.map(([city, list]) => {
						const withCoords = list.filter(hasCoordinates);
						const retiradas = withCoords.filter((order) =>
							isRetiradaTipo(order.tipo),
						);
						const servicos = withCoords.filter(
							(order) => !isRetiradaTipo(order.tipo),
						);
						const matches = servicos
							.map((principal) => {
								const street = normalizeStreet(principal.endereco);
								const relacionadas = retiradas
									.filter((order) => order.id !== principal.id)
									.map((order) => {
										const distanceMeters = Math.round(
											calcDistanceMeters(principal, order),
										);
										const sameStreet =
											street && street === normalizeStreet(order.endereco);
										if (distanceMeters > 120) return null;
										return { ...order, sameStreet, distanceMeters };
									})
									.filter(Boolean)
									.sort((a, b) => a.distanceMeters - b.distanceMeters);
								if (!relacionadas.length) return null;
								return {
									id: `${principal.id || principal.num_os}-${city}`,
									principal: compactOrder(principal),
									relacionadas: relacionadas.map(compactOrder),
									totalRelacionadas: relacionadas.length,
								};
							})
							.filter(Boolean)
							.sort((a, b) => b.totalRelacionadas - a.totalRelacionadas);

						return {
							cidade: city,
							matches,
							totalMatches: matches.length,
							totalRetiradasRelacionadas: matches.reduce(
								(sum, item) => sum + item.totalRelacionadas,
								0,
							),
							isAgente,
						};
					})
					.filter((item) => item.totalMatches > 0)
					.sort((a, b) => b.totalMatches - a.totalMatches);

				return {
					regional: group,
					cidades,
					totalMatches: cidades.reduce(
						(sum, item) => sum + item.totalMatches,
						0,
					),
					totalCidades: cidades.length,
					isAgente,
				};
			})
			.filter((item) => item.totalMatches > 0)
			.sort((a, b) => b.totalMatches - a.totalMatches);
	}

	const regionais = buildSection(groupedRegionais);
	const agentes = buildSection(groupedAgentes, true);
	const totalRelated = (section) =>
		section.reduce(
			(sum, group) =>
				sum +
				(group.cidades || []).reduce(
					(citySum, city) =>
						citySum + Number(city.totalRetiradasRelacionadas || 0),
					0,
				),
			0,
		);

	return {
		regionais,
		agentes,
		resumo: {
			totalRegionais: regionais.length,
			totalAgentes: agentes.reduce((sum, item) => sum + item.totalCidades, 0),
			totalCidades:
				regionais.reduce((sum, item) => sum + item.totalCidades, 0) +
				agentes.reduce((sum, item) => sum + item.totalCidades, 0),
			totalMatches:
				regionais.reduce((sum, item) => sum + item.totalMatches, 0) +
				agentes.reduce((sum, item) => sum + item.totalMatches, 0),
			totalRetiradasRelacionadas:
				totalRelated(regionais) + totalRelated(agentes),
			ignoradasSemRegional,
			distanciaMaximaMetros: 120,
		},
	};
}

function buildMatchMessages(matchData = {}) {
	const buildTopCities = (section = [], groupLabel) =>
		section
			.flatMap((group) =>
				(group.cidades || []).map((city) => ({
					group: group.regional,
					city: city.cidade,
					totalMatches: Number(city.totalMatches || 0),
				})),
			)
			.sort((a, b) => b.totalMatches - a.totalMatches)
			.slice(0, 10)
			.map((item, index) => {
				if (groupLabel === "agente") {
					return `${index + 1}. ${item.city} - ${item.totalMatches} matches`;
				}
				return `${index + 1}. ${item.city} (${item.group}) - ${item.totalMatches} matches`;
			});

	const buildMessage = (title, lines, link) => {
		const body = lines.length
			? lines.join("\n")
			: "Nenhuma cidade com match no momento.";
		return [
			"Mapa, Match e dados foram atualizados! Veja as cidades com mais match para utilizacao.",
			"",
			title,
			body,
			"",
			`Painel: ${link}`,
		].join("\n");
	};

	return {
		regionais: buildMessage(
			"Regionais:",
			buildTopCities(matchData.regionais || [], "regional"),
			"https://retiradas.tech/painel/match",
		),
		agentes: buildMessage(
			"Agente autorizado:",
			buildTopCities(matchData.agentes || [], "agente"),
			"https://retiradas.tech/aa-sempre",
		),
	};
}

module.exports = {
	buildMatchData,
	buildMatchMessages,
};
