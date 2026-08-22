import {
  getPublicVpsDocument,
  listAllPublicVpsDocuments,
  listPublicVpsDocuments,
  setVpsDocument,
} from "../../../services/vpsApiClient";
import { buildPublicMapaSnapshot } from "./mapaUtils";

const MATCH_DISTANCE_METERS = 120;
export const LEGACY_COLLECTION = "ordens_legadas";
export const LEGACY_META_COLLECTION = "mapa_legado_meta";
export const LEGACY_PUBLIC_DOC = "mapa_os_legadas";
export const LEGACY_CUTOFF_DATE = "2025-12-31";
export const LEGACY_PAGE_SIZE = 200;
const LEGACY_BATCH_READ_SIZE = 1000;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeStreet(value) {
  return normalizeText(value)
    .replace(/\b(rua|avenida|av|travessa|alameda|rodovia|estrada)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasCoordinates(ordem) {
  return isValidCoordinate(ordem?.latitude) && isValidCoordinate(ordem?.longitude);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calcDistanceMeters(a, b) {
  if (!hasCoordinates(a) || !hasCoordinates(b)) return Number.POSITIVE_INFINITY;

  const earthRadius = 6371000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function isRetiradaTipo(tipo) {
  const normalized = normalizeText(tipo);
  return normalized.includes("retirada") || normalized.includes("cancelamento");
}

export function parseSpreadsheetDate(rawValue) {
  if (!rawValue && rawValue !== 0) return null;
  if (rawValue instanceof Date) return validDateOrNull(rawValue);
  if (typeof rawValue === "number") return parseExcelDate(rawValue);

  return parseTextDate(rawValue);
}

function validDateOrNull(date) {
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseExcelDate(rawValue) {
  return validDateOrNull(new Date(Math.round((rawValue - 25569) * 86400 * 1000)));
}

function parseTextDate(rawValue) {
  const raw = String(rawValue).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return validDateOrNull(new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T12:00:00`));

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return validDateOrNull(new Date(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}T12:00:00`));

  return validDateOrNull(new Date(raw));
}

export function formatDateToISO(value) {
  const date = parseSpreadsheetDate(value);
  if (!date) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateToPtBR(value) {
  const date = parseSpreadsheetDate(value);
  if (!date) return "";
  return date.toLocaleDateString("pt-BR");
}

function sanitizeLegacyListItem(item) {
  return {
    id: item.id,
    num_os: item.num_os || "",
    cidade: item.cidade || "",
    regional: item.regional || "",
    agente: item.agente === true,
    tipo: item.tipo || "",
    status: item.status || "",
    tecnico: item.tecnico || "",
    codigo_cliente: item.codigo_cliente || "",
    nome_cliente: item.nome_cliente || "",
    dataAberturaSort: item.dataAberturaSort || "",
    dataAberturaLabel: item.dataAberturaLabel || "",
  };
}

function buildCopyText(grupo, cidade, principal, relacionadas, isAgente) {
  const linhas = [
    `${isAgente ? "Agente autorizado" : grupo} -> ${cidade}`,
    `Serviço legado: ${principal.tipo}`,
    `Cliente: ${principal.nome_cliente || "-"} | Código: ${principal.codigo_cliente || "-"} | OS: ${principal.num_os || "-"}`,
    `Abertura: ${principal.dataAberturaLabel || "-"}`,
    `Técnico: ${principal.tecnico || "Não informado"}`,
    `Endereço: ${principal.endereco_resumo || principal.endereco || "-"}`,
    "Serviços recentes próximos:",
  ];

  relacionadas.forEach((ordem) => {
    linhas.push(
      `- ${ordem.tipo} | ${ordem.nome_cliente || "-"} | Código ${ordem.codigo_cliente || "-"} | OS ${ordem.num_os || "-"} | ${ordem.distanceMeters}m`,
    );
  });

  return linhas.join("\n");
}

function buildLegacyCidadeMatches(grupo, cidade, legacyOrdens, recentOrdens, { isAgente = false } = {}) {
  const principais = legacyOrdens.filter(hasCoordinates);
  const relacionadasBase = recentOrdens.filter(hasCoordinates);

  const matches = principais
    .map((principal) => {
      const ruaPrincipal = normalizeStreet(principal.endereco);
      const relacionadas = relacionadasBase
        .map((ordem) => {
          const distanceMeters = Math.round(calcDistanceMeters(principal, ordem));
          const sameStreet =
            ruaPrincipal &&
            ruaPrincipal === normalizeStreet(ordem.endereco);

          if (!sameStreet && distanceMeters > MATCH_DISTANCE_METERS) {
            return null;
          }

          return {
            ...ordem,
            sameStreet,
            distanceMeters,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distanceMeters - b.distanceMeters);

      if (!relacionadas.length) return null;

      return {
        id: `${principal.id || principal.num_os}-${cidade}`,
        principal,
        relacionadas,
        totalRelacionadas: relacionadas.length,
        copyText: buildCopyText(grupo, cidade, principal, relacionadas, isAgente),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.totalRelacionadas - a.totalRelacionadas);

  return {
    cidade,
    matches,
    totalMatches: matches.length,
    totalRetiradasRelacionadas: matches.reduce(
      (sum, match) => sum + match.totalRelacionadas,
      0,
    ),
    isAgente,
  };
}

function buildLegacySection(legacyByGroup, recentByCity, { isAgente = false } = {}) {
  return Object.entries(legacyByGroup)
    .map(([grupo, cidadesMap]) => {
      const cidades = Object.entries(cidadesMap)
        .map(([cidade, listaOrdens]) =>
          buildLegacyCidadeMatches(
            grupo,
            cidade,
            listaOrdens,
            recentByCity[cidade] || [],
            { isAgente },
          ),
        )
        .filter((item) => item.totalMatches > 0)
        .sort((a, b) => b.totalMatches - a.totalMatches);

      return {
        regional: grupo,
        cidades,
        totalMatches: cidades.reduce((sum, item) => sum + item.totalMatches, 0),
        totalCidades: cidades.length,
        isAgente,
      };
    })
    .filter((item) => item.totalMatches > 0)
    .sort((a, b) => b.totalMatches - a.totalMatches);
}

export function buildLegacyMatchData(legacyOrdens = [], recentOrdens = []) {
  const legacyByRegionais = {};
  const legacyByAgentes = {};
  const recentByCity = {};

  (Array.isArray(recentOrdens) ? recentOrdens : []).forEach((ordem) => {
    if (!isRetiradaTipo(ordem?.tipo)) return;
    const cidade = String(ordem?.cidade || "").trim();
    if (!cidade) return;
    if (!recentByCity[cidade]) recentByCity[cidade] = [];
    recentByCity[cidade].push(ordem);
  });

  (Array.isArray(legacyOrdens) ? legacyOrdens : []).forEach((ordem) => {
    const regional = String(ordem?.regional || "").trim();
    const cidade = String(ordem?.cidade || "").trim();

    if (!regional || regional === "Sem Regional" || !cidade) {
      return;
    }

    const alvo = ordem?.agente ? legacyByAgentes : legacyByRegionais;
    const grupo = ordem?.agente ? "Agentes autorizados" : regional;

    if (!alvo[grupo]) alvo[grupo] = {};
    if (!alvo[grupo][cidade]) alvo[grupo][cidade] = [];
    alvo[grupo][cidade].push(ordem);
  });

  const regionais = buildLegacySection(legacyByRegionais, recentByCity);
  const agentes = buildLegacySection(legacyByAgentes, recentByCity, {
    isAgente: true,
  });

  return {
    regionais,
    agentes,
    resumo: {
      totalRegionais: regionais.length,
      totalAgentes: agentes.reduce((sum, item) => sum + item.totalCidades, 0),
      totalCidades:
        regionais.reduce((sum, item) => sum + item.totalCidades, 0) +
        agentes.reduce((sum, item) => sum + item.totalCidades, 0),
      totalMatches:
        regionais.reduce((sum, item) => sum + item.totalMatches, 0) +
        agentes.reduce((sum, item) => sum + item.totalMatches, 0),
      distanciaMaximaMetros: MATCH_DISTANCE_METERS,
    },
  };
}

export async function loadRecentMatchOrdens() {
  return listAllPublicVpsDocuments("match_os_abertas", {
    pageSize: 1000,
  });
}

export async function loadAllLegacyOrdens() {
  return listAllPublicVpsDocuments(LEGACY_COLLECTION, {
    pageSize: LEGACY_BATCH_READ_SIZE,
  });
}

export async function refreshLegacyMapaSnapshot({
  ordens = null,
  periodo = null,
  extraMeta = {},
} = {}) {
  const legacyOrdens = Array.isArray(ordens) ? ordens : await loadAllLegacyOrdens();
  const summary = buildPublicMapaSnapshot(legacyOrdens);
  const oldestPreview = [...legacyOrdens]
    .sort((a, b) => String(a.dataAberturaSort || "").localeCompare(String(b.dataAberturaSort || "")))
    .slice(0, 120)
    .map(sanitizeLegacyListItem);

  await setVpsDocument(`public_dashboard/${LEGACY_PUBLIC_DOC}`, {
    summary,
    oldestPreview,
    meta: {
      data: new Date().toISOString(),
      totalOS: legacyOrdens.length,
      cutoff: LEGACY_CUTOFF_DATE,
      periodoInicio: periodo?.inicio || null,
      periodoFim: periodo?.fim || null,
      ...extraMeta,
    },
  });
}

export async function loadLegacyDashboardDoc() {
  return getPublicVpsDocument(`public_dashboard/${LEGACY_PUBLIC_DOC}`).catch(() => null);
}

export async function loadLegacyOrdensPage({ after = null, pageSize = LEGACY_PAGE_SIZE, offset = 0 } = {}) {
  const nextOffset = Number.isFinite(Number(after)) ? Number(after) : offset;
  const items = await listPublicVpsDocuments(LEGACY_COLLECTION, {
    limit: pageSize,
    offset: nextOffset,
  });

  return {
    items: items.sort((a, b) =>
      String(a.dataAberturaSort || "").localeCompare(String(b.dataAberturaSort || "")),
    ),
    lastDoc: nextOffset + items.length,
    hasMore: items.length === pageSize,
  };
}

