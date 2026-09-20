export function toCurrencyNumber(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const normalized = String(value ?? "")
		.replace(/\./g, "")
		.replace(",", ".");
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrency(value) {
	return toCurrencyNumber(value).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

export function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function getMapsLinks(endereco) {
	const encoded = encodeURIComponent(String(endereco || "").trim());
	if (!encoded) return { mapsUrl: "", streetViewUrl: "", embedUrl: "" };
	return {
		mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
		streetViewUrl: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encoded}`,
		embedUrl: `https://www.google.com/maps?q=${encoded}&output=embed`,
	};
}

export function calculateLocalReport({
	imoveis = [],
	iptus = [],
	alugueis = [],
	reajustes = [],
} = {}) {
	const gastosIptu = iptus.reduce(
		(sum, item) => sum + toCurrencyNumber(item.valor),
		0,
	);
	const ativos = imoveis.filter((item) => item.ativo !== false);
	const alugados = ativos.filter((item) => item.tipoContrato === "alugado");
	const gastosAluguel = alugueis.length
		? alugueis.reduce((sum, item) => sum + toCurrencyNumber(item.valor), 0)
		: alugados.reduce(
				(sum, item) => sum + toCurrencyNumber(item.valorAluguel),
				0,
			);
	const finalizados = imoveis.filter((item) => item.ativo === false);

	return {
		totalImoveis: imoveis.length,
		ativos: ativos.length,
		alugados: alugados.length,
		proprios: ativos.length - alugados.length,
		finalizados: finalizados.length,
		gastosIptu,
		gastosAluguel,
		reajustes: reajustes.length,
	};
}
