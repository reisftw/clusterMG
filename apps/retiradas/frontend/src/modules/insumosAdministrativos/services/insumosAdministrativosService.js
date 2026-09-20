import { COLLECTIONS } from "../../../constants/dataCollections";
import {
	createVpsDocument,
	getVpsDocument,
	listVpsDocuments,
	requestVpsApi,
	setVpsDocument,
	updateVpsDocument,
} from "../../../services/vpsApiClient";

const PRODUTOS = COLLECTIONS.INSUMOS_ADMINISTRATIVOS_PRODUTOS;
const RETIRADAS = COLLECTIONS.INSUMOS_ADMINISTRATIVOS_RETIRADAS;
const REPOSICOES = COLLECTIONS.INSUMOS_ADMINISTRATIVOS_REPOSICOES;
const REQUISICOES = COLLECTIONS.INSUMOS_ADMINISTRATIVOS_REQUISICOES;
const CONFIG = COLLECTIONS.INSUMOS_ADMINISTRATIVOS_CONFIG;
const CONFIG_DOC = `${CONFIG}/geral`;

export const DEFAULT_INSUMOS_CONFIG = {
	unidades: ["Unidade", "Caixa", "Pacote", "Kit", "Bloco", "Rolo"],
	setores: ["Administrativo", "Financeiro", "Operação", "RH", "Supervisão"],
	categorias: ["Papelaria", "Limpeza", "Tecnologia", "Copa", "Uso geral"],
	bases: [{ id: "sede", nome: "Sede", ativo: true }],
	permissoesCategoria: { perfis: {}, usuarios: {} },
};

const text = (value) => String(value || "").trim();
const number = (value) => Math.max(0, Number(value || 0));
const uniqueList = (items = []) =>
	[...new Set(items.map(text).filter(Boolean))].sort((a, b) =>
		a.localeCompare(b),
	);

function normalizeConfig(config = {}) {
	const safeConfig = config || {};
	const bases = (
		safeConfig.bases?.length ? safeConfig.bases : DEFAULT_INSUMOS_CONFIG.bases
	)
		.map((base) => {
			if (typeof base === "string") {
				return { id: normalizeId(base), nome: text(base), ativo: true };
			}
			const nome = text(base?.nome || base?.name || base?.id);
			return {
				id: text(base?.id) || normalizeId(nome),
				nome,
				ativo: base?.ativo !== false,
			};
		})
		.filter((base) => base.nome);
	return {
		unidades: uniqueList(
			safeConfig.unidades?.length
				? safeConfig.unidades
				: DEFAULT_INSUMOS_CONFIG.unidades,
		),
		setores: uniqueList(
			safeConfig.setores?.length
				? safeConfig.setores
				: DEFAULT_INSUMOS_CONFIG.setores,
		),
		categorias: uniqueList(
			safeConfig.categorias?.length
				? safeConfig.categorias
				: DEFAULT_INSUMOS_CONFIG.categorias,
		),
		bases: bases.length ? bases : DEFAULT_INSUMOS_CONFIG.bases,
		permissoesCategoria: {
			perfis:
				safeConfig.permissoesCategoria?.perfis ||
				safeConfig.categoriaPermissoes?.perfis ||
				{},
			usuarios:
				safeConfig.permissoesCategoria?.usuarios ||
				safeConfig.categoriaPermissoes?.usuarios ||
				{},
		},
	};
}

