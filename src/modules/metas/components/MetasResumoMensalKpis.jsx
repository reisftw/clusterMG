const MetasResumoMensalKpis = ({ kpis }) => {
  if (!kpis.length) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {kpis.map(({ label, value, color, text }) => (
        <div key={label} className={`rounded-2xl border p-4 ${color}`}>
          <p className={`mb-1 text-xs font-semibold ${text} opacity-70`}>
            {label}
          </p>
          <p className={`text-2xl font-extrabold ${text}`}>{value}</p>
        </div>
      ))}
    </div>
  );
};

export default MetasResumoMensalKpis;

