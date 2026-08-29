import { COLLECTIONS } from "../../../constants/dataCollections";
import {
	createVpsDocument,
	deleteVpsDocument,
	getVpsDocument,
	listAllVpsDocuments,
	requestVpsApi,
	updateVpsDocument,
} from "../../../services/vpsApiClient";
import {
	buscarEmpresasTecnicos,
	normalizeText,
} from "../../empresasTecnicos/services/empresasTecnicosService";
import { buscarRegionais } from "../../regionais/services/regionaisService";

const CONFIG_PATH = `${COLLECTIONS.LOGISTICA_CONFIG}/global`;

const text = (value) => String(value || "").trim();
const money = (value) => {
	const raw = String(value ?? "")
		.replace(/[^\d,.-]/g, "")
		.trim();
	if (!raw) return 0;
	const hasComma = raw.includes(",");
	const hasDot = raw.includes(".");
	let normalized = raw;
	if (hasComma && hasDot) {
		normalized = raw.replace(/\./g, "").replace(",", ".");
	} else if (hasComma) {
		normalized = raw.replace(",", ".");
	}
	const number = Number(normalized);
	return Number.isFinite(number) ? number : 0;
};

export const LOGISTICA_PROVIDERS = [
	{ id: "manual", nome: "Cotação manual", tipo: "manual", ativo: true },
	{
		id: "lalamove",
		nome: "Lalamove",
		tipo: "api",
		ativo: false,
		environment: "sandbox",
		market: "BR",
		serviceType: "LALAGO",
		language: "pt_BR",
	},
	{ id: "uber_direct", nome: "Uber Direct", tipo: "api", ativo: false },
	{ id: "loggi", nome: "Loggi", tipo: "api", ativo: false },
	{
		id: "ifood_sob_demanda",
		nome: "iFood Sob Demanda",
		tipo: "api",
		ativo: false,
	},
];

export const COTACAO_STATUS = [
	{ value: "rascunho", label: "Rascunho" },
	{ value: "cotado", label: "Cotado" },
	{ value: "aprovado", label: "Aprovado" },
	{ value: "solicitado", label: "Solicitado" },
	{ value: "coletado", label: "Coletado" },
	{ value: "entregue", label: "Entregue" },
	{ value: "cancelado", label: "Cancelado" },
];

export const DEFAULT_LOGISTICA_CONFIG = {
	providers: LOGISTICA_PROVIDERS,
	providerPreferencial: "manual",
	cotacaoAutomaticaAtiva: false,
	exigeAprovacaoAntesPedido: true,
	observacoes: "",
};

export const DEFAULT_PONTO_FORM = {
	nome: "",
	cidade: "",
	regional: "",
	endereco: "",
	numero: "",
	bairro: "",
	complemento: "",
	referencia: "",
	contatoNome: "",
	contatoTelefone: "",
	lat: "",
	lng: "",
	ativo: true,
};

export const DEFAULT_COTACAO_FORM = {
	cliente: "",
	codigoCliente: "",
	telefone: "",
	os: "",
	cidade: "",
	regional: "",
	enderecoColeta: "",
	numeroColeta: "",
	bairroColeta: "",
	complementoColeta: "",
	latColeta: "",
	lngColeta: "",
	pontoId: "",
	fornecedor: "manual",
	veiculo: "Moto",
	valorEstimado: "",
	prazoEstimado: "",
	distanciaKm: "",
	status: "cotado",
	origem: "manual",
	observacoes: "",
	apiPayload: null,
	lalamoveQuotationId: "",
};

export function normalizeProvider(provider = {}) {
	const id = text(provider.id || provider.nome)
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "_");
	return {
		id,
		nome: text(provider.nome || provider.label || id),
		tipo: text(provider.tipo) || "manual",
		ativo: provider.ativo !== false,
		baseUrl: text(provider.baseUrl),
		credentialRef: text(provider.credentialRef),
		apiKey: text(provider.apiKey),
		apiSecret: text(provider.apiSecret),
		apiSecretConfigured: Boolean(provider.apiSecretConfigured),
		environment: text(provider.environment) || "sandbox",
		market: text(provider.market) || "BR",
		serviceType: text(provider.serviceType) || "LALAGO",
		language: text(provider.language) || "pt_BR",
		observacoes: text(provider.observacoes),
	};
}

