import React, { useState, useMemo } from "react";
import { FileDown, BarChart2, Check } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const RELATORIOS = [
  // 👷 Técnicos
  {
    id: "tec_por_regional",
    grupo: "👷 Técnicos",
    label: "Técnicos cadastrados por regional",
  },
  {
    id: "tec_ocupacao",
    grupo: "👷 Técnicos",
    label: "Comparativo de ocupação entre técnicos",
  },
  {
    id: "tec_mais_os",
    grupo: "👷 Técnicos",
    label: "Técnicos com mais OS no período",
  },
  {
    id: "tec_ociosidade",
    grupo: "👷 Técnicos",
    label: "Técnicos com maior ociosidade",
  },
  {
    id: "tec_eficiencia",
    grupo: "👷 Técnicos",
    label: "Índice de Eficiência por Técnico",
  },

  // 📊 OS / Produtividade
  {
    id: "os_por_regional",
    grupo: "📊 OS / Produtividade",
    label: "OS por regional no período",
  },
  {
    id: "os_por_tipo",
    grupo: "📊 OS / Produtividade",
    label: "OS por tipo (retirada, cancelamento, etc.)",
  },
  {
    id: "os_evolucao",
    grupo: "📊 OS / Produtividade",
    label: "Evolução de OS ao longo dos uploads",
  },
  {
    id: "os_dia_semana",
    grupo: "📊 OS / Produtividade",
    label: "OS por dia da semana",
  },

  // ⏱️ Ociosidade
  {
    id: "ocio_por_tecnico",
    grupo: "⏱️ Ociosidade",
    label: "Horas ociosas por técnico",
  },
  {
    id: "ocio_por_regional",
    grupo: "⏱️ Ociosidade",
    label: "Horas ociosas por regional",
  },
  {
    id: "ocio_dias",
    grupo: "⏱️ Ociosidade",
    label: "Dias cheios vs dias livres por técnico",
  },
  {
    id: "ocio_dia_semana",
    grupo: "⏱️ Ociosidade",
    label: "Ociosidade por dia da semana",
  },

  // 🎯 Metas
  {
    id: "meta_retiradas",
    grupo: "🎯 Metas",
    label: "Meta de retiradas por regional (110/mês)",
  },
  {
    id: "meta_vs_tecnico",
    grupo: "🎯 Metas",
    label: "Retiradas vs Meta — detalhe por técnico",
  },

  // 💸 Custos
  {
    id: "custo_por_tecnico",
    grupo: "💸 Custos",
    label: "Custo de ociosidade por técnico",
  },
  {
    id: "custo_por_regional",
    grupo: "💸 Custos",
    label: "Custo de ociosidade por regional",
  },

  // 🏆 Rankings
  {
    id: "ranking_produtiv",
    grupo: "🏆 Rankings",
    label: "Ranking de produtividade",
  },
  {
    id: "ranking_ociosidade",
    grupo: "🏆 Rankings",
    label: "Ranking de maior ociosidade",
  },
];

// ─── Helpers ────────────────────────────────────────────────────

const HORAS_MES = 176;

function calcularIndice(t) {
  const ocupacao = Math.min(100, t.pctOcupado || 0);
  const retiradas = Math.min(100, ((t.totalRetiradas || 0) / 20) * 100);
  const diasAtivos = t.diasAvaliados?.length
    ? Math.min(100, (t.diasComCapacidade / t.diasAvaliados.length) * 100)
    : 0;
  return Math.round(ocupacao * 0.5 + retiradas * 0.3 + diasAtivos * 0.2);
}

function labelIndice(v) {
  if (v >= 80) return "Excelente";
  if (v >= 60) return "Regular";
  if (v >= 40) return "Baixo";
  return "Crítico";
}

