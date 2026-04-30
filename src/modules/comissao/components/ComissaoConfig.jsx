import { useState } from 'react';
import { Settings, Check } from 'lucide-react';

const ComissaoConfig = ({ config, onSalvar }) => {
  const [meta,  setMeta]  = useState(config.meta_mensal);
  const [valor, setValor] = useState(config.valor_por_servico);
  const [salvo, setSalvo] = useState(false);

  const handleSalvar = async () => {
    await onSalvar({ meta_mensal: Number(meta), valor_por_servico: Number(valor) });
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
          <Settings size={16} className="text-orange-500" />
        </div>
        <p className="text-sm font-bold text-gray-900">Configuração de Comissão</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Meta mensal (serviços)</label>
          <input
            type="number"
            min="1"
            value={meta}
            onChange={(e) => setMeta(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Valor por serviço (R$)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <button
        onClick={handleSalvar}
        className={`btn-primary flex items-center gap-2 ${salvo ? '!bg-green-500 !from-green-500 !to-green-400' : ''}`}
      >
        {salvo ? <><Check size={14} /> Salvo!</> : 'Salvar configuração'}
      </button>
    </div>
  );
};

export default ComissaoConfig;
