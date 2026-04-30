import { useMemo } from "react";

const MONTHORDER = [
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

const Badge = ({ v }) => {
  if (v == null) return <span className="text-gray-300 text-xs">—</span>;
  const cls =
    v > 0
      ? "bg-green-50 text-green-700 border-green-100"
      : v < 0
        ? "bg-red-50 text-red-600 border-red-100"
        : "bg-gray-50 text-gray-500 border-gray-100";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-lg text-xs font-bold border ${cls}`}
    >
      {v > 0 ? `+${v}` : v}
    </span>
  );
};

function calcDiasUteisMes(mes, feriadosSet) {
  const mIdx = MONTHORDER.indexOf(mes);
  if (mIdx < 0) return 22;
  const m = mIdx + 1;
  const ano = new Date().getFullYear();
  const diasNoMes = new Date(ano, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    const dt = new Date(ano, m - 1, d);
    if (dt.getDay() === 0 || dt.getDay() === 6) continue;
    const key = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (feriadosSet.has(key)) continue;
    count++;
  }
  return count;
}

function isDiaUtil(mes, dia, feriadosSet) {
  const mIdx = MONTHORDER.indexOf(mes);
  if (mIdx < 0) return true;
  const m = mIdx + 1;
  const ano = new Date().getFullYear();
  const dt = new Date(ano, m - 1, dia);
  if (dt.getDay() === 0 || dt.getDay() === 6) return false;
  const key = `${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return !feriadosSet.has(key);
}

const MetasSaldoDiario = ({ dados, feriadosSet = new Set() }) => {
  if (!dados?.saldoDiario?.length)
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-300 text-sm">
        Sem dados de movimentação para este mês.
      </div>
    );

  const { metaDiaria, sd } = useMemo(() => {
    const diasUteis = calcDiasUteisMes(dados.mes, feriadosSet);
    const metaDiaria = diasUteis > 0 ? Math.ceil(dados.meta / diasUteis) : 0;

    let saldoMes = 0;
    const sd = dados.saldoDiario.map((row) => {
      const util = isDiaUtil(dados.mes, row.dia, feriadosSet);
      const metaDia = util ? metaDiaria : 0;
      const saldoDia = row.totalDia - metaDia;
      saldoMes += saldoDia;
      return { ...row, util, metaDia, saldoDia, saldoMes };
    });

    return { metaDiaria, sd };
  }, [dados, feriadosSet]);

  const totEquipe = sd.reduce((s, x) => s + x.equipe, 0);
  const totAgente = sd.reduce((s, x) => s + x.agente, 0);
  const totLoja = sd.reduce((s, x) => s + x.loja, 0);
  const totRegionais = sd.reduce((s, x) => s + x.regionais, 0);
  const totDia = sd.reduce((s, x) => s + x.totalDia, 0);
  const totMeta = sd.reduce((s, x) => s + x.metaDia, 0);
  const lastSaldo = sd[sd.length - 1]?.saldoMes ?? 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-gray-800">
          Saldo Diário — Meta por Dia
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>
            Meta diária: <strong className="text-blue-700">{metaDiaria}</strong>
          </span>
          <span>
            Saldo mês:{" "}
            <strong
              className={lastSaldo >= 0 ? "text-green-600" : "text-red-500"}
            >
              {lastSaldo >= 0 ? `+${lastSaldo}` : lastSaldo}
            </strong>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {[
                "Dia",
                "Equipe Técnica",
                "Agente Aut.",
                "Entregue Loja",
                "Regionais",
                "Total Dia",
                "Meta Diária",
                "Saldo Dia",
                "Saldo Mês",
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sd.map((row) => (
              <tr
                key={row.dia}
                className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${!row.util ? "opacity-40" : ""}`}
              >
                <td className="px-3 py-2.5 text-center font-bold text-gray-700">
                  {row.dia}
                </td>
                <td className="px-3 py-2.5 text-center text-gray-600">
                  {row.equipe}
                </td>
                <td className="px-3 py-2.5 text-center text-gray-600">
                  {row.agente}
                </td>
                <td className="px-3 py-2.5 text-center text-gray-600">
                  {row.loja}
                </td>
                <td className="px-3 py-2.5 text-center text-gray-600">
                  {row.regionais}
                </td>
                <td className="px-3 py-2.5 text-center font-bold text-gray-800">
                  {row.totalDia}
                </td>
                <td className="px-3 py-2.5 text-center text-blue-600 font-semibold">
                  {row.metaDia}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <Badge v={row.saldoDia} />
                </td>
                <td className="px-3 py-2.5 text-center">
                  <Badge v={row.saldoMes} />
                </td>
              </tr>
            ))}
            <tr className="bg-blue-50 border-t border-blue-100 font-bold">
              <td className="px-3 py-3 text-center text-blue-700 text-xs uppercase">
                Total
              </td>
              <td className="px-3 py-3 text-center text-blue-700">
                {totEquipe}
              </td>
              <td className="px-3 py-3 text-center text-blue-700">
                {totAgente}
              </td>
              <td className="px-3 py-3 text-center text-blue-700">{totLoja}</td>
              <td className="px-3 py-3 text-center text-blue-700">
                {totRegionais}
              </td>
              <td className="px-3 py-3 text-center text-blue-700">{totDia}</td>
              <td className="px-3 py-3 text-center text-blue-700">{totMeta}</td>
              <td className="px-3 py-3 text-center"></td>
              <td className="px-3 py-3 text-center">
                <Badge v={lastSaldo} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MetasSaldoDiario;
