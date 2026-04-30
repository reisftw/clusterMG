import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buscarAnalisesProjecao,
  buildAnaliseId,
  excluirAnaliseProjecao,
  salvarAnaliseProjecao,
} from "../services/analisesProjecaoService";
import { META_SAZONAL } from "../../../pages/PainelPublico/utils/constants";
import { regenerateStaticData } from "../../../services/staticDataService";

const LOCAL_BACKUP_KEY = "analises:projecao:backup";

export const MONTH_OPTIONS = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

function monthLabel(monthNumber) {
  return MONTH_OPTIONS.find((item) => item.value === Number(monthNumber))?.label || "-";
}

function getMetaSazonalPercent(monthLabelValue) {
  if (!monthLabelValue) return 80;

  if (monthLabelValue === "Março") {
    return META_SAZONAL["Março"] ?? META_SAZONAL["MarÃ§o"] ?? 75;
  }

  return META_SAZONAL[monthLabelValue] ?? 80;
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeEntry(item) {
  const abertas = Math.max(0, Number(item?.abertas) || 0);
  const realizadas = Math.max(0, Number(item?.realizadas) || 0);

  return {
    ...item,
    ano: Number(item?.ano) || new Date().getFullYear(),
    mes: Number(item?.mes) || 1,
    abertas,
    realizadas,
    taxaConversao: abertas > 0 ? realizadas / abertas : 0,
    mesLabel: monthLabel(item?.mes),
  };
}

function readLocalBackup() {
  if (!canUseLocalStorage()) return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeEntry) : [];
  } catch {
    return [];
  }
}

function writeLocalBackup(items) {
  if (!canUseLocalStorage()) return;

  try {
    const serialized = (items || []).map((item) => ({
      id: item.id,
      ano: item.ano,
      mes: item.mes,
      abertas: item.abertas,
      realizadas: item.realizadas,
    }));
    window.localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(serialized));
  } catch {
    // Falha no backup local nao impede o fluxo principal.
  }
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function round(value) {
  return Math.round(Number(value) || 0);
}

