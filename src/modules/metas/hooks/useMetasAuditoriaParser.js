import * as XLSX from 'xlsx';

const AG_ABA_MES = {
  'AG_JAN': 'Janeiro',  'AG_FEV': 'Fevereiro',
  'AG_MAR': 'Março',    'AG_ABR': 'Abril',
  'AG_MAI': 'Maio',     'AG_JUN': 'Junho',
  'AG_JUL': 'Julho',    'AG_AGO': 'Agosto',
  'AG_SET': 'Setembro', 'AG_OUT': 'Outubro',
  'AG_NOV': 'Novembro', 'AG_DEZ': 'Dezembro',
};

function normalizaAba(nome) {
  return nome
    .replace(/[^\w\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function cvCell(ws, row, col) {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = ws[addr];
  if (!cell || cell.v === undefined || cell.v === null || cell.v === '') return 0;
  const n = parseFloat(cell.v);
  return isNaN(n) ? 0 : n;
}

export function parseAgentesWorkbook(wb) {
  const resultado = {};

  for (const [chave, mes] of Object.entries(AG_ABA_MES)) {
    const realName = wb.SheetNames.find(n => normalizaAba(n).includes(chave));
    if (!realName) continue;

    const ws = wb.Sheets[realName];
    if (!ws || !ws['!ref']) continue;

    const range      = XLSX.utils.decode_range(ws['!ref']);
    const totalCols  = range.e.c + 1;
    const hasMetaCols = totalCols >= 35;

    const cidades = [];
    for (let row = 5; row <= 23; row++) {
      const cidadeAddr = XLSX.utils.encode_cell({ r: row, c: 0 });
      const cidadeCell = ws[cidadeAddr];
      if (!cidadeCell?.v) continue;
      const cidade = String(cidadeCell.v).trim();
      if (!cidade || cidade === 'CIDADE') continue;

      const daily = [];
      for (let d = 1; d <= 31; d++) {
        daily.push(cvCell(ws, row, d));
      }

      let total = 0, cancelamentos = 0, meta = 0;

      if (hasMetaCols) {
        total         = cvCell(ws, row, 32) || daily.reduce((s, v) => s + v, 0);
        cancelamentos = cvCell(ws, row, 33);
        meta          = cvCell(ws, row, 34);
      } else {
        total         = daily.reduce((s, v) => s + v, 0);
        cancelamentos = cvCell(ws, row, 32);
      }

      const pct = meta > 0 ? parseFloat(((total / meta) * 100).toFixed(1)) : 0;
      cidades.push({ cidade, total, cancelamentos, meta, pct, daily });
    }

    if (cidades.length > 0) resultado[mes] = cidades;
  }

  return resultado;
}