import {
	createVpsDocument,
	deleteVpsDocument,
	listVpsDocuments,
	setVpsDocument,
	updateVpsDocument,
} from "../../../services/vpsApiClient";

const EMPTY_STORE = {
	empresas: [],
	tecnicos: [],
	agendas: [],
	produtos: [],
	acertos: [],
};

const COLLECTIONS = {
	empresas: "empresas_tecnicos",
	tecnicos: "acerto_estoque_tecnicos",
	agendas: "acerto_estoque_agendas",
	produtos: "acerto_estoque_produtos",
	acertos: "acerto_estoque_acertos",
};

function text(value) {
	return String(value || "").trim();
}

function collectionFor(entity) {
	const collection = COLLECTIONS[entity];
	if (!collection) {
		throw new Error("Entidade invalida para o Acerto de Estoque.");
	}
	return collection;
}

function sortByName(items = []) {
	return [...items].sort((a, b) =>
		String(a.nome || a.tecnicoNome || a.cidade || a.codigo || "").localeCompare(
			String(b.nome || b.tecnicoNome || b.cidade || b.codigo || ""),
			"pt-BR",
		),
	);
}

function sortAcertos(items = []) {
	return [...items].sort((a, b) =>
		String(b.createdAt || b.dataAcerto || "").localeCompare(
			String(a.createdAt || a.dataAcerto || ""),
		),
	);
}

function uniqueValues(values = []) {
	return [
		...new Set(
			values.map((value) => String(value || "").trim()).filter(Boolean),
		),
	];
}

function buildTecnicosFromEmpresas(empresas = []) {
	return empresas.flatMap((empresa) => {
		const tecnicos = Array.isArray(empresa.tecnicos) ? empresa.tecnicos : [];
		return tecnicos
			.map((tecnico, index) => ({
				id: text(tecnico.id) || `${empresa.id}-${index}`,
				nome: text(tecnico.nome),
				email: text(tecnico.email),
				telefone: text(tecnico.telefone),
				empresaId: empresa.id,
				agendaId: text(tecnico.agendaId),
				cidade: text(tecnico.cidade),
				diaAcerto: text(tecnico.diaAcerto),
				turnoAcerto: text(tecnico.turnoAcerto),
				status: text(tecnico.status) || "Ativo",
				observacoes: text(tecnico.observacoes),
			}))
			.filter((tecnico) => tecnico.nome);
	});
}

async function loadEntity(entity) {
	const items = await listVpsDocuments(collectionFor(entity), { limit: 2000 });
	if (entity === "empresas") {
		return sortByName(
			items.map((item) => ({
				...item,
				responsavel:
					typeof item.responsavel === "string"
						? item.responsavel
						: item.responsavel?.nome || "",
				emailResponsavel:
					typeof item.responsavel === "object"
						? item.responsavel?.email || ""
						: item.emailResponsavel || "",
				tipoAtuacao: item.tipoAtuacao || item.atuacao || "Ambos",
				regionais: item.regional ? [item.regional] : item.regionais || [],
			})),
		);
	}
	return entity === "acertos" ? sortAcertos(items) : sortByName(items);
}

// Extraidos pra achado javascript:S3358 (ternario aninhado).
function buildLegacyItens(lancamento, produtosMap) {
	return (Array.isArray(lancamento.itens) ? lancamento.itens : []).map(
		(item) => {
			const produto = produtosMap.get(item.produtoId);
			return {
				produtoId: item.produtoId || "",
				nome: item.nome || produto?.nome || "",
				categoria: item.categoria || produto?.categoria || "",
				unidade: item.unidade || produto?.unidade || "un",
				quantidade: Number(item.quantidade) || 0,
			};
		},
	);
}

function buildLegacyTecnicoLancamentos(acerto, tecnicosMap, empresasMap, produtosMap) {
	return (Array.isArray(acerto.lancamentos) ? acerto.lancamentos : []).map(
		(lancamento) => {
			const tecnico = tecnicosMap.get(lancamento.tecnicoId);
			const empresa = tecnico ? empresasMap.get(tecnico.empresaId) : null;

			return {
				tecnicoId: lancamento.tecnicoId || "",
				tecnicoNome: tecnico?.nome || lancamento.tecnicoNome || "",
				tecnicoEmail: tecnico?.email || lancamento.tecnicoEmail || "",
				empresaId: tecnico?.empresaId || lancamento.empresaId || "",
				empresaNome: empresa?.nome || lancamento.empresaNome || "",
				responsavel: empresa?.responsavel || lancamento.responsavel || "",
				itens: buildLegacyItens(lancamento, produtosMap),
			};
		},
	);
}

function resolveTecnicoLancamentos(acerto, tecnicosMap, empresasMap, produtosMap) {
	if (
		Array.isArray(acerto.tecnicoLancamentos) &&
		acerto.tecnicoLancamentos.length > 0
	) {
		return acerto.tecnicoLancamentos;
	}
	return buildLegacyTecnicoLancamentos(
		acerto,
		tecnicosMap,
		empresasMap,
		produtosMap,
	);
}