export function normalizePonto(id, data = {}) {
	return {
		id,
		nome: text(data.nome),
		cidade: text(data.cidade),
		regional: text(data.regional),
		endereco: text(data.endereco),
		numero: text(data.numero),
		bairro: text(data.bairro),
		complemento: text(data.complemento),
		referencia: text(data.referencia),
		contatoNome: text(data.contatoNome || data.contato?.nome),
		contatoTelefone: text(data.contatoTelefone || data.contato?.telefone),
		lat: text(data.lat),
		lng: text(data.lng),
		ativo: data.ativo !== false,
		criadoEm: data.criadoEm || data.criado_em || "",
		atualizadoEm: data.atualizadoEm || data.atualizado_em || "",
	};
}

export function normalizeCotacao(id, data = {}) {
	return {
		id,
		cliente: text(data.cliente),
		codigoCliente: text(data.codigoCliente || data.codigo_cliente),
		telefone: text(data.telefone),
		os: text(data.os),
		cidade: text(data.cidade),
		regional: text(data.regional),
		enderecoColeta: text(data.enderecoColeta || data.endereco_coleta),
		numeroColeta: text(data.numeroColeta || data.numero_coleta),
		bairroColeta: text(data.bairroColeta || data.bairro_coleta),
		complementoColeta: text(data.complementoColeta || data.complemento_coleta),
		latColeta: text(data.latColeta || data.lat_coleta),
		lngColeta: text(data.lngColeta || data.lng_coleta),
		pontoId: text(data.pontoId || data.ponto_id),
		pontoNome: text(data.pontoNome || data.ponto_nome),
		pontoEndereco: text(data.pontoEndereco || data.ponto_endereco),
		fornecedor: text(data.fornecedor) || "manual",
		fornecedorNome: text(data.fornecedorNome || data.fornecedor_nome),
		veiculo: text(data.veiculo),
		valorEstimado: Number(data.valorEstimado ?? data.valor_estimado ?? 0),
		prazoEstimado: text(data.prazoEstimado || data.prazo_estimado),
		distanciaKm: text(data.distanciaKm || data.distancia_km),
		status: text(data.status) || "cotado",
		origem: text(data.origem) || "manual",
		observacoes: text(data.observacoes),
		apiPayload: data.apiPayload || null,
		lalamoveQuotationId: text(
			data.lalamoveQuotationId || data.lalamove_quotation_id,
		),
		criadoPor: text(data.criadoPor || data.criado_por),
		criadoEm: data.criadoEm || data.criado_em || "",
		atualizadoEm: data.atualizadoEm || data.atualizado_em || "",
	};
}

export function buildPontoPayload(form = {}) {
	return {
		nome: text(form.nome),
		cidade: text(form.cidade),
		regional: text(form.regional),
		endereco: text(form.endereco),
		numero: text(form.numero),
		bairro: text(form.bairro),
		complemento: text(form.complemento),
		referencia: text(form.referencia),
		contatoNome: text(form.contatoNome),
		contatoTelefone: text(form.contatoTelefone),
		lat: text(form.lat),
		lng: text(form.lng),
		ativo: form.ativo !== false,
	};
}

export function buildCotacaoPayload(
	form = {},
	ponto = null,
	config = DEFAULT_LOGISTICA_CONFIG,
	user = null,
) {
	const provider = (config.providers || []).find(
		(item) => item.id === form.fornecedor,
	);
	return {
		cliente: text(form.cliente),
		codigoCliente: text(form.codigoCliente),
		telefone: text(form.telefone),
		os: text(form.os),
		cidade: text(form.cidade || ponto?.cidade),
		regional: text(form.regional || ponto?.regional),
		enderecoColeta: text(form.enderecoColeta),
		numeroColeta: text(form.numeroColeta),
		bairroColeta: text(form.bairroColeta),
		complementoColeta: text(form.complementoColeta),
		latColeta: text(form.latColeta),
		lngColeta: text(form.lngColeta),
		pontoId: text(form.pontoId || ponto?.id),
		pontoNome: text(ponto?.nome),
		pontoEndereco: [
			ponto?.endereco,
			ponto?.numero,
			ponto?.bairro,
			ponto?.cidade,
		]
			.filter(Boolean)
			.join(", "),
		fornecedor: text(form.fornecedor) || "manual",
		fornecedorNome: text(provider?.nome || form.fornecedor || "Cotação manual"),
		veiculo: text(form.veiculo),
		valorEstimado: money(form.valorEstimado),
		prazoEstimado: text(form.prazoEstimado),
		distanciaKm: text(form.distanciaKm),
		status: text(form.status) || "cotado",
		origem: text(form.origem) || "manual",
		observacoes: text(form.observacoes),
		apiPayload: form.apiPayload || null,
		lalamoveQuotationId: text(form.lalamoveQuotationId),
		criadoPor: user?.nome || user?.email || user?.uid || "",
	};
}

