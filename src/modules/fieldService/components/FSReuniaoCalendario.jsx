import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
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

const STATUS_COR = {
  agendada: "bg-blue-500",
  realizada: "bg-green-500",
  cancelada: "bg-red-400",
};

const FSReuniaoCalendario = ({ reunioes, onSelectReuniao }) => {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());

  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const primeiroDia = new Date(ano, mes, 1).getDay();

  const reunioesPorDia = useMemo(() => {
    const map = {};
    const prefixo = `${ano}-${String(mes + 1).padStart(2, "0")}`;
    reunioes.forEach((r) => {
      if (!r.data_inicio?.startsWith(prefixo)) return;
      const dia = parseInt(r.data_inicio.split("-")[2], 10);
      if (!map[dia]) map[dia] = [];
      map[dia].push(r);
    });
    return map;
  }, [reunioes, mes, ano]);

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

  const celulas = [
    ...Array(primeiroDia).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ];

  return (
    <div className="space-y-4">
      {/* Navegação */}
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

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        {/* Header semana */}
        <div className="grid grid-cols-7 mb-2">
          {DIAS_SEMANA.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-bold text-gray-400 py-2"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {celulas.map((dia, idx) => {
            if (!dia) return <div key={`e-${idx}`} />;
            const isHoje =
              dia === hoje.getDate() &&
              mes === hoje.getMonth() &&
              ano === hoje.getFullYear();
            const reunioesDia = reunioesPorDia[dia] ?? [];

            return (
              <div
                key={dia}
                className={`min-h-[80px] rounded-xl p-1.5 border cursor-pointer transition-all ${
                  isHoje
                    ? "border-blue-400 bg-blue-50"
                    : reunioesDia.length > 0
                      ? "border-blue-100 bg-blue-50/30 hover:border-blue-300"
                      : "border-gray-100 bg-gray-50/50 hover:border-gray-200"
                }`}
              >
                <span
                  className={`text-xs font-bold block mb-1 ${isHoje ? "text-blue-600" : "text-gray-500"}`}
                >
                  {dia}
                </span>
                <div className="space-y-0.5">
                  {reunioesDia.slice(0, 2).map((r, i) => (
                    <button
                      key={i}
                      onClick={() => onSelectReuniao(r)}
                      className={`w-full ${STATUS_COR[r.status] ?? "bg-gray-400"} text-white text-[9px] font-semibold px-1 py-0.5 rounded text-left truncate flex items-center gap-0.5`}
                    >
                      <Clock size={8} className="shrink-0" />
                      {r.horario_inicio} {r.titulo}
                    </button>
                  ))}
                  {reunioesDia.length > 2 && (
                    <p className="text-[9px] text-gray-400 px-1">
                      +{reunioesDia.length - 2}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 px-4 py-3 bg-white border border-gray-100 rounded-2xl shadow-sm">
        {[
          { label: "Agendada", cor: "bg-blue-500" },
          { label: "Realizada", cor: "bg-green-500" },
          { label: "Cancelada", cor: "bg-red-400" },
        ].map(({ label, cor }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${cor}`} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FSReuniaoCalendario;
