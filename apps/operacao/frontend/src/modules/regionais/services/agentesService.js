import {
	createRotAgent,
	deleteRotAgent,
	fetchRotAgents,
	updateRotAgent,
} from "../../../api/rotApi";

function normalizePessoa(pessoa = {}) {
	return {
		nome: pessoa?.nome || pessoa?.name || "",
		telefone: pessoa?.telefone || pessoa?.phone || "",
		email: pessoa?.email || "",
	};
}

function normalizeAgent(item = {}) {
	const responsible = normalizePessoa(item.responsible || item.responsavel || {});
	return {
		id: item.id,
		cidade: item.cityName || item.cidade || "",
		cidadeId: item.cityId || item.cidadeId || item.cidade_id || "",
		regional_id: item.regionalId || item.regional_id || "",
		regional_nome: item.regionalName || item.regional_nome || "",
		responsavel: responsible,
		operationScopes: item.operationScopes || item.operation_scopes || ["ROT"],
	};
}

function buildPayload(dados = {}) {
	return {
		cityName: dados.cidade || dados.cityName || "",
		cityId: dados.cidadeId || dados.cidade_id || "",
		regionalId: dados.regional_id || dados.regionalId || "",
		responsible: {
			name: dados.responsavel?.nome || "",
			phone: dados.responsavel?.telefone || "",
			email: dados.responsavel?.email || "",
		},
		operationScopes: dados.operationScopes || ["ROT"],
	};
}

export async function buscarAgentes() {
	const items = await fetchRotAgents();
	return (items || []).map(normalizeAgent);
}

export async function criarAgente(dados) {
	const agent = await createRotAgent(buildPayload(dados));
	return normalizeAgent(agent);
}

export async function atualizarAgente(id, dados) {
	const agent = await updateRotAgent(id, buildPayload(dados));
	return normalizeAgent(agent);
}

export async function excluirAgente(id) {
	return deleteRotAgent(id);
}
