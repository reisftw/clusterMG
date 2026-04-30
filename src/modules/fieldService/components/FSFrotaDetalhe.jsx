import { useState, useMemo } from "react";
import {
  X,
  Wrench,
  AlertTriangle,
  User,
  Gauge,
  Calendar,
  DollarSign,
  MapPin,
  Trash2,
  Pencil,
  Plus,
  Clock,
  History,
  Users,
} from "lucide-react";

const STATUS_SINISTRO_BADGE = {
  em_analise: "bg-yellow-50 text-yellow-700 border-yellow-200",
  aprovado: "bg-blue-50 text-blue-700 border-blue-200",
  resolvido: "bg-green-50 text-green-700 border-green-200",
  negado: "bg-red-50 text-red-600 border-red-200",
};

const TIPO_MANUT_COR = {
  preventiva: "bg-blue-100 text-blue-700",
  corretiva: "bg-red-100 text-red-700",
  revisao: "bg-green-100 text-green-700",
  pneu: "bg-gray-100 text-gray-700",
  funilaria: "bg-orange-100 text-orange-700",
  eletrica: "bg-yellow-100 text-yellow-700",
  outro: "bg-purple-100 text-purple-700",
};

const formatarData = (d) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const formatarValor = (v) =>
  v != null
    ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : "—";

