import { useEffect, useRef, useState } from "react";

const DATA_JSON_URL =
  "https://storage.googleapis.com/gestao-retirada.firebasestorage.app/static/data.json";
const STATIC_DATA_UPDATED_EVENT = "static-data-updated";
const STATIC_DATA_VERSION_KEY = "static-data-version";

let cache = null;
let pendingRequest = null;

function getVersionToken() {
  if (typeof window === "undefined") return "initial";
  return window.localStorage.getItem(STATIC_DATA_VERSION_KEY) || "initial";
}

function buildDataJsonUrl() {
  const version = encodeURIComponent(getVersionToken());
  return `${DATA_JSON_URL}?v=${version}`;
}

export function invalidateDashboardDataCache(versionToken = null) {
  cache = null;
  pendingRequest = null;

  if (typeof window === "undefined") return;

  const nextVersion = versionToken || new Date().toISOString();
  window.localStorage.setItem(STATIC_DATA_VERSION_KEY, nextVersion);
  window.dispatchEvent(
    new CustomEvent(STATIC_DATA_UPDATED_EVENT, {
      detail: { version: nextVersion },
    }),
  );
}

async function fetchDataJSON({ force = false } = {}) {
  if (!force && cache) return cache;
  if (pendingRequest) return pendingRequest;

  pendingRequest = fetch(buildDataJsonUrl(), { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((json) => {
      cache = json;
      pendingRequest = null;
      return json;
    })
    .catch((err) => {
      pendingRequest = null;
      throw err;
    });

  return pendingRequest;
}

export function useDashboardData() {
  const [data, setData] = useState(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const loadData = (force = false) => {
      if (!force && cache) return;

      setLoading(true);
      setError(null);

      fetchDataJSON({ force })
        .then((json) => {
          if (!mounted.current) return;
          setData(json);
          setLoading(false);
        })
        .catch((err) => {
          if (!mounted.current) return;
          console.error("[useDashboardData] Erro:", err);
          setError(err.message || "Erro ao carregar dados");
          setLoading(false);
        });
    };

    loadData();

    const handleStaticDataUpdated = () => {
      loadData(true);
    };

    const handleStorageChange = (event) => {
      if (event.key !== STATIC_DATA_VERSION_KEY) return;
      cache = null;
      pendingRequest = null;
      loadData(true);
    };

    window.addEventListener(STATIC_DATA_UPDATED_EVENT, handleStaticDataUpdated);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      mounted.current = false;
      window.removeEventListener(
        STATIC_DATA_UPDATED_EVENT,
        handleStaticDataUpdated,
      );
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return { data, loading, error };
}
