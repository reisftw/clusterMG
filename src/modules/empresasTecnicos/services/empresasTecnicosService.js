import { COLLECTIONS } from "../../../constants/dataCollections";
import {
  createVpsDocument,
  deleteVpsDocument,
  listAllVpsDocuments,
  listVpsDocuments,
  updateVpsDocument,
} from "../../../services/vpsApiClient";

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

const cleanList = (items = []) =>
  (Array.isArray(items) ? items : String(items || "").split(/[,\n;]/))
    .map((item) => text(item))
    .filter(Boolean);

const normalizeAtuacao = (value) => {
  const key = normalizeText(value);
  if (key === "manutencao") return "Manutencao";
  if (key === "ativacao") return "Ativacao";
  return "Ambos";
};

export const normalizeEmpresaStatus = (value) => {
  const key = normalizeText(value);
  if (key === "inativa" || key === "inativo") return "Inativa";
  return "Ativa";
};

const normalizeTecnicos = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: text(item?.id) || crypto.randomUUID(),
      nome: text(item?.nome),
      email: text(item?.email),
      emailHubsoft: text(item?.emailHubsoft || item?.email_hubsoft || item?.emailHubSoft || item?.hubsoftEmail),
      telefone: text(item?.telefone),
      cidade: text(item?.cidade),
      agendaId: text(item?.agendaId),
      diaAcerto: text(item?.diaAcerto),
      turnoAcerto: text(item?.turnoAcerto),
      status: text(item?.status) || "Ativo",
      observacoes: text(item?.observacoes),
    }))
    .filter((item) => item.nome);

export const DEFAULT_EMPRESA_TECNICOS_FORM = Object.freeze({
  nome: "",
  cnpj: "",
  slug: "",
  logo: "",
  status: "Ativa",
  atuacao: "Ambos",
  agenteAutorizado: false,
  agenteCidades: [],
  responsavel: {
    nome: "",
    email: "",
  },
  regional: "",
  supervisor: {
    uid: "",
    nome: "",
    email: "",
  },
  cidades: [],
  tecnicos: [],
  observacoes: "",
});

export function normalizeEmpresaTecnicos(id, data = {}) {
  const nome = text(data.nome || data.empresa);
  const regional = text(data.regional || data.regionais?.[0]);
  const supervisor = data.supervisor || {};
  const responsavel = data.responsavel || {};

  return {
    id,
    nome,
    cnpj: text(data.cnpj || data.documento || data.cpfCnpj || data.cpf_cnpj),
    slug: text(data.slug) || slugifyEmpresa(nome || id),
    logo: text(data.logo),
    status: normalizeEmpresaStatus(data.status),
    atuacao: normalizeAtuacao(data.atuacao),
    agenteAutorizado: Boolean(data.agenteAutorizado || data.agente_autorizado || data.isAgente || data.is_agente),
    agenteCidades: cleanList(data.agenteCidades || data.agente_cidades || data.cidadesAgente || data.cidades_agente),
    responsavel: {
      nome: text(responsavel.nome || data.responsavel_nome || data.nomeResponsavel),
      email: text(responsavel.email || data.email || data.emailResponsavel),
    },
    regional,
    supervisor: {
      uid: text(supervisor.uid || data.supervisorUid),
      nome: text(supervisor.nome || data.supervisorNome),
      email: text(supervisor.email || data.supervisorEmail),
    },
    cidades: cleanList(data.cidades),
    tecnicos: normalizeTecnicos(data.tecnicos),
    observacoes: text(data.observacoes),
    criado_em: data.criado_em || null,
    atualizado_em: data.atualizado_em || null,
  };
}

export function buildEmpresaTecnicosPayload(form = {}) {
  const nome = text(form.nome);
  return {
    nome,
    cnpj: text(form.cnpj),
    slug: text(form.slug) || slugifyEmpresa(nome),
    logo: text(form.logo),
    status: normalizeEmpresaStatus(form.status),
    atuacao: normalizeAtuacao(form.atuacao),
    agenteAutorizado: Boolean(form.agenteAutorizado),
    agenteCidades: cleanList(form.agenteCidades),
    responsavel: {
      nome: text(form.responsavel?.nome),
      email: text(form.responsavel?.email),
    },
    regional: text(form.regional),
    supervisor: {
      uid: text(form.supervisor?.uid),
      nome: text(form.supervisor?.nome),
      email: text(form.supervisor?.email),
    },
    cidades: cleanList(form.cidades),
    tecnicos: normalizeTecnicos(form.tecnicos),
    observacoes: text(form.observacoes),
  };
}