function normalizeId(value) {
	return text(value)
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export async function listarInsumosAdministrativos() {
	const [produtos, retiradas, reposicoes, config] = await Promise.all([
		listVpsDocuments(PRODUTOS, { limit: 1000 }),
		listVpsDocuments(RETIRADAS, { limit: 2000 }),
		listVpsDocuments(REPOSICOES, { limit: 2000 }),
		getVpsDocument(CONFIG_DOC).catch(() => null),
	]);

	return {
		config: normalizeConfig(config),
		produtos: produtos
			.filter((produto) => produto.status !== "excluido")
			.sort((a, b) => text(a.nome).localeCompare(text(b.nome))),
		retiradas: retiradas.sort((a, b) =>
			String(b.retirado_em || b.criado_em || "").localeCompare(
				String(a.retirado_em || a.criado_em || ""),
			),
		),
		reposicoes: reposicoes.sort((a, b) =>
			String(b.reposto_em || b.criado_em || "").localeCompare(
				String(a.reposto_em || a.criado_em || ""),
			),
		),
	};
}

export async function salvarProdutoAdministrativo(dados = {}, usuario = {}) {
	const produtoId = text(dados.id);
	const existing = produtoId
		? await getVpsDocument(`${PRODUTOS}/${produtoId}`).catch(() => null)
		: null;
	const estoqueAntes = number(existing?.estoque_atual);
	const estoqueDepois = number(dados.estoque_atual);
	const actor = usuario?.nome || usuario?.email || "";
	const now = new Date().toISOString();
	const payload = {
		nome: text(dados.nome),
		unidade: text(dados.unidade) || "Unidade",
		categoria: text(dados.categoria),
		base_id: text(dados.base_id || dados.baseId),
		base_nome: text(dados.base_nome || dados.baseNome),
		estoque_atual: estoqueDepois,
		estoque_minimo: number(dados.estoque_ideal ?? dados.estoque_minimo),
		estoque_ideal: number(dados.estoque_ideal ?? dados.estoque_minimo),
		fornecedor: text(dados.fornecedor),
		observacao: text(dados.observacao),
		status: dados.status || "ativo",
		atualizado_em: now,
		atualizado_por: actor,
	};

	if (!payload.nome) throw new Error("Nome do produto obrigatorio.");

	if (produtoId) {
		await updateVpsDocument(`${PRODUTOS}/${produtoId}`, payload);
		let reposicao = null;
		if (estoqueDepois > estoqueAntes) {
			reposicao = {
				produto_id: produtoId,
				produto_nome: payload.nome,
				unidade: payload.unidade,
				categoria: payload.categoria,
				base_id: payload.base_id,
				base_nome: payload.base_nome,
				quantidade: estoqueDepois - estoqueAntes,
				estoque_antes: estoqueAntes,
				estoque_depois: estoqueDepois,
				reposto_em: now,
				criado_em: now,
				criado_por: actor,
				observacao: payload.observacao,
			};
			const ref = await createVpsDocument(REPOSICOES, reposicao);
			reposicao = { id: ref.id, ...reposicao };
		}
		return { id: produtoId, ...payload, reposicao };
	}

	const ref = await createVpsDocument(PRODUTOS, {
		...payload,
		criado_em: payload.atualizado_em,
		criado_por: payload.atualizado_por,
	});
	return { id: ref.id, ...payload };
}

export async function atualizarStatusProdutoAdministrativo(
	id,
	status,
	usuario = {},
) {
	const produtoId = text(id);
	if (!produtoId) throw new Error("Produto obrigatorio.");

	const payload = {
		status: text(status) || "ativo",
		atualizado_em: new Date().toISOString(),
		atualizado_por: usuario?.nome || usuario?.email || "",
	};

	await updateVpsDocument(`${PRODUTOS}/${produtoId}`, payload);
	return { id: produtoId, ...payload };
}

export async function registrarRetiradaAdministrativa(
	dados = {},
	usuario = {},
) {
	const produtoId = text(dados.produto_id);
	const quantidade = number(dados.quantidade);
	const responsavel = text(dados.responsavel);
	const setor = text(dados.setor);

	if (!produtoId) throw new Error("Produto obrigatorio.");
	if (!responsavel) throw new Error("Responsavel obrigatorio.");
	if (!setor) throw new Error("Setor obrigatorio.");
	if (quantidade <= 0) throw new Error("Quantidade deve ser maior que zero.");

	const produto = await getVpsDocument(`${PRODUTOS}/${produtoId}`);
	if (!produto || produto.status === "excluido")
		throw new Error("Produto nao encontrado.");

	const estoqueAtual = number(produto.estoque_atual);
	if (quantidade > estoqueAtual) {
		throw new Error(
			`Estoque insuficiente. Disponivel: ${estoqueAtual} ${produto.unidade || ""}.`,
		);
	}

	const now = new Date().toISOString();
	const retirada = {
		produto_id: produtoId,
		produto_nome: produto.nome,
		unidade: produto.unidade,
		categoria: produto.categoria || "",
		base_id: produto.base_id || "",
		base_nome: produto.base_nome || "",
		quantidade,
		responsavel,
		setor,
		observacao: text(dados.observacao),
		retirado_em: now,
		criado_em: now,
		criado_por: usuario?.nome || usuario?.email || "",
		estoque_antes: estoqueAtual,
		estoque_depois: estoqueAtual - quantidade,
	};

	const ref = await createVpsDocument(RETIRADAS, retirada);
	await updateVpsDocument(`${PRODUTOS}/${produtoId}`, {
		estoque_atual: estoqueAtual - quantidade,
		atualizado_em: now,
		atualizado_por: retirada.criado_por,
	});

	return { id: ref.id, ...retirada };
}

export async function salvarConfigInsumosAdministrativos(
	dados = {},
	usuario = {},
) {
	const now = new Date().toISOString();
	const payload = {
		...normalizeConfig(dados),
		atualizado_em: now,
		atualizado_por: usuario?.nome || usuario?.email || "",
	};
	await setVpsDocument(CONFIG_DOC, payload);
	return payload;
}

export async function listarInsumosRequisicoes({
	status = "todos",
	limit = 20,
	offset = 0,
} = {}) {
	const params = new URLSearchParams({
		status,
		limit: String(limit),
		offset: String(offset),
	});
	const response = await requestVpsApi(
		`/insumos/requisicoes?${params.toString()}`,
	);
	return {
		items: response?.items || [],
		total: Number(response?.total || 0),
		limit: Number(response?.limit || limit),
		offset: Number(response?.offset || offset),
		canManage: Boolean(response?.canManage),
	};
}

export async function criarInsumosRequisicao(dados = {}) {
	const response = await requestVpsApi("/insumos/requisicoes", {
		method: "POST",
		body: JSON.stringify({
			produtoId: text(dados.produto_id || dados.produtoId),
			quantidade: number(dados.quantidade),
			observacao: text(dados.observacao),
		}),
	});
	return response?.item;
}

export async function aprovarInsumosRequisicao(id) {
	const response = await requestVpsApi(
		`/insumos/requisicoes/${encodeURIComponent(id)}/aprovar`,
		{
			method: "POST",
			body: JSON.stringify({}),
		},
	);
	return response?.item;
}

export async function rejeitarInsumosRequisicao(id, motivo = "") {
	const response = await requestVpsApi(
		`/insumos/requisicoes/${encodeURIComponent(id)}/rejeitar`,
		{
			method: "POST",
			body: JSON.stringify({ motivo }),
		},
	);
	return response?.item;
}

export async function entregarInsumosRequisicao(id, observacao = "") {
	const response = await requestVpsApi(
		`/insumos/requisicoes/${encodeURIComponent(id)}/entregar`,
		{
			method: "POST",
			body: JSON.stringify({ observacao }),
		},
	);
	return response?.item;
}

export { REQUISICOES as INSUMOS_REQUISICOES_COLLECTION };
