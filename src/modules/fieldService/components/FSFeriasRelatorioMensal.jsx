import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, BarChart2, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MESES = [
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

const formatarData = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const STATUS_BADGE = {
  aprovado: "bg-green-100 text-green-700 border-green-200",
  pendente: "bg-yellow-100 text-yellow-700 border-yellow-200",
  reprovado: "bg-red-100 text-red-600 border-red-200",
  cancelado: "bg-gray-100 text-gray-500 border-gray-200",
};

const FSFeriasRelatorioMensal = ({ ferias, colaboradores }) => {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const [filtroReg, setFiltroReg] = useState("todos");

  const colabMap = useMemo(() => {
    const m = {};
    colaboradores.forEach((c) => {
      m[c.id] = c;
    });
    return m;
  }, [colaboradores]);

  const regionais = useMemo(() => {
    const s = new Set(colaboradores.map((c) => c.regional).filter(Boolean));
    return [...s].sort();
  }, [colaboradores]);

  const feriasMes = useMemo(() => {
    return ferias.filter((f) => {
      const inicio = new Date(f.data_inicio + "T00:00:00");
      const fim = new Date(f.data_fim + "T00:00:00");
      const primeiroDiaMes = new Date(ano, mes, 1);
      const ultimoDiaMes = new Date(ano, mes + 1, 0);
      if (!(inicio <= ultimoDiaMes && fim >= primeiroDiaMes)) return false;
      if (filtroReg !== "todos") {
        return colabMap[f.colaborador_id]?.regional === filtroReg;
      }
      return true;
    });
  }, [ferias, mes, ano, filtroReg, colabMap]);

  const totalDias = feriasMes
    .filter((f) => f.status === "aprovado")
    .reduce((acc, f) => acc + (f.dias_gozados || 0), 0);

  const navMes = (dir) => {
    const novo = mes + dir;
    if (novo < 0) {
      setMes(11);
      setAno((a) => a - 1);
    } else if (novo > 11) {
      setMes(0);
      setAno((a) => a + 1);
    } else setMes(novo);
  };

  const exportarPDF = () => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, 297, 25, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont(undefined, "bold");
    doc.text(`Relatório de Férias FS — ${MESES[mes]} ${ano}`, 15, 10);
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text(
      `Registros: ${feriasMes.length}  |  Dias aprovados: ${totalDias}  |  Gerado em: ${new Date().toLocaleDateString("pt-BR")}`,
      15,
      18,
    );

    autoTable(doc, {
      head: [
        [
          "Colaborador",
          "Cargo",
          "Regional",
          "Início",
          "Fim",
          "Dias",
          "Status",
          "Conflito",
        ],
      ],
      body: feriasMes.map((f) => {
        const c = colabMap[f.colaborador_id];
        return [
          c?.nome ?? "—",
          c?.cargo ?? "—",
          c?.regional ?? "—",
          formatarData(f.data_inicio),
          formatarData(f.data_fim),
          f.dias_gozados ?? "—",
          f.status ?? "—",
          f.tem_conflito ? "Sim" : "Não",
        ];
      }),
      startY: 32,
      margin: { left: 10, right: 10 },
      headStyles: {
        fillColor: [255, 149, 0],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
        halign: "center",
      },
      bodyStyles: { fontSize: 8, textColor: [60, 60, 60] },
      alternateRowStyles: { fillColor: [243, 244, 246] },
      didDrawPage: (data) => {
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Página ${data.pageNumber}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 8,
          { align: "center" },
        );
      },
    });

    doc.save(`Ferias_FS_${MESES[mes]}_${ano}.pdf`);
  };

  const CARDS = [
    { label: "Total", value: feriasMes.length, cor: "blue" },
    {
      label: "Aprovadas",
      value: feriasMes.filter((f) => f.status === "aprovado").length,
      cor: "green",
    },
    {
      label: "Pendentes",
      value: feriasMes.filter((f) => f.status === "pendente").length,
      cor: "yellow",
    },
    { label: "Dias Gozados", value: totalDias, cor: "orange" },
  ];

  return (
    <div className="space-y-5">
      {/* Topo */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
            <BarChart2 size={16} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Relatório Mensal
            </h3>
            <p className="text-xs text-gray-400">
              {feriasMes.length} registro(s)
            </p>
          </div>
        </div>
        <button
          onClick={exportarPDF}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <Download size={14} /> Exportar PDF
        </button>
      </div>

      {/* Navegação mês */}
      <div className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-5 py-3 shadow-sm">
        <button
          onClick={() => navMes(-1)}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-base font-bold text-gray-800">
          {MESES[mes]} {ano}
        </span>
        <button
          onClick={() => navMes(1)}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CARDS.map(({ label, value, cor }) => (
          <div
            key={label}
            className={`bg-${cor}-50 border border-${cor}-100 rounded-2xl px-4 py-3`}
          >
            <p
              className={`text-xs font-semibold text-${cor}-500 uppercase tracking-wide`}
            >
              {label}
            </p>
            <p className={`text-2xl font-bold text-${cor}-700 mt-0.5`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Filtro regional */}
      <div className="flex flex-wrap gap-2">
        {["todos", ...regionais].map((r) => (
          <button
            key={r}
            onClick={() => setFiltroReg(r)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              filtroReg === r
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600"
            }`}
          >
            {r === "todos" ? "Todas as Regionais" : r}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {[
                  "Colaborador",
                  "Cargo",
                  "Regional",
                  "Início",
                  "Fim",
                  "Dias",
                  "Status",
                  "Conflito",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {feriasMes.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center py-10 text-sm text-gray-400"
                  >
                    Nenhuma férias em {MESES[mes]} {ano}.
                  </td>
                </tr>
              ) : (
                feriasMes.map((f) => {
                  const c = colabMap[f.colaborador_id];
                  return (
                    <tr
                      key={f.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                            <span className="text-white text-[10px] font-bold">
                              {c?.nome?.charAt(0)?.toUpperCase() ?? "?"}
                            </span>
                          </div>
                          <span className="font-medium text-gray-800 text-xs">
                            {c?.nome ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {c?.cargo ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {c?.regional ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {formatarData(f.data_inicio)}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {formatarData(f.data_fim)}
                      </td>
                      <td className="px-5 py-3 text-xs font-semibold text-gray-700">
                        {f.dias_gozados ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-lg border capitalize ${STATUS_BADGE[f.status] ?? STATUS_BADGE.cancelado}`}
                        >
                          {f.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {f.tem_conflito ? (
                          <span className="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-lg">
                            ⚠️ Sim
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FSFeriasRelatorioMensal;