function extractEmpresaNamesFromAcerto(data = {}) {
  const names = [
    data.empresa,
    data.empresaNome,
    data.empresa_nome,
    data.nomeEmpresa,
    data.empresaName,
    data.razaoSocial,
    data.razao_social,
    data?.empresa?.nome,
    data?.empresa?.nomeFantasia,
    data?.empresa?.razaoSocial,
  ];

  [
    data.empresas,
    data.empresaNomes,
    data.tecnicos,
    data.tecnicoLancamentos,
    data.lancamentos,
    data.produtos,
    data.itens,
  ].forEach((items) => {
    if (!Array.isArray(items)) return;
    items.forEach((item) => {
      names.push(
        item?.empresa,
        item?.empresaNome,
        item?.empresa_nome,
        item?.nomeEmpresa,
        item?.razaoSocial,
        item?.razao_social,
        item?.empresa?.nome,
        item?.empresa?.nomeFantasia,
        item?.empresa?.razaoSocial,
      );
    });
  });

  return [...new Set(cleanList(names))];
}

export function normalizeAcertoEstoque(id, data = {}) {
  const empresaNomes = extractEmpresaNamesFromAcerto(data);
  return {
    id,
    codigo: text(data.codigo || data.id || id),
    empresaId: text(data.empresaId || data.empresa_id || data.empresa?.id),
    empresa: empresaNomes[0] || "",
    empresaNomes,
    regional: text(data.regional),
    cidade: text(data.cidade),
    turno: text(data.turno),
    feitoPor: text(data.feitoPor || data.feito_por || data.usuarioNome || data.responsavel),
    tecnico: text(data.tecnico || data.tecnicoNome || data.nomeTecnico),
    dataAcerto: text(data.dataAcerto || data.createdAt || data.criado_em),
    status: text(data.status) || "Registrado",
    produtos: Array.isArray(data.produtos) ? data.produtos : [],
  };
}

export function normalizeUsuarioEmpresa(id, data = {}) {
  return {
    id,
    nome: text(data.nome || data.display_name),
    email: text(data.email),
    role: normalizeText(data.role),
    regional: text(data.regional),
    empresaId: text(data.empresaId || data.empresa_id),
    empresaNome: text(data.empresaNome || data.empresa_nome),
  };
}

export async function buscarEmpresasTecnicos() {
  return (await listAllVpsDocuments(COLLECTIONS.EMPRESAS_TECNICOS, { pageSize: 500 }))
    .map((item) => normalizeEmpresaTecnicos(item.id, item))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function buscarEmpresaPorSlug(slug) {
  const normalizedSlug = text(slug);
  const empresas = await buscarEmpresasTecnicos();
  return empresas.find((item) => item.slug === normalizedSlug || item.id === normalizedSlug) || null;
}

export async function salvarEmpresaTecnicos(form) {
  const payload = buildEmpresaTecnicosPayload(form);
  if (!payload.nome) throw new Error("Informe o nome da empresa.");
  if (payload.logo && payload.logo.length > LOGO_MAX_BYTES * 1.45) {
    throw new Error("Logo muito grande. Use uma imagem ate 450 KB.");
  }

  const data = {
    ...payload,
    atualizado_em: new Date().toISOString(),
  };

  if (form.id) {
    await updateVpsDocument(`${COLLECTIONS.EMPRESAS_TECNICOS}/${form.id}`, data);
    return form.id;
  }

  const ref = await createVpsDocument(COLLECTIONS.EMPRESAS_TECNICOS, {
    ...data,
    criado_em: new Date().toISOString(),
  });
  return ref.id;
}

export async function excluirEmpresaTecnicos(id) {
  await deleteVpsDocument(`${COLLECTIONS.EMPRESAS_TECNICOS}/${id}`);
}

export async function buscarAcertosDaEmpresa(empresa) {
  if (!empresa?.nome) return [];
  const empresaKey = normalizeText(empresa.nome);
  const empresaId = text(empresa.id);
  return (await listAllVpsDocuments(COLLECTIONS.ACERTO_ESTOQUE_ACERTOS, { pageSize: 1000 }))
    .map((item) => normalizeAcertoEstoque(item.id, item))
    .filter((item) =>
      (empresaId && item.empresaId === empresaId) ||
      item.empresaNomes.some((nome) => normalizeText(nome) === empresaKey),
    )
    .sort((a, b) => String(b.dataAcerto).localeCompare(String(a.dataAcerto)));
}

export async function buscarSupervisores() {
  return (await listVpsDocuments(COLLECTIONS.USUARIOS, { limit: 1000 }))
    .map((item) => normalizeUsuarioEmpresa(item.id, item))
    .filter((item) => item.role === "supervisor")
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function buscarUsuariosEmpresa() {
  return (await listVpsDocuments(COLLECTIONS.USUARIOS, { limit: 1000 }))
    .map((item) => normalizeUsuarioEmpresa(item.id, item))
    .filter((item) => item.role === "lider_empresa");
}
