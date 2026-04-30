import { useState } from 'react';
import { ClipboardList, BarChart2, FileText } from 'lucide-react';
import { useColaboradores } from '../../colaboradores/hooks/useColaboradores';
import PresencaLancamento from './PresencaLancamento';
import PresencaRelatorio from './PresencaRelatorio';
import AtestadosLista from './AtestadosLista';
import Spinner from '../../../components/ui/Spinner';

const ABAS = [
  { key: 'lancamento', label: 'Lançamento Diário', icon: ClipboardList },
  { key: 'relatorio',  label: 'Relatórios',        icon: BarChart2     },
  { key: 'atestados',  label: 'Atestados',          icon: FileText      },
];

const PresencaPage = () => {
  const { colaboradores, loading } = useColaboradores();
  const [aba, setAba] = useState('lancamento');

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-6">

      {/* Abas */}
      <div className="flex gap-2 border-b border-gray-100 pb-1">
        {ABAS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              aba === key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {aba === 'lancamento' && <PresencaLancamento colaboradores={colaboradores} />}
      {aba === 'relatorio'  && <PresencaRelatorio  colaboradores={colaboradores} />}
      {aba === 'atestados'  && <AtestadosLista     colaboradores={colaboradores} />}

    </div>
  );
};

export default PresencaPage;
