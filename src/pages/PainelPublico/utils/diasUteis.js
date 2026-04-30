import { MONTH_ORDER } from './constants';

export function diasUteisDoMes(mes, feriadosSet) {
  const monthIdx = MONTH_ORDER.indexOf(mes);
  if (monthIdx < 0) return 22;
  const ano = 2026;
  const m = monthIdx + 1;
  const diasNoMes = new Date(ano, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    const dt = new Date(ano, m - 1, d);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    const key = String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    if (feriadosSet && feriadosSet.has(key)) continue;
    count++;
  }
  return count;
}

export function isDiaUtil(mes, dia, feriadosSet) {
  const monthIdx = MONTH_ORDER.indexOf(mes);
  if (monthIdx < 0) return true;
  const dt = new Date(2026, monthIdx, dia);
  const dow = dt.getDay();
  if (dow === 0 || dow === 6) return false;
  const m = monthIdx + 1;
  const key = String(m).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
  if (feriadosSet && feriadosSet.has(key)) return false;
  return true;
}