export async function buscarLogisticaConfig() {
	const doc = await requestVpsApi("/logistica/config").catch(async () => {
		const fallback = await getVpsDocument(CONFIG_PATH).catch(() => null);
		return fallback || null;
	});
	if (!doc) return DEFAULT_LOGISTICA_CONFIG;
	return {
		...DEFAULT_LOGISTICA_CONFIG,
		...doc,
		providers: (doc.providers?.length
			? doc.providers
			: DEFAULT_LOGISTICA_CONFIG.providers
		).map(normalizeProvider),
	};
}

export async function salvarLogisticaConfig(config) {
	return requestVpsApi("/logistica/config", {
		method: "PUT",
		body: JSON.stringify({
			...DEFAULT_LOGISTICA_CONFIG,
			...config,
			providers: (config.providers || DEFAULT_LOGISTICA_CONFIG.providers).map(
				normalizeProvider,
			),
			atualizadoEm: new Date().toISOString(),
		}),
	});
}

export async function buscarPontosLogistica() {
	return (
		await listAllVpsDocuments(COLLECTIONS.LOGISTICA_PONTOS, { pageSize: 500 })
	)
		.map((item) => normalizePonto(item.id, item))
		.sort(
			(a, b) =>
				a.cidade.localeCompare(b.cidade, "pt-BR") ||
				a.nome.localeCompare(b.nome, "pt-BR"),
		);
}

export async function salvarPontoLogistica(form) {
	const payload = buildPontoPayload(form);
	if (!payload.nome) throw new Error("Informe o nome do ponto.");
	if (!payload.cidade) throw new Error("Informe a cidade do ponto.");
	const data = { ...payload, atualizadoEm: new Date().toISOString() };
	if (form.id) {
		await updateVpsDocument(`${COLLECTIONS.LOGISTICA_PONTOS}/${form.id}`, data);
		return form.id;
	}
	const ref = await createVpsDocument(COLLECTIONS.LOGISTICA_PONTOS, {
		...data,
		criadoEm: new Date().toISOString(),
	});
	return ref.id;
}

export async function excluirPontoLogistica(id) {
	await deleteVpsDocument(`${COLLECTIONS.LOGISTICA_PONTOS}/${id}`);
}

export async function buscarCotacoesLogistica() {
	return (
		await listAllVpsDocuments(COLLECTIONS.LOGISTICA_COTACOES, { pageSize: 500 })
	)
		.map((item) => normalizeCotacao(item.id, item))
		.sort((a, b) =>
			String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")),
		);
}

export async function salvarCotacaoManual(
	form,
	pontos = [],
	config = DEFAULT_LOGISTICA_CONFIG,
	user = null,
) {
	const ponto = pontos.find((item) => item.id === form.pontoId) || null;
	const payload = buildCotacaoPayload(form, ponto, config, user);
	if (!payload.cliente) throw new Error("Informe o cliente.");
	if (!payload.cidade) throw new Error("Informe a cidade.");
	if (!payload.enderecoColeta) throw new Error("Informe o endereço de coleta.");
	if (!payload.pontoId) throw new Error("Selecione o ponto estratégico.");

	const data = {
		...payload,
		atualizadoEm: new Date().toISOString(),
	};

	if (form.id) {
		await updateVpsDocument(
			`${COLLECTIONS.LOGISTICA_COTACOES}/${form.id}`,
			data,
		);
		return form.id;
	}
	const ref = await createVpsDocument(COLLECTIONS.LOGISTICA_COTACOES, {
		...data,
		criadoEm: new Date().toISOString(),
	});
	return ref.id;
}

export async function excluirCotacaoLogistica(id) {
	await deleteVpsDocument(`${COLLECTIONS.LOGISTICA_COTACOES}/${id}`);
}

export async function obterCidadesEmpresas() {
	const [empresas, regionais] = await Promise.all([
		buscarEmpresasTecnicos().catch(() => []),
		buscarRegionais().catch(() => []),
	]);
	const cidades = new Map();
	const addCidade = (cidade, regional, empresaNome = "") => {
		const key = normalizeText(cidade);
		if (!key) return;
		if (!cidades.has(key)) {
			cidades.set(key, {
				cidade: text(cidade),
				regional: text(regional),
				empresas: new Set(),
			});
		}
		const row = cidades.get(key);
		if (!row.regional && regional) row.regional = text(regional);
		if (empresaNome) row.empresas.add(empresaNome);
	};

	regionais.forEach((regional) => {
		(regional.cidades || []).forEach((cidade) =>
			addCidade(cidade, regional.nome),
		);
	});

	empresas.forEach((empresa) => {
		(empresa.cidades || []).forEach((cidade) => {
			addCidade(cidade, empresa.regional, empresa.nome);
		});
		(empresa.tecnicos || []).forEach((tecnico) => {
			addCidade(tecnico.cidade, empresa.regional, empresa.nome);
		});
	});
	return [...cidades.values()]
		.map((item) => ({
			...item,
			empresas: [...item.empresas],
		}))
		.sort((a, b) => a.cidade.localeCompare(b.cidade, "pt-BR"));
}

