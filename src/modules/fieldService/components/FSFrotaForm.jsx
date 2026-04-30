import { useState } from "react";
import { X, Car, Pencil } from "lucide-react";

const CARROCERIAS = ["HATCH", "SEDAN", "CAMINHONETE", "UTILITARIO"];

const FSFrotaForm = ({
  onSubmit,
  onClose,
  veiculoParaEditar = null,
  regionais = [],
}) => {
  const modo = !!veiculoParaEditar;

  const [modelo, setModelo] = useState(veiculoParaEditar?.modelo ?? "");
  const [placa, setPlaca] = useState(veiculoParaEditar?.placa ?? "");
  const [carroceria, setCarroceria] = useState(
    veiculoParaEditar?.carroceria ?? "HATCH",
  );
  const [tipo, setTipo] = useState(veiculoParaEditar?.tipo ?? "proprio");
  const [regional, setRegional] = useState(veiculoParaEditar?.regional ?? "");
  const [ano, setAno] = useState(veiculoParaEditar?.ano ?? "");
  const [cor, setCor] = useState(veiculoParaEditar?.cor ?? "");
  const [kmAtual, setKmAtual] = useState(veiculoParaEditar?.km_atual ?? "");
  const [kmProxRev, setKmProxRev] = useState(
    veiculoParaEditar?.km_prox_revisao ?? "",
  );
  const [revPeriodica, setRevPeriodica] = useState(
    veiculoParaEditar?.revisao_periodica ?? false,
  );
  const [intervaloKm, setIntervaloKm] = useState(
    veiculoParaEditar?.intervalo_km ?? 10000,
  );
  const [erro, setErro] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    setErro("");
    if (!modelo.trim()) return setErro("Informe o modelo.");
    if (!placa.trim()) return setErro("Informe a placa.");
    if (!regional.trim()) return setErro("Informe a regional.");
    setIsSaving(true);
    try {
      await onSubmit({
        modelo: modelo.trim().toUpperCase(),
        placa: placa.trim().toUpperCase(),
        carroceria,
        tipo,
        regional,
        ano: ano ? Number(ano) : null,
        cor: cor.trim(),
        km_atual: kmAtual ? Number(kmAtual) : 0,
        km_prox_revisao: kmProxRev ? Number(kmProxRev) : null,
        revisao_periodica: revPeriodica,
        intervalo_km: revPeriodica ? Number(intervaloKm) : null,
      });
      onClose();
    } catch {
      setErro("Erro ao salvar veículo.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-lg max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${modo ? "bg-orange-50" : "bg-blue-50"}`}
            >
              {modo ? (
                <Pencil size={16} className="text-orange-500" />
              ) : (
                <Car size={16} className="text-blue-600" />
              )}
            </div>
            <p className="font-bold text-gray-900">
              {modo ? "Editar Veículo" : "Novo Veículo"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* ── Identificação ── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Identificação
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-400 mb-1 block">
                  Modelo *
                </label>
                <input
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="Ex: FIAT STRADA"
                  className="input-field w-full"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Placa *
                </label>
                <input
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                  placeholder="ABC1D23"
                  maxLength={8}
                  className="input-field w-full font-mono tracking-widest"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Ano</label>
                <input
                  type="number"
                  value={ano}
                  onChange={(e) => setAno(e.target.value)}
                  placeholder="2024"
                  min={1990}
                  max={2030}
                  className="input-field w-full"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Cor</label>
                <input
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  placeholder="Branco"
                  className="input-field w-full"
                />
              </div>

              {/* ✅ DROPDOWN REGIONAL */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Regional *
                </label>
                {regionais.length > 0 ? (
                  <select
                    value={regional}
                    onChange={(e) => setRegional(e.target.value)}
                    className="input-field w-full"
                  >
                    <option value="">Selecione a regional...</option>
                    {regionais.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={regional}
                    onChange={(e) => setRegional(e.target.value)}
                    placeholder="Ex: BH"
                    className="input-field w-full"
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── Carroceria ── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Carroceria
            </p>
            <div className="grid grid-cols-4 gap-2">
              {CARROCERIAS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCarroceria(c)}
                  className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                    carroceria === c
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* ── Propriedade ── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Propriedade
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "proprio", label: "🏢 Próprio" },
                { value: "alugado", label: "🔑 Alugado" },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTipo(t.value)}
                  className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                    tipo === t.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Quilometragem ── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Quilometragem
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  KM Atual
                </label>
                <input
                  type="number"
                  value={kmAtual}
                  onChange={(e) => setKmAtual(e.target.value)}
                  placeholder="0"
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  KM Próxima Revisão
                </label>
                <input
                  type="number"
                  value={kmProxRev}
                  onChange={(e) => setKmProxRev(e.target.value)}
                  placeholder="Ex: 50000"
                  className="input-field w-full"
                />
              </div>
            </div>

            {/* Toggle revisão periódica */}
            <div
              className={`mt-3 p-4 rounded-xl border transition-all ${
                revPeriodica
                  ? "border-blue-200 bg-blue-50"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-semibold text-gray-700">
                    Revisão Periódica por KM
                  </p>
                  <p className="text-[10px] text-gray-400">
                    Alerta automático a cada X km
                  </p>
                </div>
                <button
                  onClick={() => setRevPeriodica((v) => !v)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    revPeriodica ? "bg-blue-600" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                      revPeriodica ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
              {revPeriodica && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={intervaloKm}
                    onChange={(e) => setIntervaloKm(e.target.value)}
                    min={1000}
                    step={1000}
                    className="input-field w-28 text-center"
                  />
                  <span className="text-xs text-gray-500">
                    km entre revisões
                  </span>
                </div>
              )}
            </div>
          </div>

          {erro && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
              {erro}
            </p>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors ${
              modo
                ? "bg-orange-500 hover:bg-orange-600"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isSaving
              ? "Salvando..."
              : modo
                ? "Salvar Edição"
                : "Adicionar Veículo"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FSFrotaForm;
