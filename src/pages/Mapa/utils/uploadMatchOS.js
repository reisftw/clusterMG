import * as XLSX from "xlsx";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../../services/firebase";
import { buildCacheKey, invalidateCache } from "../../../services/firestoreCache";
import { regenerateStaticData } from "../../../services/staticDataService";
import { buildMatchOSData } from "./matchOs";

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

function sanitizePublicOrdem(id, ordem) {
  return {
    id,
    num_os: ordem.num_os || "",
    status: ordem.status || "",
    tipo: ordem.tipo || "",
    cidade: ordem.cidade || "",
    regional: ordem.regional || "",
    agente: ordem.agente === true,
    codigo_cliente: ordem.codigo_cliente || "",
    nome_cliente: ordem.nome_cliente || "",
    tecnico: ordem.tecnico || "",
    endereco: ordem.endereco || "",
    numero: ordem.numero || "",
    bairro: ordem.bairro || "",
    endereco_resumo: ordem.endereco_resumo || "",
    coordenadas: ordem.coordenadas || "",
    latitude: ordem.latitude ?? null,
    longitude: ordem.longitude ?? null,
  };
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

export async function processarUploadMatch(file, onProgress, periodo) {
  onProgress?.("Lendo planilha do Match...");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

  onProgress?.("Carregando regionais...");
  const mapaCidades = await carregarMapaCidades();

  const ordensNovas = {};
  let ignoradasSemRegional = 0;

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

    const info = mapaCidades[cidade.toUpperCase()] || null;
    if (!info || !info.regional || info.regional === "Sem Regional") {
      ignoradasSemRegional += 1;
      return;
    }

    const id = sanitizarId(numOs);
    const coords = parseCoordenadas(coordenadas);

    ordensNovas[id] = {
      num_os: String(numOs),
      status: statusNorm,
      tipo,
      cidade,
      regional: info.regional,
      agente: info.agente === true,
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

  onProgress?.("Comparando Match com Firebase...");
  const snapAtual = await getDocs(
    query(collection(db, "match_os_abertas"), orderBy("__name__"), limit(5000)),
  );
  const idsAtuais = new Set();
  const ordensAtuais = {};
  snapAtual.forEach((docSnap) => {
    idsAtuais.add(docSnap.id);
    ordensAtuais[docSnap.id] = docSnap.data();
  });

  const idsNovos = new Set(Object.keys(ordensNovas));
  const deletar = [...idsAtuais].filter((id) => !idsNovos.has(id));
  const atualizar = [...idsNovos].filter((id) => {
    const atual = ordensAtuais[id];
    if (!atual) return true;
    return !samePayload(atual, ordensNovas[id]);
  });

  onProgress?.(
    `Preparando Match: ${atualizar.length} para atualizar, ${deletar.length} para remover...`,
  );

  const batchSize = 400;
  let salvasProcessadas = 0;
  for (let index = 0; index < atualizar.length; index += batchSize) {
    const lote = atualizar.slice(index, index + batchSize);
    onProgress?.(
      `Salvando Match ${Math.min(salvasProcessadas + lote.length, atualizar.length)}/${atualizar.length} O.S...`,
    );
    const batch = writeBatch(db);
    lote.forEach((id) => {
      batch.set(doc(db, "match_os_abertas", id), ordensNovas[id]);
    });
    await batch.commit();
    salvasProcessadas += lote.length;
  }

  let removidasProcessadas = 0;
  for (let index = 0; index < deletar.length; index += batchSize) {
    const lote = deletar.slice(index, index + batchSize);
    onProgress?.(
      `Removendo Match ${Math.min(removidasProcessadas + lote.length, deletar.length)}/${deletar.length} O.S...`,
    );
    const batch = writeBatch(db);
    lote.forEach((id) => {
      batch.delete(doc(db, "match_os_abertas", id));
    });
    await batch.commit();
    removidasProcessadas += lote.length;
  }

  await setDoc(doc(db, "match_os_meta", "ultima_atualizacao"), {
    data: serverTimestamp(),
    totalOS: idsNovos.size,
    removidas: deletar.length,
    periodoInicio: periodo?.inicio || null,
    periodoFim: periodo?.fim || null,
    ignoradasSemRegional,
  });

  await addDoc(collection(db, "match_os_historico"), {
    data: serverTimestamp(),
    totalOS: idsNovos.size,
    periodoInicio: periodo?.inicio || null,
    periodoFim: periodo?.fim || null,
    ignoradasSemRegional,
  });

  const ordensPublicas = Object.entries(ordensNovas).map(([id, ordem]) =>
    sanitizePublicOrdem(id, ordem),
  );
  const matchData = buildMatchOSData(ordensPublicas);
  await setDoc(doc(db, "public_dashboard", "match_os"), {
    data: matchData,
    meta: {
      data: serverTimestamp(),
      totalOS: idsNovos.size,
      removidas: deletar.length,
      periodoInicio: periodo?.inicio || null,
      periodoFim: periodo?.fim || null,
      ignoradasSemRegional,
    },
  });

  await setDoc(doc(db, "public_dashboard", "agentes_match_os"), {
    data: {
      agentes: matchData.agentes,
      regionais: [],
      resumo: {
        ...matchData.resumo,
        totalRegionais: 0,
        totalCidades: matchData.agentes.reduce(
          (sum, item) => sum + item.totalCidades,
          0,
        ),
        totalMatches: matchData.agentes.reduce(
          (sum, item) => sum + item.totalMatches,
          0,
        ),
      },
    },
    meta: {
      data: serverTimestamp(),
      totalOS: idsNovos.size,
      removidas: deletar.length,
      periodoInicio: periodo?.inicio || null,
      periodoFim: periodo?.fim || null,
      ignoradasSemRegional,
    },
  });

  invalidateCache(buildCacheKey(["match-os", "ordens-abertas"]));
  invalidateCache(buildCacheKey(["painel-publico", "match-os"]));
  invalidateCache(buildCacheKey(["painel-publico", "match-os", "v2"]));
  invalidateCache(buildCacheKey(["painel-publico", "match-os", "v3"]));
  invalidateCache(buildCacheKey(["painel-publico", "agentes-match"]));
  invalidateCache(buildCacheKey(["painel-publico", "agentes-match", "v2"]));
  invalidateCache(buildCacheKey(["painel-publico", "agentes-match", "v3"]));

  onProgress?.("Atualizando JSON estatico...");
  try {
    await regenerateStaticData();
  } catch (error) {
    throw new Error(
      `Dados do match salvos, mas a publicacao do JSON falhou: ${error.message}`,
    );
  }

  onProgress?.("Concluido!");

  return {
    total: idsNovos.size,
    atualizadas: atualizar.length,
    removidas: deletar.length,
    ignoradasSemRegional,
  };
}
