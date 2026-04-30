import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  buscarTodasMetas,
  salvarMetaMes,
  salvarUltimaAtualizacao,
  buscarUltimaAtualizacao,
  buscarFeriados,
} from '../services/metasService';
import { salvarAuditoriaAgentes } from '../services/metasAuditoriaService';
import { parseAgentesWorkbook } from './useMetasAuditoriaParser';
import { salvarDashboard } from '../services/dashboardService';
import { salvarDashboardAgentes } from '../services/dashboardAgentesService';
import { regenerateStaticData } from '../../../services/staticDataService';


const MONTHORDER = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const META_SAZONAL = {
  Janeiro: 65, Fevereiro: 65, 'Março': 75, Abril: 85,
  Maio: 90, Junho: 90, Julho: 90, Agosto: 90,
  Setembro: 85, Outubro: 85, Novembro: 75, Dezembro: 65,
};

const DASHROW = {
  Janeiro: 4, Fevereiro: 5, 'Março': 6, Abril: 7,
  Maio: 8, Junho: 9, Julho: 10, Agosto: 11,
  Setembro: 12, Outubro: 13, Novembro: 14, Dezembro: 15,
};

const CFGFEV = { techStart: 8, regStart: 27, agenteRow: 19, lojaRow: 23, totalCol: 'AE', dayColStart: 2, dayColEnd: 29 };
const CFGDEF = { techStart: 7, regStart: 26, agenteRow: 18, lojaRow: 22, totalCol: 'AH', dayColStart: 2, dayColEnd: 32 };

const TECHNAMES = [
  'PHILIPE SANTOS', 'NATHAN PEREIRA', 'JOSEVAL CAMPOS',
  'JOÃO EZIQUIEL', 'PAULO XAVIER', 'CLAUDSON FARIA', 'ANDRE PAULA',
];
const REGNAMES = [
  'Central Mineira', 'Metropolitana sub 1', 'Metropolitana sub 2',
  'Metropolitana sub 3', 'Oeste de Minas', 'Sul de Minas', 'Centro Oeste',
];

// Feriados nacionais fixos
const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];

function encCol(idx) {
  return XLSX.utils.encode_col(idx);
}

function cv(ws, col, row) {
  if (!ws) return 0;
  const cell = ws[col + row];
  if (!cell || cell.v === undefined || cell.v === null || cell.v === '') return 0;
  const n = parseFloat(cell.v);
  return isNaN(n) ? 0 : n;
}

function ct(ws, col, row) {
  const cell = ws?.[col + row] ?? null;
  return cell ? String(cell.v).trim() : '';
}

function normalizeSheetName(name) {
  return name
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findSheet(wb, target) {
  const norm = normalizeSheetName(target);
  const realName = wb.SheetNames.find(n => normalizeSheetName(n) === norm);
  return realName ? wb.Sheets[realName] : undefined;
}

// feriadosExtras: array de strings 'MM-DD' vindos do Firebase
export function diasUteis(mes, feriadosExtras = []) {
  const idx = MONTHORDER.indexOf(mes);
  if (idx < 0) return 22;
  const m = idx + 1;
  const ano = new Date().getFullYear();
  const diasNoMes = new Date(ano, m, 0).getDate();
  const todosFeriados = [...FERIADOS_FIXOS, ...feriadosExtras];
  let count = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    const dt = new Date(ano, m - 1, d);
    if (dt.getDay() === 0 || dt.getDay() === 6) continue;
    const key = String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    if (todosFeriados.includes(key)) continue;
    count++;
  }
  return count;
}

export function isDiaUtil(mes, dia, feriadosExtras = []) {
  const idx = MONTHORDER.indexOf(mes);
  if (idx < 0) return true;
  const m = idx + 1;
  const ano = new Date().getFullYear();
  const dt = new Date(ano, m - 1, dia);
  if (dt.getDay() === 0 || dt.getDay() === 6) return false;
  const key = String(m).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
  const todosFeriados = [...FERIADOS_FIXOS, ...feriadosExtras];
  return !todosFeriados.includes(key);
}

