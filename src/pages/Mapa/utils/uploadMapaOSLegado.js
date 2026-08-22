import * as XLSX from "xlsx";
import {
  deleteVpsDocument,
  listAllVpsDocuments,
  setVpsDocument,
} from "../../../services/vpsApiClient";
import {
  LEGACY_COLLECTION,
  LEGACY_CUTOFF_DATE,
  LEGACY_META_COLLECTION,
  refreshLegacyMapaSnapshot,
} from "./legacyMapaOS";

function extrairCidade(endereco) {
  if (!endereco) return null;
  const match = String(endereco).match(/,\s*([^,|/]+)\/MG/i);
  return match ? match[1].trim().toUpperCase() : null;
}

function getRowValue(row, aliases) {
  for (const key of aliases) {
    if (!(key in row)) continue;
    const value = row[key];
    if (value === undefined || value === null || value === "") continue;
    return value;
  }
  return null;
}

function normalizarCidade(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (!texto) return null;

  return texto
    .toLowerCase()
    .split(/\s+/)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(" ");
}

const CITY_KEY_ALIASES = {
  AGUIANIL: "AGUANIL",
};

const CITY_DISPLAY_ALIASES = {
  AGUIANIL: "Aguanil",
};

function normalizeCityKey(valor) {
  const texto = String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  return CITY_KEY_ALIASES[texto] || texto;
}

function normalizarCidadeComAlias(valor) {
  const cidade = normalizarCidade(valor);
  if (!cidade) return null;

  const rawKey = String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  return CITY_DISPLAY_ALIASES[rawKey] || cidade;
}

function normalizarStatus(status) {
  const valor = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");

  if (!valor) return null;
  if (valor.startsWith("pendente")) return "Pendente";
  if (valor.includes("aguardando") && valor.includes("agendamento")) {
    return "Aguardando Agendamento";
  }
  return null;
}

function parseCoordenadas(raw) {
  if (!raw) return null;

  const partes = String(raw)
    .split(",")
    .map((item) => Number.parseFloat(String(item).trim()));

  if (partes.length !== 2 || partes.some((item) => Number.isNaN(item))) {
    return null;
  }

  return {
    latitude: partes[0],
    longitude: partes[1],
  };
}