function formatBRL(v) {
  return Number(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const DIAS_ORDEM = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// ─── Geradores ──────────────────────────────────────────────────

function gerarTecPorRegional(tecnicos) {
  const map = {};
  Object.values(tecnicos).forEach((t) => {
    const r = t.regional || "Sem regional";
    if (!map[r]) map[r] = [];
    map[r].push(t);
  });
  return Object.entries(map)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([regional, tecs]) => ({
      regional,
      total: tecs.length,
      nomes: tecs.map((t) => t.nome).join(", "),
    }));
}

function gerarTecOcupacao(ultimaAnalise) {
  return (ultimaAnalise?.resultadosTecnicos || [])
    .sort((a, b) => b.pctOcupado - a.pctOcupado)
    .map((t) => ({
      nome: t.nome,
      regional: t.regional || "—",
      escala: t.escala,
      totalOS: t.totalOS,
      horasUsadas: `${t.horasUsadas}h`,
      capacidadeUtil: `${t.capacidadeUtil}h`,
      ocupacao: `${t.pctOcupado}%`,
      status: t.temCapacidade ? "Disponível" : "Lotado",
    }));
}

function gerarTecMaisOS(ultimaAnalise) {
  return [...(ultimaAnalise?.resultadosTecnicos || [])]
    .sort((a, b) => b.totalOS - a.totalOS)
    .map((t, i) => ({
      pos: i + 1,
      nome: t.nome,
      regional: t.regional || "—",
      totalOS: t.totalOS,
      retiradas: t.totalRetiradas || 0,
      diasAvaliados: t.diasAvaliados?.length || 0,
    }));
}

function gerarTecOciosidade(ultimaAnalise) {
  return (ultimaAnalise?.resultadosTecnicos || [])
    .map((t) => {
      const horasOciosas = (
        t.diasAvaliados?.reduce((s, d) => s + (d.capacidadeRestante || 0), 0) ||
        0
      ).toFixed(1);
      return {
        nome: t.nome,
        regional: t.regional || "—",
        horasOciosas: `${horasOciosas}h`,
        diasLivres: t.diasComCapacidade,
        diasCheios: t.diasSemCapacidade,
        ocupacao: `${t.pctOcupado}%`,
      };
    })
    .sort((a, b) => parseFloat(b.horasOciosas) - parseFloat(a.horasOciosas));
}

function gerarTecEficiencia(ultimaAnalise) {
  return [...(ultimaAnalise?.resultadosTecnicos || [])]
    .map((t) => ({ ...t, indice: calcularIndice(t) }))
    .sort((a, b) => b.indice - a.indice)
    .map((t, i) => ({
      pos: i + 1,
      nome: t.nome,
      regional: t.regional || "—",
      indice: t.indice,
      classificacao: labelIndice(t.indice),
      totalOS: t.totalOS,
      retiradas: t.totalRetiradas || 0,
      ocupacao: `${t.pctOcupado}%`,
    }));
}

function gerarOsPorRegional(ultimaAnalise) {
  const map = {};
  (ultimaAnalise?.resultadosTecnicos || []).forEach((t) => {
    const r = t.regional || "Sem regional";
    if (!map[r])
      map[r] = {
        regional: r,
        tecnicos: 0,
        totalOS: 0,
        retiradas: 0,
        horasUsadas: 0,
      };
    map[r].tecnicos++;
    map[r].totalOS += t.totalOS;
    map[r].retiradas += t.totalRetiradas || 0;
    map[r].horasUsadas += t.horasUsadas;
  });
  return Object.values(map)
    .sort((a, b) => b.totalOS - a.totalOS)
    .map((r) => ({ ...r, horasUsadas: `${r.horasUsadas.toFixed(1)}h` }));
}

function gerarOsPorTipo(historico) {
  const ultima = historico?.[0];
  if (!ultima?.resultadosTecnicos) return [];
  const map = { "OS Normais": 0, Retiradas: 0 };
  ultima.resultadosTecnicos.forEach((t) => {
    map["OS Normais"] += t.totalOS;
    map["Retiradas"] += t.totalRetiradas || 0;
  });
  return Object.entries(map).map(([tipo, total]) => ({ tipo, total }));
}

function gerarOsEvolucao(historico) {
  return [...(historico || [])].reverse().map((h) => ({
    data: h.dataLabel,
    totalOS: h.totalOS,
    tecnicos: h.totalTecnicos,
    comCapacidade: h.comCapacidade,
    semCapacidade: h.semCapacidade,
  }));
}

function gerarOsDiaSemana(ultimaAnalise) {
  const map = { Seg: 0, Ter: 0, Qua: 0, Qui: 0, Sex: 0, Sáb: 0, Dom: 0 };
  (ultimaAnalise?.resultadosTecnicos || []).forEach((t) => {
    t.diasAvaliados?.forEach((d) => {
      if (map[d.nomeDia] !== undefined) map[d.nomeDia] += d.os;
    });
  });
  return DIAS_ORDEM.map((dia) => ({ dia, total: map[dia] }));
}

function gerarOcioPorRegional(ultimaAnalise) {
  const map = {};
  (ultimaAnalise?.resultadosTecnicos || []).forEach((t) => {
    const r = t.regional || "Sem regional";
    if (!map[r])
      map[r] = {
        regional: r,
        tecnicos: 0,
        horasOciosas: 0,
        diasLivres: 0,
        diasCheios: 0,
      };
    map[r].tecnicos++;
    map[r].horasOciosas +=
      t.diasAvaliados?.reduce((s, d) => s + (d.capacidadeRestante || 0), 0) ||
      0;
    map[r].diasLivres += t.diasComCapacidade;
    map[r].diasCheios += t.diasSemCapacidade;
  });
  return Object.values(map)
    .sort((a, b) => b.horasOciosas - a.horasOciosas)
    .map((r) => ({ ...r, horasOciosas: `${r.horasOciosas.toFixed(1)}h` }));
}

function gerarOcioDias(ultimaAnalise) {
  return (ultimaAnalise?.resultadosTecnicos || [])
    .sort((a, b) => b.diasSemCapacidade - a.diasSemCapacidade)
    .map((t) => ({
      nome: t.nome,
      regional: t.regional || "—",
      diasAvaliados: t.diasAvaliados?.length || 0,
      diasLivres: t.diasComCapacidade,
      diasCheios: t.diasSemCapacidade,
      pctCheio: t.diasAvaliados?.length
        ? `${Math.round((t.diasSemCapacidade / t.diasAvaliados.length) * 100)}%`
        : "0%",
    }));
}

function gerarOcioDiaSemana(ultimaAnalise) {
  const map = { Seg: 0, Ter: 0, Qua: 0, Qui: 0, Sex: 0, Sáb: 0, Dom: 0 };
  (ultimaAnalise?.resultadosTecnicos || []).forEach((t) => {
    t.diasAvaliados?.forEach((d) => {
      if (map[d.nomeDia] !== undefined)
        map[d.nomeDia] += d.capacidadeRestante || 0;
    });
  });
  return DIAS_ORDEM.map((dia) => ({
    dia,
    horasOciosas: parseFloat((map[dia] || 0).toFixed(1)),
  }));
}

function gerarMetaRetiradas(ultimaAnalise) {
  const META = 110;
  const map = {};
  (ultimaAnalise?.resultadosTecnicos || []).forEach((t) => {
    const r = t.regional || "Sem regional";
    if (!map[r]) map[r] = { regional: r, retiradas: 0 };
    map[r].retiradas += t.totalRetiradas || 0;
  });
  return Object.values(map)
    .sort((a, b) => b.retiradas - a.retiradas)
    .map((r) => ({
      regional: r.regional,
      retiradas: r.retiradas,
      meta: META,
      pct: `${Math.min(100, Math.round((r.retiradas / META) * 100))}%`,
      status:
        r.retiradas >= META ? "✅ Atingida" : `Faltam ${META - r.retiradas}`,
    }));
}

function gerarMetaVsTecnico(ultimaAnalise) {
  return [...(ultimaAnalise?.resultadosTecnicos || [])]
    .sort((a, b) => (b.totalRetiradas || 0) - (a.totalRetiradas || 0))
    .map((t) => ({
      nome: t.nome,
      regional: t.regional || "—",
      retiradas: t.totalRetiradas || 0,
      totalOS: t.totalOS,
      ocupacao: `${t.pctOcupado}%`,
      status: t.temCapacidade ? "Disponível" : "Lotado",
    }));
}

function gerarCustoPorTecnico(ultimaAnalise, salario) {
  const custoPorHora = salario / HORAS_MES;
  return (ultimaAnalise?.resultadosTecnicos || [])
    .map((t) => {
      const horasOciosas = parseFloat(
        (
          t.diasAvaliados?.reduce(
            (s, d) => s + (d.capacidadeRestante || 0),
            0,
          ) || 0
        ).toFixed(1),
      );
      return {
        nome: t.nome,
        regional: t.regional || "—",
        horasOciosas: `${horasOciosas}h`,
        custoOcioso: formatBRL(horasOciosas * custoPorHora),
        ocupacao: `${t.pctOcupado}%`,
      };
    })
    .sort((a, b) => parseFloat(b.horasOciosas) - parseFloat(a.horasOciosas));
}

function gerarCustoPorRegional(ultimaAnalise, salario) {
  const custoPorHora = salario / HORAS_MES;
  const map = {};
  (ultimaAnalise?.resultadosTecnicos || []).forEach((t) => {
    const r = t.regional || "Sem regional";
    if (!map[r]) map[r] = { regional: r, tecnicos: 0, horasOciosas: 0 };
    map[r].tecnicos++;
    map[r].horasOciosas +=
      t.diasAvaliados?.reduce((s, d) => s + (d.capacidadeRestante || 0), 0) ||
      0;
  });
  return Object.values(map)
    .sort((a, b) => b.horasOciosas - a.horasOciosas)
    .map((r) => ({
      regional: r.regional,
      tecnicos: r.tecnicos,
      horasOciosas: `${r.horasOciosas.toFixed(1)}h`,
      custoTotal: formatBRL(r.horasOciosas * custoPorHora),
      custoPorTecnico: formatBRL((r.horasOciosas / r.tecnicos) * custoPorHora),
    }));
}

function gerarRankingProdutiv(ultimaAnalise) {
  return [...(ultimaAnalise?.resultadosTecnicos || [])]
    .sort((a, b) => b.totalOS - a.totalOS)
    .map((t, i) => ({
      pos: i + 1,
      nome: t.nome,
      regional: t.regional || "—",
      totalOS: t.totalOS,
      retiradas: t.totalRetiradas || 0,
      ocupacao: `${t.pctOcupado}%`,
    }));
}

function gerarRankingOciosidade(ultimaAnalise) {
  return (ultimaAnalise?.resultadosTecnicos || [])
    .map((t) => ({
      nome: t.nome,
      regional: t.regional || "—",
      horasOciosas: parseFloat(
        (
          t.diasAvaliados?.reduce(
            (s, d) => s + (d.capacidadeRestante || 0),
            0,
          ) || 0
        ).toFixed(1),
      ),
      diasLivres: t.diasComCapacidade,
      diasCheios: t.diasSemCapacidade,
      ocupacao: `${t.pctOcupado}%`,
    }))
    .sort((a, b) => b.horasOciosas - a.horasOciosas)
    .map((t, i) => ({ pos: i + 1, ...t, horasOciosas: `${t.horasOciosas}h` }));
}

// ─── Config tabelas ──────────────────────────────────────────────

const TABELAS = {
  tec_por_regional: {
    colunas: ["Regional", "Total", "Técnicos"],
    linhas: (d) => d.map((r) => [r.regional, r.total, r.nomes]),
  },
  tec_ocupacao: {
    colunas: [
      "Nome",
      "Regional",
      "Escala",
      "OS",
      "Horas",
      "Cap. Útil",
      "Ocupação",
      "Status",
    ],
    linhas: (d) =>
      d.map((r) => [
        r.nome,
        r.regional,
        r.escala,
        r.totalOS,
        r.horasUsadas,
        r.capacidadeUtil,
        r.ocupacao,
        r.status,
      ]),
  },
  tec_mais_os: {
    colunas: ["#", "Nome", "Regional", "OS", "Retiradas", "Dias Aval."],
    linhas: (d) =>
      d.map((r) => [
        r.pos,
        r.nome,
        r.regional,
        r.totalOS,
        r.retiradas,
        r.diasAvaliados,
      ]),
  },
  tec_ociosidade: {
    colunas: [
      "Nome",
      "Regional",
      "Horas Ociosas",
      "Dias Livres",
      "Dias Cheios",
      "Ocupação",
    ],
    linhas: (d) =>
      d.map((r) => [
        r.nome,
        r.regional,
        r.horasOciosas,
        r.diasLivres,
        r.diasCheios,
        r.ocupacao,
      ]),
  },
  tec_eficiencia: {
    colunas: [
      "#",
      "Nome",
      "Regional",
      "Índice",
      "Classificação",
      "OS",
      "Retiradas",
      "Ocupação",
    ],
    linhas: (d) =>
      d.map((r) => [
        r.pos,
        r.nome,
        r.regional,
        r.indice,
        r.classificacao,
        r.totalOS,
        r.retiradas,
        r.ocupacao,
      ]),
  },
  os_por_regional: {
    colunas: ["Regional", "Técnicos", "Total OS", "Retiradas", "Horas Usadas"],
    linhas: (d) =>
      d.map((r) => [
        r.regional,
        r.tecnicos,
        r.totalOS,
        r.retiradas,
        r.horasUsadas,
      ]),
  },
  os_por_tipo: {
    colunas: ["Tipo", "Total"],
    linhas: (d) => d.map((r) => [r.tipo, r.total]),
  },
  os_evolucao: {
    colunas: ["Data", "Total OS", "Técnicos", "Com Cap.", "Sem Cap."],
    linhas: (d) =>
      d.map((r) => [
        r.data,
        r.totalOS,
        r.tecnicos,
        r.comCapacidade,
        r.semCapacidade,
      ]),
  },
  os_dia_semana: {
    colunas: ["Dia da Semana", "Total OS"],
    linhas: (d) => d.map((r) => [r.dia, r.total]),
  },
  ocio_por_tecnico: {
    colunas: [
      "Nome",
      "Regional",
      "Horas Ociosas",
      "Dias Livres",
      "Dias Cheios",
      "Ocupação",
    ],
    linhas: (d) =>
      d.map((r) => [
        r.nome,
        r.regional,
        r.horasOciosas,
        r.diasLivres,
        r.diasCheios,
        r.ocupacao,
      ]),
  },
  ocio_por_regional: {
    colunas: [
      "Regional",
      "Técnicos",
      "Horas Ociosas",
      "Dias Livres",
      "Dias Cheios",
    ],
    linhas: (d) =>
      d.map((r) => [
        r.regional,
        r.tecnicos,
        r.horasOciosas,
        r.diasLivres,
        r.diasCheios,
      ]),
  },
  ocio_dias: {
    colunas: [
      "Nome",
      "Regional",
      "Dias Aval.",
      "Dias Livres",
      "Dias Cheios",
      "% Cheio",
    ],
    linhas: (d) =>
      d.map((r) => [
        r.nome,
        r.regional,
        r.diasAvaliados,
        r.diasLivres,
        r.diasCheios,
        r.pctCheio,
      ]),
  },
  ocio_dia_semana: {
    colunas: ["Dia da Semana", "Horas Ociosas"],
    linhas: (d) => d.map((r) => [r.dia, `${r.horasOciosas}h`]),
  },
  meta_retiradas: {
    colunas: ["Regional", "Retiradas", "Meta", "% Atingido", "Status"],
    linhas: (d) =>
      d.map((r) => [r.regional, r.retiradas, r.meta, r.pct, r.status]),
  },
  meta_vs_tecnico: {
    colunas: [
      "Técnico",
      "Regional",
      "Retiradas",
      "OS Normais",
      "Ocupação",
      "Status",
    ],
    linhas: (d) =>
      d.map((r) => [
        r.nome,
        r.regional,
        r.retiradas,
        r.totalOS,
        r.ocupacao,
        r.status,
      ]),
  },
  custo_por_tecnico: {
    colunas: [
      "Técnico",
      "Regional",
      "Horas Ociosas",
      "Custo Ocioso",
      "Ocupação",
    ],
    linhas: (d) =>
      d.map((r) => [
        r.nome,
        r.regional,
        r.horasOciosas,
        r.custoOcioso,
        r.ocupacao,
      ]),
  },
  custo_por_regional: {
    colunas: [
      "Regional",
      "Técnicos",
      "Horas Ociosas",
      "Custo Total",
      "Custo/Técnico",
    ],
    linhas: (d) =>
      d.map((r) => [
        r.regional,
        r.tecnicos,
        r.horasOciosas,
        r.custoTotal,
        r.custoPorTecnico,
      ]),
  },
  ranking_produtiv: {
    colunas: ["#", "Técnico", "Regional", "OS", "Retiradas", "Ocupação"],
    linhas: (d) =>
      d.map((r) => [
        r.pos,
        r.nome,
        r.regional,
        r.totalOS,
        r.retiradas,
        r.ocupacao,
      ]),
  },
  ranking_ociosidade: {
    colunas: [
      "#",
      "Técnico",
      "Regional",
      "Horas Ociosas",
      "Dias Livres",
      "Dias Cheios",
      "Ocupação",
    ],
    linhas: (d) =>
      d.map((r) => [
        r.pos,
        r.nome,
        r.regional,
        r.horasOciosas,
        r.diasLivres,
        r.diasCheios,
        r.ocupacao,
      ]),
  },
};

// ─── Componente ──────────────────────────────────────────────────

export default function TecnicosRelatorios({ tecnicos, analises }) {
  const [selecionados, setSelecionados] = useState(
    Object.fromEntries(RELATORIOS.map((r) => [r.id, true])),
  );
  const [salario, setSalario] = useState(2500);
  const [editSal, setEditSal] = useState(false);
  const [tempSal, setTempSal] = useState("2500");

  const ultimaAnalise = analises.historico[0] || null;

  const dados = useMemo(
    () => ({
      tec_por_regional: gerarTecPorRegional(tecnicos),
      tec_ocupacao: gerarTecOcupacao(ultimaAnalise),
      tec_mais_os: gerarTecMaisOS(ultimaAnalise),
      tec_ociosidade: gerarTecOciosidade(ultimaAnalise),
      tec_eficiencia: gerarTecEficiencia(ultimaAnalise),
      os_por_regional: gerarOsPorRegional(ultimaAnalise),
      os_por_tipo: gerarOsPorTipo(analises.historico),
      os_evolucao: gerarOsEvolucao(analises.historico),
      os_dia_semana: gerarOsDiaSemana(ultimaAnalise),
      ocio_por_tecnico: gerarTecOciosidade(ultimaAnalise),
      ocio_por_regional: gerarOcioPorRegional(ultimaAnalise),
      ocio_dias: gerarOcioDias(ultimaAnalise),
      ocio_dia_semana: gerarOcioDiaSemana(ultimaAnalise),
      meta_retiradas: gerarMetaRetiradas(ultimaAnalise),
      meta_vs_tecnico: gerarMetaVsTecnico(ultimaAnalise),
      custo_por_tecnico: gerarCustoPorTecnico(ultimaAnalise, salario),
      custo_por_regional: gerarCustoPorRegional(ultimaAnalise, salario),
      ranking_produtiv: gerarRankingProdutiv(ultimaAnalise),
      ranking_ociosidade: gerarRankingOciosidade(ultimaAnalise),
    }),
    [tecnicos, ultimaAnalise, analises.historico, salario],
  );

  function toggleTodos(val) {
    setSelecionados(Object.fromEntries(RELATORIOS.map((r) => [r.id, val])));
  }
  function toggle(id) {
    setSelecionados((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  function salvarSalario() {
    const v = parseFloat(tempSal.replace(",", "."));
    if (!isNaN(v) && v > 0) setSalario(v);
    setEditSal(false);
  }

  const grupos = [...new Set(RELATORIOS.map((r) => r.grupo))];
  const qtdSelecionados = Object.values(selecionados).filter(Boolean).length;

  function exportarPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    const ativosIds = RELATORIOS.filter((r) => selecionados[r.id]).map(
      (r) => r.id,
    );
    let primeiro = true;

    ativosIds.forEach((id) => {
      const rel = RELATORIOS.find((r) => r.id === id);
      const d = dados[id];
      const tab = TABELAS[id];
      if (!d?.length || !tab) return;

      if (!primeiro) doc.addPage();
      primeiro = false;

      // Header azul
      doc.setFillColor(0, 48, 135);
      doc.rect(0, 0, 297, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(rel.label, 14, 11);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Gerado em: ${new Date().toLocaleString("pt-BR")}  |  Salário base: ${formatBRL(salario)}`,
        14,
        19,
      );

      autoTable(doc, {
        startY: 28,
        head: [tab.colunas],
        body: tab.linhas(d),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: {
          fillColor: [0, 48, 135],
          textColor: 255,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [240, 243, 250] },
        margin: { left: 14, right: 14 },
      });
    });

    if (primeiro) return alert("Nenhum relatório com dados para exportar.");
    doc.save(
      `relatorios-tecnicos-${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Config salário (para cálculos de custo) */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3 flex items-center gap-4 flex-wrap">
        <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
          💸 Salário base para cálculo de custo:
        </span>
        {editSal ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="number"
              value={tempSal}
              onChange={(e) => setTempSal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && salvarSalario()}
              className="border border-blue-400 rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              onClick={salvarSalario}
              className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              OK
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setTempSal(String(salario));
              setEditSal(true);
            }}
            className="text-sm font-black text-blue-600 hover:underline"
          >
            {formatBRL(salario)} ✏️
          </button>
        )}
        <span className="text-xs text-blue-500">
          = {formatBRL((salario / HORAS_MES).toFixed(2))}/hora ({HORAS_MES}
          h/mês)
        </span>
      </div>

      {/* Seletor */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <BarChart2 size={18} className="text-blue-500" />
            <h3 className="text-sm font-bold text-gray-800">
              Selecionar Relatórios
            </h3>
            <span className="text-xs bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded-full">
              {qtdSelecionados}/{RELATORIOS.length}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => toggleTodos(true)}
              className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 font-semibold rounded-lg hover:bg-blue-100 transition-colors"
            >
              Todos
            </button>
            <button
              onClick={() => toggleTodos(false)}
              className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 font-semibold rounded-lg hover:bg-gray-200 transition-colors"
            >
              Nenhum
            </button>
            <button
              onClick={exportarPDF}
              disabled={qtdSelecionados === 0}
              className="flex items-center gap-2 text-xs px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <FileDown size={13} /> Exportar PDF
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {grupos.map((grupo) => (
            <div key={grupo}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                {grupo}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {RELATORIOS.filter((r) => r.grupo === grupo).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => toggle(r.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left text-sm font-medium transition-all ${
                      selecionados[r.id]
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-all ${
                        selecionados[r.id]
                          ? "bg-blue-600 border-blue-600"
                          : "border-gray-300"
                      }`}
                    >
                      {selecionados[r.id] && (
                        <Check size={10} className="text-white" />
                      )}
                    </div>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabelas na tela */}
      {RELATORIOS.filter((r) => selecionados[r.id]).map((r) => {
        const d = dados[r.id];
        const tab = TABELAS[r.id];

        if (!d?.length || !tab)
          return (
            <div
              key={r.id}
              className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm"
            >
              <p className="text-sm font-bold text-gray-700 mb-1">{r.label}</p>
              <p className="text-xs text-gray-400">
                Nenhum dado disponível — faça uma análise primeiro.
              </p>
            </div>
          );

        return (
          <div
            key={r.id}
            className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm"
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <span className="text-sm">{r.grupo.split(" ")[0]}</span>
              <h3 className="text-sm font-bold text-gray-800">{r.label}</h3>
              <span className="text-xs bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full ml-auto">
                {d.length} registros
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-600 text-white text-xs uppercase tracking-wide">
                    {tab.colunas.map((c) => (
                      <th
                        key={c}
                        className="text-left px-4 py-3 whitespace-nowrap"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tab.linhas(d).map((linha, i) => (
                    <tr
                      key={i}
                      className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                    >
                      {linha.map((cel, j) => (
                        <td
                          key={j}
                          className="px-4 py-2.5 text-gray-700 whitespace-nowrap"
                        >
                          {cel}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
