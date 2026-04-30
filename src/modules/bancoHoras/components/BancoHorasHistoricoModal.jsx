import { useState, useEffect } from 'react';
import { X, History } from 'lucide-react';
import { useBancoHoras, formatarSaldo } from '../hooks/useBancoHoras';

const formatarDataHora = (str) => {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatarData = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

const BancoHorasHistoricoModal = ({ colaborador, onClose }) => {
  const { buscarHistoricoColab } = useBancoHoras();
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    buscarHistoricoColab(colaborador.id).then((h) => {
      setHistorico(h);
      setLoading(false);
    });
  }, [colaborador.id, buscarHistoricoColab]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col border border-gray-100">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <History size={16} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Histórico</h3>
              <p className="text-xs text-gray-400">{colaborador.nome}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : historico.length === 0 ? (
            <div className="text-center py-12">
              <History size={28} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Nenhum lançamento encontrado.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {historico.map((h, i) => {
                const isNeg = h.saldo_minutos < 0;
                return (
                  <li key={i} className={`p-4 rounded-xl border ${isNeg ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Saldo */}
                        <p className={`text-base font-extrabold ${isNeg ? 'text-red-600' : 'text-green-600'}`}>
                          {formatarSaldo(h.saldo_minutos)}
                        </p>
                        {/* Meta */}
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Atualizado: {formatarDataHora(h.registrado_em)}
                        </p>
                        {h.data_pgto_cobranca && (
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {isNeg ? 'Cobrança' : 'Pagamento'}: {formatarData(h.data_pgto_cobranca)}
                          </p>
                        )}
                        {h.observacao && (
                          <p className="text-xs text-gray-500 italic mt-1.5 border-t border-gray-200 pt-1.5">
                            "{h.observacao}"
                          </p>
                        )}
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                        isNeg ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                      }`}>
                        {isNeg ? 'Negativo' : 'Positivo'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};

export default BancoHorasHistoricoModal;
