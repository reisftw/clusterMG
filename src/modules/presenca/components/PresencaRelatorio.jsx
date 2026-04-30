import { useState, useMemo } from 'react';
import { FileDown, BarChart2, ChevronDown, ChevronUp } from 'lucide-react';
import { usePresenca } from '../hooks/usePresenca';

const PERIODOS = [
  { label: 'Semanal', value: 'semanal' },
  { label: 'Mensal',  value: 'mensal'  },
  { label: 'Anual',   value: 'anual'   },
];

const calcularIntervalo = (periodo) => {
  const hoje = new Date();
  let inicio;
  const fim = hoje.toISOString().split('T')[0];
  if (periodo === 'semanal') {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - hoje.getDay());
    inicio = d.toISOString().split('T')[0];
  } else if (periodo === 'mensal') {
    inicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  } else {
    inicio = `${hoje.getFullYear()}-01-01`;
  }
  return { inicio, fim };
};

const diasUteisNoIntervalo = (inicio, fim) => {
  let count = 0;
  const d = new Date(inicio + 'T00:00:00');
  const f = new Date(fim + 'T00:00:00');
  while (d <= f) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
};

const PresencaRelatorio = ({ colaboradores }) => {
  const { carregarPorPeriodo } = usePresenca();
  const [periodo,       setPeriodo]       = useState('mensal');
  const [colaboradorId, setColaboradorId] = useState('');
  const [dados,         setDados]         = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [expandido,     setExpandido]     = useState(null);

  const colaboradoresAtivos = useMemo(
    () => colaboradores.filter((c) => c.status === 'Ativo' || c.status === 'Em Experiência'),
    [colaboradores]
  );

  const gerar = async () => {
    setLoading(true);
    const { inicio, fim } = calcularIntervalo(periodo);
    const presencas = await carregarPorPeriodo(inicio, fim);
    setDados({ presencas, inicio, fim });
    setLoading(false);
  };

  const relatorio = useMemo(() => {
    if (!dados) return null;
    const { presencas, inicio, fim } = dados;
    const colabs    = colaboradorId
      ? colaboradoresAtivos.filter((c) => c.id === colaboradorId)
      : colaboradoresAtivos;
    const diasUteis = diasUteisNoIntervalo(inicio, fim);
    return colabs.map((colab) => {
      const registros = presencas.filter((p) => p.colaborador_id === colab.id);
      const presentes = registros.filter((p) => p.presente).length;
      const faltas    = registros.filter((p) => !p.presente).length;
      const porMotivo = {};
      registros.filter((p) => !p.presente).forEach((p) => {
        const m = p.motivo_ausencia || 'Sem motivo';
        porMotivo[m] = (porMotivo[m] ?? 0) + 1;
      });
      return { colab, diasUteis, presentes, faltas, porMotivo, registros };
    });
  }, [dados, colaboradorId, colaboradoresAtivos]);

  const formatarData = (d) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

  return (
    <div className="space-y-4">

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <BarChart2 size={16} className="text-blue-600" />
          </div>
          <p className="text-sm font-bold text-gray-900">Gerar Relatório</p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Período</label>
            <div className="flex gap-2">
              {PERIODOS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriodo(p.value)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    periodo === p.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Colaborador</label>
            <select
              value={colaboradorId}
              onChange={(e) => setColaboradorId(e.target.value)}
              className="input-field"
            >
              <option value="">Todos</option>
              {colaboradoresAtivos.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <button
            onClick={gerar}
            disabled={loading}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {loading
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando...</>
              : <><FileDown size={15} /> Gerar</>
            }
          </button>
        </div>
      </div>

      {/* Resultados */}
      {relatorio && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400 font-medium">
              Período: <span className="text-gray-700 font-semibold">{formatarData(dados.inicio)} → {formatarData(dados.fim)}</span>
            </p>
            <p className="text-xs text-gray-400">{relatorio.length} colaborador(es)</p>
          </div>

          {relatorio.map(({ colab, diasUteis, presentes, faltas, porMotivo, registros }) => {
            const freq       = diasUteis > 0 ? Math.round((presentes / diasUteis) * 100) : 0;
            const isExpanded = expandido === colab.id;
            const corFreq    = freq >= 90 ? 'text-green-600' : freq >= 75 ? 'text-yellow-600' : 'text-red-500';
            const bgFreq     = freq >= 90 ? 'bg-green-50 border-green-100' : freq >= 75 ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100';

            return (
              <div key={colab.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandido(isExpanded ? null : colab.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-bold">
                        {colab.nome?.charAt(0)?.toUpperCase() ?? '?'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{colab.nome}</p>
                      <p className="text-xs text-gray-400">{colab.cargo} · {colab.base_operacional || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-lg border border-green-100">
                        {presentes} pres.
                      </span>
                      <span className="font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-lg border border-red-100">
                        {faltas} falt.
                      </span>
                      <span className={`font-bold px-2 py-0.5 rounded-lg border ${bgFreq} ${corFreq}`}>
                        {freq}%
                      </span>
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-50 pt-4 space-y-4">
                    {/* Cards de resumo */}
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: 'Presenças',   value: presentes,  color: 'green' },
                        { label: 'Faltas',       value: faltas,     color: 'red'   },
                        { label: 'Dias úteis',   value: diasUteis,  color: 'gray'  },
                        { label: 'Frequência',   value: `${freq}%`, color: freq >= 90 ? 'green' : freq >= 75 ? 'yellow' : 'red' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className={`rounded-xl p-3 text-center border ${
                          color === 'green'  ? 'bg-green-50 border-green-100'   :
                          color === 'red'    ? 'bg-red-50 border-red-100'       :
                          color === 'yellow' ? 'bg-yellow-50 border-yellow-100' :
                          'bg-gray-50 border-gray-100'
                        }`}>
                          <p className={`text-lg font-extrabold ${
                            color === 'green'  ? 'text-green-600'   :
                            color === 'red'    ? 'text-red-500'     :
                            color === 'yellow' ? 'text-yellow-600'  :
                            'text-gray-600'
                          }`}>{value}</p>
                          <p className="text-[10px] text-gray-400 font-medium mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Faltas por motivo */}
                    {Object.keys(porMotivo).length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Faltas por motivo</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(porMotivo).map(([motivo, qtd]) => (
                            <span key={motivo} className="text-xs font-semibold px-2.5 py-1 bg-red-50 text-red-600 rounded-lg border border-red-100">
                              {motivo}: {qtd}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timeline de registros */}
                    {registros.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Timeline</p>
                        <div className="flex flex-wrap gap-1.5">
                          {registros.sort((a, b) => a.data.localeCompare(b.data)).map((r) => (
                            <div
                              key={r.data}
                              title={`${formatarData(r.data)}${!r.presente && r.motivo_ausencia ? ` — ${r.motivo_ausencia}` : ''}`}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold border cursor-default ${
                                r.presente
                                  ? 'bg-green-100 text-green-700 border-green-200'
                                  : 'bg-red-100 text-red-600 border-red-200'
                              }`}
                            >
                              {r.data.split('-')[2]}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PresencaRelatorio;