export async function fetchAcertoEstoqueData() {
	const [empresas, agendas, produtos, acertos] = await Promise.all([
		loadEntity("empresas"),
		loadEntity("agendas"),
		loadEntity("produtos"),
		loadEntity("acertos"),
	]);

	const tecnicos = sortByName(buildTecnicosFromEmpresas(empresas));
	const empresasMap = new Map(empresas.map((item) => [item.id, item]));
	const tecnicosMap = new Map(tecnicos.map((item) => [item.id, item]));
	const agendasMap = new Map(agendas.map((item) => [item.id, item]));
	const produtosMap = new Map(produtos.map((item) => [item.id, item]));

	const acertosNormalizados = acertos.map((acerto) => {
		const agenda = agendasMap.get(acerto.agendaId);
		const tecnicoLancamentos = resolveTecnicoLancamentos(
			acerto,
			tecnicosMap,
			empresasMap,
			produtosMap,
		);

		const tecnicoNomes = uniqueValues(
			tecnicoLancamentos.map((item) => item.tecnicoNome),
		);
		const empresaNomes = uniqueValues(
			tecnicoLancamentos.map((item) => item.empresaNome),
		);

		return {
			...acerto,
			cidade: acerto.cidade || agenda?.cidade || "",
			turno: acerto.turno || agenda?.turno || "",
			tecnicoLancamentos,
			tecnicoNomes,
			empresaNomes,
			tecnicoNome: acerto.tecnicoNome || tecnicoNomes[0] || "",
			empresaNome: acerto.empresaNome || empresaNomes[0] || "",
			totalTecnicos: acerto.totalTecnicos || tecnicoLancamentos.length,
		};
	});

	return {
		...EMPTY_STORE,
		empresas,
		tecnicos,
		agendas,
		produtos,
		acertos: sortAcertos(acertosNormalizados),
	};
}

export async function saveAcertoEstoqueEntity(entity, item) {
	if (entity === "empresas" || entity === "tecnicos") {
		throw new Error(
			"Empresas e tecnicos devem ser cadastrados no modulo Empresas.",
		);
	}

	const collection = collectionFor(entity);
	const now = new Date().toISOString();
	const payload = item ? { ...item, atualizadoEm: now } : { atualizadoEm: now };
	if (entity === "empresas") {
		payload.atuacao = item?.atuacao || item?.tipoAtuacao || "Ambos";
		payload.regional = item?.regional || item?.regionais?.[0] || "";
		payload.responsavel = {
			nome:
				typeof item?.responsavel === "string"
					? item.responsavel
					: item?.responsavel?.nome || "",
			email: item?.emailResponsavel || item?.responsavel?.email || "",
		};
	}

	if (item?.id) {
		await updateVpsDocument(`${collection}/${item.id}`, payload);
	} else {
		await createVpsDocument(collection, {
			...payload,
			criadoEm: now,
		});
	}

	return fetchAcertoEstoqueData();
}

export async function deleteAcertoEstoqueEntity(entity, id) {
	await deleteVpsDocument(`${collectionFor(entity)}/${id}`);
	return fetchAcertoEstoqueData();
}

function buildCodigoAcerto(date = new Date()) {
	const datePart = [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("");
	const timePart = [
		String(date.getHours()).padStart(2, "0"),
		String(date.getMinutes()).padStart(2, "0"),
		String(date.getSeconds()).padStart(2, "0"),
	].join("");
	return `ACE-${datePart}-${timePart}`;
}

export async function createAcertoEstoqueLancamento(payload) {
	const now = new Date();
	const acerto = payload
		? {
				...payload,
				codigo: payload.codigo || buildCodigoAcerto(now),
				createdAt: now.toISOString(),
				updatedAt: now.toISOString(),
			}
		: {
				codigo: buildCodigoAcerto(now),
				createdAt: now.toISOString(),
				updatedAt: now.toISOString(),
			};

	const ref = await createVpsDocument(COLLECTIONS.acertos, acerto);
	const saved = {
		id: ref.id,
		...acerto,
	};

	return {
		store: await fetchAcertoEstoqueData(),
		acerto: saved,
	};
}

export async function deleteAcertoEstoqueLancamento(id) {
	await deleteVpsDocument(`${COLLECTIONS.acertos}/${id}`);
	return fetchAcertoEstoqueData();
}

export async function replaceAcertoEstoqueStore(store = EMPTY_STORE) {
	await Promise.all(
		Object.keys(COLLECTIONS).flatMap((entity) =>
			(Array.isArray(store[entity]) ? store[entity] : []).map((item) => {
				if (!item?.id) return createVpsDocument(COLLECTIONS[entity], item);
				return setVpsDocument(`${COLLECTIONS[entity]}/${item.id}`, item);
			}),
		),
	);
	return fetchAcertoEstoqueData();
}
