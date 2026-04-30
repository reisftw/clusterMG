import { useState } from 'react';
import { X, Clock } from 'lucide-react';
import { objParaMinutos, formatarSaldo } from '../hooks/useBancoHoras';

const hoje = () => new Date().toISOString().split('T')[0];

const inputClass =
  "w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all";

const BancoHorasModal = ({ colaborador, saldoAtual, onSalvar, onClose }) => {
  const [sinal,    setSinal]    = useState(saldoAtual < 0 ? 'negativo' : 'positivo');
  const [horas,    setHoras]    = useState('');
  const [minutos,  setMinutos]  = useState('');
  const [dataPgto, setDataPgto] = useState('');
  const [obs,      setObs]      = useState('');
  const [saving,   setSaving]   = useState(false);

  const preview = objParaMinutos({
    horas: horas || 0,
    minutos: minutos || 0,
    negativo: sinal === 'negativo',
  });

  const handleSalvar = async () => {
    if (horas === '' && minutos === '') return;
    setSaving(true);
    const totalMinutos = objParaMinutos({
      horas: Number(horas || 0),
      minutos: Number(minutos || 0),
      negativo: sinal === 'negativo',
    });
    await onSalvar({
      colaborador_id: colaborador.id,
      saldo_minutos: totalMinutos,
      data_atualizacao: hoje(),
      data_pgto_cobranca: dataPgto || null,
      observacao: obs,
      registrado_em: new Date().toISOString(),
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Clock size={16} className="text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Lançar Banco de Horas</h3>
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

          {/* Info colaborador */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">
                {colaborador.nome.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">{colaborador.nome}</p>
              <p className="text-xs text-gray-400">{colaborador.cargo}</p>
            </div>
            {saldoAtual != null && (
              <div className="ml-auto text-right">
                <p className="text-[10px] text-gray-400">Saldo atual</p>
                <p className={`text-sm font-bold ${saldoAtual < 0 ? 'text-red-500' : saldoAtual > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {formatarSaldo(saldoAtual)}
                </p>
              </div>
            )}
          </div>

          {/* Sinal */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tipo de lançamento</label>
            <div className="flex gap-2">
              {[
                { key: 'negativo', label: 'Negativo (débito)', color: 'red' },
                { key: 'positivo', label: 'Positivo (crédito)', color: 'green' },
              ].map(({ key, label, color }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSinal(key)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    sinal === key
                      ? color === 'red'
                        ? 'bg-red-500 text-white border-red-500'
                        : 'bg-green-500 text-white border-green-500'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Horas e Minutos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Horas</label>
              <input
                type="number"
                min="0"
                className={inputClass}
                placeholder="0"
                value={horas}
                onChange={(e) => setHoras(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Minutos</label>
              <input
                type="number"
                min="0"
                max="59"
                className={inputClass}
                placeholder="0"
                value={minutos}
                onChange={(e) => setMinutos(e.target.value)}
              />
            </div>
          </div>

          {/* Preview */}
          {(horas !== '' || minutos !== '') && (
            <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${
              sinal === 'negativo' ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'
            }`}>
              <span className="text-xs font-medium text-gray-600">Será lançado:</span>
              <span className={`text-sm font-bold ${sinal === 'negativo' ? 'text-red-600' : 'text-green-600'}`}>
                {formatarSaldo(preview)}
              </span>
            </div>
          )}

          {/* Data pgto/cobrança */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Data de {sinal === 'negativo' ? 'cobrança' : 'pagamento'} (opcional)
            </label>
            <input
              type="date"
              className={inputClass}
              value={dataPgto}
              onChange={(e) => setDataPgto(e.target.value)}
            />
          </div>

          {/* Observação */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Observação (opcional)</label>
            <textarea
              className={`${inputClass} resize-none`}
              rows={2}
              placeholder="Ex: compensação semana passada..."
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
          </div>
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
            disabled={saving || (horas === '' && minutos === '')}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Salvando...' : 'Confirmar lançamento'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default BancoHorasModal;
