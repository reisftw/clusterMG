import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { usePresenca } from '../hooks/usePresenca';
import { useAuthContext } from '../../../context/AuthContext';

const MOTIVOS = [
  'Falta injustificada','Atestado médico','Férias',
  'Folga','Feriado','Licença','Outro',
];

const hoje = () => new Date().toISOString().split('T')[0];

const PresencaLancamento = ({ colaboradores }) => {
  const { currentUser } = useAuthContext();
  const { presencas, loading, salvar, carregarPorData } = usePresenca();
  const [data,      setData]      = useState(hoje());
  const [expandido, setExpandido] = useState(null);
  const [salvando,  setSalvando]  = useState(null);

  useEffect(() => { carregarPorData(data); }, [data, carregarPorData]);

  const colaboradoresAtivos = useMemo(
    () => colaboradores.filter((c) => c.status === 'Ativo' || c.status === 'Em Experiência'),
    [colaboradores]
  );

  const presencaMap = useMemo(() => {
    const map = {};
    presencas.forEach((p) => { map[p.colaborador_id] = p; });
    return map;
  }, [presencas]);

  const handleToggle = async (colab, presente) => {
    if (salvando) return;
    setSalvando(colab.id);
    try {
      await salvar({
        colaborador_id:  colab.id,
        data,
        presente,
        motivo_ausencia: presente ? null : (presencaMap[colab.id]?.motivo_ausencia ?? ''),
        observacao:      presencaMap[colab.id]?.observacao ?? '',
        ...(currentUser?.uid ? { registrado_por: currentUser.uid } : {}),
      });
      if (!presente) setExpandido(colab.id);
      else setExpandido(null);
    } catch (e) {
      console.error('Erro ao salvar presença:', e);
    } finally {
      setSalvando(null);
    }
  };

  const handleMotivoSalvar = async (colab, motivo, observacao) => {
    if (salvando) return;
    setSalvando(colab.id);
    try {
      await salvar({
        colaborador_id:  colab.id,
        data,
        presente:        false,
        motivo_ausencia: motivo,
        observacao,
        ...(currentUser?.uid ? { registrado_por: currentUser.uid } : {}),
      });
      setExpandido(null);
    } catch (e) {
      console.error('Erro ao salvar motivo:', e);
    } finally {
      setSalvando(null);
    }
  };

  const totalPresentes = colaboradoresAtivos.filter((c) => presencaMap[c.id]?.presente === true).length;
  const totalAusentes  = colaboradoresAtivos.filter((c) => presencaMap[c.id]?.presente === false).length;

  return (
    <div className="space-y-4">

      {/* Header: data + resumo */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Clock size={16} className="text-blue-600" />
          </div>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="input-field w-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-xl border border-green-100">
            <CheckCircle2 size={13} /> {totalPresentes} presentes
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 px-3 py-1.5 rounded-xl border border-red-100">
            <XCircle size={13} /> {totalAusentes} ausentes
          </span>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Lista */}
      {!loading && (
        <div className="space-y-2">
          {colaboradoresAtivos.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
              <p className="text-sm text-gray-400">Nenhum colaborador ativo cadastrado.</p>
            </div>
          )}

          {colaboradoresAtivos.map((colab) => {
            const nome       = colab?.nome ?? '';
            const inicial    = nome.charAt(0).toUpperCase() || '?';
            const registro   = presencaMap[colab.id];
            const presente   = registro?.presente;
            const ausente    = presente === false;
            const isSalvando = salvando === colab.id;
            const isExpanded = expandido === colab.id;

            return (
              <div
                key={colab.id}
                className={`bg-white rounded-2xl border shadow-sm transition-all ${
                  ausente ? 'border-red-100' : presente ? 'border-green-100' : 'border-gray-100'
                }`}
              >
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                  {/* Info colaborador */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                      ausente   ? 'bg-red-100 text-red-600'     :
                      presente  ? 'bg-green-100 text-green-700' :
                                  'bg-gray-100 text-gray-500'
                    }`}>
                      {inicial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{nome || '—'}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {colab.cargo ?? ''}{colab.base_operacional ? ` · ${colab.base_operacional}` : ''}
                      </p>
                      {ausente && registro?.motivo_ausencia && (
                        <p className="text-xs text-red-500 font-medium mt-0.5">
                          {registro.motivo_ausencia}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isSalvando ? (
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <button
                          onClick={() => handleToggle(colab, true)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                            presente === true
                              ? 'bg-green-500 text-white border-green-500 shadow-sm'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-green-300 hover:text-green-600'
                          }`}
                        >
                          <CheckCircle2 size={13} /> Presente
                        </button>
                        <button
                          onClick={() => handleToggle(colab, false)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                            ausente
                              ? 'bg-red-500 text-white border-red-500 shadow-sm'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-500'
                          }`}
                        >
                          <XCircle size={13} /> Ausente
                        </button>
                        {ausente && (
                          <button
                            onClick={() => setExpandido(isExpanded ? null : colab.id)}
                            className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Painel motivo */}
                {isExpanded && ausente && (
                  <MotivoPanel
                    colab={colab}
                    registro={registro}
                    onSalvar={handleMotivoSalvar}
                    onCancelar={() => setExpandido(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const MotivoPanel = ({ colab, registro, onSalvar, onCancelar }) => {
  const [motivo,     setMotivo]     = useState(registro?.motivo_ausencia ?? '');
  const [observacao, setObservacao] = useState(registro?.observacao ?? '');

  return (
    <div className="px-4 pb-4 border-t border-red-50 pt-3 space-y-3 bg-red-50/30 rounded-b-2xl">
      <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Motivo da Ausência</p>
      <div className="flex flex-wrap gap-2">
        {MOTIVOS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMotivo(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              motivo === m
                ? 'bg-red-500 text-white border-red-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:text-red-500'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <textarea
        className="input-field resize-none text-xs"
        rows={2}
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        placeholder="Observação adicional..."
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancelar}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={() => onSalvar(colab, motivo, observacao)}
          disabled={!motivo}
          className="btn-primary text-xs py-1.5 disabled:opacity-40"
        >
          Salvar motivo
        </button>
      </div>
    </div>
  );
};

export default PresencaLancamento;
