import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const COR_POR_CARGO = {
  "Técnico I": { bg: "bg-blue-500", dot: "bg-blue-500" },
  "Técnico II": { bg: "bg-blue-600", dot: "bg-blue-600" },
  "Técnico III": { bg: "bg-blue-700", dot: "bg-blue-700" },
  "BackOffice I": { bg: "bg-purple-500", dot: "bg-purple-500" },
  "BackOffice II": { bg: "bg-purple-600", dot: "bg-purple-600" },
  "BackOffice III": { bg: "bg-purple-700", dot: "bg-purple-700" },
  "Líder Técnico": { bg: "bg-orange-500", dot: "bg-orange-500" },
};
const COR_PADRAO = { bg: "bg-gray-400", dot: "bg-gray-400" };

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

const toDateOrNull = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getPrimeiroNome = (value) => {
  const nome = String(value || "").trim();
  return nome ? nome.split(" ")[0] : "Sem nome";
};

const FSFeriasCalendario = ({ ferias, colaboradores }) => {
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

  const getNome = (id) => colabMap[id]?.nome ?? id ?? "Sem nome";
  const getCargo = (id) => colabMap[id]?.cargo ?? "";
  const getCor = (id) => COR_POR_CARGO[getCargo(id)] ?? COR_PADRAO;

  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const primeiroDia = new Date(ano, mes, 1).getDay();

  const feriasPorDia = useMemo(() => {
    const map = {};
    ferias.forEach((f) => {
      if (f.status === "reprovado" || f.status === "cancelado") return;
      const inicio = toDateOrNull(f.data_inicio);
      const fim = toDateOrNull(f.data_fim);
      if (!inicio || !fim) return;
      for (let d = 1; d <= diasNoMes; d++) {
        const dia = new Date(ano, mes, d);
        if (dia >= inicio && dia <= fim) {
          if (!map[d]) map[d] = [];
          map[d].push(f);
        }
      }
    });
    return map;
  }, [ferias, mes, ano, diasNoMes]);

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

  const colaboradoresComFerias = useMemo(() => {
    const ids = new Set(
      Object.values(feriasPorDia)
        .flat()
        .map((f) => f.colaborador_id),
    );
    return [...ids]
      .map((id) => ({ id, ...colabMap[id] }))
      .filter((c) => c.nome);
  }, [feriasPorDia, colabMap]);

  // Células do grid: espaços em branco + dias
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

      {/* Grid */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-4">
        {/* Cabeçalho dias semana */}
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

        {/* Dias */}
        <div className="grid grid-cols-7 gap-1">
          {celulas.map((dia, idx) => {
            if (!dia) return <div key={`empty-${idx}`} />;
            const hoje2 = new Date();
            const isHoje =
              dia === hoje2.getDate() &&
              mes === hoje2.getMonth() &&
              ano === hoje2.getFullYear();
            const feriasNoDia = feriasPorDia[dia] ?? [];

            return (
              <div
                key={dia}
                className={`min-h-[70px] rounded-xl p-1.5 border transition-all ${
                  isHoje
                    ? "border-blue-400 bg-blue-50"
                    : feriasNoDia.length > 0
                      ? "border-orange-100 bg-orange-50/30"
                      : "border-gray-100 bg-gray-50/50"
                }`}
              >
                <span
                  className={`text-xs font-bold block mb-1 ${isHoje ? "text-blue-600" : "text-gray-500"}`}
                >
                  {dia}
                </span>
                <div className="space-y-0.5">
                  {feriasNoDia.slice(0, 2).map((f, i) => (
                    <div
                      key={i}
                      className={`${getCor(f.colaborador_id).bg} text-white text-[9px] font-semibold px-1 py-0.5 rounded truncate`}
                      title={getNome(f.colaborador_id)}
                    >
                      {getPrimeiroNome(getNome(f.colaborador_id))}
                    </div>
                  ))}
                  {feriasNoDia.length > 2 && (
                    <div className="text-[9px] text-gray-400 font-semibold px-1">
                      +{feriasNoDia.length - 2} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legenda */}
      {colaboradoresComFerias.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Legenda — {MESES[mes]}
          </p>
          <div className="flex flex-wrap gap-2">
            {colaboradoresComFerias.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100"
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${getCor(c.id).dot}`}
                />
                <span className="text-xs font-medium text-gray-700">
                  {getPrimeiroNome(c.nome)}
                </span>
                <span className="text-[10px] text-gray-400">{c.cargo}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FSFeriasCalendario;
