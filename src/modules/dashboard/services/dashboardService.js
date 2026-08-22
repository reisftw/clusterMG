import {
  getInternalStaticData,
  SNAPSHOT_DOMAINS,
} from "../../../services/internalStaticDataService";
import { buscarColaboradores } from "../../colaboradores/services/colaboradoresService";
import { buscarTodasFerias } from "../../ferias/services/feriasService";
import { buscarFeriados } from "../../feriados/services/feriadosService";
import { buscarVisitas } from "../../visitas/services/visitasService";

function sortByDate(items = []) {
  return [...items].sort((a, b) =>
    String(a?.date || a?.data || "").localeCompare(String(b?.date || b?.data || "")),
  );
}

function normalizeHoliday(item = {}) {
  return {
    ...item,
    date: item.date || item.data || "",
    name: item.name || item.nome || item.descricao || "",
  };
}

export const carregarDadosDashboard = async (force = false) => {
  const [dashboardSnapshot, visitas, feriasFallback, colaboradoresFallback, feriadosFallback] = await Promise.all([
    getInternalStaticData({
      force,
      domains: [
        SNAPSHOT_DOMAINS.DASHBOARD,
        SNAPSHOT_DOMAINS.RH,
        SNAPSHOT_DOMAINS.OPERACIONAL,
      ],
    }).catch(() => null),
    buscarVisitas().catch(() => []),
    buscarTodasFerias().catch(() => []),
    buscarColaboradores(force).catch(() => []),
    buscarFeriados().catch(() => []),
  ]);

  const dashboardDataSnapshot = dashboardSnapshot?.dashboard?.data ?? null;
  const feriados = dashboardDataSnapshot?.feriados ?? feriadosFallback;
  const ferias = dashboardSnapshot?.ferias ?? dashboardDataSnapshot?.ferias ?? feriasFallback;
  const colaboradoresSnapshot =
    dashboardSnapshot?.colaboradores?.items ??
    dashboardDataSnapshot?.colaboradores ??
    null;
  const colaboradores = Array.isArray(colaboradoresSnapshot) && colaboradoresSnapshot.length > 0
    ? colaboradoresSnapshot
    : colaboradoresFallback;

  const dashboardData = {
    ferias: Array.isArray(ferias) ? ferias : [],
    visitas: Array.isArray(visitas) ? visitas : [],
    colaboradores: Array.isArray(colaboradores) ? colaboradores : [],
    feriados: Array.isArray(feriados) ? sortByDate(feriados.map(normalizeHoliday)) : [],
  };

  return {
    data: dashboardData,
    fromStatic:
      Array.isArray(feriados) &&
      Array.isArray(ferias) &&
      Array.isArray(colaboradores),
  };
};

