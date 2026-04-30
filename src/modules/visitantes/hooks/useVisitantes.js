import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../../services/firebase";
import { getTodayVisitKey } from "../../../services/publicVisitTracker";
import {
  buildCacheKey,
  getOrLoadCachedValue,
} from "../../../services/firestoreCache";
import { logFirestoreRead } from "../../../services/firestoreMonitoring";

const CACHE_TTL_MS = 60 * 1000;

function toDate(value) {
  if (!value) return null;
  const date = value.toDate?.() || new Date(value);
  return Number.isNaN(date?.getTime?.()) ? null : date;
}

function getMonthRange(dayKey) {
  const baseDate = new Date(`${dayKey}T00:00:00`);
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);

  return {
    monthStartKey: start.toISOString().slice(0, 10),
    monthEndKey: end.toISOString().slice(0, 10),
  };
}

export function useVisitantes() {
  const [selectedDate, setSelectedDate] = useState(getTodayVisitKey());
  const [allVisitas, setAllVisitas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const carregar = async () => {
      setLoading(true);

      try {
        const { monthStartKey, monthEndKey } = getMonthRange(selectedDate);
        const { data, fromCache } = await getOrLoadCachedValue(
          buildCacheKey(["visitantes", monthStartKey, monthEndKey]),
          async () => {
            const visitasSnap = await getDocs(
              query(
                collection(db, "painel_visitas"),
                where("dayKey", ">=", monthStartKey),
                where("dayKey", "<=", monthEndKey),
                orderBy("dayKey", "asc"),
              ),
            );

            logFirestoreRead({
              source: "Visitantes/useVisitantes",
              operation: "getDocs",
              count: visitasSnap.size,
              details: `${monthStartKey}..${monthEndKey}`,
            });

            return visitasSnap.docs
              .map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
              }))
              .sort((a, b) => {
                const dateA = toDate(a.createdAt)?.getTime?.() || 0;
                const dateB = toDate(b.createdAt)?.getTime?.() || 0;
                return dateB - dateA;
              });
          },
          { ttlMs: CACHE_TTL_MS },
        );

        if (cancelled) return;

        if (fromCache) {
          logFirestoreRead({
            source: "Visitantes/useVisitantes",
            operation: "cache-hit",
            cacheHit: true,
          });
        }

        setAllVisitas(data || []);
        setLoading(false);
      } catch (error) {
        console.error("Erro ao carregar visitantes:", error);
        if (!cancelled) {
          setAllVisitas([]);
          setLoading(false);
        }
      }
    };

    carregar();

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const visitas = useMemo(
    () => allVisitas.filter((item) => item.dayKey === selectedDate),
    [allVisitas, selectedDate],
  );

  const resumo = useMemo(() => {
    const total = visitas.length;
    const diretas = visitas.filter((item) => item.sourceType === "direct").length;
    const externas = visitas.filter(
      (item) => item.sourceType === "referrer" || item.sourceType === "utm",
    ).length;
    const internas = visitas.filter((item) => item.sourceType === "internal").length;

    const origensMap = visitas.reduce((accumulator, item) => {
      const key = item.sourceLabel || "Desconhecida";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    const origens = Object.entries(origensMap)
      .map(([origem, totalOrigem]) => ({ origem, total: totalOrigem }))
      .sort((a, b) => b.total - a.total);

    return {
      total,
      diretas,
      externas,
      internas,
      origens,
    };
  }, [visitas]);

  const analytics = useMemo(() => {
    const selectedBase = new Date(`${selectedDate}T00:00:00`);
    const diaAnterior = new Date(selectedBase);
    diaAnterior.setDate(diaAnterior.getDate() - 1);
    const previousDayKey = diaAnterior.toISOString().slice(0, 10);

    const porDiaMap = allVisitas.reduce((accumulator, item) => {
      const key = item.dayKey || "";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    const seriesMensal = Object.entries(porDiaMap)
      .map(([dayKey, total]) => ({
        dayKey,
        label: new Date(`${dayKey}T00:00:00`).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        }),
        total,
      }))
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

    const porHoraMap = visitas.reduce((accumulator, item) => {
      const hora = toDate(item.createdAt)?.getHours?.();
      if (hora === undefined || hora === null) return accumulator;
      accumulator[hora] = (accumulator[hora] || 0) + 1;
      return accumulator;
    }, {});

    const seriesHoras = Array.from({ length: 24 }, (_, hora) => ({
      hora,
      total: porHoraMap[hora] || 0,
    }));

    const picoHora = seriesHoras.reduce(
      (best, item) => (item.total > best.total ? item : best),
      { hora: 0, total: 0 },
    );

    const topOrigem = resumo.origens[0] || null;
    const totalDiaAnterior = allVisitas.filter(
      (item) => item.dayKey === previousDayKey,
    ).length;

    return {
      visitasMes: allVisitas,
      totalMes: allVisitas.length,
      seriesMensal,
      seriesHoras,
      picoHora,
      topOrigem,
      totalDiaAnterior,
      diferencaDiaAnterior: visitas.length - totalDiaAnterior,
    };
  }, [allVisitas, resumo.origens, selectedDate, visitas]);

  return {
    visitas,
    loading,
    selectedDate,
    setSelectedDate,
    resumo,
    analytics,
  };
}
