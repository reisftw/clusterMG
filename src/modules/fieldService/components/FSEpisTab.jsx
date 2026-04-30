import { useState, useMemo } from "react";
import {
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Calendar,
} from "lucide-react";
import { useFSColaboradores } from "../hooks/useFSColaboradores";

// ─── Status config ─────────────────────────────────────────
const STATUS = {
  ativo: { label: "Ativo", cor: "green", icon: CheckCircle },
  vencido: { label: "Vencido", cor: "red", icon: XCircle },
  proximo: { label: "Próximo Venc.", cor: "yellow", icon: AlertTriangle },
};

const TIPOS_EPI = [
  "Capacete",
  "Colete de Segurança",
  "Cinto de Segurança",
  "Óculos de Proteção",
  "Máscara/Respirador",
  "Luvas",
  "Avental",
  "Bota de Segurança",
  "Protetor Auricular",
  "Fone de Ouvido",
  "Macacão",
  "Escada de Segurança",
  "Outro",
];

// ─── Badge Status ──────────────────────────────────────────
const BadgeStatus = ({ status }) => {
  const s = STATUS[status] || STATUS.ativo;
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-${s.cor}-50 text-${s.cor}-600 border border-${s.cor}-200`}
    >
      <Icon size={9} /> {s.label}
    </span>
  );
};

// ─── Calcular status por validade ──────────────────────────
const calcularStatus = (validade) => {
  if (!validade) return "ativo";
  const hoje = new Date();
  const vencimento = new Date(validade);
  const diasRestantes = Math.ceil((vencimento - hoje) / (1000 * 60 * 60 * 24));

  if (diasRestantes < 0) return "vencido";
  if (diasRestantes <= 30) return "proximo";
  return "ativo";
};

// ─── Modal Form ────────────────────────────────────────────
const FSEpiForm = ({
  inicial,
  regionais,
  colaboradores = [],
  onSalvar,
  onFechar,
}) => {
  const [form, setForm] = useState({
    nome: "",
    tipo: "",
    ca: "",
    colaboradorId: "",
    colaboradorNome: "",
    regional: "",
    dataEntrega: "",
    validade: "",
    observacao: "",
    ...inicial,
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const ok =
    form.nome.trim() && form.ca.trim() && form.colaboradorId && form.regional;

  const colabAtivos = useMemo(
    () =>
      colaboradores
        .filter((c) => c.status === "ativo" || c.status === "Ativo")
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [colaboradores],
  );

  const handleColaboradorChange = (colab_id) => {
    const colab = colabAtivos.find((c) => c.id === colab_id);
    set("colaboradorId", colab_id);
    set("colaboradorNome", colab?.nome || "");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center">
              <ShieldCheck size={16} className="text-green-600" />
            </div>
            <h3 className="font-bold text-gray-900">
              {inicial ? "Editar EPI" : "Novo EPI"}
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
              <label className="label-field">Nome do EPI *</label>
              <input
                value={form.nome}
                onChange={(e) => set("nome", e.target.value)}
                placeholder="Ex: Capacete Branco"
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
                {TIPOS_EPI.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* CA (Certificado) */}
            <div>
              <label className="label-field font-bold text-orange-600">
                CA (Certificado) *
              </label>
              <input
                value={form.ca}
                onChange={(e) => set("ca", e.target.value)}
                placeholder="Ex: CA 123456"
                className="input-field w-full font-mono bg-orange-50 border-orange-300"
              />
            </div>

            {/* Colaborador */}
            <div className="col-span-2">
              <label className="label-field">Colaborador *</label>
              <select
                value={form.colaboradorId}
                onChange={(e) => handleColaboradorChange(e.target.value)}
                className="input-field w-full"
              >
                <option value="">Selecione...</option>
                {colabAtivos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.cargo})
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

            {/* Data Entrega */}
            <div>
              <label className="label-field">Data Entrega</label>
              <input
                type="date"
                value={form.dataEntrega}
                onChange={(e) => set("dataEntrega", e.target.value)}
                className="input-field w-full"
              />
            </div>

            {/* Validade */}
            <div>
              <label className="label-field">Data Validade</label>
              <input
                type="date"
                value={form.validade}
                onChange={(e) => set("validade", e.target.value)}
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

          {/* Info */}
          <div className="px-3 py-2 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700">
            <p className="font-semibold">💡 Dica:</p>
            <p>
              Mantenha os dados de CA e validade atualizados para conformidade
              com NR.
            </p>
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
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 transition-colors"
          >
            {inicial ? "Salvar Alterações" : "Cadastrar"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Tab Principal ─────────────────────────────────────────
const FSEpisTab = ({
  epis,
  busca,
  regionais,
  podeGerenciar,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const { colaboradores = [] } = useFSColaboradores() || {};
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  const tipos = useMemo(
    () => [...new Set(epis.map((e) => e.tipo).filter(Boolean))].sort(),
    [epis],
  );

  const lista = useMemo(
    () =>
      epis
        .map((e) => ({ ...e, calculatedStatus: calcularStatus(e.validade) }))
        .filter(
          (e) =>
            (!busca ||
              e.nome?.toLowerCase().includes(busca.toLowerCase()) ||
              e.ca?.toLowerCase().includes(busca.toLowerCase()) ||
              e.colaboradorNome?.toLowerCase().includes(busca.toLowerCase())) &&
            (filtroStatus === "todos" || e.calculatedStatus === filtroStatus) &&
            (filtroTipo === "todos" || e.tipo === filtroTipo),
        )
        .sort((a, b) => a.nome?.localeCompare(b.nome)),
    [epis, busca, filtroStatus, filtroTipo],
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

  // ─── KPI rápido ────────────────────────────────────────
  const stats = useMemo(
    () => ({
      total: epis.length,
      ativos: epis.filter((e) => calcularStatus(e.validade) === "ativo").length,
      vencidos: epis.filter((e) => calcularStatus(e.validade) === "vencido")
        .length,
      proximos: epis.filter((e) => calcularStatus(e.validade) === "proximo")
        .length,
    }),
    [epis],
  );

  return (
    <div className="space-y-4">
      {/* Stats rápido */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total", val: stats.total, cor: "gray" },
          { label: "Ativos", val: stats.ativos, cor: "green" },
          { label: "Próx. Venc.", val: stats.proximos, cor: "yellow" },
          { label: "Vencidos", val: stats.vencidos, cor: "red" },
        ].map((s) => (
          <div
            key={s.label}
            className={`px-3 py-2 rounded-xl bg-${s.cor}-50 border border-${s.cor}-100`}
          >
            <p className={`text-xs font-semibold text-${s.cor}-600 uppercase`}>
              {s.label}
            </p>
            <p className={`text-lg font-bold text-${s.cor}-700`}>{s.val}</p>
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
              { v: "ativo", l: "🟢 Ativos" },
              { v: "proximo", l: "🟡 Próx. Venc." },
              { v: "vencido", l: "🔴 Vencidos" },
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
            <Plus size={15} /> Novo EPI
          </button>
        )}
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-14 text-center">
          <ShieldCheck size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-400">
            Nenhum EPI encontrado.
          </p>
          {podeGerenciar && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 btn-primary text-sm"
            >
              Cadastrar primeiro EPI
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lista.map((e) => (
            <div
              key={e.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                    <ShieldCheck size={16} className="text-green-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {e.nome}
                    </p>
                    <p className="text-xs text-gray-400">{e.tipo || "—"}</p>
                  </div>
                </div>
                <BadgeStatus status={e.calculatedStatus} />
              </div>

              <div className="space-y-1.5 mb-3 text-xs">
                {/* CA em destaque */}
                <div className="px-2 py-1 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="font-mono font-bold text-orange-700">
                    CA: {e.ca}
                  </p>
                </div>

                <p className="text-gray-600">
                  <span className="font-medium">Colaborador:</span>{" "}
                  {e.colaboradorNome || "—"}
                </p>

                <p className="text-gray-500">
                  <span className="font-medium">Regional:</span>{" "}
                  {e.regional || "—"}
                </p>

                {e.dataEntrega && (
                  <p className="text-gray-500">
                    <span className="font-medium">Entregue:</span>{" "}
                    {new Date(e.dataEntrega).toLocaleDateString("pt-BR")}
                  </p>
                )}

                {e.validade && (
                  <div
                    className={`px-2 py-1 rounded-lg border flex items-center gap-1 ${
                      e.calculatedStatus === "vencido"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : e.calculatedStatus === "proximo"
                          ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                          : "bg-green-50 text-green-700 border-green-200"
                    }`}
                  >
                    <Calendar size={11} />
                    <span className="font-mono font-semibold">
                      {new Date(e.validade).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                )}

                {e.observacao && (
                  <p className="text-gray-400 italic border-l-2 border-green-300 pl-2">
                    {e.observacao}
                  </p>
                )}
              </div>

              {podeGerenciar && (
                <div className="flex gap-2 pt-3 border-t border-gray-50">
                  {/* Editar */}
                  <button
                    onClick={() => {
                      setEditando(e);
                      setShowForm(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    <Pencil size={12} /> Editar
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
        <FSEpiForm
          inicial={editando}
          regionais={regionais}
          colaboradores={colaboradores}
          onSalvar={handleSalvar}
          onFechar={() => {
            setShowForm(false);
            setEditando(null);
          }}
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
                <p className="font-bold text-gray-900 mb-1">Excluir EPI?</p>
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

export default FSEpisTab;
