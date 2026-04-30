import * as XLSX from "xlsx";
import {
  collection,
  getDocs,
  writeBatch,
  doc,
  setDoc,
  serverTimestamp,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../../../services/firebase";
import { buildCacheKey, invalidateCache } from "../../../services/firestoreCache";
import { getInternalStaticDataSlice } from "../../../services/internalStaticDataService";
import { regenerateStaticData } from "../../../services/staticDataService";
import { buildPublicMapaSnapshot } from "./mapaUtils";

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

async function carregarMapaCidades() {
  const snap = await getDocs(
    query(
      collection(db, "ferramentas_regionais"),
      orderBy("nome"),
      limit(150),
    ),
  );
  const mapa = {};
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const nomeRegional = data.nome || "Sem Regional";
    (data.cidades || []).forEach((cidade) => {
      mapa[String(cidade.nome || "").toUpperCase()] = {
        regional: nomeRegional,
        agente: cidade.agente === true,
      };
    });
  });
  return mapa;
}

function calcularTotaisPorRegional(ordensMap) {
  const totais = {};
  Object.values(ordensMap).forEach((os) => {
    const regional = os.regional || "Sem Regional";
    totais[regional] = (totais[regional] || 0) + 1;
  });
  return totais;
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
  };
}

function samePayload(a, b) {
  return JSON.stringify(comparablePayload(a)) === JSON.stringify(comparablePayload(b));
}

function buildOrdensStateFromList(ordens = []) {
  const ids = new Set();
  const ordensMap = {};

  ordens.forEach((item) => {
    if (!item?.id) return;
    ids.add(item.id);
    ordensMap[item.id] = item;
  });

  return {
    idsAtuais: ids,
    ordensAntigasMap: ordensMap,
  };
}

async function carregarEstadoAtualOrdens() {
  const staticMapa = await getInternalStaticDataSlice(
    (payload) => payload?.mapa ?? null,
    { force: true },
  );

  const staticOrdens = Array.isArray(staticMapa?.ordens) ? staticMapa.ordens : null;
  const totalMeta = Number(staticMapa?.meta?.totalOS || 0);

  if (
    Array.isArray(staticOrdens) &&
    (totalMeta === 0 || totalMeta === staticOrdens.length)
  ) {
    return {
      source: "json",
      ...buildOrdensStateFromList(staticOrdens),
    };
  }

  const snapAtual = await getDocs(
    query(collection(db, "ordens_abertas"), orderBy("__name__"), limit(5000)),
  );

  return {
    source: "firestore",
    idsAtuais: new Set(snapAtual.docs.map((docSnap) => docSnap.id)),
    ordensAntigasMap: Object.fromEntries(
      snapAtual.docs.map((docSnap) => [docSnap.id, docSnap.data()]),
    ),
  };
}

export async function processarUploadMapa(file, onProgress, periodo) {
  onProgress?.("Lendo planilha...");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

  onProgress?.("Carregando regionais...");
  const mapaCidades = await carregarMapaCidades();

  const ordensNovas = {};
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

    const cidade = normalizarCidade(cidadeRaw);
    if (!cidade) return;

    const info = mapaCidades[cidade.toUpperCase()] || {
      regional: "Sem Regional",
      agente: false,
    };
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
      atualizadoEm: serverTimestamp(),
    };
  });

  onProgress?.("Comparando com base atual...");
  const {
    source: estadoSource,
    idsAtuais,
    ordensAntigasMap,
  } = await carregarEstadoAtualOrdens();
  onProgress?.(
    estadoSource === "json"
      ? "Comparacao feita com JSON interno atual."
      : "JSON interno indisponivel; usando Firestore como fallback.",
  );
  const totaisAntigos = calcularTotaisPorRegional(ordensAntigasMap);

  const idsNovos = new Set(Object.keys(ordensNovas));
  const salvar = [...idsNovos].filter((id) => !idsAtuais.has(id));
  const deletar = [...idsAtuais].filter((id) => !idsNovos.has(id));
  const atualizar = [...idsNovos].filter((id) => {
    const atual = ordensAntigasMap[id];
    if (!atual) return true;
    return !samePayload(atual, ordensNovas[id]);
  });

  onProgress?.(
    `Preparando salvamento: ${atualizar.length} para atualizar, ${deletar.length} para remover...`,
  );

  const batchSize = 400;
  let salvasProcessadas = 0;
  for (let index = 0; index < atualizar.length; index += batchSize) {
    const lote = atualizar.slice(index, index + batchSize);
    onProgress?.(
      `Salvando Mapa ${Math.min(salvasProcessadas + lote.length, atualizar.length)}/${atualizar.length} O.S...`,
    );
    const batch = writeBatch(db);
    lote.forEach((id) => {
      batch.set(doc(db, "ordens_abertas", id), ordensNovas[id]);
    });
    await batch.commit();
    salvasProcessadas += lote.length;
  }

  let removidasProcessadas = 0;
  for (let index = 0; index < deletar.length; index += batchSize) {
    const lote = deletar.slice(index, index + batchSize);
    onProgress?.(
      `Removendo Mapa ${Math.min(removidasProcessadas + lote.length, deletar.length)}/${deletar.length} O.S...`,
    );
    const batch = writeBatch(db);
    lote.forEach((id) => {
      batch.delete(doc(db, "ordens_abertas", id));
    });
    await batch.commit();
    removidasProcessadas += lote.length;
  }

  const totaisNovos = calcularTotaisPorRegional(ordensNovas);
  const todasRegionais = new Set([
    ...Object.keys(totaisAntigos),
    ...Object.keys(totaisNovos),
  ]);
  const comparativo = [...todasRegionais]
    .map((regional) => ({
      regional,
      anterior: totaisAntigos[regional] || 0,
      atual: totaisNovos[regional] || 0,
      diff: (totaisNovos[regional] || 0) - (totaisAntigos[regional] || 0),
    }))
    .sort((a, b) => b.atual - a.atual);

  await setDoc(doc(db, "mapa_meta", "ultima_atualizacao"), {
    data: serverTimestamp(),
    totalOS: idsNovos.size,
    novasSalvas: salvar.length,
    removidas: deletar.length,
    periodoInicio: periodo?.inicio || null,
    periodoFim: periodo?.fim || null,
  });

  await setDoc(doc(db, "public_dashboard", "mapa_os"), {
    summary: buildPublicMapaSnapshot(Object.values(ordensNovas)),
    meta: {
      data: serverTimestamp(),
      totalOS: idsNovos.size,
      novasSalvas: salvar.length,
      removidas: deletar.length,
      periodoInicio: periodo?.inicio || null,
      periodoFim: periodo?.fim || null,
    },
  });

  invalidateCache(buildCacheKey(["mapa", "ordens-abertas"]));
  invalidateCache(buildCacheKey(["painel-publico", "mapa-os"]));
  invalidateCache(buildCacheKey(["painel-publico", "mapa-os", "v2"]));

  onProgress?.("Atualizando JSON estatico...");
  try {
    await regenerateStaticData();
  } catch (error) {
    throw new Error(
      `Dados do mapa salvos, mas a publicacao do JSON falhou: ${error.message}`,
    );
  }

  onProgress?.("Concluido!");

  return {
    total: idsNovos.size,
    salvas: salvar.length,
    atualizadas: atualizar.length,
    removidas: deletar.length,
    comparativo,
  };
}
