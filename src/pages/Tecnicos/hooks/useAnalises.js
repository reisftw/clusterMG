import { useEffect, useState, useCallback } from "react";
import {
  addDoc,
  collection,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../../services/firebase";
import { getInternalStaticDataSlice } from "../../../services/internalStaticDataService";
import { regenerateStaticData } from "../../../services/staticDataService";

function normalizeOsKey(value) {
  let normalized = String(value || "").trim();
  if (!normalized || normalized === "NaN") return null;

  if (normalized.includes("e") || normalized.includes("E")) {
    try {
      normalized = BigInt(Math.round(Number(normalized))).toString();
    } catch {
      normalized = String(value || "").trim();
    }
  }

  return normalized || null;
}

function resolveOsKey(row = {}) {
  const value =
    row.num_o_s ||
    row.numos ||
    row.OS ||
    row.numeroOs ||
    row["NÃºmero OS"] ||
    row.numero;

  return normalizeOsKey(value);
}

function mergeOsRows(rows = []) {
  const map = new Map();

  rows.forEach((item) => {
    const key = resolveOsKey(item);
    if (!key) return;
    map.set(key, item);
  });

  return Array.from(map.values());
}

export function useAnalises({ includeOsAcumuladas = true } = {}) {
  const [historico, setHistorico] = useState([]);
  const [osAcumuladas, setOsAcumuladas] = useState([]);

  const carregarHistorico = useCallback(async (force = false) => {
    const staticHistorico = await getInternalStaticDataSlice(
      (payload) => payload?.tecnicos?.historico ?? null,
      { force },
    );

    setHistorico(Array.isArray(staticHistorico) ? staticHistorico : []);
  }, []);

  const carregarOsAcumuladas = useCallback(async (force = false) => {
    if (!includeOsAcumuladas) {
      setOsAcumuladas([]);
      return [];
    }

    const staticOsAcumuladas = await getInternalStaticDataSlice(
      (payload) => payload?.tecnicos?.osAcumuladas ?? null,
      { force },
    );

    const rows = Array.isArray(staticOsAcumuladas) ? staticOsAcumuladas : [];
    setOsAcumuladas(rows);
    return rows;
  }, [includeOsAcumuladas]);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregarHistorico();
    }, 0);

    return () => clearTimeout(timer);
  }, [carregarHistorico]);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregarOsAcumuladas();
    }, 0);

    return () => clearTimeout(timer);
  }, [carregarOsAcumuladas]);

  async function buscarNumsOSExistentes() {
    return new Set(
      (osAcumuladas || [])
        .map((item) => resolveOsKey(item))
        .filter(Boolean),
    );
  }

  async function salvarOSNovas(rows) {
    const batchSize = 400;

    for (let index = 0; index < rows.length; index += batchSize) {
      const batch = writeBatch(db);

      rows.slice(index, index + batchSize).forEach((row) => {
        const normalized = resolveOsKey(row);
        if (!normalized) return;

        batch.set(doc(db, "os_acumuladas", normalized), {
          ...row,
          savedAt: new Date().toISOString(),
        });
      });

      await batch.commit();
    }

    setOsAcumuladas((current) => mergeOsRows([...(rows || []), ...(current || [])]));
    void regenerateStaticData().catch(() => null);
  }

  async function carregarTodasOS(force = false) {
    return carregarOsAcumuladas(force);
  }

  async function salvarAnalise(analise) {
    const ref = await addDoc(collection(db, "analises"), analise);
    const nextItem = { id: ref.id, ...analise };

    setHistorico((current) =>
      [nextItem, ...(current || [])]
        .sort((a, b) => String(b?.dataISO || "").localeCompare(String(a?.dataISO || "")))
        .slice(0, 30),
    );

    void regenerateStaticData().catch(() => null);
    return ref.id;
  }

  async function limparHistorico() {
    const batch = writeBatch(db);

    (historico || []).forEach((item) => {
      if (!item?.id) return;
      batch.delete(doc(db, "analises", item.id));
    });

    await batch.commit();
    setHistorico([]);
    void regenerateStaticData().catch(() => null);
  }

  async function limparOSAcumuladas() {
    const keys = Array.from(
      new Set(
        (osAcumuladas || [])
          .map((item) => resolveOsKey(item))
          .filter(Boolean),
      ),
    );

    const batchSize = 400;
    for (let index = 0; index < keys.length; index += batchSize) {
      const batch = writeBatch(db);
      keys
        .slice(index, index + batchSize)
        .forEach((key) => batch.delete(doc(db, "os_acumuladas", key)));
      await batch.commit();
    }

    setOsAcumuladas([]);
    void regenerateStaticData().catch(() => null);
  }

  return {
    historico,
    osAcumuladas,
    buscarNumsOSExistentes,
    salvarOSNovas,
    carregarTodasOS,
    salvarAnalise,
    limparHistorico,
    limparOSAcumuladas,
  };
}
