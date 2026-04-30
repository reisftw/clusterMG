import { useState, useEffect, useMemo, useRef } from "react";
import { Chart } from "chart.js/auto";
import KpiCard from "../components/KpiCard";
import RankingList from "../components/RankingList";
import RitmoBar from "../components/RitmoBar";
import TecIndividual from "../components/TecIndividual";
import AnomaliaList from "../components/AnomaliaList";
import SaldoTable from "../components/SaldoTable";
import EmptyState from "../components/EmptyState";
import { calcProjecao, calcSaldoDiario } from "../utils/calcProjecao";
import { calcRitmo } from "../utils/calcRitmo";
import { calcAnomalias } from "../utils/calcAnomalias";

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function normalizeMonthName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/gi, "c")
    .toLowerCase()
    .trim();
}

function formatLastUpdate(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const isoDate = new Date(value);
    if (!Number.isNaN(isoDate.getTime())) {
      return isoDate.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return value;
  }

  const raw =
    value.texto ||
    value.lastUpdate ||
    value.updatedAt ||
    value.data ||
    value.ultimaAtualizacao ||
    value.atualizadoEm ||
    null;

  if (typeof raw === "string") {
    const isoDate = new Date(raw);
    if (!Number.isNaN(isoDate.getTime())) {
      return isoDate.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return raw;
  }

  const date = raw?.toDate?.() || (raw ? new Date(raw) : null);
  if (!date || Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMonthPrevious(month, allData) {
  const index = MONTHS.findIndex(
    (item) => normalizeMonthName(item) === normalizeMonthName(month),
  );
  if (index <= 0) return null;
  const previous = MONTHS[index - 1];
  return (
    Object.keys(allData || {}).find(
      (item) => normalizeMonthName(item) === normalizeMonthName(previous),
    ) || previous
  );
}

function getDayRow(rawDays = [], day) {
  return rawDays.find((item) => Number(item?.dia) === Number(day)) || null;
}

function getComparisonReferenceDay() {
  return Math.max(1, new Date().getDate() - 1);
}

function buildComparativoDiaAtual(allData, month) {
  const previousMonth = getMonthPrevious(month, allData);
  if (!previousMonth) return null;

  const currentMonthData = allData[month];
  const previousMonthData = allData[previousMonth];
  if (!currentMonthData || !previousMonthData) return null;

  const referenceDay = getComparisonReferenceDay();
  const atual = getDayRow(currentMonthData.rawDays || [], referenceDay) || {};
  const anterior = getDayRow(previousMonthData.rawDays || [], referenceDay) || {};

  const grupos = [
    { key: "equipe", label: "Técnico retirada" },
    { key: "agente", label: "Agente autorizado" },
    { key: "loja", label: "Entregue em loja" },
    { key: "regionais", label: "Regionais" },
  ].map((grupo) => {
    const hoje = Number(atual?.[grupo.key] || 0);
    const mesAnterior = Number(anterior?.[grupo.key] || 0);
    return {
      ...grupo,
      hoje,
      mesAnterior,
      diferenca: hoje - mesAnterior,
    };
  });

  return {
    dia: referenceDay,
    previousMonth,
    grupos,
    totalHoje: grupos.reduce((sum, item) => sum + item.hoje, 0),
    totalMesAnterior: grupos.reduce((sum, item) => sum + item.mesAnterior, 0),
  };
}

function buildComparativoMes(allData, month) {
  const previousMonth = getMonthPrevious(month, allData);
  if (!previousMonth) return null;

  const currentMonthData = allData[month];
  const previousMonthData = allData[previousMonth];
  if (!currentMonthData || !previousMonthData) return null;

  const currentRaw = currentMonthData.rawDays || [];
  const previousRaw = previousMonthData.rawDays || [];
  const maxDay = Math.max(
    ...currentRaw.map((item) => Number(item?.dia) || 0),
    ...previousRaw.map((item) => Number(item?.dia) || 0),
    0,
  );

  const linhas = Array.from({ length: maxDay }, (_, index) => {
    const dia = index + 1;
    const atual = getDayRow(currentRaw, dia) || {};
    const anterior = getDayRow(previousRaw, dia) || {};
    const equipeHoje = Number(atual.equipe || 0);
    const equipeAnterior = Number(anterior.equipe || 0);
    const agenteHoje = Number(atual.agente || 0);
    const agenteAnterior = Number(anterior.agente || 0);
    const lojaHoje = Number(atual.loja || 0);
    const lojaAnterior = Number(anterior.loja || 0);
    const regionaisHoje = Number(atual.regionais || 0);
    const regionaisAnterior = Number(anterior.regionais || 0);
    const totalHoje = Number(atual.totalDia || 0);
    const totalAnterior = Number(anterior.totalDia || 0);

    return {
      dia,
      equipeHoje,
      equipeAnterior,
      agenteHoje,
      agenteAnterior,
      lojaHoje,
      lojaAnterior,
      regionaisHoje,
      regionaisAnterior,
      totalHoje,
      totalAnterior,
      diferenca: totalHoje - totalAnterior,
    };
  });

  return { previousMonth, linhas };
}

function buildComparativoSemana(allData, month) {
  const previousMonth = getMonthPrevious(month, allData);
  if (!previousMonth) return null;

  const currentMonthData = allData[month];
  const previousMonthData = allData[previousMonth];
  if (!currentMonthData || !previousMonthData) return null;

  const referenceDay = getComparisonReferenceDay();
  const diaInicial = Math.max(1, referenceDay - 6);
  const dias = Array.from(
    { length: referenceDay - diaInicial + 1 },
    (_, index) => diaInicial + index,
  );

  const grupos = [
    { key: "equipe", label: "Técnico retirada" },
    { key: "agente", label: "Agente autorizado" },
    { key: "loja", label: "Entregue em loja" },
    { key: "regionais", label: "Regionais" },
  ].map((grupo) => {
    const hoje = dias.reduce((sum, dia) => sum + Number(getDayRow(currentMonthData.rawDays || [], dia)?.[grupo.key] || 0), 0);
    const mesAnterior = dias.reduce((sum, dia) => sum + Number(getDayRow(previousMonthData.rawDays || [], dia)?.[grupo.key] || 0), 0);
    return {
      ...grupo,
      hoje,
      mesAnterior,
      diferenca: hoje - mesAnterior,
    };
  });

  return {
    previousMonth,
    periodo: `${diaInicial} a ${referenceDay}`,
    grupos,
    totalHoje: grupos.reduce((sum, item) => sum + item.hoje, 0),
    totalMesAnterior: grupos.reduce((sum, item) => sum + item.mesAnterior, 0),
  };
}

function DiffValue({ value }) {
  const color = value >= 0 ? "var(--green)" : "var(--orange)";
  return (
    <span style={{ color, fontWeight: 800 }}>
      {value >= 0 ? "+" : ""}
      {value.toLocaleString("pt-BR")}
    </span>
  );
}

export default function TabRetiradas({ allData, month, lastUpdate }) {
  const d = allData[month];
  const lastUpdateText = useMemo(() => formatLastUpdate(lastUpdate), [lastUpdate]);
  const comparativoDia = useMemo(() => buildComparativoDiaAtual(allData, month), [allData, month]);
  const comparativoMes = useMemo(() => buildComparativoMes(allData, month), [allData, month]);
  const comparativoSemana = useMemo(() => buildComparativoSemana(allData, month), [allData, month]);

  const [projecao, setProjecao] = useState(null);
  const [ritmo, setRitmo] = useState(null);
  const [saldoDiario, setSaldoDiario] = useState([]);
  const [anomaliasMinimizadas, setAnomaliasMinimizadas] = useState(true);
  const [comparativoMesAberto, setComparativoMesAberto] = useState(false);
  const anomalias = useMemo(() => calcAnomalias(d), [d]);

  const chartDailyRef = useRef(null);
  const chartMonthlyRef = useRef(null);
  const chartDailyInst = useRef(null);
  const chartMonthlyInst = useRef(null);

  useEffect(() => {
    if (!d) return;
    calcProjecao(d, month).then(setProjecao);
    calcRitmo(d, month).then(setRitmo);
    calcSaldoDiario(d, month).then(({ lista }) => setSaldoDiario(lista || []));
  }, [d, month]);

  useEffect(() => {
    if (!d || !saldoDiario.length || !chartDailyRef.current) return;
    if (chartDailyInst.current) chartDailyInst.current.destroy();

    const labels = saldoDiario.map((s) => `Dia ${s.dia}`);
    let sum = 0;
    const accumulated = saldoDiario.map((s) => {
      sum += Number(s.totalDia) || 0;
      return sum;
    });
    const metaLine = saldoDiario.map(() => Number(d.meta) || 0);

    const projecaoLine = new Array(saldoDiario.length).fill(null);
    if (projecao && projecao.diasUteisRestantes > 0) {
      for (const ponto of projecao.projecaoPorDia || []) {
        labels.push(`Dia ${ponto.dia}`);
        projecaoLine.push(ponto.valor);
        accumulated.push(null);
        metaLine.push(Number(d.meta) || 0);
      }
      projecaoLine[saldoDiario.length - 1] = Number(d.totalOS) || 0;
    }

    chartDailyInst.current = new Chart(chartDailyRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Realizado Acumulado",
            data: accumulated,
            borderColor: "#FF6B00",
            backgroundColor: "rgba(255,107,0,0.08)",
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            borderWidth: 2,
          },
          {
            label: "Meta",
            data: metaLine,
            borderColor: "#003087",
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
          },
          {
            label: "Projeção",
            data: projecaoLine,
            borderColor: "#7C3AED",
            borderDash: [4, 4],
            borderWidth: 2,
            pointRadius: 3,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top" } },
        scales: {
          y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" } },
          x: { grid: { display: false } },
        },
      },
    });
  }, [d, saldoDiario, projecao]);

  useEffect(() => {
    if (!chartMonthlyRef.current) return;
    if (chartMonthlyInst.current) chartMonthlyInst.current.destroy();

    const mesesComDados = Object.keys(allData).filter(
      (m) => Number(allData[m]?.totalOS || 0) > 0,
    );
    const labels = mesesComDados;
    const realizados = mesesComDados.map((m) => Number(allData[m]?.totalOS || 0));
    const metas = mesesComDados.map((m) => Number(allData[m]?.meta || 0));
    const mesAtualNormalizado = normalizeMonthName(month);
    const coresRealizado = mesesComDados.map((m) =>
      normalizeMonthName(m) === mesAtualNormalizado ? "#003087" : "#FF6B00",
    );
    const bordasRealizado = mesesComDados.map((m) =>
      normalizeMonthName(m) === mesAtualNormalizado ? "#001b4d" : "#FF6B00",
    );
    const borderWidths = mesesComDados.map((m) =>
      normalizeMonthName(m) === mesAtualNormalizado ? 2 : 0,
    );

    chartMonthlyInst.current = new Chart(chartMonthlyRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Realizado",
            data: realizados,
            backgroundColor: coresRealizado,
            borderColor: bordasRealizado,
            borderWidth: borderWidths,
            borderRadius: 6,
          },
          {
            label: "Meta",
            data: metas,
            backgroundColor: "rgba(0,48,135,0.5)",
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top" } },
        scales: {
          y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" } },
          x: { grid: { display: false } },
        },
      },
    });
  }, [allData, month]);

  useEffect(() => {
    return () => {
      if (chartDailyInst.current) chartDailyInst.current.destroy();
      if (chartMonthlyInst.current) chartMonthlyInst.current.destroy();
    };
  }, []);

  if (!d) {
    return (
      <EmptyState
        icon="📊"
        title="Sem dados para este mês"
        desc="Aguardando sincronização com o Firebase."
      />
    );
  }

  return (
    <div>
      {lastUpdateText ? (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            background:
              "linear-gradient(135deg, rgba(0,48,135,0.04), rgba(255,107,0,0.05))",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--blue)",
              marginBottom: 4,
            }}
          >
            Última atualização
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>
            {`Última atualização: ${lastUpdateText}`}
          </div>
        </div>
      ) : null}

      <div className="kpis">
        <KpiCard
          label="Total O.S Realizado"
          value={Number(d.totalOS || 0).toLocaleString("pt-BR")}
          sub="No mês selecionado"
          color="orange"
        />
        <KpiCard
          label="Meta"
          value={Math.round(Number(d.meta || 0)).toLocaleString("pt-BR")}
          sub="Objetivo do mês"
          color="blue"
        />
        <KpiCard
          label="% Atingido"
          value={`${Number(d.percentAchieved || 0).toFixed(1)}%`}
          sub={d.status}
          color="green"
        />
        <KpiCard
          label="Projeção Final do Mês"
          value={
            projecao
              ? Number(projecao.projecaoFinal || 0).toLocaleString("pt-BR")
              : "--"
          }
          sub={
            projecao
              ? `${Number(projecao.pctProjecao || 0).toFixed(1)}% da meta · ${Number(projecao.pctProjecaoCancelamentos || 0).toFixed(1)}% dos cancelamentos`
              : "Calculando..."
          }
          color="purple"
        />
      </div>

      <RitmoBar ritmo={ritmo} />

      <div className="grid">
        {comparativoDia ? (
          <div className="card grid-full">
            <div
              className="card-title"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span>{`📅 Comparativo do Dia ${comparativoDia.dia} x ${comparativoDia.previousMonth}`}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color:
                      comparativoDia.totalHoje - comparativoDia.totalMesAnterior >= 0
                        ? "var(--green)"
                        : "var(--orange)",
                  }}
                >
                  {`Diferença total: ${
                    comparativoDia.totalHoje - comparativoDia.totalMesAnterior >= 0 ? "+" : ""
                  }${(comparativoDia.totalHoje - comparativoDia.totalMesAnterior).toLocaleString("pt-BR")} O.S`}
                </span>
                {comparativoMes ? (
                  <button
                    type="button"
                    onClick={() => setComparativoMesAberto(true)}
                    style={{
                      border: "1px solid var(--line)",
                      background: "#fff",
                      color: "var(--blue)",
                      borderRadius: 999,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Comparativo mês
                  </button>
                ) : null}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                marginTop: 16,
              }}
            >
              {comparativoDia.grupos.map((item) => (
                <div
                  key={item.key}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 18,
                    padding: 16,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--blue)",
                      marginBottom: 12,
                    }}
                  >
                    {item.label}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                        Mês anterior
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
                        {item.mesAnterior.toLocaleString("pt-BR")}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                        Hoje
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
                        {item.hoje.toLocaleString("pt-BR")}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                        Diferença
                      </div>
                      <div style={{ fontSize: 22 }}>
                        <DiffValue value={item.diferenca} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {comparativoSemana ? (
          <div className="card grid-full">
            <div
              className="card-title"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span>{`🗓️ Comparativo por Semana (${comparativoSemana.periodo}) x ${comparativoSemana.previousMonth}`}</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color:
                    comparativoSemana.totalHoje - comparativoSemana.totalMesAnterior >= 0
                      ? "var(--green)"
                      : "var(--orange)",
                }}
              >
                {`Diferença total: ${
                  comparativoSemana.totalHoje - comparativoSemana.totalMesAnterior >= 0 ? "+" : ""
                }${(comparativoSemana.totalHoje - comparativoSemana.totalMesAnterior).toLocaleString("pt-BR")} O.S`}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                marginTop: 16,
              }}
            >
              {comparativoSemana.grupos.map((item) => (
                <div
                  key={item.key}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 18,
                    padding: 16,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--blue)",
                      marginBottom: 12,
                    }}
                  >
                    {item.label}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                        Semana anterior
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
                        {item.mesAnterior.toLocaleString("pt-BR")}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                        Semana atual
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
                        {item.hoje.toLocaleString("pt-BR")}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
                        Diferença
                      </div>
                      <div style={{ fontSize: 22 }}>
                        <DiffValue value={item.diferenca} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="card">
          <div className="card-title">🏆 Ranking Técnicos</div>
          <RankingList items={d.technicians || []} metaRef={110} label="O.S" />
        </div>

        <div className="card">
          <div className="card-title">🗺️ Ranking Regionais</div>
          <RankingList items={d.regionais || []} metaRef={110} label="O.S" />
        </div>

        <TecIndividual
          title="Meta Individual — Técnicos"
          icon="👤"
          items={d.technicians || []}
          month={month}
        />

        <TecIndividual
          title="Meta Individual — Regionais"
          icon="🗺️"
          items={d.regionais || []}
          month={month}
        />

        <div className="card grid-full">
          <div
            className="card-title"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>🚨 Detector de Anomalias</span>
            <button
              type="button"
              onClick={() => setAnomaliasMinimizadas((current) => !current)}
              style={{
                border: "1px solid var(--line)",
                background: "#fff",
                color: "var(--text)",
                borderRadius: 999,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {anomaliasMinimizadas ? "Expandir" : "Minimizar"}
            </button>
          </div>
          {!anomaliasMinimizadas && <AnomaliaList anomalias={anomalias || []} />}
        </div>

        <div className="card grid-full">
          <div className="card-title">📈 Evolução Diária Acumulada</div>
          <div className="chart-container">
            <canvas ref={chartDailyRef} />
          </div>
        </div>

        <div className="card grid-full">
          <div className="card-title">⚖️ Saldo Diário — Meta por Dia</div>
          <div className="saldo-wrap">
            <table className="saldo-table">
              <thead>
                <tr>
                  <th>Dia</th>
                  <th>Equipe Técnica</th>
                  <th>Agente Aut.</th>
                  <th>Entregue Loja</th>
                  <th>Regionais</th>
                  <th>Total Dia</th>
                  <th>Meta Diária</th>
                  <th>Saldo Dia</th>
                  <th>Saldo Mês</th>
                </tr>
              </thead>
              <tbody>
                <SaldoTable saldoDiario={saldoDiario || []} />
              </tbody>
            </table>
          </div>
        </div>

        <div className="card grid-full">
          <div className="card-title">📊 Comparativo Mensal — Ano Completo</div>
          <div className="chart-container">
            <canvas ref={chartMonthlyRef} />
          </div>
        </div>
      </div>

      {comparativoMesAberto && comparativoMes ? (
        <div className="city-modal-overlay show" onClick={() => setComparativoMesAberto(false)}>
          <div className="city-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1180 }}>
            <div className="city-modal-header">
              <div>
                <h2>{`Comparativo Mês — ${month} x ${comparativoMes.previousMonth}`}</h2>
                <p>Comparação dia a dia entre o mês atual e o mês anterior.</p>
              </div>
              <button
                type="button"
                className="city-modal-close"
                onClick={() => setComparativoMesAberto(false)}
              >
                ×
              </button>
            </div>

            <div className="city-modal-body">
              <div className="saldo-wrap" style={{ maxHeight: "65vh", overflow: "auto" }}>
                <table className="saldo-table">
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th>Téc. Ant.</th>
                      <th>Téc. Hoje</th>
                      <th>Agente Ant.</th>
                      <th>Agente Hoje</th>
                      <th>Loja Ant.</th>
                      <th>Loja Hoje</th>
                      <th>Regionais Ant.</th>
                      <th>Regionais Hoje</th>
                      <th>Total Ant.</th>
                      <th>Total Hoje</th>
                      <th>Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparativoMes.linhas.map((linha) => (
                      <tr key={linha.dia}>
                        <td>{linha.dia}</td>
                        <td>{linha.equipeAnterior}</td>
                        <td>{linha.equipeHoje}</td>
                        <td>{linha.agenteAnterior}</td>
                        <td>{linha.agenteHoje}</td>
                        <td>{linha.lojaAnterior}</td>
                        <td>{linha.lojaHoje}</td>
                        <td>{linha.regionaisAnterior}</td>
                        <td>{linha.regionaisHoje}</td>
                        <td>{linha.totalAnterior}</td>
                        <td>{linha.totalHoje}</td>
                        <td><DiffValue value={linha.diferenca} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="city-modal-actions">
                <button
                  type="button"
                  className="btn-fechar-modal"
                  onClick={() => setComparativoMesAberto(false)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
