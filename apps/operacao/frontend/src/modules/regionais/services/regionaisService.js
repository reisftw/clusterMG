import {
	createRotCity,
	createRotRegional,
	deleteRotCity,
	deleteRotRegional,
	fetchRotRegionals,
	updateRotCity,
	updateRotRegional,
} from "../../../api/rotApi";

const emptyPessoa = () => ({ nome: "", telefone: "", email: "" });
const OPERATIONAL_GROUPS = ["rot", "delivery", "field_service"];

function normalizePessoa(pessoa = {}) {
	return {
		nome: pessoa?.nome || pessoa?.name || "",
		telefone: pessoa?.telefone || pessoa?.phone || "",
		email: pessoa?.email || "",
	};
}

function normalizePessoas(pessoas = []) {
	const list = Array.isArray(pessoas) ? pessoas : [];
	const normalized = list.map(normalizePessoa);
	return normalized.length ? normalized : [emptyPessoa()];
}

function normalizeGroup(group = {}, fallback = {}) {
	return {
		lider: normalizePessoa(group?.lider || fallback?.lider),
		backoffices: normalizePessoas(
			Array.isArray(group?.backoffices) && group.backoffices.length
				? group.backoffices
				: group?.backoffice
					? [group.backoffice]
					: fallback?.backoffices,
		),
		supervisor: normalizePessoa(group?.supervisor || fallback?.supervisor),
	};
}

function normalizeGroups(groups = {}, fallback = {}) {
	return OPERATIONAL_GROUPS.reduce((result, key) => {
		result[key] = normalizeGroup(groups?.[key], key === "delivery" ? fallback : {});
		return result;
	}, {});
}

function normalizeCity(city = {}, regional = {}) {
	return {
		id: city.canonicalId || city.id,
		canonicalId: city.canonicalId || city.id,
		nome: city.name || city.nome || "",
		name: city.name || city.nome || "",
		tipo: city.tipo || city.type || "Comum",
		regionalId: city.regionalId || regional.id,
		regionalNome: regional.nome || regional.name || "",
		code: city.code || "",
		lat: city.lat ?? null,
		lng: city.lng ?? null,
	};
}

function normalizeRegional(item = {}) {
	const gruposOperacionais = normalizeGroups(
		item.gruposOperacionais || item.grupos_operacionais || item.operationalGroups || {},
		item,
	);
	const backoffices = gruposOperacionais.delivery.backoffices;
	return {
		id: item.id,
		nome: item.nome || item.name || "",
		name: item.nome || item.name || "",
		cidades: (item.cities || item.cidades || []).map((city) =>
			normalizeCity(city, item),
		),
		supervisor: gruposOperacionais.delivery.supervisor,
		lider: gruposOperacionais.delivery.lider,
		backoffice: backoffices[0] || emptyPessoa(),
		backoffices,
		gruposOperacionais,
		grupos_operacionais: gruposOperacionais,
	};
}

function buildPayload(dados = {}) {
	const gruposOperacionais = normalizeGroups(dados.gruposOperacionais || {});
	return {
		name: dados.nome || dados.name || "",
		gruposOperacionais,
		responsaveis: [
			{
				type: "supervisor_rot",
				phone: gruposOperacionais.rot.supervisor.telefone || "",
			},
			{
				type: "supervisor_field",
				phone: gruposOperacionais.field_service.supervisor.telefone || "",
			},
		],
	};
}

async function syncCities(regionalId, desiredCities = []) {
	const current = await buscarRegionais();
	const regional = current.find((item) => item.id === regionalId);
	const currentCities = regional?.cidades || [];
	const desiredIds = new Set(
		desiredCities
			.map((city) => city.canonicalId || city.id)
			.filter(Boolean)
			.map(String),
	);

	await Promise.all(
		currentCities
			.filter((city) => !desiredIds.has(String(city.canonicalId || city.id)))
			.map((city) => deleteRotCity(city.canonicalId || city.id)),
	);

	for (const city of desiredCities) {
		const id = city.canonicalId || city.id;
		const payload = {
			name: city.nome || city.name,
			tipo: city.tipo || city.type || "Comum",
			code: city.code || "",
			lat: city.lat ?? null,
			lng: city.lng ?? null,
		};
		if (id) await updateRotCity(id, payload);
		else await createRotCity(regionalId, payload);
	}
}

export async function buscarRegionais() {
	const items = await fetchRotRegionals();
	return (items || []).map(normalizeRegional);
}

export async function criarRegional(dados) {
	const regional = await createRotRegional(buildPayload(dados));
	await syncCities(regional.id, dados.cidades || []);
	return regional;
}

export async function atualizarRegional(id, dados) {
	const regional = await updateRotRegional(id, buildPayload(dados));
	await syncCities(regional.id || id, dados.cidades || []);
	return regional;
}

export async function excluirRegional(id) {
	return deleteRotRegional(id);
}
