import {
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../../../services/firebase";

const DUVIDAS_DOC_REF = doc(db, "config", "duvidas_retirada");

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeContato(item = {}) {
  return {
    id: cleanText(item.id) || `contato-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nome: cleanText(item.nome),
    telefone: cleanText(item.telefone),
    cargo: cleanText(item.cargo),
    observacao: cleanText(item.observacao),
  };
}

function normalizeDuvida(item = {}) {
  return {
    id: cleanText(item.id) || `duvida-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
  await setDoc(
    DUVIDAS_DOC_REF,
    {
      ...normalized,
      atualizadoEm: serverTimestamp(),
    },
    { merge: true },
  );
  return normalized;
}
