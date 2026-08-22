import {
  getInternalSnapshotSlice,
  SNAPSHOT_DOMAINS,
} from "../../../services/internalStaticDataService";
import {
  CENTRAL_WHATSAPP_BUTTON_TEXT,
  CENTRAL_WHATSAPP_PHONE,
  buscarFilaMensageria,
  criarItemFilaMensageria,
} from "./mensageriaService";
import {
  isVpsBackendEnabled,
  listAllPublicVpsDocuments,
} from "../../../services/vpsApiClient";

const readField = (source, fields) => {
  for (const field of fields) {
    const value = source?.[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
};

const parseExcelDate = (value) => {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber) || asNumber <= 0) return null;

  const wholeDays = Math.floor(asNumber);
  const dayFraction = asNumber - wholeDays;
  const excelDate = new Date(1899, 11, 30 + wholeDays);
  const totalSeconds = Math.round(dayFraction * 24 * 60 * 60);
  excelDate.setSeconds(totalSeconds);
  return excelDate.getFullYear() > 1990 ? excelDate : null;
};

const parseBrDateText = (text) => {
  const brMatch = text.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!brMatch) return null;

  const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw, secondRaw] = brMatch;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const yearNumber = Number(yearRaw);
  const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
  const date = new Date(
    year,
    month - 1,
    day,
    Number(hourRaw || 0),
    Number(minuteRaw || 0),
    Number(secondRaw || 0),
  );
  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return isValid && year > 1990 ? date : null;
};

const parseIsoDateText = (text) => {
  const isoDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!isoDateMatch) return null;

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw] = isoDateMatch;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(
    year,
    month - 1,
    day,
    Number(hourRaw || 0),
    Number(minuteRaw || 0),
    Number(secondRaw || 0),
  );
  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return isValid && year > 1990 ? date : null;
};

const parseDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const excelDate = parseExcelDate(value);
  if (excelDate) return excelDate;

  const text = String(value || "").trim();
  const textDate = parseBrDateText(text) || parseIsoDateText(text);
  if (textDate) return textDate;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const date = parseDate(value);
  if (!date) return "";
  return date.toLocaleDateString("pt-BR");
};

const calculateAgeDays = (value) => {
  const date = parseDate(value);
  if (!date) return null;
  const diff = Date.now() - date.getTime();
  if (diff < -24 * 60 * 60 * 1000) return null;
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
};

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

const extractCustomerCode = (value) => {
  const match = String(value || "").match(/^\s*\((\d+)\)/);
  return match?.[1] || "";
};

