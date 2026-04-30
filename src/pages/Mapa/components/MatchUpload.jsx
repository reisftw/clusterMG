import React, { useRef, useState } from "react";
import { Calendar, Route, Upload, X } from "lucide-react";
import { processarUploadMatch } from "../utils/uploadMatchOS";
import StaticDataRefreshLink from "../../../components/ui/StaticDataRefreshLink";

function ModalPeriodo({ onConfirmar, onCancelar }) {
  const hoje = new Date().toISOString().split("T")[0];
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState(hoje);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onCancelar} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-emerald-600" />
              <h3 className="font-bold text-gray-900">Periodo da Planilha</h3>
            </div>
            <button
              onClick={onCancelar}
              className="p-1 rounded-lg hover:bg-gray-100"
            >
              <X size={16} className="text-gray-400" />
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Informe o periodo usado na planilha do Match antes de importar.
          </p>
          <div className="flex flex-col gap-3 mb-6">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">
                Data inicio
              </label>
              <input
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">
                Data fim
              </label>
              <input
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancelar}
              className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirmar({ inicio, fim })}
              disabled={!inicio || !fim}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-all"
            >
              Importar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function MatchUpload({ onConcluido }) {
  const inputRef = useRef();
  const [progresso, setProgresso] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [filePendente, setFilePendente] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFilePendente(file);
    setModalAberto(true);
    inputRef.current.value = "";
  }

  async function handleConfirmar(periodo) {
    setModalAberto(false);
    setLoading(true);
    setResultado(null);

    try {
      const res = await processarUploadMatch(filePendente, setProgresso, periodo);
      setResultado(res);
      onConcluido?.();
    } catch (err) {
      setProgresso("Erro: " + err.message);
    } finally {
      setLoading(false);
      setFilePendente(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 flex-wrap bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFile}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current.click()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-xl transition-all"
        >
          <Upload size={16} />
          {loading ? "Processando Match..." : "Importar Match"}
        </button>

        <StaticDataRefreshLink
          className="flex items-center gap-2 px-4 py-2 bg-white border border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-xl transition-all"
        />

        {progresso ? (
          <span className="text-sm text-gray-500">{progresso}</span>
        ) : null}

        {resultado && !loading ? (
          <div className="flex gap-2 flex-wrap">
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1 text-xs font-semibold">
              <Route size={12} className="inline mr-1" />
              Match: {resultado.total}
            </span>
            <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-3 py-1 text-xs font-semibold">
              Atualizadas: {resultado.atualizadas}
            </span>
            <span className="bg-slate-50 text-slate-700 border border-slate-200 rounded-lg px-3 py-1 text-xs font-semibold">
              Removidas: {resultado.removidas}
            </span>
            <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-1 text-xs font-semibold">
              Fora das regionais: {resultado.ignoradasSemRegional}
            </span>
          </div>
        ) : null}
      </div>

      {modalAberto ? (
        <ModalPeriodo
          onConfirmar={handleConfirmar}
          onCancelar={() => {
            setModalAberto(false);
            setFilePendente(null);
          }}
        />
      ) : null}
    </div>
  );
}
