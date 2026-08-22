import { useState, useMemo } from 'react';
import { Plus, RefreshCw, Pencil, Trash2, ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import { useRegionais } from '../hooks/useRegionais';
import { useAuthContext } from '../../../context/AuthContext';
import { hasPermission } from '../../../constants/roles';
import RegionalModal from './RegionalModal';
import ContactCard from './ContactCard';
import Spinner from '../../../components/ui/Spinner';

const RegionaisPage = () => {
  const { currentUser } = useAuthContext();
  const { regionais, loading, carregar, criar, atualizar, excluir } = useRegionais();

  const [expandidas,       setExpandidas]       = useState({});
  const [modal,            setModal]            = useState(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState(null);

  const podeEditar = hasPermission(currentUser?.role, 'manage_regionais');
  const toggle = (id) => setExpandidas((p) => ({ ...p, [id]: !p[id] }));

  const totalCidades = useMemo(() => regionais.reduce((a, r) => a + (r.cidades?.length ?? 0), 0), [regionais]);
  const totalAgentes = useMemo(() => regionais.reduce((a, r) => a + (r.cidades?.filter(c => c.tipo === 'Agente Aut.').length ?? 0), 0), [regionais]);

  const handleSalvar = async (dados) => {
    if (modal?.id) await atualizar(modal.id, dados);
    else await criar(dados);
  };

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <MapPin size={18} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Regionais</h2>
            <p className="text-xs text-gray-400">{regionais.length} regional(is) · {totalCidades} cidades</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregar} className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
            <RefreshCw size={16} />
          </button>
          {podeEditar && (
            <button onClick={() => setModal('novo')} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Nova Regional
            </button>
          )}
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Regionais',    value: regionais.length, bg: 'bg-blue-50  border-blue-100',  text: 'text-blue-700'  },
          { label: 'Cidades',      value: totalCidades,     bg: 'bg-green-50 border-green-100', text: 'text-green-700' },
          { label: 'Agentes Aut.', value: totalAgentes,     bg: 'bg-amber-50 border-amber-100', text: 'text-amber-600' },
        ].map(({ label, value, bg, text }) => (
          <div key={label} className={`rounded-2xl border p-4 text-center ${bg}`}>
            <p className={`text-2xl font-extrabold ${text}`}>{value}</p>
            <p className={`text-xs font-medium mt-0.5 ${text} opacity-80`}>{label}</p>
          </div>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {regionais.map((regional) => {
          const aberta  = !!expandidas[regional.id];
          const comuns  = regional.cidades?.filter(c => c.tipo === 'Comum').length ?? 0;
          const agentes = regional.cidades?.filter(c => c.tipo === 'Agente Aut.').length ?? 0;

          // Suporte ao formato antigo (backoffice) e novo (backoffices)
          const listaBackoffices = Array.isArray(regional.backoffices) && regional.backoffices.length
            ? regional.backoffices
            : regional.backoffice?.nome ? [regional.backoffice] : [];

          const temEquipe = regional.supervisor?.nome || regional.lider?.nome || listaBackoffices.length > 0;

          return (
            <div key={regional.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggle(regional.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle(regional.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-gray-400">
                    {aberta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <span className="font-bold text-gray-900 tracking-wide">{regional.nome}</span>
                  <span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                    {regional.cidades?.length ?? 0} cidades
                  </span>
                  {agentes > 0 && (
                    <span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-amber-50 text-amber-600 border border-amber-100">
                      ⭐ {agentes} ag.
                    </span>
                  )}
                  {listaBackoffices.length > 1 && (
                    <span className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-purple-50 text-purple-600 border border-purple-100">
                      {listaBackoffices.length} backoffices
                    </span>
                  )}
                </div>
                {podeEditar && (
                  <div
                    className="flex gap-1"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="presentation"
                  >
                    <button onClick={() => setModal(regional)} className="p-1.5 rounded-lg text-gray-400 hover:bg-orange-50 hover:text-orange-500 transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmarExcluir(regional)} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {aberta && (
                <div className="border-t border-gray-100 p-5 space-y-5">
                  {temEquipe && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <ContactCard label="Supervisor"    pessoa={regional.supervisor} />
                        <ContactCard label="Líder Técnico" pessoa={regional.lider} />
                      </div>
                      {listaBackoffices.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {listaBackoffices.map((b, i) => (
                            <ContactCard
                              key={i}
                              label={listaBackoffices.length > 1 ? `BackOffice ${String(i + 1).padStart(2, '0')}` : 'BackOffice'}
                              pessoa={b}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                      Cidades — {comuns} comum{comuns !== 1 ? 'ns' : ''}{agentes > 0 ? ` · ${agentes} agente(s) aut.` : ''}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {regional.cidades?.map((cidade, i) => (
                        <div key={i} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ${
                          cidade.tipo === 'Agente Aut.'
                            ? 'bg-amber-50 border-amber-100 text-amber-700'
                            : 'bg-gray-50 border-gray-100 text-gray-700'
                        }`}>
                          {cidade.tipo === 'Agente Aut.' && <span className="text-amber-500">⭐</span>}
                          {cidade.nome}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {regionais.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <MapPin size={28} className="text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Nenhuma regional cadastrada.</p>
        </div>
      )}

      {modal && (
        <RegionalModal
          regional={modal === 'novo' ? null : modal}
          onSalvar={handleSalvar}
          onClose={() => setModal(null)}
        />
      )}

      {confirmarExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-sm">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={18} className="text-red-500" />
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">Excluir regional?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              <span className="font-semibold text-gray-700">{confirmarExcluir.nome}</span> e suas{' '}
              {confirmarExcluir.cidades?.length ?? 0} cidades serao removidas permanentemente.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmarExcluir(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button
                onClick={async () => { await excluir(confirmarExcluir.id); setConfirmarExcluir(null); }}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegionaisPage;

