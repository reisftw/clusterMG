import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

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

const CORES = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-lime-500",
  "bg-violet-500",
];

const FSEscalaCalendario = ({
  folgas,
  colaboradores,
  onDeleteFolga,
  podeGerenciar,
}) => {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());

  const colabMap = useMemo(() => {
    const m = {};
    colaboradores.forEach((c) => {
      m[c.id] = c;
    });
    return m;
  }, [colaboradores]);

  // Cor fixa por colaborador (índice no array)
  const corPorColab = useMemo(() => {
    const m = {};
    colaboradores.forEach((c, i) => {
      m[c.id] = CORES[i % CORES.length];
    });
    return m;
  }, [colaboradores]);

  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const primeiroDia = new Date(ano, mes, 1).getDay();

  // Folgas por dia no mês
  const folgasPorDia = useMemo(() => {
    const map = {};
    const prefixo = `${ano}-${String(mes + 1).padStart(2, "0")}`;
    folgas.forEach((f) => {
      if (!f.data?.startsWith(prefixo)) return;
      const dia = parseInt(f.data.split("-")[2], 10);
      if (!map[dia]) map[dia] = [];
      map[dia].push(f);
    });
    return map;
  }, [folgas, mes, ano]);

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

  // Colaboradores com folga no mês para legenda
  const colaboradoresComFolga = useMemo(() => {
    const ids = new Set(
      Object.values(folgasPorDia)
        .flat()
        .map((f) => f.colaborador_id),
    );
    return [...ids].map((id) => colabMap[id]).filter(Boolean);
  }, [folgasPorDia, colabMap]);

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

      {/* Grid calendário */}
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

        {/* Células */}
        <div className="grid grid-cols-7 gap-1">
          {celulas.map((dia, idx) => {
            if (!dia) return <div key={`e-${idx}`} />;

            const isHoje =
              dia === hoje.getDate() &&
              mes === hoje.getMonth() &&
              ano === hoje.getFullYear();
            const folgasNoDia = folgasPorDia[dia] ?? [];
            const temConflito = folgasNoDia.some((f) => f.tem_conflito);

            return (
              <div
                key={dia}
                className={`min-h-[72px] rounded-xl p-1.5 border transition-all ${
                  isHoje
                    ? "border-blue-400 bg-blue-50"
                    : folgasNoDia.length > 0
                      ? "border-orange-100 bg-orange-50/20"
                      : "border-gray-100 bg-gray-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-bold ${isHoje ? "text-blue-600" : "text-gray-500"}`}
                  >
                    {dia}
                  </span>
                  {temConflito && (
                    <AlertTriangle size={10} className="text-orange-500" />
                  )}
                </div>
                <div className="space-y-0.5">
                  {folgasNoDia.slice(0, 2).map((f, i) => {
                    const c = colabMap[f.colaborador_id];
                    return (
                      <div
                        key={i}
                        className={`${corPorColab[f.colaborador_id] ?? "bg-gray-400"} text-white text-[9px] font-semibold px-1 py-0.5 rounded truncate flex items-center justify-between group`}
                        title={c?.nome}
                      >
                        <span>{c?.nome?.split(" ")[0] ?? "?"}</span>
                        {podeGerenciar && (
                          <button
                            onClick={() => onDeleteFolga(f.id)}
                            className="hidden group-hover:block text-white/80 hover:text-white ml-1 shrink-0"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {folgasNoDia.length > 2 && (
                    <div className="text-[9px] text-gray-400 font-semibold px-1">
                      +{folgasNoDia.length - 2} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legenda */}
      {colaboradoresComFolga.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Legenda — {MESES[mes]}
          </p>
          <div className="flex flex-wrap gap-2">
            {colaboradoresComFolga.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100"
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${corPorColab[c.id]}`}
                />
                <span className="text-xs font-medium text-gray-700">
                  {c.nome?.split(" ")[0]}
                </span>
                <span className="text-[10px] text-gray-400">{c.regional}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FSEscalaCalendario;
