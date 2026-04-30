export const TIPOS_RETIRADA = [
  "cancelamento ftth",
  "cancelamento loja",
  "retirada ftth",
  "retirada cancelamento - segunda tentativa",
];

export function detectarColunaTecnico(rows) {
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]);
  const priority = [
    "tecnicos","técnicos","tecnico","técnico","Técnico",
    "Tecnico","TÉCNICO","TECNICO","responsavel","Responsável","responsável",
  ];
  for (const p of priority) if (cols.includes(p)) return p;
  return cols[0];
}

export function detectarColunaTipo(rows) {
  const cols = Object.keys(rows[0] || {});
  const cands = ["tipo","TIPO","Tipo","tipoos","type"];
  for (const c of cands) if (cols.includes(c)) return c;
  return null;
}

export function extrairNumOS(r) {
  const v = r["num_o_s"] || r["numos"] || r["OS"] || r["numeroOs"] || r["Número OS"] || r["numero"];
  let s = String(v || "").trim();
  if (!s || s === "NaN") return null;
  if (s.includes("e") || s.includes("E")) {
    try { return BigInt(Math.round(Number(s))).toString(); } catch { return s; }
  }
  return s;
}

export function calcularDuracao(row) {
  try {
    const di = String(row["data_inicio_programado"]  || "").trim();
    const hi = String(row["hora_inicio_programado"]  || "").trim();
    const dt = String(row["data_termino_programado"] || "").trim();
    const ht = String(row["hora_termino_programado"] || "").trim();
    if (!di || !dt || di === "-" || dt === "-") return 0;
    const parse = (d, h) =>
      new Date(`${d.split("/").reverse().join("-")}T${h || "00:00:00"}`);
    const diff = (parse(dt, ht) - parse(di, hi)) / 3600000;
    return isNaN(diff) || diff < 0 ? 0 : parseFloat(diff.toFixed(2));
  } catch { return 0; }
}

export function calcularCapacidade(rows, tecnicos) {
  const tecCol = detectarColunaTecnico(rows);
  const porTecnico = {};
  const DESLOCAMENTO_PADRAO = 1.5;

  rows.forEach(r => {
    const tipoOS = String(r["tipo"] || r["Tipo"] || r["TIPO"] || "").trim().toLowerCase();
    const ehRetirada = TIPOS_RETIRADA.some(t => tipoOS.includes(t));

    const nomeRaw = String(r[tecCol] || "").trim();
    let tecId = Object.keys(tecnicos).find(id => {
      const n = tecnicos[id].nome.toLowerCase();
      const nm = nomeRaw.toLowerCase();
      return nm.includes(n) || n.includes(nm);
    });
    if (!tecId) {
      for (const seg of nomeRaw.split(",").map(s => s.trim())) {
        tecId = Object.keys(tecnicos).find(id => {
          const n = tecnicos[id].nome.toLowerCase();
          const s = seg.toLowerCase();
          return s.includes(n) || n.includes(s);
        });
        if (tecId) break;
      }
    }
    if (!tecId) return;

    const nome = tecnicos[tecId].nome;
    const dataOS = String(r["data_inicio_programado"] || "").trim();
    if (!dataOS || dataOS === "-") return;

    if (!porTecnico[nome]) porTecnico[nome] = { porDia: {}, tecId };
    if (!porTecnico[nome].porDia[dataOS])
      porTecnico[nome].porDia[dataOS] = { os: 0, horas: 0, retiradas: 0 };

    if (ehRetirada) {
      porTecnico[nome].porDia[dataOS].retiradas++;
    } else {
      porTecnico[nome].porDia[dataOS].os++;
      porTecnico[nome].porDia[dataOS].horas += calcularDuracao(r);
    }
  });

  const NOMES_DIA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

  const resultadosTecnicos = Object.entries(porTecnico).map(([nome, dados]) => {
    const tecId = dados.tecId;
    const tec = tecnicos[tecId];

    const jornada = tec?.jornada || 8;
    const escala = jornada >= 12 ? "12x36" : "seg-sex";
    const deslocamento = tec?.deslocamento ?? DESLOCAMENTO_PADRAO;
    const capacidadeUtil = parseFloat((jornada - deslocamento).toFixed(2));

    const diasOrdenados = Object.keys(dados.porDia).sort((a, b) => {
      const [da, ma, ya] = a.split("/").map(Number);
      const [db, mb, yb] = b.split("/").map(Number);
      return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
    });

    const diasAvaliados = diasOrdenados.map((data, idx) => {
      const [dd, mm, yyyy] = data.split("/").map(Number);
      const dateObj = new Date(yyyy, mm - 1, dd);
      const diaSemana = dateObj.getDay();
      const nomeDia = NOMES_DIA[diaSemana];

      if (escala === "seg-sex") {
        if (diaSemana === 0 || diaSemana === 6) return null;
      } else {
        if (idx % 2 !== 0) return null;
      }

      const diaInfo = dados.porDia[data];
      const horasUsadas = parseFloat(diaInfo.horas.toFixed(2));
      const capacidadeRestante = parseFloat(Math.max(0, capacidadeUtil - horasUsadas).toFixed(2));
      const temCapacidade = capacidadeRestante >= 0.25;
      const pctOcupado = capacidadeUtil > 0
        ? Math.min(100, Math.round((horasUsadas / capacidadeUtil) * 100))
        : 0;

      return {
        data, nomeDia, escala,
        os: diaInfo.os,
        retiradas: diaInfo.retiradas || 0,
        horasUsadas, capacidadeRestante, temCapacidade, pctOcupado,
      };
    }).filter(d => d !== null);

    const totalOS       = diasAvaliados.reduce((s, d) => s + d.os, 0);
    const totalHoras    = parseFloat(diasAvaliados.reduce((s, d) => s + d.horasUsadas, 0).toFixed(2));
    const totalRetiradas = diasAvaliados.reduce((s, d) => s + d.retiradas, 0);
    const diasComCapacidade  = diasAvaliados.filter(d => d.temCapacidade).length;
    const diasSemCapacidade  = diasAvaliados.filter(d => !d.temCapacidade).length;
    const temCapacidade      = diasComCapacidade > 0;
    const mediaHorasDia      = diasAvaliados.length > 0 ? totalHoras / diasAvaliados.length : 0;
    const pctOcupado         = capacidadeUtil > 0
      ? Math.min(100, Math.round((mediaHorasDia / capacidadeUtil) * 100))
      : 0;
    const melhorDia          = diasAvaliados.find(d => d.temCapacidade);
    const capacidadeRestante = melhorDia?.capacidadeRestante || 0;

    return {
      nome, tecId,
      regional: tec?.regional,
      jornada, escala, deslocamento, capacidadeUtil,
      horasUsadas: totalHoras, capacidadeRestante, temCapacidade,
      totalOS, totalRetiradas, pctOcupado,
      diasAvaliados, diasComCapacidade, diasSemCapacidade,
    };
  });

  return {
    resultadosTecnicos,
    comCapacidade: resultadosTecnicos.filter(t => t.temCapacidade).length,
    semCapacidade: resultadosTecnicos.filter(t => !t.temCapacidade).length,
    totalTecnicos: resultadosTecnicos.length,
  };
}