import * as XLSX from "xlsx";
import { buildCacheKey, invalidateCache } from "../../../services/dataCache";
import { invalidateDashboardDataCache } from "../../PainelPublico/hooks/useDashboardData";
import { invalidateInternalStaticDataCache } from "../../../services/internalStaticDataService";
import { persistMapaImport } from "../../../services/operationalImportService";

const DATE_FIELD_ALIASES = new Set([
  "data_cadastro",
  "data_abertura",
  "data_abertura_os",
  "abertura",
]);

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

async function readRowsFromFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
  const headers = [];

  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const address = XLSX.utils.encode_cell({ r: range.s.r, c: column });
    const header = worksheet[address]?.v;
    headers[column] = header;
  }

  rows.forEach((row, rowIndex) => {
    const sheetRow = range.s.r + 1 + rowIndex;
    headers.forEach((header, column) => {
      if (!header || !DATE_FIELD_ALIASES.has(normalizeHeader(header))) return;
      const cell = worksheet[XLSX.utils.encode_cell({ r: sheetRow, c: column })];
      if (!cell?.w) return;
      row[header] = cell.w;
    });
  });

  return rows;
}

export async function processarUploadMapa(filesInput, onProgress, periodo, onJobProgress) {
  const files = Array.isArray(filesInput) ? filesInput : [filesInput];
  const validFiles = files.filter(Boolean);

  if (!validFiles.length) {
    throw new Error("Selecione ao menos uma planilha para importar.");
  }

  const rows = [];

  for (const [index, file] of validFiles.entries()) {
    const fileLabel =
      validFiles.length > 1 ? ` (${index + 1}/${validFiles.length})` : "";
    onProgress?.(`Lendo planilha do Mapa${fileLabel}...`);
    rows.push(...(await readRowsFromFile(file)));
  }

  const fontes = Array.isArray(periodo?.fontes) && periodo.fontes.length > 0
    ? periodo.fontes.filter((fonte) => ["sempre", "onnet"].includes(fonte))
    : [periodo?.fonte === "onnet" ? "onnet" : "sempre"];
  const fontesUnicas = [...new Set(fontes.length > 0 ? fontes : ["sempre"])];
  const fonteLabel = fontesUnicas.includes("sempre") && fontesUnicas.includes("onnet")
    ? "SEMPRE + ONNET"
    : fontesUnicas.includes("onnet")
      ? "ONNET"
      : "SEMPRE";

  onProgress?.(`Enviando planilha ${fonteLabel} para processamento...`);
  const persistResult = await persistMapaImport({
    rows,
    periodo,
    fontes: fontesUnicas,
  }, {
    onProgress: (job) => {
      onJobProgress?.(job);
      if (job?.stage) {
        onProgress?.(`${job.stage}${job.percent !== undefined ? ` (${job.percent}%)` : ""}`);
      }
    },
  });

  invalidateCache(buildCacheKey(["mapa", "ordens-abertas"]));
  invalidateCache(buildCacheKey(["painel-publico", "mapa-os"]));
  invalidateCache(buildCacheKey(["painel-publico", "mapa-os", "v2"]));
  invalidateDashboardDataCache(persistResult?.generatedAt || null);
  invalidateInternalStaticDataCache(persistResult?.generatedAt || null);

  onProgress?.("Concluído!");

  return {
    total: persistResult?.total ?? 0,
    totalGeral: persistResult?.totalGeral ?? persistResult?.total ?? 0,
    salvas: persistResult?.salvas ?? 0,
    atualizadas: persistResult?.atualizadas ?? 0,
    removidas: persistResult?.removidas ?? 0,
    fontes: persistResult?.fontes || fontesUnicas,
    fonteLabel: persistResult?.fonteLabel || fonteLabel,
    comparativo: persistResult?.comparativo ?? [],
  };
}

