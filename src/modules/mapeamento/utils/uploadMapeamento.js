import * as XLSX from "xlsx";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../../services/firebase";
import { COLLECTIONS } from "../../../constants/firestoreCollections";
import { buildCacheKey, invalidateCache } from "../../../services/firestoreCache";
import { buscarRegionais } from "../../regionais/services/regionaisService";

const CACHE_KEY = buildCacheKey(["mapeamento", "dashboard"]);
const DASHBOARD_DOC_ID = "resumo";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeCity(value) {
  return normalizeText(value);
}

function getRowValue(row, aliases) {
  const entries = Object.entries(row || {});

  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias).replace(/[\s_-]+/g, "");
    const match = entries.find(([key]) => {
      const normalizedKey = normalizeText(key).replace(/[\s_-]+/g, "");
      return normalizedKey === normalizedAlias;
    });

    if (!match) continue;
    const [, value] = match;
    if (value === undefined || value === null || value === "") continue;
    return value;
  }

  return null;
}

function parseSpreadsheetDate(value) {
  if (value === undefined || value === null || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;

    return new Date(
      parsed.y,
      (parsed.m || 1) - 1,
      parsed.d || 1,
      parsed.H || 0,
      parsed.M || 0,
      Math.floor(parsed.S || 0),
    );
  }

  const text = String(value).trim();
  if (!text) return null;

  const normalized = text.replace("T", " ");
  const brMatch = normalized.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (brMatch) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = brMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
}

function getLastThreeMonthKeys() {
  const now = new Date();
  return Array.from({ length: 3 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (2 - index), 1);
    return buildMonthKey(date);
  });
}

function sortByRegionalName(items = []) {
  return [...items].sort((a, b) =>
    String(a?.nome || "").localeCompare(String(b?.nome || ""), "pt-BR"),
  );
}

function buildRegionalCityMap(regionais = []) {
  const map = new Map();

  regionais.forEach((regional) => {
    (regional?.cidades || []).forEach((cidade) => {
      const normalizedCity = normalizeCity(cidade?.nome);
      if (!normalizedCity) return;

      map.set(normalizedCity, {
        regionalId: regional.id,
        regionalNome: regional.nome || "Regional sem nome",
      });
    });
  });

  return map;
}

async function readWorkbookRows(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });

  return workbook.SheetNames.flatMap((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet, {
      defval: null,
      raw: false,
    });
  });
}

function buildPayload({
  regionais,
  monthlyByRegional,
  totalLinhas,
  totalArquivos,
  ignoradasSemRegional,
  linhasInvalidas,
  cidadesNaoMapeadas,
}) {
  const currentMonthKey = buildMonthKey(new Date());
  const lastThreeMonthKeys = getLastThreeMonthKeys();

  const regionaisResumo = sortByRegionalName(regionais).map((regional) => {
    const monthly = monthlyByRegional.get(regional.id) || {};
    return {
      regionalId: regional.id,
      nome: regional.nome || "Regional sem nome",
      abertasMesAtual: Number(monthly[currentMonthKey] || 0),
      historico: lastThreeMonthKeys.map((monthKey) => ({
        key: monthKey,
        label: formatMonthLabel(monthKey),
        value: Number(monthly[monthKey] || 0),
      })),
      historicoMensal: monthly,
    };
  });

  return {
    resumo: {
      totalArquivos,
      totalLinhas,
      ignoradasSemRegional,
      linhasInvalidas,
      totalRegionais: regionaisResumo.length,
      abertasMesAtual: regionaisResumo.reduce(
        (sum, regional) => sum + regional.abertasMesAtual,
        0,
      ),
    },
    regionais: regionaisResumo,
    cidadesNaoMapeadas: cidadesNaoMapeadas
      .sort((a, b) => b.total - a.total)
      .slice(0, 20),
    meta: {
      data: serverTimestamp(),
      totalArquivos,
      totalLinhas,
      ignoradasSemRegional,
      linhasInvalidas,
      mesAtual: currentMonthKey,
    },
  };
}

export async function processarUploadMapeamento(files, onProgress) {
  const selectedFiles = Array.from(files || []).filter(Boolean);
  if (!selectedFiles.length) {
    throw new Error("Selecione ao menos um arquivo para importar.");
  }

  onProgress?.("Carregando regionais cadastradas...");
  const regionais = await buscarRegionais(true);
  const regionalCityMap = buildRegionalCityMap(regionais);

  onProgress?.(`Lendo ${selectedFiles.length} arquivo(s)...`);
  const rowsByFile = await Promise.all(selectedFiles.map((file) => readWorkbookRows(file)));
  const allRows = rowsByFile.flat();

  const monthlyByRegional = new Map(regionais.map((regional) => [regional.id, {}]));
  const unmatchedCityMap = new Map();
  let linhasInvalidas = 0;
  let ignoradasSemRegional = 0;

  allRows.forEach((row) => {
    const cidadeRaw = getRowValue(row, ["cidade"]);
    const dataCadastroRaw = getRowValue(row, ["data_cadastro", "data cadastro", "cadastro"]);

    const cidade = normalizeCity(cidadeRaw);
    const dataCadastro = parseSpreadsheetDate(dataCadastroRaw);

    if (!cidade || !dataCadastro) {
      linhasInvalidas += 1;
      return;
    }

    const regionalInfo = regionalCityMap.get(cidade);
    if (!regionalInfo) {
      ignoradasSemRegional += 1;
      unmatchedCityMap.set(cidade, (unmatchedCityMap.get(cidade) || 0) + 1);
      return;
    }

    const monthKey = buildMonthKey(dataCadastro);
    const monthly = monthlyByRegional.get(regionalInfo.regionalId) || {};
    monthly[monthKey] = Number(monthly[monthKey] || 0) + 1;
    monthlyByRegional.set(regionalInfo.regionalId, monthly);
  });

  onProgress?.("Salvando resumo do mapeamento...");

  const payload = buildPayload({
    regionais,
    monthlyByRegional,
    totalLinhas: allRows.length,
    totalArquivos: selectedFiles.length,
    ignoradasSemRegional,
    linhasInvalidas,
    cidadesNaoMapeadas: Array.from(unmatchedCityMap.entries()).map(([cidade, total]) => ({
      cidade,
      total,
    })),
  });

  await setDoc(
    doc(db, COLLECTIONS.MAPEAMENTO_DASHBOARD, DASHBOARD_DOC_ID),
    payload,
  );

  invalidateCache(CACHE_KEY);

  onProgress?.("Concluido!");

  return {
    totalArquivos: selectedFiles.length,
    totalLinhas: allRows.length,
    ignoradasSemRegional,
    linhasInvalidas,
    abertasMesAtual: payload.resumo.abertasMesAtual,
    cidadesNaoMapeadas: payload.cidadesNaoMapeadas,
  };
}
