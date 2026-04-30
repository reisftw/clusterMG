import React, { useMemo, useState } from "react";
import {
  BarChart2,
  Trophy,
  Moon,
  Target,
  Package,
  CalendarDays,
  Star,
  DollarSign,
  Search,
} from "lucide-react";
import TecnicoDetalheModal from "./TecnicoDetalheModal";
import TecnicosHeatmap from "./TecnicosHeatmap";
import TecnicosCustoOciosidade from "./TecnicosCustoOciosidade";
import TecnicosIndiceEficiencia from "./TecnicosIndiceEficiencia";
import {
  TIPOS_RETIRADA,
  detectarColunaTecnico,
  extrairNumOS,
} from "../utils/calcularCapacidade";

const DIAS_ORDEM = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const DATA_FECHAMENTO_KEYS = [
  "datafechamento",
  "data_fechamento",
  "dataFechamento",
];
const DATA_REFERENCIA_KEYS = [
  ...DATA_FECHAMENTO_KEYS,
  "data_inicio_programado",
  "dataInicioProgramado",
  "datainicioprogramado",
  "data",
  "datacadastro",
];
const DESCRICAO_FECHAMENTO_KEYS = [
  "descricaofechamento",
  "descricao_fechamento",
  "descricaoFechamento",
  "descriçãofechamento",
  "descrição_fechamento",
  "motivofechamento",
  "motivo_fechamento",
  "status",
  "statusos",
  "ocorrencia",
  "observacao",
];
const NOME_KEYS = [
  "nomecliente",
  "nome_cliente",
  "cliente",
  "nome",
  "razaosocial",
  "razao_social",
  "assinante",
];

function normalizarTexto(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function obterValor(row = {}, chaves = []) {
  if (!row || typeof row !== "object") return "";

  const mapa = Object.entries(row).reduce((acc, [key, value]) => {
    acc[normalizarTexto(key).replace(/[\s_]+/g, "")] = value;
    return acc;
  }, {});

  for (const chave of chaves) {
    const valor = mapa[normalizarTexto(chave).replace(/[\s_]+/g, "")];
    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      return valor;
    }
  }

  return "";
}

