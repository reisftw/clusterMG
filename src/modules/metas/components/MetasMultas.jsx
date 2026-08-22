const MetasMultas = ({ dados }) => {
  if (!dados) return null;
  const { totalMultas, propMult, totalOS, multasDiarias = [] } = dados;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total de Multas',     value: totalMultas || '—', color: 'bg-red-50 border-red-100',      text: 'text-red-600'    },
          { label: 'Total de Retiradas',  value: totalOS     || '—', color: 'bg-blue-50 border-blue-100',    text: 'text-blue-700'   },
          { label: 'Proporcao Ret/Multa', value: propMult > 0 ? `${propMult}x` : '—',
            color: 'bg-purple-50 border-purple-100', text: 'text-purple-700' },
        ].map(({ label, value, color, text }) => (
          <div key={label} className={`rounded-2xl border p-4 ${color}`}>
            <p className={`text-xs font-semibold mb-1 ${text} opacity-70`}>{label}</p>
            <p className={`text-2xl font-extrabold ${text}`}>{value}</p>
          </div>
        ))}
      </div>

      {multasDiarias.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-800">Lancamento Diario de Multas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[680px] w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Dia','Multas Lancadas','Retiradas do Dia','Relacao Retir/Multa'].map(h => (
                    <th key={h} className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {multasDiarias.map((row) => {
                  const rel = row.lancadas > 0 ? (row.retiradas / row.lancadas).toFixed(1) : '—';
                  return (
                    <tr key={row.dia} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-center font-bold text-gray-700">{row.dia}</td>
                      <td className="px-4 py-2.5 text-center text-red-600 font-semibold">{row.lancadas}</td>
                      <td className="px-4 py-2.5 text-center text-blue-600 font-semibold">{row.retiradas}</td>
                      <td className="px-4 py-2.5 text-center text-purple-600 font-semibold">{rel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetasMultas;

