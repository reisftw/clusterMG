import { useState, useMemo } from "react";
import {
  X,
  Clock,
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Calendar,
  History,
  AlertCircle,
} from "lucide-react";

const FSBancoHorasDetalhe = ({
  colaborador,
  lancamentos,
  calcularSaldo,
  minutosParaHoras,
  onClose,
  onNovoLancamento,
  onEditarLancamento,
  onDeletarLancamento,
  podeGerenciar,
}) => {
  const [aba, setAba] = useState("lancamentos");

  const meus = useMemo(
    () =>
      lancamentos
        .filter((l) => l.colaborador_id === colaborador.id)
        .sort((a, b) => b.data.localeCompare(a.data)),
    [lancamentos, colaborador.id],
  );

  const saldoMinutos = calcularSaldo(colaborador.id);
  const saldoTexto = minutosParaHoras(saldoMinutos);
  const positivo = saldoMinutos >= 0;

  const totalCredito = useMemo(
    () =>
      meus
        .filter((l) => l.tipo === "credito")
        .reduce((acc, l) => {
          const [h, m] = (l.horas || "0:0").split(":").map(Number);
          return acc + h * 60 + m;
        }, 0),
    [meus],
  );

  const totalDebito = useMemo(
    () =>
      meus
        .filter((l) => l.tipo === "debito")
        .reduce((acc, l) => {
          const [h, m] = (l.horas || "0:0").split(":").map(Number);
          return acc + h * 60 + m;
        }, 0),
    [meus],
  );

  const formatMin = (min) => {
    const h = Math.floor(min / 60)
      .toString()
      .padStart(2, "0");
    const m = (min % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  const formatarData = (d) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  // Histórico de edições de todos os lançamentos desse colaborador
  const todasEdicoes = useMemo(
    () =>
      meus
        .flatMap((l) =>
          (l.historico_edicoes ?? []).map((e) => ({
            ...e,
            lancamento_id: l.id,
            lancamento_desc: l.descricao,
          })),
        )
        .sort((a, b) => b.editado_em.localeCompare(a.editado_em)),
    [meus],
  );

  const ABAS = [
    { key: "lancamentos", label: `Lançamentos (${meus.length})` },
    { key: "cobrancas", label: "Cobranças" },
    { key: "historico", label: `Edições (${todasEdicoes.length})` },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${positivo ? "bg-green-600" : "bg-red-500"}`}
              >
                <span className="text-white font-bold text-lg">
                  {colaborador.nome?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-bold text-gray-900 text-lg">
                  {colaborador.nome}
                </p>
                <p className="text-xs text-gray-400">
                  {colaborador.cargo} · {colaborador.regional}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          {/* Cards saldo */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2 text-center">
              <p className="text-[10px] font-semibold text-green-500 uppercase">
                Total Crédito
              </p>
              <p className="text-sm font-bold text-green-700 font-mono">
                {formatMin(totalCredito)}h
              </p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-center">
              <p className="text-[10px] font-semibold text-red-500 uppercase">
                Total Débito
              </p>
              <p className="text-sm font-bold text-red-600 font-mono">
                {formatMin(totalDebito)}h
              </p>
            </div>
            <div
              className={`border rounded-xl px-3 py-2 text-center ${positivo ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}
            >
              <p className="text-[10px] font-semibold text-gray-500 uppercase">
                Saldo
              </p>
              <p
                className={`text-sm font-bold font-mono ${positivo ? "text-green-700" : "text-red-600"}`}
              >
                {saldoTexto}h
              </p>
            </div>
          </div>
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
          {/* ── Aba: Lançamentos ── */}
          {aba === "lancamentos" && (
            <>
              {podeGerenciar && (
                <button
                  onClick={() => onNovoLancamento(colaborador)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus size={14} /> Novo Lançamento
                </button>
              )}

              {meus.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">
                  Nenhum lançamento registrado.
                </p>
              ) : (
                meus.map((l) => (
                  <div
                    key={l.id}
                    className={`rounded-xl border p-4 ${
                      l.tipo === "credito"
                        ? "bg-green-50 border-green-100"
                        : "bg-red-50 border-red-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                            l.tipo === "credito"
                              ? "bg-green-600 text-white"
                              : "bg-red-600 text-white"
                          }`}
                        >
                          {l.tipo === "credito" ? "➕ Crédito" : "➖ Débito"}
                        </span>
                        <span className="font-mono text-sm font-bold text-gray-800">
                          {l.horas}h
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Calendar size={11} /> {formatarData(l.data)}
                        </span>
                      </div>
                      {podeGerenciar && (
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => onEditarLancamento(l)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => onDeletarLancamento(l.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-2">{l.descricao}</p>
                    {l.data_cobranca && (
                      <p className="text-[10px] text-orange-600 mt-1 font-semibold">
                        📅 Cobrança: {formatarData(l.data_cobranca)}
                      </p>
                    )}
                    {l.historico_edicoes?.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        ✏️ {l.historico_edicoes.length} edição(ões)
                      </p>
                    )}
                  </div>
                ))
              )}
            </>
          )}

          {/* ── Aba: Cobranças ── */}
          {aba === "cobrancas" && (
            <>
              {meus.filter((l) => l.data_cobranca).length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">
                  Nenhuma cobrança agendada.
                </p>
              ) : (
                (() => {
                  const hoje = new Date().toISOString().split("T")[0];
                  const comCobranca = meus
                    .filter((l) => l.data_cobranca)
                    .sort((a, b) =>
                      a.data_cobranca.localeCompare(b.data_cobranca),
                    );

                  return comCobranca.map((l) => {
                    const vencida = l.data_cobranca < hoje;
                    return (
                      <div
                        key={l.id}
                        className={`rounded-xl border p-4 ${
                          vencida
                            ? "bg-red-50 border-red-200"
                            : "bg-orange-50 border-orange-100"
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {vencida && (
                            <AlertCircle size={13} className="text-red-500" />
                          )}
                          <Calendar
                            size={13}
                            className={
                              vencida ? "text-red-500" : "text-orange-500"
                            }
                          />
                          <span
                            className={`text-xs font-bold ${vencida ? "text-red-600" : "text-orange-700"}`}
                          >
                            {formatarData(l.data_cobranca)}
                            {vencida ? " — VENCIDA" : ""}
                          </span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                              l.tipo === "credito"
                                ? "bg-green-600 text-white"
                                : "bg-red-600 text-white"
                            }`}
                          >
                            {l.tipo === "credito" ? "➕" : "➖"} {l.horas}h
                          </span>
                        </div>
                        <p className="text-xs text-gray-600">{l.descricao}</p>
                      </div>
                    );
                  });
                })()
              )}
            </>
          )}

          {/* ── Aba: Histórico de edições ── */}
          {aba === "historico" && (
            <>
              {todasEdicoes.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">
                  Nenhuma edição registrada.
                </p>
              ) : (
                todasEdicoes.map((e, i) => (
                  <div
                    key={i}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-4"
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <History size={12} className="text-gray-400" />
                      <span className="text-xs font-semibold text-gray-700">
                        {new Date(e.editado_em).toLocaleString("pt-BR")}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        por {e.editado_por}
                      </span>
                    </div>
                    {e.motivo && (
                      <p className="text-xs text-blue-600 mb-2 font-semibold">
                        "{e.motivo}"
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400 mb-1">
                      Lançamento: {e.lancamento_desc}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(e.dados_antes ?? {}).map(
                        ([k, v]) =>
                          v != null && (
                            <div
                              key={k}
                              className="bg-white border border-gray-100 rounded-lg px-2 py-1"
                            >
                              <p className="text-[9px] text-gray-400 uppercase">
                                {k.replace("_", " ")}
                              </p>
                              <p className="text-xs font-semibold text-gray-600">
                                {String(v)}
                              </p>
                            </div>
                          ),
                      )}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FSBancoHorasDetalhe;