function parseDateFlexible(value) {
  if (!value) return null;
  const raw = String(value).trim().split(" ")[0];
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isDateInCurrentMonth(date) {
  if (!date) return false;
  const hoje = new Date();
  return (
    date.getFullYear() === hoje.getFullYear() &&
    date.getMonth() === hoje.getMonth() &&
    date <= hoje
  );
}

function isRetiradaRow(row) {
  const tipo = normalizarTexto(
    obterValor(row, ["tipo", "Tipo", "TIPO", "tipoos", "type"]),
  );
  return TIPOS_RETIRADA.some((item) => tipo.includes(normalizarTexto(item)));
}

function matchTecnicoNome(nomeRaw, tecnicos = []) {
  const nomeNormalizado = normalizarTexto(nomeRaw);
  if (!nomeNormalizado) return null;

  let encontrado = tecnicos.find((tecnico) => {
    const nomeTecnico = normalizarTexto(tecnico.nome);
    return (
      nomeNormalizado.includes(nomeTecnico) || nomeTecnico.includes(nomeNormalizado)
    );
  });

  if (encontrado) return encontrado.nome;

  for (const segmento of String(nomeRaw)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    const segNorm = normalizarTexto(segmento);
    encontrado = tecnicos.find((tecnico) => {
      const nomeTecnico = normalizarTexto(tecnico.nome);
      return segNorm.includes(nomeTecnico) || nomeTecnico.includes(segNorm);
    });
    if (encontrado) return encontrado.nome;
  }

  return null;
}

function filtrarDiasMesAtual(dias = []) {
  return (dias || []).filter((dia) =>
    isDateInCurrentMonth(parseDateFlexible(dia.data)),
  );
}

export default function TecnicosDashboard({ analises }) {
  const [tecnicoSelecionado, setTecnicoSelecionado] = useState(null);
  const [buscaTecnico, setBuscaTecnico] = useState("");
  const [filtroRegional, setFiltroRegional] = useState("todas");

  const ultimaAnalise = analises.historico?.[0] || null;
  const osAcumuladas = useMemo(
    () => analises.osAcumuladas || [],
    [analises.osAcumuladas],
  );

  const tecs = useMemo(() => {
    const base = ultimaAnalise?.resultadosTecnicos || [];
    if (!base.length) return [];

    const tecnicoCol = osAcumuladas.length ? detectarColunaTecnico(osAcumuladas) : null;
    const ordensMesPorTecnico = osAcumuladas.reduce((acc, row) => {
      const dataReferencia = parseDateFlexible(
        obterValor(row, DATA_REFERENCIA_KEYS),
      );
      if (!isDateInCurrentMonth(dataReferencia)) return acc;

      const nomeTecnico = tecnicoCol
        ? matchTecnicoNome(row[tecnicoCol], base)
        : null;
      if (!nomeTecnico) return acc;

      if (!acc[nomeTecnico]) {
        acc[nomeTecnico] = {
          ordensFeitas: [],
          totalOSNormais: 0,
          totalRetiradas: 0,
        };
      }

      const retirada = isRetiradaRow(row);
      const numeroOS = extrairNumOS(row);
      const nomeCliente =
        obterValor(row, NOME_KEYS) ||
        (numeroOS ? `O.S ${numeroOS}` : "Sem nome");
      const descricaoFechamento =
        obterValor(row, DESCRICAO_FECHAMENTO_KEYS) || "Sem descrição";

      acc[nomeTecnico].ordensFeitas.push({
        numeroOS: numeroOS || "",
        nome: nomeCliente,
        data: dataReferencia.toLocaleDateString("pt-BR"),
        descricaoFechamento,
        tipo: retirada ? "Retirada" : "O.S normal",
      });

      if (retirada) {
        acc[nomeTecnico].totalRetiradas += 1;
      } else {
        acc[nomeTecnico].totalOSNormais += 1;
      }

      return acc;
    }, {});

    return base.map((tecnico) => {
      const diasMesAtual = filtrarDiasMesAtual(tecnico.diasAvaliados || []);
      const horasUsadasMes = parseFloat(
        diasMesAtual.reduce((s, d) => s + (d.horasUsadas || 0), 0).toFixed(2),
      );
      const diasComCapacidade = diasMesAtual.filter((d) => d.temCapacidade).length;
      const diasSemCapacidade = diasMesAtual.filter((d) => !d.temCapacidade).length;
      const mediaHorasDia = diasMesAtual.length
        ? horasUsadasMes / diasMesAtual.length
        : 0;
      const pctOcupado =
        tecnico.capacidadeUtil > 0
          ? Math.min(100, Math.round((mediaHorasDia / tecnico.capacidadeUtil) * 100))
          : 0;
      const dadosOrdens = ordensMesPorTecnico[tecnico.nome] || {
        ordensFeitas: [],
        totalOSNormais: diasMesAtual.reduce((s, d) => s + (d.os || 0), 0),
        totalRetiradas: diasMesAtual.reduce((s, d) => s + (d.retiradas || 0), 0),
      };

      const ordensFeitas = [...dadosOrdens.ordensFeitas].sort((a, b) => {
        const da = parseDateFlexible(a.data);
        const db = parseDateFlexible(b.data);
        return (db?.getTime() || 0) - (da?.getTime() || 0);
      });

      return {
        ...tecnico,
        diasAvaliados: diasMesAtual,
        diasComCapacidade,
        diasSemCapacidade,
        temCapacidade: diasComCapacidade > 0,
        horasUsadas: horasUsadasMes,
        pctOcupado,
        totalOSNormais: dadosOrdens.totalOSNormais,
        totalRetiradas: dadosOrdens.totalRetiradas,
        totalOS: dadosOrdens.totalOSNormais + dadosOrdens.totalRetiradas,
        ordensFeitas,
      };
    });
  }, [ultimaAnalise, osAcumuladas]);

  const regionaisDisponiveis = useMemo(
    () =>
      [...new Set(tecs.map((t) => t.regional || "Sem regional"))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [tecs],
  );

  const tecsFiltrados = useMemo(() => {
    const termo = buscaTecnico.trim().toLowerCase();

    return tecs.filter((t) => {
      const regional = t.regional || "Sem regional";
      const textoOk = !termo
        ? true
        : `${t.nome || ""} ${regional}`.toLowerCase().includes(termo);
      const regionalOk =
        filtroRegional === "todas" ? true : regional === filtroRegional;

      return textoOk && regionalOk;
    });
  }, [tecs, buscaTecnico, filtroRegional]);

  // ── KPIs principais ──────────────────────────────────────────
  const horasOciosas = useMemo(() => {
    return tecsFiltrados
      .reduce((acc, t) => {
        return (
          acc +
          (t.diasAvaliados?.reduce(
            (s, d) => s + (d.capacidadeRestante || 0),
            0,
          ) || 0)
        );
      }, 0)
      .toFixed(1);
  }, [tecsFiltrados]);

  // ── Ranking Produtividade ────────────────────────────────────
  const rankingProdutividade = useMemo(
    () =>
      [...tecsFiltrados].sort((a, b) => b.totalOS - a.totalOS).slice(0, 10),
    [tecsFiltrados],
  );

  // ── Maior Ociosidade ─────────────────────────────────────────
  const rankingOciosidade = useMemo(
    () =>
      [...tecsFiltrados]
        .map((t) => ({
          ...t,
          horasOciosas: parseFloat(
            (
              t.diasAvaliados?.reduce(
                (s, d) => s + (d.capacidadeRestante || 0),
                0,
              ) || 0
            ).toFixed(1),
          ),
        }))
        .sort((a, b) => b.horasOciosas - a.horasOciosas)
        .slice(0, 10),
    [tecsFiltrados],
  );

  // ── Ociosidade por Regional ──────────────────────────────────
  const ocioRegional = useMemo(() => {
    const map = {};
    tecsFiltrados.forEach((t) => {
      const r = t.regional || "Sem regional";
      if (!map[r])
        map[r] = { regional: r, tecnicos: 0, horasOciosas: 0, totalOS: 0 };
      map[r].tecnicos++;
      map[r].totalOS += t.totalOS;
      map[r].horasOciosas +=
        t.diasAvaliados?.reduce((s, d) => s + (d.capacidadeRestante || 0), 0) ||
        0;
    });
    return Object.values(map)
      .map((r) => ({
        ...r,
        horasOciosas: parseFloat(r.horasOciosas.toFixed(1)),
      }))
      .sort((a, b) => b.horasOciosas - a.horasOciosas);
  }, [tecsFiltrados]);

  const maxOcioRegional = ocioRegional[0]?.horasOciosas || 1;

  // ── Ociosidade por Dia da Semana ─────────────────────────────
  const ocioDiaSemana = useMemo(() => {
    const map = { Seg: 0, Ter: 0, Qua: 0, Qui: 0, Sex: 0, Sáb: 0, Dom: 0 };
    tecsFiltrados.forEach((t) => {
      t.diasAvaliados?.forEach((d) => {
        if (map[d.nomeDia] !== undefined)
          map[d.nomeDia] += d.capacidadeRestante || 0;
      });
    });
    return DIAS_ORDEM.map((dia) => ({
      dia,
      horas: parseFloat((map[dia] || 0).toFixed(1)),
    }));
  }, [tecsFiltrados]);

  const maxOcioDia = Math.max(...ocioDiaSemana.map((d) => d.horas), 1);

  // ── Meta de Retiradas por Regional (110/mês) ─────────────────
  const metaRetiradas = useMemo(() => {
    const META = 110;
    const map = {};
    tecsFiltrados.forEach((t) => {
      const r = t.regional || "Sem regional";
      if (!map[r]) map[r] = { regional: r, retiradas: 0 };
      map[r].retiradas += t.totalRetiradas || 0;
    });
    return Object.values(map)
      .map((r) => ({
        ...r,
        meta: META,
        pct: Math.min(100, Math.round((r.retiradas / META) * 100)),
        atingiu: r.retiradas >= META,
      }))
      .sort((a, b) => b.retiradas - a.retiradas);
  }, [tecsFiltrados]);

  const CORES_BARRA = (pct) =>
    pct >= 100 ? "bg-green-500" : pct >= 70 ? "bg-yellow-500" : "bg-red-400";

  if (!ultimaAnalise)
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <span className="text-5xl mb-4">📊</span>
        <p className="text-gray-600 font-semibold">Nenhuma análise carregada</p>
        <p className="text-gray-400 text-sm mt-1">
          Vá até "Análise de OS" para importar uma planilha
        </p>
      </div>
    );

  return (
    <div className="flex flex-col gap-8">
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr),240px] gap-3">
          <label className="relative block">
            <span className="sr-only">Buscar tecnico</span>
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={buscaTecnico}
              onChange={(e) => setBuscaTecnico(e.target.value)}
              placeholder="Buscar por tecnico ou regional"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
            />
          </label>

          <select
            value={filtroRegional}
            onChange={(e) => setFiltroRegional(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
          >
            <option value="todas">Todas as regionais</option>
            {regionaisDisponiveis.map((regional) => (
              <option key={regional} value={regional}>
                {regional}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Exibindo {tecsFiltrados.length} de {tecs.length} tecnico(s) na analise atual.
        </p>
      </div>
      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          {
            label: "Total Técnicos",
            value: tecsFiltrados.length,
            color: "border-blue-500 text-blue-600",
            sub:
              tecsFiltrados.length === tecs.length
                ? "exibidos na anÃ¡lise"
                : `de ${tecs.length} na anÃ¡lise`,
          },
          {
            label: "Com Capacidade",
            value: tecsFiltrados.filter((t) => t.temCapacidade).length,
            color: "border-green-500 text-green-600",
            sub: "podem receber OS",
          },
          {
            label: "Sem Capacidade",
            value: tecsFiltrados.filter((t) => !t.temCapacidade).length,
            color: "border-red-500 text-red-600",
            sub: "jornada esgotada",
          },
          {
            label: "OS Analisadas",
            value: tecsFiltrados.reduce((acc, t) => acc + (t.totalOS || 0), 0),
            color: "border-orange-500 text-orange-600",
            sub: "somente no mês atual",
          },
          {
            label: "Horas Ociosas",
            value: `${horasOciosas}h`,
            color: "border-yellow-500 text-yellow-600",
            sub: "capacidade perdida",
          },
        ].map((k) => {
          const [border, text] = k.color.split(" ");
          return (
            <div
              key={k.label}
              className={`bg-white border-t-4 ${border} rounded-2xl p-5 shadow-sm`}
            >
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                {k.label}
              </p>
              <p className={`text-4xl font-black ${text}`}>{k.value}</p>
              <p className="text-xs text-gray-400 mt-1">{k.sub}</p>
            </div>
          );
        })}
      </div>

      {/* ── Grid principal ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 🏆 Ranking Produtividade */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={16} className="text-yellow-500" />
            <h3 className="text-sm font-bold text-gray-800">
              Ranking de Produtividade
            </h3>
          </div>
          <div className="flex flex-col gap-2">
            {rankingProdutividade.map((t, i) => {
              const max = rankingProdutividade[0]?.totalOS || 1;
              const medalha =
                i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <div key={t.nome} className="flex items-center gap-3">
                  <span className="text-sm font-black text-gray-400 w-6 text-center shrink-0">
                    {medalha || `${i + 1}`}
                  </span>
                  <span
                    className="text-sm font-semibold text-blue-600 hover:underline cursor-pointer w-36 truncate shrink-0"
                    onClick={() => setTecnicoSelecionado(t)}
                  >
                    {t.nome}
                  </span>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${(t.totalOS / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-black text-gray-900 w-10 text-right shrink-0">
                    {t.totalOS}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 😴 Maior Ociosidade */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Moon size={16} className="text-purple-500" />
            <h3 className="text-sm font-bold text-gray-800">
              Maior Ociosidade
            </h3>
          </div>
          <div className="flex flex-col gap-2">
            {rankingOciosidade.map((t, i) => {
              const max = rankingOciosidade[0]?.horasOciosas || 1;
              return (
                <div key={t.nome} className="flex items-center gap-3">
                  <span className="text-sm font-black text-gray-400 w-6 text-center shrink-0">
                    {i + 1}
                  </span>
                  <span
                    className="text-sm font-semibold text-blue-600 hover:underline cursor-pointer w-36 truncate shrink-0"
                    onClick={() => setTecnicoSelecionado(t)}
                  >
                    {t.nome}
                  </span>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-400 rounded-full transition-all"
                      style={{ width: `${(t.horasOciosas / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-black text-gray-900 w-14 text-right shrink-0">
                    {t.horasOciosas}h
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 📊 Horas Ociosas por Regional */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-blue-500" />
            <h3 className="text-sm font-bold text-gray-800">
              Horas Ociosas por Regional
            </h3>
          </div>
          <div className="flex flex-col gap-3">
            {ocioRegional.map((r) => (
              <div key={r.regional}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-gray-700 truncate">
                    {r.regional}
                  </span>
                  <span className="font-black text-gray-900 ml-2 shrink-0">
                    {r.horasOciosas}h
                  </span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-400 rounded-full transition-all"
                    style={{
                      width: `${(r.horasOciosas / maxOcioRegional) * 100}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {r.tecnicos} técnico(s) · {r.totalOS} OS
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 📅 Ociosidade por Dia da Semana */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays size={16} className="text-orange-500" />
            <h3 className="text-sm font-bold text-gray-800">
              Ociosidade por Dia da Semana
            </h3>
          </div>
          <div className="flex items-end gap-2 h-36">
            {ocioDiaSemana.map((d) => (
              <div
                key={d.dia}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <span className="text-[10px] font-bold text-gray-500">
                  {d.horas}h
                </span>
                <div
                  className="w-full bg-gray-100 rounded-t-lg overflow-hidden flex items-end"
                  style={{ height: "80px" }}
                >
                  <div
                    className="w-full bg-orange-400 rounded-t-lg transition-all"
                    style={{ height: `${(d.horas / maxOcioDia) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-gray-400">
                  {d.dia}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Meta de Retiradas por Regional ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-green-500" />
            <h3 className="text-sm font-bold text-gray-800">
              Meta de Retiradas por Regional
            </h3>
          </div>
          <span className="text-xs bg-green-50 text-green-600 font-bold px-3 py-1 rounded-full border border-green-200">
            Meta: 110 retiradas/mês
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {metaRetiradas.map((r) => (
            <div
              key={r.regional}
              className={`rounded-xl border p-4 ${r.atingiu ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"}`}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    {r.regional}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {r.retiradas} de {r.meta} retiradas
                  </p>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-full ${
                    r.atingiu
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {r.pct}%
                </span>
              </div>
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${CORES_BARRA(r.pct)}`}
                  style={{ width: `${r.pct}%` }}
                />
              </div>
              <p
                className={`text-xs mt-1.5 font-semibold ${r.atingiu ? "text-green-600" : "text-gray-400"}`}
              >
                {r.atingiu
                  ? `✅ Meta atingida! +${r.retiradas - r.meta} acima`
                  : `Faltam ${r.meta - r.retiradas} retiradas`}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Retiradas vs Meta (tabela) ── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <Package size={16} className="text-purple-500" />
          <h3 className="text-sm font-bold text-gray-800">
            Retiradas vs Meta — Detalhe por Técnico
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-blue-600 text-white text-xs uppercase tracking-wide">
                {[
                  "Técnico",
                  "Regional",
                  "Retiradas",
                  "OS Normais",
                  "Ocupação",
                  "Status",
                ].map((h) => (
                  <th key={h} className="text-left px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...tecsFiltrados]
                .sort(
                  (a, b) => (b.totalRetiradas || 0) - (a.totalRetiradas || 0),
                )
                .map((t, i) => (
                  <tr
                    key={t.nome}
                    className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                  >
                    <td
                      className="px-4 py-2.5 font-semibold text-blue-600 hover:underline cursor-pointer"
                      onClick={() => setTecnicoSelecionado(t)}
                    >
                      {t.nome}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {t.regional || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-black text-purple-600">
                        {t.totalRetiradas || 0}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-bold text-blue-600">
                      {t.totalOSNormais || 0}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              t.pctOcupado >= 90
                                ? "bg-red-500"
                                : t.pctOcupado >= 70
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                            }`}
                            style={{ width: `${t.pctOcupado}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {t.pctOcupado}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-full ${
                          t.temCapacidade
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {t.temCapacidade ? "Disponível" : "Lotado"}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Índice de Eficiência ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Star size={16} className="text-yellow-500" />
          <h3 className="text-sm font-bold text-gray-800">
            Índice de Eficiência por Técnico
          </h3>
        </div>
        <TecnicosIndiceEficiencia tecs={tecsFiltrados} />
      </div>

      {/* ── Heatmap ── */}
      <TecnicosHeatmap tecs={tecsFiltrados} />

      {/* ── Custo de Ociosidade ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <DollarSign size={16} className="text-red-500" />
          <h3 className="text-sm font-bold text-gray-800">
            💸 Custo de Ociosidade
          </h3>
        </div>
        <TecnicosCustoOciosidade
          tecs={tecsFiltrados}
          historico={analises.historico}
        />
      </div>

      {/* ── Modal Detalhe Técnico ── */}
      {tecnicoSelecionado && (
        <TecnicoDetalheModal
          tecnico={tecnicoSelecionado}
          onClose={() => setTecnicoSelecionado(null)}
        />
      )}
    </div>
  );
}
