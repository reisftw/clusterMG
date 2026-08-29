const MATCH_DISTANCE_METERS = 120;

function normalizeText(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function normalizeStreet(value) {
	return normalizeText(value)
		.replace(/\b(rua|avenida|av|travessa|alameda|rodovia|estrada)\b/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function isValidCoordinate(value) {
	return typeof value === "number" && Number.isFinite(value);
}

function hasCoordinates(ordem) {
	return (
		isValidCoordinate(ordem?.latitude) && isValidCoordinate(ordem?.longitude)
	);
}

function toRadians(value) {
	return (value * Math.PI) / 180;
}

function calcDistanceMeters(a, b) {
	if (!hasCoordinates(a) || !hasCoordinates(b)) return Number.POSITIVE_INFINITY;

	const earthRadius = 6371000;
	const dLat = toRadians(b.latitude - a.latitude);
	const dLng = toRadians(b.longitude - a.longitude);
	const lat1 = toRadians(a.latitude);
	const lat2 = toRadians(b.latitude);

	const haversine =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

	return (
		2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
	);
}

export function isRetiradaTipo(tipo) {
	const normalized = normalizeText(tipo);
	return normalized.includes("retirada") || normalized.includes("cancelamento");
}

function buildCopyText(grupo, cidade, principal, relacionadas, isAgente) {
	const linhas = [
		`${isAgente ? "Agente autorizado" : grupo} -> ${cidade}`,
		`Serviço base: ${principal.tipo}`,
		`Cliente: ${principal.nome_cliente || "-"} | Código: ${principal.codigo_cliente || "-"} | OS: ${principal.num_os || "-"}`,
		`Técnico: ${principal.tecnico || "Não informado"}`,
		`Endereço: ${principal.endereco_resumo || principal.endereco || "-"}`,
		"Retiradas próximas:",
	];

	relacionadas.forEach((ordem) => {
		linhas.push(
			`- ${ordem.tipo} | ${ordem.nome_cliente || "-"} | Código ${ordem.codigo_cliente || "-"} | OS ${ordem.num_os || "-"} | ${ordem.distanceMeters}m`,
		);
	});

	return linhas.join("\n");
}

function buildCidadeMatches(
	grupo,
	cidade,
	listaOrdens,
	{ isAgente = false } = {},
) {
	const ordensComCoord = listaOrdens.filter(hasCoordinates);
	const retiradas = ordensComCoord.filter((ordem) =>
		isRetiradaTipo(ordem.tipo),
	);
	const servicos = ordensComCoord.filter(
		(ordem) => !isRetiradaTipo(ordem.tipo),
	);

	const matches = servicos
		.map((principal) => {
			const ruaPrincipal = normalizeStreet(principal.endereco);
			const relacionadas = retiradas
				.filter((retirada) => retirada.id !== principal.id)
				.map((retirada) => {
					const distanceMeters = Math.round(
						calcDistanceMeters(principal, retirada),
					);
					const sameStreet =
						ruaPrincipal && ruaPrincipal === normalizeStreet(retirada.endereco);

					if (!sameStreet && distanceMeters > MATCH_DISTANCE_METERS) {
						return null;
					}

					return {
						...retirada,
						sameStreet,
						distanceMeters,
					};
				})
				.filter(Boolean)
				.sort((a, b) => a.distanceMeters - b.distanceMeters);

			if (!relacionadas.length) return null;

			return {
				id: `${principal.id || principal.num_os}-${cidade}`,
				principal,
				relacionadas,
				totalRelacionadas: relacionadas.length,
				copyText: buildCopyText(
					grupo,
					cidade,
					principal,
					relacionadas,
					isAgente,
				),
			};
		})
		.filter(Boolean)
		.sort((a, b) => b.totalRelacionadas - a.totalRelacionadas);

	return {
		cidade,
		matches,
		totalMatches: matches.length,
		totalRetiradasRelacionadas: matches.reduce(
			(sum, match) => sum + match.totalRelacionadas,
			0,
		),
		isAgente,
	};
}

function buildSection(agrupado, { isAgente = false } = {}) {
	return Object.entries(agrupado)
		.map(([grupo, cidadesMap]) => {
			const cidades = Object.entries(cidadesMap)
				.map(([cidade, listaOrdens]) =>
					buildCidadeMatches(grupo, cidade, listaOrdens, { isAgente }),
				)
				.filter((item) => item.totalMatches > 0)
				.sort((a, b) => b.totalMatches - a.totalMatches);

			return {
				regional: grupo,
				cidades,
				totalMatches: cidades.reduce(
					(sum, cidade) => sum + cidade.totalMatches,
					0,
				),
				totalCidades: cidades.length,
				isAgente,
			};
		})
		.filter((item) => item.totalMatches > 0)
		.sort((a, b) => b.totalMatches - a.totalMatches);
}

function sumRetiradasRelacionadas(section = []) {
	return section.reduce(
		(totalSection, item) =>
			totalSection +
			(item.cidades || []).reduce(
				(totalCidades, cidade) =>
					totalCidades + Number(cidade.totalRetiradasRelacionadas || 0),
				0,
			),
		0,
	);
}

export function buildMatchOSData(ordens = []) {
	const agrupadoRegionais = {};
	const agrupadoAgentes = {};
	let ignoradasSemRegional = 0;

	(Array.isArray(ordens) ? ordens : []).forEach((ordem) => {
		const regional = String(ordem?.regional || "").trim();
		const cidade = String(ordem?.cidade || "").trim();

		if (!regional || regional === "Sem Regional" || !cidade) {
			ignoradasSemRegional += 1;
			return;
		}

		const alvo = ordem?.agente ? agrupadoAgentes : agrupadoRegionais;
		const grupo = ordem?.agente ? "Agentes autorizados" : regional;

		if (!alvo[grupo]) alvo[grupo] = {};
		if (!alvo[grupo][cidade]) alvo[grupo][cidade] = [];
		alvo[grupo][cidade].push(ordem);
	});

	const regionais = buildSection(agrupadoRegionais);
	const agentes = buildSection(agrupadoAgentes, { isAgente: true });

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
				sumRetiradasRelacionadas(regionais) + sumRetiradasRelacionadas(agentes),
			ignoradasSemRegional,
			distanciaMaximaMetros: MATCH_DISTANCE_METERS,
		},
	};
}
