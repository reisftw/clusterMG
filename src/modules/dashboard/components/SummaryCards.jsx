import { CalendarCheck, ClipboardCheck, Users } from "lucide-react";

const CARDS = [
  {
    key: "tecnicosEmFerias",
    label: "Colaboradores em Férias",
    icon: Users,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-100",
    accent: "from-blue-500 to-blue-400",
  },
  {
    key: "visitasNoMes",
    label: "Visitas no mês",
    icon: ClipboardCheck,
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-100",
    accent: "from-green-500 to-green-400",
  },
  {
    key: "feriadosProximos",
    label: "Próximos Feriados",
    icon: CalendarCheck,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    border: "border-indigo-100",
    accent: "from-indigo-500 to-indigo-400",
    isArray: true,
  },
];

const SummaryCards = ({ resumo, variant = "classic", hiddenKeys = [] }) => {
  if (!resumo) return null;

  const isModern = variant === "modern";
  const gridClassName = "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <div
      className={gridClassName}
    >
      {CARDS.filter(({ key }) => !hiddenKeys.includes(key)).map(
        ({ key, label, icon: Icon, color, bg, border, accent, isArray }) => {
          const value = isArray ? (resumo[key]?.length ?? 0) : (resumo[key] ?? 0);

          return (
            <div
              key={key}
              className={
                isModern
                  ? `rounded-lg border ${border} bg-white p-5 shadow-card transition-shadow hover:shadow-md`
                  : `flex items-center gap-4 rounded-2xl border ${border} bg-white p-5 shadow-sm transition-shadow hover:shadow-md`
              }
            >
              {isModern ? (
                <>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${bg}`}
                    >
                      <Icon size={21} className={color} />
                    </div>
                    <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-500">
                      Atual
                    </span>
                  </div>
                  <p className="text-3xl font-black text-slate-950">{value}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {label}
                  </p>
                  <div
                    className={`mt-4 h-1 rounded-full bg-gradient-to-r ${accent} opacity-70`}
                  />
                </>
              ) : (
                <>
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${bg}`}
                  >
                    <Icon size={22} className={color} />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-gray-900">
                      {value}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-gray-500">
                      {label}
                    </p>
                  </div>
                  <div
                    className={`ml-auto h-10 w-1 rounded-full bg-gradient-to-b ${accent} opacity-60`}
                  />
                </>
              )}
            </div>
          );
        },
      )}
    </div>
  );
};

export default SummaryCards;

