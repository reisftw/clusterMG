import { act, renderHook } from "@testing-library/react";
import {
  buildHistoricoAnual,
  buildMonthDetail,
  buildMonthProjection,
  useMetasResumoMensal,
} from "./useMetasResumoMensal";

const dadosBase = {
  Janeiro: {
    mes: "Janeiro",
    cancelamentos: 200,
    metaSazonal: 80,
    meta: 160,
    totalOS: 120,
    percentAchieved: "75.0",
    saldoDiario: [
      { dia: 2, totalDia: 10, saldoMes: 10 },
      { dia: 5, totalDia: 15, saldoMes: 25 },
      { dia: 6, totalDia: 20, saldoMes: 45 },
    ],
    regionais: [
      { name: "Regional A", total: 90 },
      { name: "Regional B", total: 130 },
    ],
    technicians: [{ name: "Tecnico 1", total: 40 }],
  },
};

describe("useMetasResumoMensal business helpers", () => {
  it("monta o detalhe mensal", () => {
    const detail = buildMonthDetail("Janeiro", dadosBase.Janeiro, ["01-01"]);
    expect(detail.atingiu).toBe(false);
    expect(detail.faltaOS).toBe(40);
    expect(detail.topRegional?.name).toBe("Regional A");
    expect(detail.regionaisAbaixo).toHaveLength(1);
  });

  it("monta a projecao do mes", () => {
    const projection = buildMonthProjection(dadosBase.Janeiro, ["01-01"]);
    expect(projection).not.toBeNull();
    expect(projection.ritmoAtual).toBeGreaterThan(0);
    expect(projection.diasRestantes).toBeGreaterThanOrEqual(0);
  });

  it("monta o historico anual com meses vazios", () => {
    const historico = buildHistoricoAnual(dadosBase, ["01-01"]);
    expect(historico[0].mes).toBe("Janeiro");
    expect(historico[0].vazio).toBe(false);
    expect(historico[1].vazio).toBe(true);
  });

  it("recalcula saldo final e meta diaria com a mesma regra do saldo diario", () => {
    const historico = buildHistoricoAnual(
      {
        Maio: {
          mes: "Maio",
          cancelamentos: 100,
          metaSazonal: 80,
          meta: 100,
          totalOS: 25,
          percentAchieved: "25.0",
          saldoDiario: [
            { dia: 1, totalDia: 10, saldoMes: 10 },
            { dia: 4, totalDia: 15, saldoMes: 25 },
          ],
        },
      },
      [],
    );

    const maio = historico.find((item) => item.mes === "Maio");

    expect(maio.metaDiaria).toBe(5);
    expect(maio.diasUteis).toBe(20);
    expect(maio.saldoFinal).toBe(20);
  });

  it("ignora linhas zeradas no saldo final do resumo mensal", () => {
    const historico = buildHistoricoAnual(
      {
        Junho: {
          mes: "Junho",
          cancelamentos: 1000,
          metaSazonal: 90,
          meta: 911,
          totalOS: 1,
          percentAchieved: "0.1",
          saldoDiario: [
            { dia: 1, totalDia: 0, saldoMes: -42 },
            { dia: 2, totalDia: 0, saldoMes: -84 },
          ],
        },
      },
      [],
    );

    const junho = historico.find((item) => item.mes === "Junho");

    expect(junho.saldoFinal).toBe(0);
  });

  it("monta o estado derivado do hook para um mes atual", () => {
    const meses = [
      "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ];
    const mesAtual = meses[new Date().getMonth()];
    const dataMesAtual = {
      [mesAtual]: {
        ...dadosBase.Janeiro,
        mes: mesAtual,
      },
    };

    const { result } = renderHook(() =>
      useMetasResumoMensal(dataMesAtual, mesAtual, ["05-01"]),
    );

    expect(result.current.dadosMesSelecionado?.mes).toBe(mesAtual);
    expect(result.current.temMetaMesSelecionado).toBe(true);
    expect(result.current.isMesAtual).toBe(true);
    expect(result.current.kpis).toHaveLength(6);
    expect(result.current.projecao).not.toBeNull();

    act(() => {
      result.current.setMesDetalhe(mesAtual);
    });

    expect(result.current.detalheMesSelecionado?.mes).toBe(mesAtual);
    expect(result.current.historico[0].mes).toBe("Janeiro");
  });

  it("retorna vazio para mes sem meta e sem detalhe aberto", () => {
    const { result } = renderHook(() =>
      useMetasResumoMensal({ Janeiro: { totalOS: 0, meta: 0 } }, "Janeiro"),
    );

    expect(result.current.temMetaMesSelecionado).toBe(false);
    expect(result.current.kpis).toEqual([]);
    expect(result.current.projecao).toBeNull();
    expect(result.current.detalheMesSelecionado).toBeNull();
  });
});

