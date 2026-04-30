import { useState, useEffect, useRef, useMemo } from "react";
import { Chart } from "chart.js/auto";
import KpiCard from "../components/KpiCard";
import RankingList from "../components/RankingList";
import CityTable from "../components/CityTable";
import CityModal from "../components/CityModal";
import EmptyState from "../components/EmptyState";
import { MONTH_ORDER } from "../utils/constants";

export default function TabAgentes({ allData, month }) {
  const d = allData[month];
  const [selectedCity, setSelectedCity] = useState(null);

  const chartCidadesRef = useRef(null);
  const chartDailyRef = useRef(null);
  const chartMonthlyRef = useRef(null);
  const chartCidadesInst = useRef(null);
  const chartDailyInst = useRef(null);
  const chartMonthlyInst = useRef(null);

  const intFmt = useMemo(
    () =>
      new Intl.NumberFormat("pt-BR", {
        maximumFractionDigits: 0,
      }),
    [],
  );

  const pctFmt = useMemo(
    () =>
      new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [],
  );

  useEffect(() => {
    if (!d || !chartCidadesRef.current) return;
    if (chartCidadesInst.current) chartCidadesInst.current.destroy();

    const all = Array.isArray(d.cidadesRanking) ? d.cidadesRanking : [];
    const chartH = Math.max(300, all.length * 40 + 60);
    chartCidadesRef.current.parentElement.style.height = `${chartH}px`;

    chartCidadesInst.current = new Chart(chartCidadesRef.current, {
      type: "bar",
      data: {
        labels: all.map((c) => c.nome),
        datasets: [
          {
            label: "Realizado",
            data: all.map((c) => Math.round(Number(c.realizado) || 0)),
            backgroundColor: "#FF6B00",
            borderRadius: 4,
          },
          {
            label: "Meta 80%",
            data: all.map((c) => Math.round(Number(c.meta80) || 0)),
            backgroundColor: "rgba(0,48,135,0.55)",
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: ${intFmt.format(ctx.parsed.x || 0)}`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: "rgba(0,0,0,0.05)" },
            ticks: {
              callback: (value) => intFmt.format(value),
            },
          },
          y: { grid: { display: false } },
        },
      },
    });
  }, [d, intFmt]);

  useEffect(() => {
    if (!d || !chartDailyRef.current) return;
    if (chartDailyInst.current) chartDailyInst.current.destroy();

    let daily = Array.isArray(d.totalDaily)
      ? d.totalDaily.map((v) => Math.round(Number(v) || 0))
      : [];

    let lastActive = -1;
    daily.forEach((v, i) => {
      if (v > 0) lastActive = i;
    });

    if (lastActive >= 0) {
      daily = daily.slice(0, lastActive + 1);
    }

    const accumulated = [];
    let sum = 0;

    for (let i = 0; i < daily.length; i++) {
      sum += daily[i];
      accumulated.push(sum);
    }

    const labels = daily.map((_, i) => `Dia ${i + 1}`);

    chartDailyInst.current = new Chart(chartDailyRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Acumulado Geral",
            data: accumulated,
            borderColor: "#FF6B00",
            backgroundColor: "rgba(255,107,0,0.08)",
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: ${intFmt.format(ctx.parsed.y || 0)}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(0,0,0,0.05)" },
            ticks: {
              callback: (value) => intFmt.format(value),
            },
          },
          x: { grid: { display: false } },
        },
      },
    });
  }, [d, intFmt]);

  useEffect(() => {
    if (!chartMonthlyRef.current) return;
    if (chartMonthlyInst.current) chartMonthlyInst.current.destroy();

    const mesesComDados = MONTH_ORDER.filter(
      (m) => Number(allData[m]?.totalRealizado || 0) > 0,
    );

    chartMonthlyInst.current = new Chart(chartMonthlyRef.current, {
      type: "bar",
      data: {
        labels: mesesComDados,
        datasets: [
          {
            label: "Realizado",
            data: mesesComDados.map((m) =>
              Math.round(Number(allData[m]?.totalRealizado || 0)),
            ),
            backgroundColor: "#FF6B00",
            borderRadius: 6,
          },
          {
            label: "Meta 80%",
            data: mesesComDados.map((m) =>
              Math.round(Number(allData[m]?.totalMeta || 0)),
            ),
            backgroundColor: "rgba(0,48,135,0.5)",
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: ${intFmt.format(ctx.parsed.y || 0)}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => intFmt.format(value),
            },
          },
          x: { grid: { display: false } },
        },
      },
    });
  }, [allData, month, intFmt]);

  useEffect(() => {
    return () => {
      if (chartCidadesInst.current) chartCidadesInst.current.destroy();
      if (chartDailyInst.current) chartDailyInst.current.destroy();
      if (chartMonthlyInst.current) chartMonthlyInst.current.destroy();
    };
  }, []);

  if (!d)
    return (
      <EmptyState
        icon="🏢"
        title="Sem dados para este mês"
        desc="Aguardando sincronização com o Firebase."
      />
    );

  const rankItems = (d.cidadesRanking || []).map((c) => ({
    ...c,
    name: c.nome,
    total: Math.round(Number(c.realizado) || 0),
    percent: Number(c.pct) || 0,
  }));

  return (
    <div>
      <div className="kpis">
        <KpiCard
          label="Total Realizado"
          value={intFmt.format(Number(d.totalRealizado || 0))}
          sub="Retiradas concluídas"
          color="orange"
        />
        <KpiCard
          label="Meta 80%"
          value={intFmt.format(Math.round(Number(d.totalMeta || 0)))}
          sub={`Cancelamentos: ${intFmt.format(Number(d.totalCancelamentos || 0))}`}
          color="blue"
        />
        <KpiCard
          label="% Atingido da Meta"
          value={`${pctFmt.format(Number(d.percentAchieved || 0))}%`}
          sub={d.status}
          color="green"
        />
        <KpiCard
          label="Falta para Meta"
          value={intFmt.format(
            Math.max(0, Math.round(Number(d.totalFalta || 0))),
          )}
          sub="Retiradas pendentes"
          color="red"
        />
      </div>

      <div className="grid">
        <div className="card">
          <div className="card-title">🏆 Ranking por Cidade</div>
          <RankingList
            items={rankItems}
            metaRef={Number(d.totalMeta) || 0}
            label="retiradas"
          />
          <div
            style={{
              marginTop: 20,
              borderRadius: 12,
              overflow: "hidden",
              lineHeight: 0,
            }}
          >
            <img
              src="https://i.ibb.co/zh5hS8TF/estela.webp"
              alt=""
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                borderRadius: 12,
              }}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-title">📊 Realizado vs Meta por Cidade</div>
          <div className="chart-container" style={{ height: 300 }}>
            <canvas ref={chartCidadesRef} />
          </div>
        </div>

        <div className="card grid-full">
          <div className="card-title">📋 Detalhamento por Cidade</div>
          <CityTable cidades={d.cidades || []} onCityClick={setSelectedCity} />
        </div>

        <div className="card grid-full">
          <div className="card-title">
            📅 Evolução Diária Acumulada — Total Geral
          </div>
          <div className="chart-container">
            <canvas ref={chartDailyRef} />
          </div>
        </div>

        <div className="card grid-full">
          <div className="card-title">📈 Comparativo Mensal — Ano Completo</div>
          <div className="chart-container">
            <canvas ref={chartMonthlyRef} />
          </div>
        </div>
      </div>

      {selectedCity && (
        <CityModal
          cidade={selectedCity}
          month={month}
          allData={allData}
          onClose={() => setSelectedCity(null)}
        />
      )}
    </div>
  );
}
