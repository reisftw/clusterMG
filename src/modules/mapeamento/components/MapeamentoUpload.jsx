import { useRef, useState } from "react";
import { RefreshCw, Upload } from "lucide-react";
import { processarUploadMapeamento } from "../utils/uploadMapeamento";

export default function MapeamentoUpload({ onConcluido }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [resultado, setResultado] = useState(null);

  async function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setLoading(true);
    setProgresso("");
    setResultado(null);

    try {
      const payload = await processarUploadMapeamento(files, setProgresso);
      setResultado(payload);
      onConcluido?.();
    } catch (error) {
      setProgresso(`Erro: ${error.message}`);
    } finally {
      setLoading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          onChange={handleFiles}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {loading ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
          {loading ? "Processando mapeamento..." : "Importar base do mapeamento"}
        </button>

        <p className="text-xs text-gray-500">
          Aceita um ou mais arquivos com as colunas <strong>data_cadastro</strong> e{" "}
          <strong>cidade</strong>.
        </p>

        {progresso ? <span className="text-sm text-gray-500">{progresso}</span> : null}
      </div>

      {resultado ? (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            Arquivos: {resultado.totalArquivos}
          </span>
          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Linhas lidas: {resultado.totalLinhas}
          </span>
          <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            Sem regional: {resultado.ignoradasSemRegional}
          </span>
          <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            Linhas invalidas: {resultado.linhasInvalidas}
          </span>
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            Abertas mes atual: {resultado.abertasMesAtual}
          </span>
        </div>
      ) : null}
    </div>
  );
}
