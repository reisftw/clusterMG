import { ROUTES } from "../router/routes";
import { getApiBaseUrl } from "./vpsApiClient";

const TRACKING_TIMEZONE = "America/Sao_Paulo";
const TRACKING_SESSION_PREFIX = "painel_visitas";
const TRACKING_BROWSER_PREFIX = "painel_visitas_browser";
const PUBLIC_PAGE_LABELS = {
  [ROUTES.PAINEL_PUBLICO]: "Painel publico",
  [ROUTES.PAINEL_RELATORIOS]: "Painel relatorios",
  [ROUTES.PAINEL_MAPA]: "Painel mapa",
  [ROUTES.PAINEL_MATCH]: "Painel match",
  [ROUTES.AGENTES_MATCH_PUBLICO]: "Portal agentes autorizados",
};

const pendingTrackKeys = new Set();

function normalizePath(pathname = "") {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function getTodayKey(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TRACKING_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch (error) {
    console.warn("Nao foi possivel formatar a data de visitas com timezone fixa.", error);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function buildTrackKey(dayKey, pagePath) {
  return `${TRACKING_SESSION_PREFIX}:${dayKey}:${pagePath}`;
}

function buildBrowserTrackKey(dayKey) {
  return `${TRACKING_BROWSER_PREFIX}:${dayKey}`;
}

function wasTrackedInSession(trackKey) {
  if (!canUseSessionStorage()) return false;
  return window.sessionStorage.getItem(trackKey) === "1";
}

function wasTrackedInBrowser(trackKey) {
  if (!canUseLocalStorage()) return false;
  return window.localStorage.getItem(trackKey) === "1";
}

function markTrackedInSession(trackKey) {
  if (!canUseSessionStorage()) return;
  window.sessionStorage.setItem(trackKey, "1");
}

function markTrackedInBrowser(trackKey) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(trackKey, "1");
}

function getPageLabel(pagePath) {
  return PUBLIC_PAGE_LABELS[pagePath] || pagePath;
}

function getUtmLabel(search = "") {
  const params = new URLSearchParams(search);
  const source = params.get("utm_source");
  const medium = params.get("utm_medium");
  const campaign = params.get("utm_campaign");

  if (!source && !medium && !campaign) {
    return "";
  }

  return [source, medium, campaign].filter(Boolean).join(" / ");
}

function buildSourceInfo(referrer, search, origin) {
  const utmLabel = getUtmLabel(search);
  if (utmLabel) {
    return {
      referrer: referrer || "",
      sourceType: "utm",
      sourceLabel: utmLabel,
    };
  }

  if (!referrer) {
    return {
      referrer: "",
      sourceType: "direct",
      sourceLabel: "Acesso direto",
    };
  }

  try {
    const referrerUrl = new URL(referrer);

    if (origin && referrerUrl.origin === origin) {
      const referrerPath = normalizePath(referrerUrl.pathname);
      return {
        referrer,
        sourceType: "internal",
        sourceLabel: getPageLabel(referrerPath) || "Navegacao interna",
      };
    }

    return {
      referrer,
      sourceType: "referrer",
      sourceLabel: referrerUrl.hostname.replace(/^www\./, "") || "Origem externa",
    };
  } catch {
    return {
      referrer,
      sourceType: "referrer",
      sourceLabel: "Origem externa",
    };
  }
}

export function shouldTrackPainelVisit(pathname = "") {
  return Object.hasOwn(PUBLIC_PAGE_LABELS, normalizePath(pathname));
}

export async function trackPainelVisit() {
  if (typeof window === "undefined") return null;

  const pagePath = normalizePath(window.location.pathname);
  if (!shouldTrackPainelVisit(pagePath)) return null;

  const dayKey = getTodayKey();
  const trackKey = buildTrackKey(dayKey, pagePath);
  const browserTrackKey = buildBrowserTrackKey(dayKey);

  if (
    pendingTrackKeys.has(trackKey) ||
    wasTrackedInBrowser(browserTrackKey) ||
    wasTrackedInSession(trackKey)
  ) {
    return null;
  }

  const referrer =
    typeof document !== "undefined" ? document.referrer || "" : "";
  const source = buildSourceInfo(
    referrer,
    window.location.search || "",
    window.location.origin || "",
  );

  pendingTrackKeys.add(trackKey);

  try {
    const response = await fetch(`${getApiBaseUrl()}/public/visits`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dayKey,
        pagePath,
        pageLabel: getPageLabel(pagePath),
        referrer: source.referrer,
        sourceType: source.sourceType,
        sourceLabel: source.sourceLabel,
        hostname: window.location.hostname || "",
      }),
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.error || `Erro HTTP ${response.status}.`);
    }

    markTrackedInSession(trackKey);
    markTrackedInBrowser(browserTrackKey);
    return data?.id || null;
  } catch (error) {
    console.error("Erro ao registrar visita publica:", error);
    return null;
  } finally {
    pendingTrackKeys.delete(trackKey);
  }
}

export function getTodayVisitKey() {
  return getTodayKey();
}