export function parseMetasWorkbook(wb, feriadosExtras = []) {
  const result = {};

  const wsDash = findSheet(wb, 'DASHBOARD');
  const wsMult = findSheet(wb, 'MULTAS');

  console.log('[useMetas] DASHBOARD encontrado:', !!wsDash);
  console.log('[useMetas] MULTAS encontrado:', !!wsMult);

  MONTHORDER.forEach(mes => {
    const wsMonth = findSheet(wb, mes);
    const dRow = DASHROW[mes];
    if (!dRow) return;

    const cfg = mes === 'Fevereiro' ? CFGFEV : CFGDEF;

    const cancelamentos = cv(wsDash, 'B', dRow);
    const meta = cv(wsDash, 'C', dRow);
    const totalOS = cv(wsDash, 'D', dRow);
    const pctRaw = cv(wsDash, 'F', dRow);
    const percentAchieved = pctRaw > 1 ? pctRaw : (pctRaw * 100).toFixed(1);
    const metaSazonal = META_SAZONAL[mes] ?? 80;

    const multCols = {
      Janeiro: 9, Fevereiro: 10, 'Março': 11, Abril: 12,
      Maio: 13, Junho: 14, Julho: 15, Agosto: 16,
      Setembro: 17, Outubro: 18, Novembro: 19, Dezembro: 20,
    };
    let totalMultas = 0;
    if (wsMult) {
      const mCol = multCols[mes];
      if (mCol !== undefined) totalMultas = cv(wsMult, encCol(mCol - 1), 34);
    }

    const propMult = totalOS > 0 && totalMultas > 0 ? (totalOS / totalMultas).toFixed(1) : 0;

    const du = diasUteis(mes, feriadosExtras);
    const metaDiaria = du > 0 ? Math.ceil(meta / du) : 0;

    const technicians = [];
    for (let i = 0; i < 7; i++) {
      const r = cfg.techStart + i;
      const name = wsMonth ? ct(wsMonth, 'B', r) : TECHNAMES[i];
      const total = wsMonth ? cv(wsMonth, cfg.totalCol, r) : 0;
      const daily = [];
      for (let d = cfg.dayColStart; d <= cfg.dayColEnd; d++) {
        daily.push(wsMonth ? cv(wsMonth, encCol(d), r) : 0);
      }
      technicians.push({ name, total, daily, percent: ((total / 110) * 100).toFixed(1) });
    }
    technicians.sort((a, b) => b.total - a.total);

    const regionais = [];
    for (let i = 0; i < 7; i++) {
      const r = cfg.regStart + i;
      const name = wsMonth ? ct(wsMonth, 'B', r) : REGNAMES[i];
      const total = wsMonth ? cv(wsMonth, cfg.totalCol, r) : 0;
      const daily = [];
      for (let d = cfg.dayColStart; d <= cfg.dayColEnd; d++) {
        daily.push(wsMonth ? cv(wsMonth, encCol(d), r) : 0);
      }
      regionais.push({ name, total, daily, percent: ((total / 110) * 100).toFixed(1) });
    }
    regionais.sort((a, b) => b.total - a.total);

    const agenteTotal = wsMonth ? cv(wsMonth, cfg.totalCol, cfg.agenteRow) : 0;
    const lojaTotal   = wsMonth ? cv(wsMonth, cfg.totalCol, cfg.lojaRow)   : 0;
    const agenteDai   = [];
    const lojaDai     = [];
    for (let d = cfg.dayColStart; d <= cfg.dayColEnd; d++) {
      agenteDai.push(wsMonth ? cv(wsMonth, encCol(d), cfg.agenteRow) : 0);
      lojaDai.push(wsMonth  ? cv(wsMonth, encCol(d), cfg.lojaRow)   : 0);
    }

    const numDays    = cfg.dayColEnd - cfg.dayColStart + 1;
    const saldoDiario = [];
    let saldoMes = 0;
    for (let d = 0; d < numDays; d++) {
      const diaNum   = d + 1;
      const util     = isDiaUtil(mes, diaNum, feriadosExtras);
      const tecTot   = technicians.reduce((s, t) => s + (t.daily[d] || 0), 0);
      const regTot   = regionais.reduce((s, r) => s + (r.daily[d] || 0), 0);
      const agDia    = agenteDai[d] || 0;
      const lojaDia  = lojaDai[d]  || 0;
      const totalDia = tecTot + regTot + agDia + lojaDia;
      const metaDoDia = util ? metaDiaria : 0;
      saldoMes += totalDia - metaDoDia;
      saldoDiario.push({
        dia: diaNum, util, equipe: tecTot, agente: agDia,
        loja: lojaDia, regionais: regTot, totalDia,
        metaDia: metaDoDia, saldoDia: totalDia - metaDoDia, saldoMes,
      });
    }

    let lastActive = 0;
    saldoDiario.forEach((d, i) => { if (d.totalDia > 0) lastActive = i; });
    const saldoFiltrado = saldoDiario.slice(0, lastActive + 1);

    const multasDiarias = [];
    if (wsMult) {
      for (let d = 1; d <= 31; d++) {
        const lancadas  = cv(wsMult, 'B', d + 1);
        const retiradas = cv(wsMult, 'C', d + 1);
        if (lancadas > 0 || retiradas > 0) {
          multasDiarias.push({ dia: d, lancadas, retiradas });
        }
      }
    }

    result[mes] = {
      mes, cancelamentos, meta, metaSazonal, totalOS,
      percentAchieved, metaDiaria, totalMultas, propMult,
      technicians, regionais, agenteTotal, lojaTotal,
      saldoDiario: saldoFiltrado, multasDiarias,
      status: parseFloat(percentAchieved) >= metaSazonal
        ? 'Meta atingida!'
        : `Faltam ${Math.max(0, meta - totalOS).toFixed(0)} O.S`,
    };
  });

  return result;
}

