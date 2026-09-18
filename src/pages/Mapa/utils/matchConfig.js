import {
	getMatchConfig as getMatchConfigCallable,
	saveMatchConfig as saveMatchConfigCallable,
} from "../../../services/operationalImportService";

export const DEFAULT_MATCH_IGNORED_TYPES = [];

function normalizeText(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function uniqueByNormalized(values = []) {
	const seen = new Set();
	return values.filter((value) => {
		const normalized = normalizeText(value);
		if (!normalized || seen.has(normalized)) return false;
		seen.add(normalized);
		return true;
	});
}

export function buildMatchIgnoredTypes(adicionais = []) {
	return uniqueByNormalized(adicionais);
}

export async function loadMatchConfig() {
	const data = await getMatchConfigCallable();
	const adicionais = Array.isArray(data?.tiposIgnoradosAdicionais)
		? uniqueByNormalized(
				data.tiposIgnoradosAdicionais.map((item) => String(item).trim()),
			)
		: [];

	return {
		tiposIgnoradosAdicionais: adicionais,
		tiposIgnoradosAplicados: buildMatchIgnoredTypes(adicionais),
	};
}

export async function saveMatchConfig(tiposIgnoradosAdicionais = []) {
	const adicionais = uniqueByNormalized(
		tiposIgnoradosAdicionais.map((item) => String(item || "").trim()),
	);
	const data = await saveMatchConfigCallable({
		tiposIgnoradosAdicionais: adicionais,
	});

	return {
		tiposIgnoradosAdicionais: Array.isArray(data?.tiposIgnoradosAdicionais)
			? data.tiposIgnoradosAdicionais
			: adicionais,
		tiposIgnoradosAplicados: Array.isArray(data?.tiposIgnoradosAplicados)
			? data.tiposIgnoradosAplicados
			: buildMatchIgnoredTypes(adicionais),
	};
}
