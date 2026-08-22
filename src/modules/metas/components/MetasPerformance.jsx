const BarItem = ({ name, total, meta = 110, rank }) => {
  const pct = Math.min((total / meta) * 100, 100);
  const atingiu = total >= meta;
  return (
    <div className="flex items-center gap-3">
      <span className={`text-lg font-extrabold min-w-[28px] text-center ${rank <= 3 ? "text-orange-500" : "text-gray-300"}`}>
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-gray-800 truncate">{name}</span>
          <span className="text-sm font-bold text-gray-700 ml-2">{total}</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${atingiu ? "bg-gradient-to-r from-green-400 to-green-500" : "bg-gradient-to-r from-orange-400 to-orange-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">{total} / {meta} O.S - {pct.toFixed(0)}%</p>
      </div>
    </div>
  );
};

const EmptyRanking = ({ children }) => (
  <p className="rounded-xl bg-gray-50 p-4 text-sm font-semibold text-gray-400">
    {children}
  </p>
);

const MetasPerformance = ({ dados }) => {
  if (!dados) return null;
  const technicians = dados.technicians || [];
  const regionais = dados.regionais || [];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-4">Ranking Tecnicos</h3>
        <div className="space-y-4">
          {technicians.length > 0 ? technicians.map((t, i) => (
            <BarItem key={t.name} name={t.name} total={t.total} meta={110} rank={i + 1} />
          )) : (
            <EmptyRanking>Sem dados de tecnicos para esta base.</EmptyRanking>
          )}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-4">Ranking Regionais</h3>
        <div className="space-y-4">
          {regionais.length > 0 ? regionais.map((r, i) => (
            <BarItem key={r.name} name={r.name} total={r.total} meta={110} rank={i + 1} />
          )) : (
            <EmptyRanking>Sem dados de regionais para esta base.</EmptyRanking>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetasPerformance;