function pickFirst(...values) {
	return values.map(text).find(Boolean) || "";
}

export function normalizeClienteLogistica(id, data = {}) {
	const endereco = pickFirst(
		data.endereco,
		data.endereco_completo,
		data.enderecoCompleto,
		[data.logradouro, data.numero, data.bairro].filter(Boolean).join(", "),
	);
	return {
		id,
		cliente: pickFirst(
			data.cliente,
			data.nome_cliente,
			data.nomeCliente,
			data.assinante,
			data.nome,
		),
		codigoCliente: pickFirst(
			data.codigo_cliente,
			data.codigoCliente,
			data.cod_cliente,
			data.contrato,
			data.id_cliente,
		),
		telefone: pickFirst(data.telefone, data.celular, data.contato, data.fone),
		os: pickFirst(data.os, data.num_os, data.numero_os, data.ordem_servico),
		cidade: pickFirst(data.cidade),
		regional: pickFirst(data.regional, data.filial),
		enderecoColeta: endereco,
		numeroColeta: pickFirst(data.numero),
		bairroColeta: pickFirst(data.bairro),
		complementoColeta: pickFirst(data.complemento),
	};
}

export async function buscarClientesLogistica() {
	const docs = await listAllVpsDocuments("ordens_abertas", {
		pageSize: 1000,
		max: 20000,
	}).catch(() => []);
	const seen = new Set();
	return docs
		.map((item) => normalizeClienteLogistica(item.id, item))
		.filter((item) => {
			const key = normalizeText(
				`${item.codigoCliente}-${item.cliente}-${item.os}`,
			);
			if (!item.cliente || seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));
}

export function buscarSugestoesClientes(clientes = [], query = "", limit = 8) {
	const term = normalizeText(query);
	if (!term || term.length < 2) return [];
	return clientes
		.filter((cliente) =>
			normalizeText(
				[
					cliente.cliente,
					cliente.codigoCliente,
					cliente.os,
					cliente.cidade,
					cliente.telefone,
				].join(" "),
			).includes(term),
		)
		.slice(0, limit);
}

export async function solicitarCotacaoLalamove(form = {}, pontos = []) {
	const ponto = pontos.find((item) => item.id === form.pontoId) || {};
	const pickupAddress = [
		form.enderecoColeta,
		form.numeroColeta,
		form.bairroColeta,
		form.cidade,
	]
		.filter(Boolean)
		.join(", ");
	const dropoffAddress = [
		ponto.endereco,
		ponto.numero,
		ponto.bairro,
		ponto.cidade,
	]
		.filter(Boolean)
		.join(", ");
	return requestVpsApi("/logistica/lalamove/quote", {
		method: "POST",
		body: JSON.stringify({
			cliente: form.cliente,
			telefone: form.telefone,
			enderecoColeta: pickupAddress,
			pontoEndereco: dropoffAddress,
			pontoNome: ponto.nome,
			pontoTelefone: ponto.contatoTelefone,
			latColeta: form.latColeta,
			lngColeta: form.lngColeta,
			pontoLat: ponto.lat,
			pontoLng: ponto.lng,
			observacoes: form.observacoes,
		}),
	});
}

export async function geocodificarEndereco(payload = {}) {
	return requestVpsApi("/logistica/geocode", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export async function criarPontosBasePorCidades(
	cidades = [],
	pontosExistentes = [],
) {
	const existing = new Set(
		pontosExistentes.map((item) => normalizeText(item.cidade)),
	);
	let created = 0;
	for (const item of cidades) {
		if (existing.has(normalizeText(item.cidade))) continue;
		await salvarPontoLogistica({
			nome: `Ponto ${item.cidade}`,
			cidade: item.cidade,
			regional: item.regional,
			ativo: true,
			referencia:
				"Cadastro inicial criado pela Logística. Complete o endereço antes de usar.",
		});
		created += 1;
	}
	return created;
}