const FSFrotaDetalhe = ({
  veiculo,
  colaboradores,
  manutencoes,
  sinistros,
  onClose,
  onNovaManutencao,
  onEditarManutencao,
  onDeletarManutencao,
  onNovoSinistro,
  onEditarSinistro,
  onDeletarSinistro,
  onAtualizarResponsavel,
  podeGerenciar,
}) => {
  const [aba, setAba] = useState("manutencao");
  const [showRespForm, setShowRespForm] = useState(false);
  const [novoRespId, setNovoRespId] = useState(veiculo.responsavel_id ?? "");
  const [salvandoResp, setSalvandoResp] = useState(false);
  const [showDelMResp, setShowDelMResp] = useState(null);

  const veicManutencoes = useMemo(
    () =>
      manutencoes
        .filter((m) => m.veiculo_id === veiculo.id)
        .sort((a, b) => b.data.localeCompare(a.data)),
    [manutencoes, veiculo.id],
  );

  const veicSinistros = useMemo(
    () =>
      sinistros
        .filter((s) => s.veiculo_id === veiculo.id)
        .sort((a, b) => b.data.localeCompare(a.data)),
    [sinistros, veiculo.id],
  );

  const totalGastoManutencao = useMemo(
    () => veicManutencoes.reduce((acc, m) => acc + (m.valor || 0), 0),
    [veicManutencoes],
  );

  const colabMap = {};
  colaboradores.forEach((c) => {
    colabMap[c.id] = c;
  });

  const handleSalvarResponsavel = async () => {
    setSalvandoResp(true);
    const colab = colabMap[novoRespId];
    await onAtualizarResponsavel(
      veiculo.id,
      novoRespId || null,
      colab?.nome || null,
    );
    setSalvandoResp(false);
    setShowRespForm(false);
  };

  // Próxima revisão KM
  const kmRestante =
    veiculo.km_prox_revisao && veiculo.km_atual
      ? veiculo.km_prox_revisao - veiculo.km_atual
      : null;

  const ABAS = [
    { key: "manutencao", label: `Manutenções (${veicManutencoes.length})` },
    { key: "sinistro", label: `Sinistros (${veicSinistros.length})` },
    { key: "agenda", label: "Agenda KM" },
    { key: "historico", label: "Histórico Resp." },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-gray-900">
                {veiculo.modelo}
              </p>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg tracking-widest">
                  {veiculo.placa}
                </span>
                <span className="text-xs text-gray-400">
                  {veiculo.carroceria}
                </span>
                {veiculo.ano && (
                  <span className="text-xs text-gray-400">· {veiculo.ano}</span>
                )}
                {veiculo.cor && (
                  <span className="text-xs text-gray-400">· {veiculo.cor}</span>
                )}
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-lg border ${veiculo.tipo === "proprio" ? "bg-green-50 text-green-700 border-green-200" : "bg-purple-50 text-purple-700 border-purple-200"}`}
                >
                  {veiculo.tipo === "proprio" ? "Próprio" : "Alugado"}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          {/* Cards resumo */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-center">
              <p className="text-[10px] text-blue-500 font-semibold">
                KM Atual
              </p>
              <p className="text-sm font-bold text-blue-700">
                {veiculo.km_atual
                  ? `${veiculo.km_atual.toLocaleString("pt-BR")}`
                  : "—"}
              </p>
            </div>
            <div className="px-3 py-2 bg-green-50 border border-green-100 rounded-xl text-center">
              <p className="text-[10px] text-green-500 font-semibold">
                Gasto Manutenção
              </p>
              <p className="text-sm font-bold text-green-700">
                {formatarValor(totalGastoManutencao)}
              </p>
            </div>
            <div
              className={`px-3 py-2 border rounded-xl text-center ${
                kmRestante == null
                  ? "bg-gray-50 border-gray-100"
                  : kmRestante <= 0
                    ? "bg-red-50 border-red-200"
                    : kmRestante <= 1000
                      ? "bg-orange-50 border-orange-200"
                      : "bg-yellow-50 border-yellow-100"
              }`}
            >
              <p className="text-[10px] font-semibold text-gray-500">
                Próx. Revisão
              </p>
              <p
                className={`text-sm font-bold ${
                  kmRestante == null
                    ? "text-gray-400"
                    : kmRestante <= 0
                      ? "text-red-600"
                      : kmRestante <= 1000
                        ? "text-orange-600"
                        : "text-yellow-700"
                }`}
              >
                {kmRestante == null
                  ? "—"
                  : kmRestante <= 0
                    ? "VENCIDA"
                    : `${kmRestante.toLocaleString("pt-BR")} km`}
              </p>
            </div>
          </div>

          {/* Responsável */}
          <div className="flex items-center justify-between mt-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <User size={14} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">
                  {veiculo.parado_na_base
                    ? "Parado na base"
                    : (veiculo.responsavel_nome ?? "Sem responsável")}
                </p>
                <p className="text-[10px] text-gray-400">Responsável atual</p>
              </div>
            </div>
            {podeGerenciar && (
              <button
                onClick={() => setShowRespForm((v) => !v)}
                className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"
              >
                <Pencil size={11} /> Alterar
              </button>
            )}
          </div>

          {/* Form trocar responsável */}
          {showRespForm && (
            <div className="mt-2 flex items-center gap-2">
              <select
                value={novoRespId}
                onChange={(e) => setNovoRespId(e.target.value)}
                className="input-field flex-1 text-sm"
              >
                <option value="">Parado na base</option>
                {colaboradores
                  .filter((c) => c.status === "ativo")
                  .sort((a, b) => a.nome.localeCompare(b.nome))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} — {c.cargo}
                    </option>
                  ))}
              </select>
              <button
                onClick={handleSalvarResponsavel}
                disabled={salvandoResp}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {salvandoResp ? "..." : "Salvar"}
              </button>
              <button
                onClick={() => setShowRespForm(false)}
                className="p-2 rounded-xl text-gray-400 hover:bg-gray-100"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Abas */}
        <div className="flex gap-1 px-6 py-2 border-b border-gray-100 shrink-0 overflow-x-auto">
          {ABAS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                aba === a.key
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {/* Aba: Manutenções */}
          {aba === "manutencao" && (
            <>
              {podeGerenciar && (
                <button
                  onClick={() => onNovaManutencao(veiculo.id)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus size={14} /> Registrar Manutenção
                </button>
              )}
              {veicManutencoes.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">
                  Nenhuma manutenção registrada.
                </p>
              ) : (
                veicManutencoes.map((m) => (
                  <div
                    key={m.id}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-lg capitalize ${TIPO_MANUT_COR[m.tipo] ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {m.tipo}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Calendar size={11} /> {formatarData(m.data)}
                        </span>
                        {m.km && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Gauge size={11} /> {m.km.toLocaleString("pt-BR")}{" "}
                            km
                          </span>
                        )}
                        {m.valor && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-green-700">
                            <DollarSign size={11} /> {formatarValor(m.valor)}
                          </span>
                        )}
                      </div>
                      {podeGerenciar && (
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => onEditarManutencao(m)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => onDeletarManutencao(m.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-600">{m.descricao}</p>
                    {m.oficina && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        🔧 {m.oficina}
                      </p>
                    )}
                    {m.proxima_km && (
                      <p className="text-[10px] text-blue-500 mt-1 font-semibold">
                        Próxima: {m.proxima_km.toLocaleString("pt-BR")} km
                      </p>
                    )}
                  </div>
                ))
              )}
            </>
          )}

          {/* Aba: Sinistros */}
          {aba === "sinistro" && (
            <>
              {podeGerenciar && (
                <button
                  onClick={() => onNovoSinistro(veiculo.id)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  <Plus size={14} /> Registrar Sinistro
                </button>
              )}
              {veicSinistros.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">
                  Nenhum sinistro registrado.
                </p>
              ) : (
                veicSinistros.map((s) => (
                  <div
                    key={s.id}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gray-700 capitalize">
                          {s.tipo}
                        </span>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-lg border capitalize ${STATUS_SINISTRO_BADGE[s.status]}`}
                        >
                          {s.status?.replace("_", " ")}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Calendar size={11} /> {formatarData(s.data)}
                        </span>
                        {s.valor && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
                            <DollarSign size={11} /> {formatarValor(s.valor)}
                          </span>
                        )}
                      </div>
                      {podeGerenciar && (
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => onEditarSinistro(s)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => onDeletarSinistro(s.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-600">{s.descricao}</p>
                    {s.bo && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        BO: {s.bo}
                      </p>
                    )}
                  </div>
                ))
              )}
            </>
          )}

          {/* Aba: Agenda KM */}
          {aba === "agenda" && (
            <div className="space-y-3">
              <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
                <p className="text-xs font-semibold text-blue-600 mb-1">
                  KM Atual
                </p>
                <p className="text-2xl font-bold text-blue-800">
                  {veiculo.km_atual
                    ? `${veiculo.km_atual.toLocaleString("pt-BR")} km`
                    : "—"}
                </p>
              </div>

              {veiculo.km_prox_revisao && (
                <div
                  className={`px-4 py-3 rounded-xl border ${
                    kmRestante <= 0
                      ? "bg-red-50 border-red-200"
                      : kmRestante <= 1000
                        ? "bg-orange-50 border-orange-200"
                        : kmRestante <= 3000
                          ? "bg-yellow-50 border-yellow-200"
                          : "bg-green-50 border-green-200"
                  }`}
                >
                  <p className="text-xs font-semibold text-gray-600 mb-1">
                    Próxima Revisão
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      kmRestante <= 0
                        ? "text-red-600"
                        : kmRestante <= 1000
                          ? "text-orange-600"
                          : kmRestante <= 3000
                            ? "text-yellow-700"
                            : "text-green-700"
                    }`}
                  >
                    {veiculo.km_prox_revisao.toLocaleString("pt-BR")} km
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {kmRestante <= 0
                      ? "⚠️ Revisão vencida! Agende imediatamente."
                      : `Faltam ${kmRestante.toLocaleString("pt-BR")} km`}
                  </p>
                  {/* Barra de progresso */}
                  {veiculo.km_atual > 0 && (
                    <div className="mt-3">
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            kmRestante <= 0
                              ? "bg-red-500"
                              : kmRestante <= 1000
                                ? "bg-orange-500"
                                : kmRestante <= 3000
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                          }`}
                          style={{
                            width: `${Math.min(100, (veiculo.km_atual / veiculo.km_prox_revisao) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1 text-right">
                        {Math.min(
                          100,
                          Math.round(
                            (veiculo.km_atual / veiculo.km_prox_revisao) * 100,
                          ),
                        )}
                        % concluído
                      </p>
                    </div>
                  )}
                </div>
              )}

              {veiculo.revisao_periodica && (
                <div className="px-4 py-3 bg-purple-50 border border-purple-100 rounded-xl">
                  <p className="text-xs font-semibold text-purple-600 mb-1 flex items-center gap-1">
                    <Clock size={11} /> Revisão Periódica
                  </p>
                  <p className="text-sm font-bold text-purple-800">
                    A cada{" "}
                    {Number(veiculo.intervalo_km).toLocaleString("pt-BR")} km
                  </p>
                  {veiculo.km_prox_revisao && (
                    <p className="text-xs text-purple-500 mt-1">
                      Após a revisão:{" "}
                      {(
                        veiculo.km_prox_revisao + Number(veiculo.intervalo_km)
                      ).toLocaleString("pt-BR")}{" "}
                      km
                    </p>
                  )}
                </div>
              )}

              {/* Histórico de manutenções por km */}
              {veicManutencoes.filter((m) => m.km).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Histórico por KM
                  </p>
                  <div className="space-y-2">
                    {veicManutencoes
                      .filter((m) => m.km)
                      .sort((a, b) => b.km - a.km)
                      .map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 px-4 py-2.5 bg-white border border-gray-100 rounded-xl"
                        >
                          <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                          <span className="text-xs font-bold text-gray-700 w-24 shrink-0">
                            {m.km.toLocaleString("pt-BR")} km
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-lg font-semibold capitalize ${TIPO_MANUT_COR[m.tipo] ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {m.tipo}
                          </span>
                          <span className="text-xs text-gray-400 flex-1 truncate">
                            {m.descricao}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aba: Histórico responsáveis */}
          {aba === "historico" && (
            <div className="space-y-2">
              {!veiculo.historico_responsaveis ||
              veiculo.historico_responsaveis.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">
                  Nenhum histórico de responsáveis.
                </p>
              ) : (
                [...veiculo.historico_responsaveis].reverse().map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-bold">
                        {h.nome?.charAt(0)?.toUpperCase() ?? "?"}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-800">
                        {h.nome}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Desde {formatarData(h.desde)}
                      </p>
                    </div>
                    {i === 0 && (
                      <span className="text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg">
                        Atual
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FSFrotaDetalhe;