export const useMetas = () => {
  const [allData,        setAllData]        = useState({});
  const [loading,        setLoading]        = useState(true);
  const [uploading,      setUploading]      = useState(false);
  const [lastUpdate,     setLastUpdate]     = useState(null);
  const mesAtual = MONTHORDER[new Date().getMonth()];
  const [mesSelecionado, setMesSelecionado] = useState(mesAtual);
  const [feriadosExtras, setFeriadosExtras] = useState([]);

  // Busca feriados combinados (BrasilAPI + Firebase) via metasService
  const buscarFeriadosFirebase = useCallback(async () => {
    try {
      const feriadosSet = await buscarFeriados(true); // retorna Set de "MM-DD"
      return Array.from(feriadosSet);
    } catch (e) {
      console.warn('[useMetas] Erro ao buscar feriados:', e);
      return [];
    }
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [dados, lu, extras] = await Promise.all([
        buscarTodasMetas(true),
        buscarUltimaAtualizacao(),
        buscarFeriadosFirebase(),
      ]);
      if (dados && Object.keys(dados).length > 0) setAllData(dados);
      if (lu) setLastUpdate(lu);
      setFeriadosExtras(extras);
    } catch (e) {
      console.error('Erro ao carregar metas', e);
    } finally {
      setLoading(false);
    }
  }, [buscarFeriadosFirebase]);

  useEffect(() => { carregar(); }, [carregar]);

  const processarPlanilha = useCallback(async (file) => {
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false });
      console.log('[useMetas] Abas encontradas no xlsx:', wb.SheetNames);

      // Busca feriados do Firebase antes de parsear
      const extras = await buscarFeriadosFirebase();
      setFeriadosExtras(extras);
      console.log('[useMetas] Feriados Firebase:', extras);

      const parsed = parseMetasWorkbook(wb, extras);
      console.log('[useMetas] Meses parseados:', Object.keys(parsed));
      setAllData(parsed);

      // Salva metas normais
      await Promise.all(
        Object.entries(parsed).map(([mes, dados]) => salvarMetaMes(mes, dados))
      );

      await salvarDashboard(parsed);
console.log('[useMetas] Dashboard salvo com sucesso');


      // Salva auditoria de agentes autorizados
      const agentesData = parseAgentesWorkbook(wb);
      if (Object.keys(agentesData).length > 0) {
        await Promise.all(
          Object.entries(agentesData).map(([mes, cidades]) =>
            salvarAuditoriaAgentes(mes, cidades)
          )
        );
        console.log('[useMetas] Auditoria de agentes salva:', Object.keys(agentesData));
         await salvarDashboardAgentes(agentesData);
  console.log('[useMetas] Dashboard agentes salvo com sucesso');
      }
      const now = new Date();
      const txt = `Última atualização: ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')} às ${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
      await salvarUltimaAtualizacao(txt);
      setLastUpdate(txt);
      await regenerateStaticData({ scope: 'metas' });
      setMesSelecionado(MONTHORDER[new Date().getMonth()]);
    } catch (e) {
      console.error('Erro ao processar planilha', e);
      throw e;
    } finally {
      setUploading(false);
    }
  }, [buscarFeriadosFirebase]);
  

  return {
    allData,
    dadosMes: allData[mesSelecionado] ?? null,
    loading, uploading, lastUpdate,
    mesSelecionado, setMesSelecionado,
    processarPlanilha, carregar,
    feriadosExtras,
  };
};