const sanitizeCustomerName = (value) => {
  const cleaned = String(value || "")
    .replace(/^\s*\(\d+\)\s*/, "")
    .replace(/\s*-\s*\((?:INATIVO|ATIVO)\)\s*$/i, "")
    .replace(/\s*\((?:INATIVO|ATIVO)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || String(value || "").trim();
};

const buildAttemptKey = (item) => {
  const os = String(item?.os || item?.num_os || "").trim();
  const phone = onlyDigits(item?.telefone);
  return `${os}|${phone}`;
};

function normalizeBacklogOrder(ordem) {
  const os = String(readField(ordem, ["num_os", "os", "numero_os", "numero_ordem_servico", "id"]));
  const clienteRaw = String(readField(ordem, ["nome_cliente", "cliente", "nome_razaosocial", "assinante"]));
  const cliente = sanitizeCustomerName(clienteRaw);
  const codigoCliente =
    String(readField(ordem, ["codigo_cliente", "codigo"])) || extractCustomerCode(clienteRaw);
  const telefone = String(readField(ordem, ["telefone", "celular", "fone", "whatsapp", "contato"]));
  const dataAberturaRaw = readField(ordem, [
    "data_abertura",
    "data_abertura_os",
    "abertura",
    "data",
    "createdAt",
    "criadoEm",
  ]);
  const endereco = String(readField(ordem, ["endereco_resumo", "endereco", "logradouro"]));
  const numero = String(readField(ordem, ["numero"]));
  const bairro = String(readField(ordem, ["bairro"]));
  const enderecoCompleto =
    endereco || [readField(ordem, ["rua"]), numero, bairro].filter(Boolean).join(", ");
  const tentativas = Number(readField(ordem, [
    "tentativas",
    "tentativas_contato",
    "tentativas_agendamento",
    "qtd_tentativas",
  ]) || 0);
  const ultimaTentativaRaw = readField(ordem, [
    "ultima_tentativa",
    "ultimo_contato",
    "ultimo_envio",
    "data_ultima_tentativa",
  ]);

  return {
    id: String(ordem?.id || os || crypto.randomUUID()),
    os,
    cliente: cliente || "Cliente não informado",
    codigo_cliente: codigoCliente,
    contrato: String(readField(ordem, ["contrato", "codigo_contrato", "id_contrato"])),
    telefone,
    cidade: String(readField(ordem, ["cidade"])) || "Cidade não informada",
    regional: String(readField(ordem, ["regional"])) || "Sem Regional",
    tipo: String(readField(ordem, ["tipo", "tipo_ordem_servico"])) || "Tipo não informado",
    status_os: String(readField(ordem, ["status"])) || "Aberta",
    data_abertura_os: formatDate(dataAberturaRaw),
    dias_aberta: calculateAgeDays(dataAberturaRaw),
    endereco: enderecoCompleto,
    tecnico: String(readField(ordem, ["tecnico", "tecnicos"])),
    origem: "Backlog de O.S.",
    tentativas,
    ultima_tentativa: formatDate(ultimaTentativaRaw),
    status_mensageria: String(readField(ordem, ["status_mensageria", "status_contato"])),
    ja_esta_na_fila: false,
    _attemptKey: buildAttemptKey({ os, telefone }),
  };
}

async function loadOrdensFromMapaAtual() {
  if (!isVpsBackendEnabled()) return [];

  try {
    return await listAllPublicVpsDocuments("ordens_abertas", {
      pageSize: 1000,
    });
  } catch (error) {
    console.warn("[mensageriaBacklog] Falha ao buscar ordens_abertas.", error);
    return [];
  }
}

async function loadOrdensFromSnapshot(force = false) {
  const staticSlice = await getInternalSnapshotSlice(
    SNAPSHOT_DOMAINS.OPERACIONAL,
    (payload) => payload?.mapa ?? null,
    { force },
  );
  if (Array.isArray(staticSlice?.ordens) && staticSlice.ordens.length > 0) {
    return staticSlice.ordens;
  }

  if (Array.isArray(staticSlice?.mapa?.ordens) && staticSlice.mapa.ordens.length > 0) {
    return staticSlice.mapa.ordens;
  }

  return [];
}

export async function buscarBacklogMensageria({ force = false } = {}) {
  const ordensMapaAtual = await loadOrdensFromMapaAtual();
  const ordens = ordensMapaAtual.length
    ? ordensMapaAtual
    : await loadOrdensFromSnapshot(force);
  const fila = await buscarFilaMensageria().catch(() => []);
  const filaKeys = new Set(
    fila
      .map((item) => buildAttemptKey(item))
      .filter((item) => item && item !== "|"),
  );

  return ordens
    .map((ordem) => normalizeBacklogOrder(ordem))
    .filter((ordem) => ordem.os)
    .map((ordem) => ({
      ...ordem,
      ja_esta_na_fila: filaKeys.has(ordem._attemptKey),
    }))
    .sort((a, b) => {
      const regional = a.regional.localeCompare(b.regional, "pt-BR");
      if (regional !== 0) return regional;
      const cidade = a.cidade.localeCompare(b.cidade, "pt-BR");
      if (cidade !== 0) return cidade;
      return String(a.os).localeCompare(String(b.os), "pt-BR");
    });
}

export async function enviarBacklogParaFila(
  ordens,
  {
    templateId,
    status = "novo",
    requiredCentralButton = true,
    centralButtonText = CENTRAL_WHATSAPP_BUTTON_TEXT,
    centralButtonPhone = CENTRAL_WHATSAPP_PHONE,
    centralButtonMessage = "",
  } = {},
) {
  const created = [];
  const skipped = [];

  for (const ordem of ordens) {
    if (ordem.ja_esta_na_fila) {
      skipped.push(ordem);
      continue;
    }

    const ref = await criarItemFilaMensageria({
      cliente: ordem.cliente,
      codigo_cliente: ordem.codigo_cliente,
      contrato: ordem.contrato || ordem.os,
      os: ordem.os,
      cidade: ordem.cidade,
      regional: ordem.regional,
      endereco: ordem.endereco,
      telefone: ordem.telefone,
      data_abertura_os: ordem.data_abertura_os,
      dias_aberta: ordem.dias_aberta,
      status_os: ordem.status_os,
      tipo: ordem.tipo,
      tentativas: ordem.tentativas,
      ultima_tentativa: ordem.ultima_tentativa,
      origem: "Backlog de O.S.",
      templateId,
      requiredCentralButton,
      centralButtonText,
      centralButtonPhone,
      centralButtonMessage,
      status,
    });
    created.push({ ...ordem, filaId: ref.id });
  }

  return { created, skipped };
}

