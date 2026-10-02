const { text, toNumberOrNull } = require("../utils/text");

function nestedValue(source, path) {
	return path.split(".").reduce((acc, key) => acc?.[key], source);
}

function firstPath(source, paths = []) {
	for (const path of paths) {
		const value = nestedValue(source, path);
		const clean = text(value);
		if (clean && clean !== "<masked>") return { value: clean, path };
	}
	return { value: "", path: "" };
}

function resolveActivationLocation(order = {}) {
	const directCity = order.cidade || order.cidade_instalacao || order.endereco?.cidade || {};
	const cityName = firstPath(order, [
		"cidade.nome",
		"cidade.display",
		"cidade.descricao",
		"cidade",
		"cidade_instalacao.nome",
		"cidade_instalacao.display",
		"cliente_servico.cidade.nome",
		"cliente_servico.cidade.display",
		"cliente_servico.endereco_instalacao.cidade",
		"cliente_servico.endereco_instalacao.cidade_nome",
		"cliente_servico.endereco.cidade",
		"cliente_servico.endereco.cidade_nome",
		"endereco.cidade",
		"endereco.cidade_nome",
		"bairro.cidade.nome",
		"bairro.cidade.display",
	]);
	const cityId = toNumberOrNull(
		directCity?.id_cidade ||
		directCity?.id ||
		order.id_cidade ||
		order.cliente_servico?.id_cidade ||
		order.cliente_servico?.cidade?.id_cidade ||
		order.cliente_servico?.cidade?.id,
	);
	return {
		cityId,
		cityName: cityName.value,
		source: cityName.path || (cityId ? "id_cidade" : ""),
		confidence: cityName.value ? "HIGH" : cityId ? "MEDIUM" : "MISSING",
	};
}

module.exports = { resolveActivationLocation };
