import { useRef } from 'react';
import { Upload, RefreshCw } from 'lucide-react';
import StaticDataRefreshLink from '../../../components/ui/StaticDataRefreshLink';

const MetasUpload = ({ onUpload, uploading, lastUpdate, onRefresh }) => {
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await onUpload(file);
    } catch {
      alert('Erro ao processar a planilha. Verifique o arquivo e tente novamente.');
    }
    e.target.value = '';
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {lastUpdate && (
        <span className="text-xs text-gray-400 mr-1">{lastUpdate}</span>
      )}
      <button
        onClick={onRefresh}
        className="p-2 rounded-xl border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
        title="Recarregar dados"
      >
        <RefreshCw size={16} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Upload size={16} />
        {uploading ? 'Processando...' : 'Atualizar Planilha'}
      </button>
      <StaticDataRefreshLink
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300 text-sm font-semibold transition-colors"
      />
    </div>
  );
};

export default MetasUpload;

