import { useState } from 'react';
import { X, ClipboardList, Check } from 'lucide-react';

const ITENS_CHECKLIST = [
  { key: 'pneus',        label: 'Pneus'        },
  { key: 'oleo',         label: 'Óleo'          },
  { key: 'limpeza',      label: 'Limpeza'       },
  { key: 'farois',       label: 'Faróis'        },
  { key: 'freios',       label: 'Freios'        },
  { key: 'documentacao', label: 'Documentação'  },
  { key: 'extintor',     label: 'Extintor'      },
];

const ChecklistForm = ({ veiculo, tecnicoId, tipo, onSubmit, onClose }) => {
  const [itens,        setItens]        = useState(
    Object.fromEntries(ITENS_CHECKLIST.map((i) => [i.key, false]))
  );
  const [observacao,   setObservacao]   = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleItem = (key) => setItens((p) => ({ ...p, [key]: !p[key] }));

  const totalMarcados = Object.values(itens).filter(Boolean).length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({ veiculo_id: veiculo.id, tecnico_id: tecnicoId, tipo, itens, observacao });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSaida = tipo === 'saida';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isSaida ? 'bg-green-50' : 'bg-blue-50'
            }`}>
              <ClipboardList size={16} className={isSaida ? 'text-green-600' : 'text-blue-600'} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Checklist de {isSaida ? 'Saída' : 'Retorno'}
              </h3>
              <p className="text-xs text-gray-400 font-medium">{veiculo.placa} · {veiculo.modelo}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-500">Itens verificados</span>
                <span className="text-xs font-bold text-gray-700">{totalMarcados}/{ITENS_CHECKLIST.length}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${isSaida ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${(totalMarcados / ITENS_CHECKLIST.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Itens */}
            <div className="grid grid-cols-2 gap-2">
              {ITENS_CHECKLIST.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleItem(key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all text-left ${
                    itens[key]
                      ? isSaida
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-all ${
                    itens[key]
                      ? isSaida ? 'bg-green-500 border-green-500' : 'bg-blue-500 border-blue-500'
                      : 'border-gray-300 bg-white'
                  }`}>
                    {itens[key] && <Check size={10} className="text-white" strokeWidth={3} />}
                  </div>
                  {label}
                </button>
              ))}
            </div>

            {/* Observação */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Observações</label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
                placeholder="Alguma observação sobre o veículo..."
                className="input-field resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 pb-5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                isSaida ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isSubmitting ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChecklistForm;
