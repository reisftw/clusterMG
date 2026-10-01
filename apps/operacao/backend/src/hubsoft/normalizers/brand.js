const { normalizeText, text } = require("../utils/text");

function resolveHubsoftBrand(clienteServico = {}) {
	const serviceDescription = text(
		clienteServico?.servico?.descricao ||
		clienteServico?.servico?.display ||
		clienteServico?.service_description ||
		clienteServico?.display ||
		"",
	);
	const normalized = normalizeText(serviceDescription);
	if (!normalized) return { brand: "UNKNOWN", brandSource: null };
	if (/\bon\b|\bonnet\b|\bon\s+udi\b|\bon\s+net\b/.test(normalized)) {
		return { brand: "ONNET", brandSource: "service_description" };
	}
	if (/\bsempre\b|\bpme sempre\b|\bsempre play\b|\bsempre gamer\b/.test(normalized)) {
		return { brand: "SEMPRE", brandSource: "service_description" };
	}
	return { brand: "UNKNOWN", brandSource: "service_description" };
}

module.exports = { resolveHubsoftBrand };
