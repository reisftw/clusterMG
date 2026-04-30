import { useState, useMemo } from "react";
import {
  ShoppingCart,
  Plus,
  Pencil,
  Trash2,
  Check,
  Clock,
  AlertTriangle,
  XCircle,
  Eye,
  FileText,
  TrendingUp,
} from "lucide-react";

// ─── Status config ─────────────────────────────────────────
const STATUS = {
  pendente: { label: "Pendente", cor: "yellow", icon: Clock },
  aprovado: { label: "Aprovado", cor: "blue", icon: Check },
  recebido: { label: "Recebido", cor: "green", icon: Check },
  cancelado: { label: "Cancelado", cor: "red", icon: XCircle },
  atrasado: { label: "Atrasado", cor: "red", icon: AlertTriangle },
};

const TIPOS_ITEM = [
  "Ferramenta",
  "Equipamento",
  "EPI",
  "Consumível",
  "Manutenção",
];

// ─── Badge Status ──────────────────────────────────────────
const BadgeStatus = ({ status }) => {
  const s = STATUS[status] || STATUS.pendente;
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
const FSPedidoForm = ({ inicial, regionais, onSalvar, onFechar }) => {
  const [form, setForm] = useState({
    descricao: "",
    tipo: "",
    quantidade: "",
    valorUnitario: "",
    valorTotal: "",
    fornecedor: "",
    dataEntregaPrevista: "",
    status: "pendente",
    observacao: "",
    regional: "",
    responsavel: "",
    ...inicial,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Auto-calcular total
  const calcularTotal = () => {
    const qtd = parseFloat(form.quantidade) || 0;
    const valor = parseFloat(form.valorUnitario) || 0;
    return (qtd * valor).toFixed(2);
  };

  const handleQtdChange = (v) => {
    set("quantidade", v);
    set("valorTotal", calcularTotal());
  };

  const handleValorChange = (v) => {
    set("valorUnitario", v);
    set("valorTotal", calcularTotal());
  };

  const ok =
    form.descricao.trim() &&
    form.quantidade &&
    form.valorUnitario &&
    form.regional;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center">
              <ShoppingCart size={16} className="text-orange-600" />
            </div>
            <h3 className="font-bold text-gray-900">
              {inicial ? "Editar Pedido" : "Novo Pedido"}
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
            {/* Descrição */}
            <div className="col-span-2">
              <label className="label-field">Descrição do Item *</label>
              <input
                value={form.descricao}
                onChange={(e) => set("descricao", e.target.value)}
                placeholder="Ex: Furadeira DeWalt 12V"
                className="input-field w-full"
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="label-field">Tipo</label>
              <select
                value={form.tipo}
                onChange={(e) => set("tipo", e.target.value)}
                className="input-field w-full"
              >
                <option value="">Selecione...</option>
                {TIPOS_ITEM.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
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

            {/* Quantidade */}
            <div>
              <label className="label-field">Quantidade *</label>
              <input
                type="number"
                min="1"
                step="1"
                value={form.quantidade}
                onChange={(e) => handleQtdChange(e.target.value)}
                placeholder="0"
                className="input-field w-full"
              />
            </div>

            {/* Valor Unitário */}
            <div>
              <label className="label-field">Valor Unitário (R$) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.valorUnitario}
                onChange={(e) => handleValorChange(e.target.value)}
                placeholder="0,00"
                className="input-field w-full"
              />
            </div>

            {/* Valor Total */}
            <div>
              <label className="label-field">Valor Total (R$)</label>
              <input
                type="text"
                value={`R$ ${parseFloat(form.valorTotal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                disabled
                className="input-field w-full bg-gray-50 text-gray-600 cursor-not-allowed font-semibold"
              />
            </div>

            {/* Fornecedor */}
            <div>
              <label className="label-field">Fornecedor</label>
              <input
                value={form.fornecedor}
                onChange={(e) => set("fornecedor", e.target.value)}
                placeholder="Ex: Leroy Merlin, Amazon..."
                className="input-field w-full"
              />
            </div>

            {/* Data Prevista */}
            <div>
              <label className="label-field">Data Entrega Prevista</label>
              <input
                type="date"
                value={form.dataEntregaPrevista}
                onChange={(e) => set("dataEntregaPrevista", e.target.value)}
                className="input-field w-full"
              />
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

            {/* Responsável */}
            <div className="col-span-2">
              <label className="label-field">Responsável</label>
              <input
                value={form.responsavel}
                onChange={(e) => set("responsavel", e.target.value)}
                placeholder="Nome da pessoa responsável"
                className="input-field w-full"
              />
            </div>

            {/* Observação */}
            <div className="col-span-2">
              <label className="label-field">Observação</label>
              <textarea
                value={form.observacao}
                onChange={(e) => set("observacao", e.target.value)}
                rows={2}
                placeholder="Informações adicionais..."
                className="input-field w-full resize-none"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white">
          <button
            onClick={onFechar}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => ok && onSalvar(form)}
            disabled={!ok}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-40 transition-colors"
          >
            {inicial ? "Salvar Alterações" : "Criar Pedido"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Modal Visualização ───────────────────────────────────
const FSPedidoDetalhes = ({ pedido, onFechar }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center">
              <FileText size={16} className="text-orange-600" />
            </div>
            <h3 className="font-bold text-gray-900">Detalhes do Pedido</h3>
          </div>
          <button
            onClick={onFechar}
            className="text-gray-400 hover:text-gray-600"
          >
            <XCircle size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-gray-900">{pedido.descricao}</h4>
            <BadgeStatus status={pedido.status} />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 font-medium">Tipo</p>
              <p className="font-semibold text-gray-900">
                {pedido.tipo || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Regional</p>
              <p className="font-semibold text-gray-900">{pedido.regional}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Quantidade</p>
              <p className="font-semibold text-gray-900">
                {pedido.quantidade} un.
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Valor Unit.</p>
              <p className="font-semibold text-gray-900">
                R${" "}
                {parseFloat(pedido.valorUnitario || 0).toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-500 font-medium">Valor Total</p>
              <p className="text-lg font-bold text-orange-600">
                R${" "}
                {parseFloat(pedido.valorTotal || 0).toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3 text-sm">
            {pedido.fornecedor && (
              <div>
                <p className="text-xs text-gray-500 font-medium">Fornecedor</p>
                <p className="font-semibold text-gray-900">
                  {pedido.fornecedor}
                </p>
              </div>
            )}
            {pedido.dataEntregaPrevista && (
              <div>
                <p className="text-xs text-gray-500 font-medium">
                  Entrega Prevista
                </p>
                <p className="font-semibold text-gray-900">
                  {new Date(pedido.dataEntregaPrevista).toLocaleDateString(
                    "pt-BR",
                  )}
                </p>
              </div>
            )}
            {pedido.responsavel && (
              <div>
                <p className="text-xs text-gray-500 font-medium">Responsável</p>
                <p className="font-semibold text-gray-900">
                  {pedido.responsavel}
                </p>
              </div>
            )}
            {pedido.observacao && (
              <div>
                <p className="text-xs text-gray-500 font-medium">Observação</p>
                <p className="text-gray-700 italic">{pedido.observacao}</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onFechar}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Tab Principal ─────────────────────────────────────────
const FSPedidosTab = ({
  pedidos = [],
  busca,
  regionais,
  podeGerenciar,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [visualizando, setVisualizando] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  const tipos = useMemo(
    () => [...new Set(pedidos.map((p) => p.tipo).filter(Boolean))].sort(),
    [pedidos],
  );

  const lista = useMemo(
    () =>
      pedidos
        .filter(
          (p) =>
            (!busca ||
              p.descricao?.toLowerCase().includes(busca.toLowerCase()) ||
              p.fornecedor?.toLowerCase().includes(busca.toLowerCase()) ||
              p.responsavel?.toLowerCase().includes(busca.toLowerCase())) &&
            (filtroStatus === "todos" || p.status === filtroStatus) &&
            (filtroTipo === "todos" || p.tipo === filtroTipo),
        )
        .sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao)),
    [pedidos, busca, filtroStatus, filtroTipo],
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

  // ─── KPIs ──────────────────────────────────────────────
  const stats = useMemo(
    () => ({
      total: pedidos.length,
      pendentes: pedidos.filter((p) => p.status === "pendente").length,
      aprovados: pedidos.filter((p) => p.status === "aprovado").length,
      recebidos: pedidos.filter((p) => p.status === "recebido").length,
      valorTotal: pedidos.reduce(
        (sum, p) => sum + (parseFloat(p.valorTotal) || 0),
        0,
      ),
    }),
    [pedidos],
  );

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: "Total", val: stats.total, cor: "gray" },
          { label: "Pendentes", val: stats.pendentes, cor: "yellow" },
          { label: "Aprovados", val: stats.aprovados, cor: "blue" },
          { label: "Recebidos", val: stats.recebidos, cor: "green" },
          {
            label: "Valor Total",
            val: `R$ ${stats.valorTotal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`,
            cor: "orange",
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`px-3 py-2 rounded-xl bg-${s.cor}-50 border border-${s.cor}-100`}
          >
            <p
              className={`text-[10px] font-semibold text-${s.cor}-600 uppercase`}
            >
              {s.label}
            </p>
            <p
              className={`text-sm font-bold text-${s.cor}-700 mt-0.5 truncate`}
            >
              {s.val}
            </p>
          </div>
        ))}
      </div>

      {/* Filtros + Botão */}
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex gap-2 flex-wrap">
          {/* Status */}
          <div className="flex gap-1">
            {[
              { v: "todos", l: "Todos" },
              { v: "pendente", l: "🟡 Pendentes" },
              { v: "aprovado", l: "🔵 Aprovados" },
              { v: "recebido", l: "🟢 Recebidos" },
              { v: "cancelado", l: "🔴 Cancelados" },
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
            <Plus size={15} /> Novo Pedido
          </button>
        )}
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-14 text-center">
          <ShoppingCart size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-400">
            Nenhum pedido encontrado.
          </p>
          {podeGerenciar && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 btn-primary text-sm"
            >
              Criar primeiro pedido
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {lista.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0 mt-0.5">
                    <ShoppingCart size={18} className="text-orange-600" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-gray-900 truncate">
                      {p.descricao}
                    </h4>
                    <p className="text-xs text-gray-500">
                      {p.tipo || "Sem tipo"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <BadgeStatus status={p.status} />
                  {podeGerenciar && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setVisualizando(p)}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => {
                          setEditando(p);
                          setShowForm(true);
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDelConfirm(p.id)}
                        className="p-1.5 rounded-lg text-red-300 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                <div>
                  <p className="text-gray-500 font-medium">Quantidade</p>
                  <p className="font-bold text-gray-900">{p.quantidade} un.</p>
                </div>
                <div>
                  <p className="text-gray-500 font-medium">Valor Unit.</p>
                  <p className="font-bold text-gray-900">
                    R${" "}
                    {parseFloat(p.valorUnitario || 0).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 font-medium">Total</p>
                  <p className="font-bold text-orange-600">
                    R${" "}
                    {parseFloat(p.valorTotal || 0).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 font-medium">Regional</p>
                  <p className="font-bold text-gray-900">{p.regional}</p>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-xs">
                <div className="space-y-1">
                  {p.fornecedor && (
                    <p className="text-gray-600">
                      <span className="font-medium">Fornecedor:</span>{" "}
                      {p.fornecedor}
                    </p>
                  )}
                  {p.dataEntregaPrevista && (
                    <p className="text-gray-600">
                      <span className="font-medium">Entrega:</span>{" "}
                      {new Date(p.dataEntregaPrevista).toLocaleDateString(
                        "pt-BR",
                      )}
                    </p>
                  )}
                  {p.responsavel && (
                    <p className="text-gray-600">
                      <span className="font-medium">Responsável:</span>{" "}
                      {p.responsavel}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Form */}
      {showForm && (
        <FSPedidoForm
          inicial={editando}
          regionais={regionais}
          onSalvar={handleSalvar}
          onFechar={() => {
            setShowForm(false);
            setEditando(null);
          }}
        />
      )}

      {/* Modal Detalhes */}
      {visualizando && (
        <FSPedidoDetalhes
          pedido={visualizando}
          onFechar={() => setVisualizando(null)}
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
                <p className="font-bold text-gray-900 mb-1">Excluir pedido?</p>
                <p className="text-sm text-gray-500 mb-5">
                  Esta ação não pode ser desfeita.
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

export default FSPedidosTab;
