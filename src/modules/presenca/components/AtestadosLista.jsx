import { useState, useMemo } from 'react';
import { Plus, RefreshCw, Trash2, Pencil, Search, FileText } from 'lucide-react';
import { useAtestado } from '../hooks/useAtestado';
import AtestadoForm from './AtestadoForm';

const AtestadosLista = ({ colaboradores }) => {
  const { atestados, loading, salvar, atualizar, deletar, carregar } = useAtestado();
  const [showForm,  setShowForm]  = useState(false);
  const [editando,  setEditando]  = useState(null);
  const [busca,     setBusca]     = useState('');
  const [confirmar, setConfirmar] = useState(null);

  const colabMap = useMemo(() => {
    const m = {};
    colaboradores.forEach((c) => { m[c.id] = c; });
    return m;
  }, [colaboradores]);

  const listaFiltrada = useMemo(() =>
    atestados.filter((a) => {
      const nome = colabMap[a.colaborador_id]?.nome ?? '';
      return (
        nome.toLowerCase().includes(busca.toLowerCase()) ||
        a.cid?.toLowerCase().includes(busca.toLowerCase()) ||
        a.cid_descricao?.toLowerCase().includes(busca.toLowerCase())
      );
    }),
    [atestados, busca, colabMap]
  );

  const handleSubmit = async (dados) => {
    if (editando) { await atualizar(editando.id, dados); }
    else { await salvar(dados); }
    setEditando(null);
  };

  const formatarData = (d) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, CID ou diagnóstico..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="input-field pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={carregar}
            className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => { setEditando(null); setShowForm(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} /> Novo Atestado
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Colaborador','Data','CID','Diagnóstico','Dias','Médico','Ações'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">
                    <FileText size={24} className="text-gray-200 mx-auto mb-2" />
                    Nenhum atestado encontrado.
                  </td>
                </tr>
              ) : listaFiltrada.map((a) => {
                const colab = colabMap[a.colaborador_id];
                return (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                          <span className="text-white text-[10px] font-bold">
                            {colab?.nome?.charAt(0)?.toUpperCase() ?? '?'}
                          </span>
                        </div>
                        <span className="font-medium text-gray-800">{colab?.nome ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{formatarData(a.data_atestado)}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg">
                        {a.cid || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600 text-xs max-w-[180px] truncate">
                      {a.cid_descricao || '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 bg-orange-50 text-orange-600 rounded-lg">
                        {a.dias_afastamento}d
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{a.medico || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditando(a); setShowForm(true); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-orange-50 hover:text-orange-500 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmar(a)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal form */}
      {showForm && (
        <AtestadoForm
          colaboradores={colaboradores}
          onSubmit={handleSubmit}
          onClose={() => { setShowForm(false); setEditando(null); }}
          inicial={editando}
        />
      )}

      {/* Confirmar exclusão */}
      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-sm">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={18} className="text-red-500" />
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">Excluir atestado?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              CID <span className="font-semibold text-gray-700">{confirmar.cid}</span> de{' '}
              <span className="font-semibold text-gray-700">{colabMap[confirmar.colaborador_id]?.nome}</span> será removido.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmar(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => { await deletar(confirmar.id); setConfirmar(null); }}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AtestadosLista;
