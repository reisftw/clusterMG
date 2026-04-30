import { useMemo, useState } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { useAuthContext } from '../../../context/AuthContext';
import { useColaboradores } from '../../colaboradores/hooks/useColaboradores';
import { useComissao } from '../hooks/useComissao';
import { hasPermission } from '../../../constants/roles';
import ComissaoConfig from './ComissaoConfig';
import ComissaoTabela from './ComissaoTabela';
import Spinner from '../../../components/ui/Spinner';

const ComissaoPage = () => {
  const { currentUser } = useAuthContext();
  const { colaboradores, loading: loadingC } = useColaboradores();
  const {
    ano, setAno, config, loading, error,
    atualizarConfig, lancarServicos, buildTabela, carregar,
  } = useComissao();

  const [showConfig, setShowConfig] = useState(false);

  const podeEditar = hasPermission(currentUser?.role, 'manage_comissao');

  const tecnicos = useMemo(() =>
    colaboradores.filter((c) =>
      (c.status === 'Ativo' || c.status === 'Em Experiência') &&
      (c.cargo?.includes('Técnico') || c.cargo?.includes('Líder'))
    ),
    [colaboradores]
  );

  const tabela = useMemo(() => buildTabela(tecnicos), [buildTabela, tecnicos]);

  if (loading || loadingC) return <Spinner fullScreen />;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Seletor de ano */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
          <button
            onClick={() => setAno((a) => a - 1)}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-bold text-gray-900 min-w-[40px] text-center">{ano}</span>
          <button
            onClick={() => setAno((a) => a + 1)}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Resumo config + ações */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs text-blue-600 font-medium">
              Meta: <span className="font-bold">{config.meta_mensal}</span> serv. ·{' '}
              R$ <span className="font-bold">{Number(config.valor_por_servico).toFixed(2)}</span>/serv.
            </p>
          </div>
          <button
            onClick={carregar}
            className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
          >
            <RefreshCw size={16} />
          </button>
          {podeEditar && (
            <button
              onClick={() => setShowConfig((v) => !v)}
              className={`p-2 rounded-xl border transition-colors ${
                showConfig
                  ? 'bg-orange-50 border-orange-200 text-orange-500'
                  : 'border-gray-200 text-gray-400 hover:bg-orange-50 hover:text-orange-500 hover:border-orange-200'
              }`}
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">{error}</div>
      )}

      {/* Config panel */}
      {showConfig && podeEditar && (
        <ComissaoConfig config={config} onSalvar={atualizarConfig} />
      )}

      {/* Tabela */}
      <ComissaoTabela
        tabela={tabela}
        config={config}
        onLancar={lancarServicos}
        podeEditar={podeEditar}
      />

    </div>
  );
};

export default ComissaoPage;
