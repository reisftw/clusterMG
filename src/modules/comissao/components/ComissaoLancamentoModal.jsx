import { useState } from 'react';
import { X, Wrench } from 'lucide-react';

const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const ComissaoLancamentoModal = ({ colaborador, mesIdx, valorAtual, config, onSalvar, onClose }) => {
  const [servicos, setServicos] = useState(valorAtual ?? '');
  const [saving,   setSaving]   = useState(false);

  const comissao = Number(servicos) * config.valor_por_servico;
  const pct = config.meta_mensal > 0
    ? Math.round((Number(servicos) / config.meta_mensal) * 100)
    : 0;

  const corPct = pct >= 100
    ? 'text-green-600'
    : pct >= 70
    ? 'text-yellow-600'
    : 'text-red-500';

  const bgPct = pct >= 100
    ? 'bg-green-50 border-green-100'
    : pct >= 70
    ? 'bg-yellow-50 border-yellow-100'
    : 'bg-red-50 border-red-100';

  const handleSalvar = async () => {
    setSaving(true);
    await onSalvar(colaborador.id, mesIdx, Number(servicos));
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-gray-100">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
              <Wrench size={16} className="text-orange-500" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Lançar Serviços</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <p className="text-[10px] font-semibold text-blue-400 uppercase mb-0.5">Técnico</p>
              <p className="text-sm font-bold text-blue-700 truncate">{colaborador.nome.split(' ')[0]}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Mês</p>
              <p className="text-sm font-bold text-gray-700">{MESES_LABEL[mesIdx]}</p>
            </div>
          </div>

          {/* Input serviços */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Quantidade de Serviços
            </label>
            <input
              type="number"
              min="0"
              value={servicos}
              onChange={(e) => setServicos(e.target.value)}
              placeholder="0"
              className="input-field text-lg font-bold text-center"
              autoFocus
            />
          </div>

          {/* Preview */}
          {servicos !== '' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-center">
                <p className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Serviços</p>
                <p className="text-base font-extrabold text-gray-800">{Number(servicos)}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 border border-green-100 text-center">
                <p className="text-[10px] font-semibold text-green-400 uppercase mb-0.5">Comissão</p>
                <p className="text-base font-extrabold text-green-700">
                  R${comissao.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                </p>
              </div>
              <div className={`rounded-xl p-3 border text-center ${bgPct}`}>
                <p className={`text-[10px] font-semibold uppercase mb-0.5 ${corPct}`}>Meta</p>
                <p className={`text-base font-extrabold ${corPct}`}>{pct}%</p>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={saving || servicos === ''}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ComissaoLancamentoModal;