function averageRatioForMonths(entries, selectedYear, anchorMonth, targetMonth) {
  const previousYears = Array.from(
    new Set(entries.filter((item) => item.ano < selectedYear).map((item) => item.ano)),
  );

  const ratios = previousYears
    .map((year) => {
      const anchor = entries.find((item) => item.ano === year && item.mes === anchorMonth);
      const target = entries.find((item) => item.ano === year && item.mes === targetMonth);
      const anchorValue = Number(anchor?.abertas) || 0;
      const targetValue = Number(target?.abertas) || 0;

      if (anchorValue <= 0 || targetValue <= 0) return null;
      return targetValue / anchorValue;
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  return average(ratios);
}

function buildProjection(entries, selectedYear) {
  const currentYearEntries = entries
    .filter((item) => item.ano === selectedYear)
    .sort((a, b) => a.mes - b.mes);

  const lastMonthWithData = currentYearEntries.at(-1)?.mes ?? 0;
  const futureMonths = MONTH_OPTIONS.filter((item) => item.value > lastMonthWithData);

  const allRates = entries
    .filter((item) => item.abertas > 0)
    .map((item) => item.realizadas / item.abertas);

  const currentYearRates = currentYearEntries
    .filter((item) => item.abertas > 0)
    .map((item) => item.realizadas / item.abertas);

  const currentYearAbertas = currentYearEntries.map((item) => item.abertas);
  const recentCurrentYearEntries = currentYearEntries.slice(-3);
  const recentCurrentYearAverage =
    average(recentCurrentYearEntries.map((item) => item.abertas)) ||
    average(currentYearAbertas) ||
    average(entries.map((item) => item.abertas)) ||
    0;
  const currentYearRate = average(currentYearRates) || 0;
  const fallbackRate = currentYearRate || average(allRates);
  const fallbackAbertas =
    average(currentYearAbertas) || average(entries.map((item) => item.abertas));
  const anchorMonth = lastMonthWithData || currentYearEntries.at(-1)?.mes || 0;
  const anchorValue = Number(currentYearEntries.at(-1)?.abertas) || recentCurrentYearAverage || fallbackAbertas;

  const conversionYearsUsed = Array.from(
    new Set(
      entries
        .filter((item) => item.abertas > 0)
        .map((item) => item.ano),
    ),
  ).sort((a, b) => a - b);

  const projectionRows = futureMonths.map((month) => {
    const historicalForMonth = entries.filter(
      (item) => item.ano < selectedYear && item.mes === month.value,
    );
    const neighborMonths = [month.value - 1, month.value, month.value + 1].filter(
      (monthValue) => monthValue >= 1 && monthValue <= 12,
    );
    const seasonalBandHistory = entries.filter(
      (item) => item.ano < selectedYear && neighborMonths.includes(item.mes),
    );

    const historicalMonthRates = historicalForMonth
      .filter((item) => item.abertas > 0)
      .map((item) => item.realizadas / item.abertas);
    const historicalMonthAbertas = historicalForMonth.map((item) => item.abertas);
    const seasonalBandAbertas = seasonalBandHistory.map((item) => item.abertas);

    const historicalAbertasMedia = average(historicalMonthAbertas);
    const historicalAbertasMediana = median(historicalMonthAbertas);
    const historicalAbertas =
      historicalAbertasMedia && historicalAbertasMediana
        ? (historicalAbertasMedia * 0.65) + (historicalAbertasMediana * 0.35)
        : historicalAbertasMedia || historicalAbertasMediana || 0;
    const seasonalBandAverage =
      average(seasonalBandAbertas) || historicalAbertas || fallbackAbertas || 0;
    const historicalMonthToAnchorRatio = anchorMonth
      ? averageRatioForMonths(entries, selectedYear, anchorMonth, month.value)
      : 0;
    const projectedCurrentRhythm =
      historicalMonthToAnchorRatio > 0
        ? anchorValue * historicalMonthToAnchorRatio
        : seasonalBandAverage || historicalAbertas || recentCurrentYearAverage || fallbackAbertas;
    const blendedProjection =
      (historicalAbertas * 0.45) +
      (projectedCurrentRhythm * 0.35) +
      (seasonalBandAverage * 0.20);
    const minimumRealisticFloor =
      currentYearEntries.length >= 3
        ? projectedCurrentRhythm * 0.9
        : 0;
    const projectedAbertas = Math.max(
      blendedProjection || historicalAbertas || projectedCurrentRhythm || fallbackAbertas || 0,
      minimumRealisticFloor,
    );
    const projectedRate = average(historicalMonthRates) || fallbackRate || 0;
    const metaSazonalPercentual = getMetaSazonalPercent(month.label) / 100;
    const metaDoMes = projectedAbertas * metaSazonalPercentual;

    return {
      ano: selectedYear,
      mes: month.value,
      mesLabel: month.label,
      abertasProjetadas: round(projectedAbertas),
      metaDoMes: round(metaDoMes),
      metaSazonalPercentual,
      taxaProjetada: projectedRate,
      baseHistorica: historicalForMonth.length,
      referenciaSazonal: round(historicalAbertas),
      referenciaFaixa: round(seasonalBandAverage),
      referenciaRitmoAtual: round(projectedCurrentRhythm),
    };
  });

  const realizadoAteAgora = currentYearEntries.reduce(
    (sum, item) => sum + item.realizadas,
    0,
  );
  const abertasAteAgora = currentYearEntries.reduce(
    (sum, item) => sum + item.abertas,
    0,
  );
  const projetadoRestante = projectionRows.reduce(
    (sum, item) => sum + item.metaDoMes,
    0,
  );
  const abertasProjetadasRestante = projectionRows.reduce(
    (sum, item) => sum + item.abertasProjetadas,
    0,
  );
  const totalProjetadoAbertasAno = abertasAteAgora + abertasProjetadasRestante;
  const mediaProjetadaAbertas = average(
    projectionRows.map((item) => item.abertasProjetadas),
  );
  const picoProjetado =
    projectionRows.reduce(
      (highest, item) =>
        !highest || item.abertasProjetadas > highest.abertasProjetadas ? item : highest,
      null,
    ) || null;

  return {
    currentYearEntries,
    lastMonthWithData,
    projectionRows,
    summary: {
      abertasAteAgora,
      realizadoAteAgora,
      abertasProjetadasRestante,
      projetadoRestante,
      totalProjetadoAbertasAno,
      totalProjetadoAno: realizadoAteAgora + projetadoRestante,
      taxaMediaAtual: fallbackRate,
      taxaMediaAnoAtual: currentYearRate,
      taxaMediaTodosAnos: average(allRates),
      anosConversao: conversionYearsUsed,
      mediaProjetadaAbertas,
      latestKnownAbertas: round(currentYearEntries.at(-1)?.abertas || 0),
      ritmoAtualAbertas: round(recentCurrentYearAverage),
      picoProjetado,
      mesesComBase: currentYearEntries.length,
    },
  };
}

export function useAnalisesProjecao() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carregar = useCallback(async (force = false) => {
    setLoading(true);
    setError("");

    try {
      const rows = await buscarAnalisesProjecao(force);
      const loadedItems = (rows || []).map(normalizeEntry);
      setItems(loadedItems);
      writeLocalBackup(loadedItems);
    } catch (err) {
      console.error("Erro ao carregar analises de projecao:", err);
      setItems([]);
      setError("Nao foi possivel carregar o JSON interno da analise.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = useCallback(async (dados) => {
    const payload = {
      ano: Number(dados.ano),
      mes: Number(dados.mes),
      abertas: Math.max(0, Number(dados.abertas) || 0),
      realizadas: Math.max(0, Number(dados.realizadas) || 0),
    };

    await salvarAnaliseProjecao(payload);

    setItems((current) => {
      const next = current.filter(
        (item) => !(item.ano === payload.ano && item.mes === payload.mes),
      );
      next.push(
        normalizeEntry({
          id: buildAnaliseId(payload.ano, payload.mes),
          ...payload,
        }),
      );

      const sortedItems = next.sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
      writeLocalBackup(sortedItems);
      return sortedItems;
    });
    void regenerateStaticData().catch(() => null);
  }, []);

  const excluir = useCallback(async (id) => {
    await excluirAnaliseProjecao(id);
    setItems((current) => {
      const next = current.filter((item) => item.id !== id);
      writeLocalBackup(next);
      return next;
    });
    void regenerateStaticData().catch(() => null);
  }, []);

  const years = useMemo(() => {
    const uniqueYears = new Set(items.map((item) => item.ano));
    uniqueYears.add(new Date().getFullYear());
    return Array.from(uniqueYears).sort((a, b) => b - a);
  }, [items]);

  const buildYearProjection = useCallback(
    (year) => buildProjection(items, Number(year)),
    [items],
  );

  return {
    items,
    years,
    loading,
    error,
    carregar: () => carregar(true),
    salvar,
    excluir,
    buildYearProjection,
  };
}
