import { obterIndiceMes } from "./mes";

export const FERIADOS_NACIONAIS_FIXOS = Object.freeze([
  "01-01",
  "04-21",
  "05-01",
  "09-07",
  "10-12",
  "11-02",
  "11-15",
  "12-25",
]);

/**
 * Normaliza uma colecao de feriados para `Set`.
 * @param {Iterable<string>|null|undefined} feriados
 * @returns {Set<string>}
 */
export function normalizarFeriados(feriados) {
  const normalized = feriados instanceof Set
    ? new Set(feriados)
    : new Set(feriados || []);

  FERIADOS_NACIONAIS_FIXOS.forEach((feriado) => {
    normalized.add(feriado);
  });

  return normalized;
}

/**
 * Formata a chave `MM-DD` de um feriado.
 * @param {number} mes
 * @param {number} dia
 * @returns {string}
 */
export function formatarChaveFeriado(mes, dia) {
  return `${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Indica se um dia e util.
 * @param {string|number} mes
 * @param {number} dia
 * @param {Iterable<string>|null|undefined} feriados
 * @param {number} [ano]
 * @returns {boolean}
 */
export function isDiaUtil(mes, dia, feriados, ano = new Date().getFullYear()) {
  const monthIndex = obterIndiceMes(mes);
  if (monthIndex < 0) return true;

  const date = new Date(ano, monthIndex, dia);
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const feriadosSet = normalizarFeriados(feriados);
  return !feriadosSet.has(formatarChaveFeriado(monthIndex + 1, dia));
}

/**
 * Conta quantos dias uteis existem no mes.
 * @param {string|number} mes
 * @param {Iterable<string>|null|undefined} feriados
 * @param {number} [ano]
 * @returns {number}
 */
export function diasUteisDoMes(
  mes,
  feriados,
  ano = new Date().getFullYear(),
) {
  const monthIndex = obterIndiceMes(mes);
  if (monthIndex < 0) return 22;

  const totalDias = new Date(ano, monthIndex + 1, 0).getDate();
  let total = 0;

  for (let dia = 1; dia <= totalDias; dia += 1) {
    if (isDiaUtil(mes, dia, feriados, ano)) {
      total += 1;
    }
  }

  return total;
}

/**
 * Conta quantos dias uteis restam no mes a partir do ultimo dia com dados.
 * @param {string|number} mes
 * @param {Iterable<string>|null|undefined} feriados
 * @param {number} [ultimoDiaComDados]
 * @param {number} [ano]
 * @returns {number}
 */
export function diasUteisRestantesNoMes(
  mes,
  feriados,
  ultimoDiaComDados = 0,
  ano = new Date().getFullYear(),
) {
  const monthIndex = obterIndiceMes(mes);
  if (monthIndex < 0) return 0;

  const primeiroDia = Math.max(1, Number(ultimoDiaComDados) + 1);
  const totalDias = new Date(ano, monthIndex + 1, 0).getDate();
  let total = 0;

  for (let dia = primeiroDia; dia <= totalDias; dia += 1) {
    if (isDiaUtil(mes, dia, feriados, ano)) {
      total += 1;
    }
  }

  return total;
}

