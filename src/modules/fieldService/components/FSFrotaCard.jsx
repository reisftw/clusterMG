import { useMemo } from "react";
import {
  MapPin,
  User,
  Wrench,
  AlertTriangle,
  Gauge,
  Pencil,
  Trash2,
  Building2,
  Key,
  ChevronRight,
} from "lucide-react";

const CARROCERIA_ICON = {
  HATCH: "🚗",
  SEDAN: "🚙",
  CAMINHONETE: "🛻",
  UTILITARIO: "🚐",
};

const getAlertaKm = (v) => {
  if (!v.km_prox_revisao || !v.km_atual) return null;
  const r = v.km_prox_revisao - v.km_atual;
  if (r <= 0)
    return {
      nivel: "critico",
      texto: "Revisão vencida!",
      cor: "text-red-600 bg-red-50 border-red-200",
    };
  if (r <= 1000)
    return {
      nivel: "urgente",
      texto: `${r} km p/ revisão`,
      cor: "text-orange-600 bg-orange-50 border-orange-200",
    };
  if (r <= 3000)
    return {
      nivel: "atencao",
      texto: `${r} km p/ revisão`,
      cor: "text-yellow-600 bg-yellow-50 border-yellow-200",
    };
  return null;
};

const gerarTextoWhatsApp = (v) =>
  [
    `🚗 *${v.modelo}*`,
    `🔖 Placa: *${v.placa}*`,
    `📍 Regional: ${v.regional}`,
    `🏷️ Tipo: ${v.tipo === "proprio" ? "Próprio" : "Alugado"}`,
    `🪟 Carroceria: ${v.carroceria}`,
    v.ano ? `📅 Ano: ${v.ano}` : null,
    v.cor ? `🎨 Cor: ${v.cor}` : null,
    `📊 KM Atual: ${v.km_atual ? `${v.km_atual.toLocaleString("pt-BR")} km` : "—"}`,
    v.km_prox_revisao
      ? `🔧 Próx. Revisão: ${v.km_prox_revisao.toLocaleString("pt-BR")} km`
      : null,
    `👤 Responsável: ${v.parado_na_base ? "Parado na base" : (v.responsavel_nome ?? "Sem responsável")}`,
  ]
    .filter(Boolean)
    .join("\n");

const WhatsAppIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const FSFrotaCard = ({
  veiculo,
  manutencoes = [],
  sinistros = [],
  onVerDetalhe,
  onEditar,
  onDeletar,
  podeGerenciar,
}) => {
  const alerta = useMemo(() => getAlertaKm(veiculo), [veiculo]);

  const ultimaManutencao = useMemo(
    () =>
      manutencoes
        .filter((m) => m.veiculo_id === veiculo.id)
        .sort((a, b) => b.data.localeCompare(a.data))[0],
    [manutencoes, veiculo.id],
  );

  const sinistrosAbertos = useMemo(
    () =>
      sinistros.filter(
        (s) => s.veiculo_id === veiculo.id && s.status === "em_analise",
      ).length,
    [sinistros, veiculo.id],
  );

  const handleWhatsApp = (e) => {
    e.stopPropagation();
    navigator.clipboard
      .writeText(gerarTextoWhatsApp(veiculo))
      .then(() => alert("✅ Copiado! Cole no WhatsApp."))
      .catch(() => alert("Erro ao copiar. Tente novamente."));
  };

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden cursor-pointer group ${
        alerta?.nivel === "critico"
          ? "border-red-200"
          : alerta?.nivel === "urgente"
            ? "border-orange-200"
            : "border-gray-100"
      }`}
      onClick={() => onVerDetalhe(veiculo)}
    >
      {/* Banner topo */}
      <div
        className={`px-4 py-2.5 flex items-center justify-between ${
          veiculo.parado_na_base
            ? "bg-gray-100"
            : "bg-gradient-to-r from-blue-600 to-blue-700"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">
            {CARROCERIA_ICON[veiculo.carroceria] ?? "🚗"}
          </span>
          <div>
            <p
              className={`text-xs font-bold ${veiculo.parado_na_base ? "text-gray-600" : "text-white"}`}
            >
              {veiculo.modelo}
            </p>
            <p
              className={`text-[10px] font-mono tracking-widest ${veiculo.parado_na_base ? "text-gray-400" : "text-blue-200"}`}
            >
              {veiculo.placa}
            </p>
          </div>
        </div>
        <span
          className={`flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            veiculo.parado_na_base
              ? "bg-gray-200 text-gray-500"
              : "bg-white/20 text-white/80"
          }`}
        >
          {veiculo.tipo === "proprio" ? (
            <>
              <Building2 size={9} /> Próprio
            </>
          ) : (
            <>
              <Key size={9} /> Alugado
            </>
          )}
        </span>
      </div>

      {/* Corpo */}
      <div className="p-4 space-y-3">
        {/* Alerta KM */}
        {alerta && (
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${alerta.cor}`}
          >
            <AlertTriangle size={12} className="shrink-0" />
            {alerta.texto}
          </div>
        )}

        {/* Responsável */}
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
              veiculo.parado_na_base ? "bg-gray-200" : "bg-blue-100"
            }`}
          >
            {veiculo.parado_na_base ? (
              <Building2 size={13} className="text-gray-500" />
            ) : (
              <User size={13} className="text-blue-600" />
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-800">
              {veiculo.parado_na_base
                ? "Parado na base"
                : (veiculo.responsavel_nome ?? "Sem responsável")}
            </p>
            <p className="text-[10px] text-gray-400">Responsável</p>
          </div>
        </div>

        {/* Regional + KM */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 rounded-xl">
            <MapPin size={12} className="text-gray-400 shrink-0" />
            <div>
              <p className="text-[10px] text-gray-400">Regional</p>
              <p className="text-xs font-bold text-gray-700">
                {veiculo.regional}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 rounded-xl">
            <Gauge size={12} className="text-gray-400 shrink-0" />
            <div>
              <p className="text-[10px] text-gray-400">KM Atual</p>
              <p className="text-xs font-bold text-gray-700">
                {veiculo.km_atual
                  ? `${veiculo.km_atual.toLocaleString("pt-BR")} km`
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Última manutenção */}
        {ultimaManutencao && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl border border-blue-100">
            <Wrench size={12} className="text-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-blue-500">Última manutenção</p>
              <p className="text-xs font-semibold text-blue-700 truncate">
                {ultimaManutencao.tipo} ·{" "}
                {new Date(
                  ultimaManutencao.data + "T00:00:00",
                ).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
        )}

        {/* Sinistros abertos */}
        {sinistrosAbertos > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-xl border border-red-200">
            <AlertTriangle size={12} className="text-red-500 shrink-0" />
            <p className="text-xs font-semibold text-red-600">
              {sinistrosAbertos} sinistro{sinistrosAbertos > 1 ? "s" : ""} em
              análise
            </p>
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 text-[10px] text-gray-400">
          {veiculo.ano && <span>{veiculo.ano}</span>}
          {veiculo.cor && <span>· {veiculo.cor}</span>}
          {veiculo.carroceria && <span>· {veiculo.carroceria}</span>}
        </div>

        <div className="flex items-center gap-1">
          {/* ✅ Botão WhatsApp */}
          <button
            onClick={handleWhatsApp}
            title="Copiar para WhatsApp"
            className="p-1.5 rounded-lg text-gray-400 hover:text-green-500 hover:bg-green-50 transition-colors"
          >
            <WhatsAppIcon />
          </button>

          {podeGerenciar && (
            <>
              <button
                onClick={() => onEditar(veiculo)}
                title="Editar"
                className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => onDeletar(veiculo.id)}
                title="Excluir"
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}

          <ChevronRight
            size={14}
            className="text-gray-300 group-hover:text-blue-400 transition-colors ml-1"
          />
        </div>
      </div>
    </div>
  );
};

export default FSFrotaCard;
