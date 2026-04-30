import { useState, useMemo } from "react";
import {
  Monitor,
  Plus,
  Pencil,
  Trash2,
  ArrowRightLeft,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { useFSColaboradores } from "../hooks/useFSColaboradores";

// ─── Status config ─────────────────────────────────────────
const STATUS = {
  disponivel: { label: "Disponível", cor: "green", icon: CheckCircle },
  em_uso: { label: "Em Uso", cor: "blue", icon: Clock },
  manutencao: { label: "Manutenção", cor: "yellow", icon: AlertTriangle },
  perdido: { label: "Perdido", cor: "red", icon: XCircle },
};

const TIPOS_EQUIPAMENTO = [
  "Celular",
  "Notebook",
  "Tablet",
  "Telefone",
  "Monitor",
  "Teclado",
  "Mouse",
  "Fone de Ouvido",
  "Webcam",
  "Impressora",
  "Carregador",
  "Cabo",
];

// ─── Badge Status ──────────────────────────────────────────
const BadgeStatus = ({ status }) => {
  const s = STATUS[status] || STATUS.disponivel;
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-${s.cor}-50 text-${s.cor}-600 border border-${s.cor}-200`}
    >
      <Icon size={9} /> {s.label}
    </span>
  );
};

// ─── Modal Form ────────────────────────────────────────────
const FSEquipamentoForm = ({ inicial, regionais, onSalvar, onFechar }) => {
  const [form, setForm] = useState({
    nome: "",
    tipo: "",
    marca: "",
    modelo: "",
    patrimonio: "",
    numeroSerie: "",
    regional: "",
    status: "disponivel",
    observacao: "",
    ...inicial,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const ok = form.nome.trim() && form.patrimonio.trim() && form.regional;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center">
              <Monitor size={16} className="text-purple-600" />
            </div>
            <h3 className="font-bold text-gray-900">
              {inicial ? "Editar Equipamento" : "Novo Equipamento"}
            </h3>
          </div>
          <button
            onClick={onFechar}
            className="text-gray-400 hover:text-gray-600"
          >
            <XCircle size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Nome */}
            <div className="col-span-2">
              <label className="label-field">Nome do Equipamento *</label>
              <input
                value={form.nome}
                onChange={(e) => set("nome", e.target.value)}
                placeholder="Ex: Celular Samsung S24"
                className="input-field w-full"
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="label-field">Tipo *</label>
              <select
                value={form.tipo}
                onChange={(e) => set("tipo", e.target.value)}
                className="input-field w-full"
              >
                <option value="">Selecione...</option>
                {TIPOS_EQUIPAMENTO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Marca */}
            <div>
              <label className="label-field">Marca</label>
              <input
                value={form.marca}
                onChange={(e) => set("marca", e.target.value)}
                placeholder="Ex: Samsung, Apple..."
                className="input-field w-full"
              />
            </div>

            {/* Modelo */}
            <div>
              <label className="label-field">Modelo</label>
              <input
                value={form.modelo}
                onChange={(e) => set("modelo", e.target.value)}
                placeholder="Ex: S24 Ultra"
                className="input-field w-full"
              />
            </div>

            {/* Patrimônio */}
            <div>
              <label className="label-field font-bold text-red-600">
                Nº Patrimônio * (Obrigatório)
              </label>
              <input
                value={form.patrimonio}
                onChange={(e) => set("patrimonio", e.target.value)}
                placeholder="Ex: PAT-2026-001"
                className="input-field w-full font-mono bg-yellow-50 border-yellow-300"
              />
            </div>

            {/* Série */}
            <div>
              <label className="label-field">Nº de Série</label>
              <input
                value={form.numeroSerie}
                onChange={(e) => set("numeroSerie", e.target.value)}
                placeholder="Opcional"
                className="input-field w-full font-mono"
              />
            </div>

            {/* Regional */}
            <div>
              <label className="label-field">Regional *</label>
              <select
                value={form.regional}
                onChange={(e) => set("regional", e.target.value)}
                className="input-field w-full"
              >
                <option value="">Selecione...</option>
                {regionais.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="col-span-2">
              <label className="label-field">Status</label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(STATUS).map(([val, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => set("status", val)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                        form.status === val
                          ? `bg-${cfg.cor}-600 text-white border-${cfg.cor}-600`
                          : `bg-${cfg.cor}-50 text-${cfg.cor}-600 border-${cfg.cor}-200`
                      }`}
                    >
                      <Icon size={12} /> {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Observação */}
            <div className="col-span-2">
              <label className="label-field">Observação</label>
              <textarea
                value={form.observacao}
                onChange={(e) => set("observacao", e.target.value)}
                rows={2}
                placeholder="Condições, danos, notas especiais..."
                className="input-field w-full resize-none"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onFechar}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => ok && onSalvar(form)}
            disabled={!ok}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 transition-colors"
          >
            {inicial ? "Salvar Alterações" : "Cadastrar"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Modal Entrega/Devolução ───────────────────────────────
const FSEntregaEquipForm = ({ equipamento, onSalvar, onFechar }) => {
  const { colaboradores = [] } = useFSColaboradores() || {};
  const [colaboradorId, setColaboradorId] = useState(
    equipamento.colaboradorId || "",
  );
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [obs, setObs] = useState("");
  const isDevolucao = equipamento.status === "em_uso";

  const colabAtivos = useMemo(
    () =>
      colaboradores
        .filter((c) => c.status === "ativo" || c.status === "Ativo")
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [colaboradores],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDevolucao ? "bg-green-50" : "bg-blue-50"}`}
            >
              <ArrowRightLeft
                size={16}
                className={isDevolucao ? "text-green-600" : "text-blue-600"}
              />
            </div>
            <h3 className="font-bold text-gray-900">
              {isDevolucao ? "Registrar Devolução" : "Registrar Entrega"}
            </h3>
          </div>
          <button
            onClick={onFechar}
            className="text-gray-400 hover:text-gray-600"
          >
            <XCircle size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500">Equipamento</p>
            <p className="text-sm font-bold text-gray-900">
              {equipamento.nome}
            </p>
            <p className="text-xs font-mono text-purple-600 font-bold">
              PAT: {equipamento.patrimonio}
            </p>
            {equipamento.marca && (
              <p className="text-xs text-gray-400">
                {equipamento.marca}{" "}
                {equipamento.modelo && `- ${equipamento.modelo}`}
              </p>
            )}
          </div>

          {!isDevolucao && (
            <div>
              <label className="label-field">Colaborador *</label>
              <select
                value={colaboradorId}
                onChange={(e) => setColaboradorId(e.target.value)}
                className="input-field w-full"
              >
                <option value="">Selecione...</option>
                {colabAtivos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isDevolucao && (
            <div className="px-3 py-2 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-xs text-blue-500">Em posse de</p>
              <p className="text-sm font-bold text-blue-800">
                {equipamento.colaboradorNome || "—"}
              </p>
            </div>
          )}

          <div>
            <label className="label-field">Data</label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="label-field">Observação</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              className="input-field w-full resize-none"
              placeholder="Condição, danos, observações..."
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onFechar}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSalvar({ colaboradorId, data, observacao: obs })}
            disabled={!isDevolucao && !colaboradorId}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-colors ${
              isDevolucao
                ? "bg-green-600 hover:bg-green-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isDevolucao ? "Confirmar Devolução" : "Confirmar Entrega"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Tab Principal ─────────────────────────────────────────
const FSEquipamentosTab = ({
  equipamentos,
  busca,
  regionais,
  podeGerenciar,
  onCreate,
  onUpdate,
  onDelete,
  onEntrega,
  onDevolucao,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [movendo, setMovendo] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  const tipos = useMemo(
    () => [...new Set(equipamentos.map((e) => e.tipo).filter(Boolean))].sort(),
    [equipamentos],
  );

  const lista = useMemo(
    () =>
      equipamentos
        .filter(
          (e) =>
            (!busca ||
              e.nome?.toLowerCase().includes(busca.toLowerCase()) ||
              e.patrimonio?.toLowerCase().includes(busca.toLowerCase()) ||
              e.marca?.toLowerCase().includes(busca.toLowerCase()) ||
              e.numeroSerie?.toLowerCase().includes(busca.toLowerCase())) &&
            (filtroStatus === "todos" || e.status === filtroStatus) &&
            (filtroTipo === "todos" || e.tipo === filtroTipo),
        )
        .sort((a, b) => a.nome?.localeCompare(b.nome)),
    [equipamentos, busca, filtroStatus, filtroTipo],
  );

  const handleSalvar = async (dados) => {
    if (editando) {
      await onUpdate(editando.id, dados);
    } else {
      await onCreate(dados);
    }
    setShowForm(false);
    setEditando(null);
  };

  const handleMovimentacao = async ({ colaboradorId, data, observacao }) => {
    if (!movendo) return;
    const isDevolucao = movendo.status === "em_uso";

    if (isDevolucao) {
      const entregaAtiva = movendo.entregaId;
      await onDevolucao(entregaAtiva, movendo.id, "equipamento");
    } else {
      const colab = { id: colaboradorId };
      await onEntrega({
        itemId: movendo.id,
        itemTipo: "equipamento",
        colaboradorId,
        colaboradorNome: colab.nome || colaboradorId,
        regionalId: movendo.regionalId,
        regional: movendo.regional,
        data,
        observacao,
      });
    }
    setMovendo(null);
  };

  return (
    <div className="space-y-4">
      {/* Filtros + Botão */}
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex gap-2 flex-wrap">
          {/* Status */}
          <div className="flex gap-1">
            {[
              { v: "todos", l: "Todos" },
              { v: "disponivel", l: "🟢 Disp." },
              { v: "em_uso", l: "🔵 Em Uso" },
              { v: "manutencao", l: "🟡 Manut." },
              { v: "perdido", l: "🔴 Perdido" },
            ].map((f) => (
              <button
                key={f.v}
                onClick={() => setFiltroStatus(f.v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filtroStatus === f.v
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                }`}
              >
                {f.l}
              </button>
            ))}
          </div>

          {/* Tipo */}
          {tipos.length > 0 && (
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="input-field text-xs"
            >
              <option value="todos">Todos tipos</option>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>

        {podeGerenciar && (
          <button
            onClick={() => {
              setEditando(null);
              setShowForm(true);
            }}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus size={15} /> Novo Equipamento
          </button>
        )}
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-14 text-center">
          <Monitor size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-400">
            Nenhum equipamento encontrado.
          </p>
          {podeGerenciar && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 btn-primary text-sm"
            >
              Cadastrar primeiro equipamento
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {lista.map((e) => (
            <div
              key={e.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                    <Monitor size={16} className="text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {e.nome}
                    </p>
                    <p className="text-xs text-gray-400">{e.tipo || "—"}</p>
                  </div>
                </div>
                <BadgeStatus status={e.status} />
              </div>

              <div className="space-y-1.5 mb-3 text-xs">
                {/* Patrimônio em destaque */}
                <div className="px-2 py-1 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="font-mono font-bold text-yellow-700">
                    PAT: {e.patrimonio}
                  </p>
                </div>

                {e.marca && (
                  <p className="text-gray-600">
                    <span className="font-medium">Marca:</span> {e.marca}
                    {e.modelo && ` - ${e.modelo}`}
                  </p>
                )}

                {e.numeroSerie && (
                  <p className="text-gray-500 font-mono">
                    <span className="font-medium font-sans">Série:</span>{" "}
                    {e.numeroSerie}
                  </p>
                )}

                <p className="text-gray-500">
                  <span className="font-medium">Regional:</span>{" "}
                  {e.regional || "—"}
                </p>

                {e.colaboradorNome && (
                  <p className="text-blue-600 font-semibold">
                    👤 {e.colaboradorNome}
                  </p>
                )}

                {e.observacao && (
                  <p className="text-gray-400 italic border-l-2 border-yellow-300 pl-2">
                    {e.observacao}
                  </p>
                )}
              </div>

              {podeGerenciar && (
                <div className="flex gap-2 pt-3 border-t border-gray-50">
                  {/* Entrega/Devolução */}
                  <button
                    onClick={() => setMovendo(e)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      e.status === "em_uso"
                        ? "bg-green-50 text-green-600 hover:bg-green-100"
                        : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                    }`}
                  >
                    <ArrowRightLeft size={12} />
                    {e.status === "em_uso" ? "Devolver" : "Entregar"}
                  </button>

                  {/* Editar */}
                  <button
                    onClick={() => {
                      setEditando(e);
                      setShowForm(true);
                    }}
                    className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  >
                    <Pencil size={14} />
                  </button>

                  {/* Deletar */}
                  <button
                    onClick={() => setDelConfirm(e.id)}
                    className="p-1.5 rounded-xl text-red-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Form */}
      {showForm && (
        <FSEquipamentoForm
          inicial={editando}
          regionais={regionais}
          onSalvar={handleSalvar}
          onFechar={() => {
            setShowForm(false);
            setEditando(null);
          }}
        />
      )}

      {/* Modal Movimentação */}
      {movendo && (
        <FSEntregaEquipForm
          equipamento={movendo}
          onSalvar={handleMovimentacao}
          onFechar={() => setMovendo(null)}
        />
      )}

      {/* Modal Confirmar Delete */}
      {delConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 mb-1">
                  Excluir equipamento?
                </p>
                <p className="text-sm text-gray-500 mb-5">
                  Esta ação não pode ser desfeita. O equipamento será removido
                  do sistema.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDelConfirm(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      await onDelete(delConfirm);
                      setDelConfirm(null);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FSEquipamentosTab;
