import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { invalidateDashboardDataCache } from "../pages/PainelPublico/hooks/useDashboardData";
import { invalidateInternalStaticDataCache } from "./internalStaticDataService";

export const STATIC_DATA_REFRESH_URL =
  "https://us-central1-gestao-retirada.cloudfunctions.net/generateStaticDataHttp";
const STATIC_DATA_SECRET = import.meta.env.VITE_STATIC_DATA_SECRET || "";
let staticDataRegenerationPromise = null;

const generateStaticDataCallable = httpsCallable(
  functions,
  "generateStaticDataCallable",
);

function extractCallableErrorMessage(error) {
  return (
    error?.details ||
    error?.message ||
    null
  );
}

function buildStaticDataRefreshUrl(options = {}) {
  if (!STATIC_DATA_SECRET) return STATIC_DATA_REFRESH_URL;

  const url = new URL(STATIC_DATA_REFRESH_URL);
  url.searchParams.set("secret", STATIC_DATA_SECRET);
  if (options?.scope) {
    url.searchParams.set("scope", options.scope);
  }
  return url.toString();
}

async function regenerateStaticDataViaHttp(options = {}) {
  const response = await fetch(buildStaticDataRefreshUrl(options), {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
  });

  const payload = await response.json().catch(async () => {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      error: text || `HTTP ${response.status}`,
    };
  });

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }

  return payload;
}

export async function regenerateStaticData(options = {}) {
  if (staticDataRegenerationPromise) {
    return staticDataRegenerationPromise;
  }

  staticDataRegenerationPromise = (async () => {
  try {
      const response = await generateStaticDataCallable(options);
      const result = response.data || null;
      invalidateDashboardDataCache(result?.generatedAt || null);
      invalidateInternalStaticDataCache(result?.generatedAt || null);
      return result;
    } catch (callableError) {
      if (!STATIC_DATA_SECRET) {
        throw new Error(
          extractCallableErrorMessage(callableError) ||
            "Falha ao publicar o JSON estatico.",
        );
      }

      try {
        const result = await regenerateStaticDataViaHttp(options);
        invalidateDashboardDataCache(result?.generatedAt || null);
        invalidateInternalStaticDataCache(result?.generatedAt || null);
        return result;
      } catch (httpError) {
        const message =
          (
            String(httpError?.message || "").includes("STATIC_DATA_SECRET nao configurado")
              ? null
              : httpError?.message
          ) ||
          extractCallableErrorMessage(callableError) ||
          "Falha ao publicar o JSON estatico.";
        throw new Error(message);
      }
    }
  })();

  try {
    return await staticDataRegenerationPromise;
  } finally {
    staticDataRegenerationPromise = null;
  }
}
