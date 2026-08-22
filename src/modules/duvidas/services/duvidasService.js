import { updateVpsDocument } from "../../../services/vpsApiClient";

function cleanText(value) {
  return String(value || "").trim();
}

let fallbackIdCounter = 0;

function createLocalId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  fallbackIdCounter += 1;
  return `${prefix}_${Date.now()}_${fallbackIdCounter}`;
}

function normalizeContato(item = {}) {
  return {
    id: cleanText(item.id) || createLocalId("contato"),
    nome: cleanText(item.nome),
    telefone: cleanText(item.telefone),
    cargo: cleanText(item.cargo),
    observacao: cleanText(item.observacao),
  };
}

function normalizeDuvida(item = {}) {
  return {
    id: cleanText(item.id) || createLocalId("duvida"),
    pergunta: cleanText(item.pergunta),
    resposta: cleanText(item.resposta),
    categoria: cleanText(item.categoria),
  };
}

export function normalizeDuvidasContent(payload = {}) {
  const equipe = payload?.equipe || {};

  return {
    titulo: cleanText(payload?.titulo) || "Wiki da Retirada",
    descricao:
      cleanText(payload?.descricao) ||
      "Dicas rápidas, dúvidas frequentes e contatos corporativos da operação.",
    equipe: {
      backoffice: Array.isArray(equipe.backoffice)
        ? equipe.backoffice.map(normalizeContato)
        : [],
      supervisor: Array.isArray(equipe.supervisor)
        ? equipe.supervisor.map(normalizeContato)
        : [],
      lider: Array.isArray(equipe.lider)
        ? equipe.lider.map(normalizeContato)
        : [],
      tecnico: Array.isArray(equipe.tecnico)
        ? equipe.tecnico.map(normalizeContato)
        : [],
    },
    duvidas: Array.isArray(payload?.duvidas)
      ? payload.duvidas.map(normalizeDuvida)
      : [],
    atualizadoEm: payload?.atualizadoEm || payload?.atualizado_em || null,
  };
}

export async function salvarDuvidasContent(payload) {
  const normalized = normalizeDuvidasContent(payload);
  await updateVpsDocument("config/duvidas_retirada", {
    ...normalized,
    atualizadoEm: new Date().toISOString(),
  });
  return normalized;
}

