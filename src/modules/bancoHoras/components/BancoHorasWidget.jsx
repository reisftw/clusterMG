import { useMemo } from 'react';
import { Clock, TrendingDown, TrendingUp } from 'lucide-react';
import { useBancoHoras, formatarSaldo } from '../hooks/useBancoHoras';
import { useColaboradores } from '../../colaboradores/hooks/useColaboradores';

const BancoHorasWidget = () => {
  const { saldos, loading: loadingS } = useBancoHoras({ preferStatic: true });
  const { colaboradores, loading: loadingC } = useColaboradores({ preferStatic: true });

  const saldoMap = useMemo(() => {
    const m = {};
    saldos.forEach((s) => { m[s.colaborador_id] = s; });
    return m;
  }, [saldos]);

  const lista = useMemo(() => {
    const ativos = colaboradores.filter(
      (c) => c.status === 'Ativo' || c.status === 'Em Experiência'
    );
    return [...ativos].sort((a, b) => {
      const sa = saldoMap[a.id]?.saldo_minutos ?? 0;
      const sb = saldoMap[b.id]?.saldo_minutos ?? 0;
      return sa - sb;
    });
  }, [colaboradores, saldoMap]);

  const resumo = useMemo(() => ({
    negativos: lista.filter((c) => (saldoMap[c.id]?.saldo_minutos ?? 0) < 0).length,
    positivos: lista.filter((c) => (saldoMap[c.id]?.saldo_minutos ?? 0) > 0).length,
  }), [lista, saldoMap]);

  if (loadingS || loadingC) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Clock size={16} className="text-blue-600" />
          </div>
          <p className="text-sm font-bold text-gray-900">Banco de Horas</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-lg">
            <TrendingDown size={11} /> {resumo.negativos} neg.
          </span>
          <span className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-lg">
            <TrendingUp size={11} /> {resumo.positivos} pos.
          </span>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto space-y-1 max-h-56">
        {lista.map((colab) => {
          const reg = saldoMap[colab.id];
          const saldo = reg?.saldo_minutos ?? null;
          const isNeg = saldo != null && saldo < 0;
          const isPos = saldo != null && saldo > 0;

          return (
            <div
              key={colab.id}
              className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                  isNeg ? 'bg-red-100 text-red-600' : isPos ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {colab.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">
                    {colab.nome.split(' ').slice(0, 2).join(' ')}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">{colab.cargo}</p>
                </div>
              </div>
              <span className={`text-xs font-bold shrink-0 ml-2 ${
                isNeg ? 'text-red-500' : isPos ? 'text-green-600' : 'text-gray-400'
              }`}>
                {saldo == null ? '—' : formatarSaldo(saldo)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BancoHorasWidget;
