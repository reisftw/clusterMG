import {
	createRotCompany,
	createRotTechnician,
	deleteRotCompany,
	fetchRotCompanies,
	fetchRotRegionals,
	fetchRotTechnicians,
	fetchRotUsers,
	updateRotCompany,
	updateRotTechnician,
} from "../../../api/rotApi";

export const LOGO_MAX_BYTES = 450 * 1024;

const text = (value) => String(value || "").trim();

export function normalizeText(value) {
	return text(value)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

export function slugifyEmpresa(value) {
	return normalizeText(value)
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

export const OPERATIONAL_AREAS = Object.freeze([
	{ value: "delivery", label: "Delivery" },
	{ value: "field_service", label: "Field Service" },
]);

export const OPERATIONAL_AREA_LABELS = Object.freeze(
	Object.fromEntries(OPERATIONAL_AREAS.map((area) => [area.value, area.label])),
);

export const normalizeOperationalArea = (value) => {
	const key = normalizeText(value).replace(/[\s-]+/g, "_");
	if (["field", "field_service", "fieldservice", "manutencao"].includes(key)) return "field_service";
	if (["delivery", "ativacao", "retirada"].includes(key)) return "delivery";
	if (key === "rot") return "rot";
	return "delivery";
};

export const normalizeEmpresaStatus = (value) => {
	const key = normalizeText(value);
	if (key === "inativa" || key === "inativo") return "Inativa";
	return "Ativa";
};

export const DEFAULT_EMPRESA_TECNICOS_FORM = Object.freeze({
	nome: "",
	cnpj: "",
	slug: "",
	logo: "",
	status: "Ativa",
	atuacao: "Ambos",
	agenteAutorizado: false,
	agenteCidades: [],
	responsavel: { nome: "", email: "" },
	gruposOperacionais: {
		delivery: {
			lider: { nome: "", telefone: "", email: "" },
			backoffices: [{ nome: "", telefone: "", email: "" }],
			supervisor: { nome: "", telefone: "", email: "" },
		},
		field_service: {
			lider: { nome: "", telefone: "", email: "" },
			backoffices: [{ nome: "", telefone: "", email: "" }],
			supervisor: { nome: "", telefone: "", email: "" },
		},
	},
	regional: "",
	regionais: [],
	supervisor: { uid: "", nome: "", email: "" },
	cidades: [],
	tecnicos: [],
	observacoes: "",
});

function cleanList(items = []) {
	return (Array.isArray(items) ? items : String(items || "").split(/[,\n;]/))
		.map((item) => text(item))
		.filter(Boolean);
}

function normalizeAtuacao(value) {
	const key = normalizeText(value);
	if (key === "manutencao") return "Manutencao";
	if (key === "ativacao") return "Ativacao";
	return "Ambos";
}

function areaToScopes(area, scopes = []) {
	const cleanScopes = cleanList(scopes).map((item) => item.toUpperCase());
	if (cleanScopes.length) return cleanScopes;
	const normalized = normalizeOperationalArea(area);
	if (normalized === "field_service") return ["FIELD"];
	if (normalized === "delivery") return ["DELIVERY"];
	return ["ROT"];
}

function scopesToArea(scopes = [], fallback = "") {
	const clean = cleanList(scopes).map((item) => item.toUpperCase());
	if (clean.includes("FIELD")) return "field_service";
	if (clean.includes("DELIVERY")) return "delivery";
	return normalizeOperationalArea(fallback);
}

function normalizePessoa(value = {}) {
	return {
		uid: text(value?.uid || value?.id),
		nome: text(value?.nome || value?.name),
		telefone: text(value?.telefone || value?.phone),
		email: text(value?.email),
	};
}

function emptyGroups() {
	return structuredClone(DEFAULT_EMPRESA_TECNICOS_FORM.gruposOperacionais);
}

function normalizeTecnico(item = {}) {
	const operationScopes = areaToScopes(item.areaOperacional || item.operationalArea, item.operationScopes);
	return {
		id: text(item.id) || crypto.randomUUID(),
		nome: text(item.nome || item.name),
		email: text(item.email),
		emailHubsoft: text(item.emailHubsoft || item.email_hubsoft || item.emailHubSoft || item.hubsoftEmail || item.email),
		telefone: text(item.telefone || item.phone),
		cidade: text(item.cidade || item.cityName),
		areaOperacional: scopesToArea(operationScopes, item.areaOperacional || item.operationalArea),
		operationScopes,
		supervisor: normalizePessoa(item.supervisor || {}),
		agendaId: text(item.agendaId),
		diaAcerto: text(item.diaAcerto),
		turnoAcerto: text(item.turnoAcerto),
		status: text(item.status) || "Ativo",
		observacoes: text(item.observacoes || item.notes),
	};
}

function normalizeEmpresa(item = {}) {
	const regionais = cleanList(item.regionalNames || item.regionais || item.regional);
	const tecnicos = Array.isArray(item.technicians) ? item.technicians.map(normalizeTecnico) : [];
	return {
		id: text(item.id),
		nome: text(item.name || item.nome),
		cnpj: text(item.cnpj),
		slug: text(item.slug) || slugifyEmpresa(item.name || item.nome || item.id),
		logo: text(item.logoUrl || item.logo),
		status: normalizeEmpresaStatus(item.status),
		atuacao: normalizeAtuacao(item.atuacao),
		agenteAutorizado: Boolean(item.authorizedAgent || item.agenteAutorizado),
		agenteCidades: cleanList(item.agentNames || item.agenteCidades),
		responsavel: {
			nome: text(item.responsible?.name || item.responsavel?.nome),
			email: text(item.responsible?.email || item.responsavel?.email),
		},
		gruposOperacionais: item.gruposOperacionais || emptyGroups(),
		regional: regionais[0] || "",
		regionais,
		regionalIds: Array.isArray(item.regionalIds) ? item.regionalIds : [],
		agentIds: Array.isArray(item.agentIds) ? item.agentIds : [],
		operationScopes: cleanList(item.operationScopes).length ? item.operationScopes : ["ROT"],
		supervisor: normalizePessoa(item.supervisor || {}),
		cidades: cleanList(item.cidades),
		tecnicos,
		observacoes: text(item.notes || item.observacoes),
		criado_em: item.createdAt || item.criado_em || null,
		atualizado_em: item.updatedAt || item.atualizado_em || null,
	};
}

function companyPayloadFromForm(form = {}, regionals = []) {
	const selectedRegionalNames = cleanList(form.regionais || form.regional);
	const regionalIds = regionals
		.filter((regional) => selectedRegionalNames.some((name) => normalizeText(name) === normalizeText(regional.name || regional.nome)))
		.map((regional) => regional.id);
	return {
		name: text(form.nome),
		cnpj: text(form.cnpj),
		logoUrl: text(form.logo),
		status: normalizeEmpresaStatus(form.status),
		atuacao: normalizeAtuacao(form.atuacao),
		authorizedAgent: Boolean(form.agenteAutorizado),
		responsible: {
			name: text(form.responsavel?.nome),
			email: text(form.responsavel?.email),
		},
		regionalIds: regionalIds.length ? regionalIds : form.regionalIds || [],
		agentIds: form.agentIds || [],
		operationScopes: form.operationScopes || ["ROT"],
		notes: text(form.observacoes),
	};
}

function technicianPayloadFromForm(tech = {}, company, regionals = []) {
	const regionais = cleanList(company.regionais || company.regional);
	const regional =
		regionals.find((item) => regionais.some((name) => normalizeText(name) === normalizeText(item.name || item.nome))) ||
		null;
	const cityName = text(tech.cidade);
	const city = (regional?.cities || regional?.cidades || []).find((item) => normalizeText(item.name || item.nome) === normalizeText(cityName));
	return {
		name: text(tech.nome),
		email: text(tech.emailHubsoft || tech.email),
		phone: text(tech.telefone),
		cityName,
		cityId: city?.id || "",
		companyId: company.id,
		regionalId: regional?.id || company.regionalIds?.[0] || "",
		operationalArea: normalizeOperationalArea(tech.areaOperacional),
		operationScopes: areaToScopes(tech.areaOperacional, tech.operationScopes),
		status: text(tech.status) || "Ativo",
		notes: text(tech.observacoes),
	};
}

export async function buscarEmpresasTecnicos() {
	return (await fetchRotCompanies()).map(normalizeEmpresa).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function buscarEmpresaPorSlug(slug) {
	const normalizedSlug = text(slug);
	const empresas = await buscarEmpresasTecnicos();
	return empresas.find((item) => item.slug === normalizedSlug || item.id === normalizedSlug) || null;
}

export async function salvarEmpresaTecnicos(form) {
	if (!text(form.nome)) throw new Error("Informe o nome da empresa.");
	if (form.logo && form.logo.length > LOGO_MAX_BYTES * 1.45) {
		throw new Error("Logo muito grande. Use uma imagem até 450 KB.");
	}
	const regionals = await fetchRotRegionals();
	const payload = companyPayloadFromForm(form, regionals);
	const saved = form.id ? await updateRotCompany(form.id, payload) : await createRotCompany(payload);
	const company = normalizeEmpresa(saved);
	const existing = new Map(company.tecnicos.map((item) => [item.id, item]));
	for (const tecnico of Array.isArray(form.tecnicos) ? form.tecnicos : []) {
		if (!text(tecnico.nome)) continue;
		const techPayload = technicianPayloadFromForm(tecnico, { ...company, ...form, id: company.id }, regionals);
		if (tecnico.id && existing.has(tecnico.id)) {
			await updateRotTechnician(tecnico.id, techPayload);
		} else {
			await createRotTechnician(techPayload);
		}
	}
	return company.id;
}

export async function excluirEmpresaTecnicos(id) {
	await deleteRotCompany(id);
}

export async function buscarAcertosDaEmpresa(empresa) {
	if (!empresa?.id && !empresa?.nome) return [];
	const data = await import("../../../api/rotApi").then((api) => api.requestRotApi("/admin/stock-adjustments"));
	const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
	const empresaKey = normalizeText(empresa.nome);
	return items
		.filter((item) => item.companyId === empresa.id || normalizeText(item.companyName || item.empresaNome) === empresaKey)
		.map((item) => ({
			id: item.id,
			codigo: item.code || item.codigo || item.id,
			empresaId: item.companyId || "",
			empresa: item.companyName || "",
			empresaNomes: [item.companyName || ""].filter(Boolean),
			regional: item.regionalName || "",
			cidade: item.cityName || "",
			turno: item.shift || "",
			feitoPor: item.createdByName || "",
			tecnico: item.technicianName || "",
			dataAcerto: item.date || item.createdAt || "",
			status: item.status || "Registrado",
			produtos: item.items || [],
		}))
		.sort((a, b) => String(b.dataAcerto).localeCompare(String(a.dataAcerto)));
}

export async function buscarSupervisores() {
	const users = await fetchRotUsers().catch(() => []);
	return users
		.map((item) => ({
			id: item.id,
			nome: text(item.name || item.nome),
			email: text(item.email),
			role: normalizeText(item.role || item.roleId),
			regional: text(item.regionalName || item.regional),
		}))
		.filter((item) => item.role.includes("supervisor"))
		.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function buscarUsuariosEmpresa() {
	const users = await fetchRotUsers().catch(() => []);
	return users
		.map((item) => ({
			id: item.id,
			nome: text(item.name || item.nome),
			email: text(item.email),
			role: normalizeText(item.role || item.roleId),
			regional: text(item.regionalName || item.regional),
			empresaId: text(item.empresaId || item.companyId),
			empresaNome: text(item.empresaNome || item.companyName),
		}))
		.filter((item) => item.role.includes("lider") || item.role.includes("empresa"));
}