function sanitizarId(numOs) {
  return String(numOs).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function montarEndereco({ endereco, numero, bairro }) {
  return [endereco, numero, bairro].filter(Boolean).join(", ");
}

function comparablePayload(payload) {
  return {
    num_os: payload.num_os || "",
    status: payload.status || "",
    tipo: payload.tipo || "",
    cidade: payload.cidade || "",
    regional: payload.regional || "",
    agente: payload.agente === true,
    codigo_cliente: payload.codigo_cliente || "",
    nome_cliente: payload.nome_cliente || "",
    tecnico: payload.tecnico || "",
    endereco: payload.endereco || "",
    numero: payload.numero || "",
    bairro: payload.bairro || "",
    endereco_resumo: payload.endereco_resumo || "",
    coordenadas: payload.coordenadas || "",
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    dataAberturaSort: payload.dataAberturaSort || "",
    dataAberturaLabel: payload.dataAberturaLabel || "",
  };
}

function samePayload(a, b) {
  return JSON.stringify(comparablePayload(a)) === JSON.stringify(comparablePayload(b));
}

async function carregarMapaCidades() {
  const regionais = await listAllVpsDocuments("ferramentas_regionais", { pageSize: 500 });
  const mapa = {};
  regionais.forEach((data) => {
    const nomeRegional = data.nome || "Sem Regional";
    (data.cidades || []).forEach((cidade) => {
      const cidadeNome = normalizarCidadeComAlias(cidade.nome);
      const cidadeKey = normalizeCityKey(cidadeNome);
      if (!cidadeKey) return;
      mapa[cidadeKey] = {
        nome: cidadeNome,
        regional: nomeRegional,
        agente: cidade.agente === true,
      };
    });
  });
  return mapa;
}

async function carregarOrdensLegadasAtuais() {
  const idsAtuais = new Set();
  const ordensAntigasMap = {};

  const atuais = await listAllVpsDocuments(LEGACY_COLLECTION, { pageSize: 1000 });
  atuais.forEach((item) => {
    idsAtuais.add(item.id);
    ordensAntigasMap[item.id] = item;
  });

  return { idsAtuais, ordensAntigasMap };
}

export async function processarUploadMapaLegado(file, onProgress, periodo) {
  onProgress?.("Lendo planilha legada...");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

  onProgress?.("Carregando regionais...");
  const mapaCidades = await carregarMapaCidades();

  const ordensNovas = {};
  let ignoradasSemData = 0;
  let ignoradasForaDoCorte = 0;

  rows.forEach((row) => {
    const numOs = getRowValue(row, [
      "numero_ordem_servico",
      "num_o_s",
      "num_os",
      "numero_os",
    ]);
    const status = getRowValue(row, ["status"]);
    const tipoRaw = getRowValue(row, ["tipo_ordem_servico", "tipo"]);
    const endereco = getRowValue(row, ["endereco", "endereco_instalacao"]);
    const numero = getRowValue(row, ["numero"]);
    const bairro = getRowValue(row, ["bairro"]);
    const cidadeRaw = getRowValue(row, ["cidade"]) || extrairCidade(endereco);
    const codigoCliente = getRowValue(row, ["codigo_cliente", "codigo"]);
    const nomeCliente = getRowValue(row, [
      "nome_razaosocial",
      "cliente",
      "nome_cliente",
    ]);
    const tecnico = getRowValue(row, ["tecnicos", "tecnico"]);
    const coordenadas = getRowValue(row, ["coordenadas"]);
    const tipo = String(tipoRaw || "").trim();

    if (!numOs || !tipo || tipo === "-" || status === "-") return;

    const statusNorm = normalizarStatus(status);
    if (!statusNorm) return;

    const cidadeInformada = normalizarCidadeComAlias(cidadeRaw);
    if (!cidadeInformada) return;

    const info = mapaCidades[normalizeCityKey(cidadeInformada)] || {
      regional: "Sem Regional",
      agente: false,
    };
    const cidade = info.nome || cidadeInformada;
    const id = sanitizarId(numOs);
    const coords = parseCoordenadas(coordenadas);

    ordensNovas[id] = {
      num_os: String(numOs),
      status: statusNorm,
      tipo,
      cidade,
      regional: info.regional,
      agente: info.agente,
      codigo_cliente: codigoCliente ? String(codigoCliente) : "",
      nome_cliente: nomeCliente ? String(nomeCliente).trim() : "",
      tecnico: tecnico ? String(tecnico).trim() : "",
      endereco: endereco ? String(endereco).trim() : "",
      numero: numero ? String(numero).trim() : "",
      bairro: bairro ? String(bairro).trim() : "",
      endereco_resumo: montarEndereco({
        endereco: endereco ? String(endereco).trim() : "",
        numero: numero ? String(numero).trim() : "",
        bairro: bairro ? String(bairro).trim() : "",
      }),
      coordenadas: coordenadas ? String(coordenadas).trim() : "",
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      dataAberturaSort: LEGACY_CUTOFF_DATE,
      dataAberturaLabel: `Anterior a ${LEGACY_CUTOFF_DATE}`,
      atualizadoEm: new Date().toISOString(),
    };
  });

  onProgress?.("Comparando com a base legada...");
  const { idsAtuais, ordensAntigasMap } = await carregarOrdensLegadasAtuais();

  const idsNovos = new Set(Object.keys(ordensNovas));
  const deletar = [...idsAtuais].filter((id) => !idsNovos.has(id));
  const atualizar = [...idsNovos].filter((id) => {
    const atual = ordensAntigasMap[id];
    if (!atual) return true;
    return !samePayload(atual, ordensNovas[id]);
  });

  const batchSize = 400;
  let atualizadasProcessadas = 0;
  for (let index = 0; index < atualizar.length; index += batchSize) {
    const lote = atualizar.slice(index, index + batchSize);
    onProgress?.(
      `Salvando legadas ${Math.min(atualizadasProcessadas + lote.length, atualizar.length)}/${atualizar.length}...`,
    );
    await Promise.all(
      lote.map((id) => setVpsDocument(`${LEGACY_COLLECTION}/${id}`, ordensNovas[id])),
    );
    atualizadasProcessadas += lote.length;
  }

  let removidasProcessadas = 0;
  for (let index = 0; index < deletar.length; index += batchSize) {
    const lote = deletar.slice(index, index + batchSize);
    onProgress?.(
      `Removendo legadas ${Math.min(removidasProcessadas + lote.length, deletar.length)}/${deletar.length}...`,
    );
    await Promise.all(
      lote.map((id) => deleteVpsDocument(`${LEGACY_COLLECTION}/${id}`)),
    );
    removidasProcessadas += lote.length;
  }

  await setVpsDocument(`${LEGACY_META_COLLECTION}/ultima_atualizacao`, {
    data: new Date().toISOString(),
    totalOS: idsNovos.size,
    removidas: deletar.length,
    ignoradasSemData,
    ignoradasForaDoCorte,
    cutoff: LEGACY_CUTOFF_DATE,
    periodoInicio: periodo?.inicio || null,
    periodoFim: periodo?.fim || null,
  });

  onProgress?.("Atualizando painel legado e match...");
  await refreshLegacyMapaSnapshot({
    ordens: Object.entries(ordensNovas).map(([id, ordem]) => ({ id, ...ordem })),
    periodo,
    extraMeta: {
      removidas: deletar.length,
      ignoradasSemData,
      ignoradasForaDoCorte,
    },
  });

  onProgress?.("Concluído!");

  return {
    total: idsNovos.size,
    atualizadas: atualizar.length,
    removidas: deletar.length,
    ignoradasSemData,
    ignoradasForaDoCorte,
  };
}

