import { useState, useEffect } from "react";
import {
  X,
  User,
  Clock,
  CalendarDays,
  CalendarClock,
  Copy,
  Trash2,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { CARGOS_FS } from "../../../constants/roles";
import { useRegionais } from "../../regionais/hooks/useRegionais";

const ABAS = [
  { id: "dados", label: "Dados", icon: User },
  { id: "banco_horas", label: "Banco de Horas", icon: Clock },
  { id: "ferias", label: "Férias", icon: CalendarDays },
  { id: "escala", label: "Escala", icon: CalendarClock },
];

const STATUS_OPTS = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "demitido", label: "Demitido" },
];

// ─── Cálculo Data Limite Férias (CLT) ─────────────────────
// Regra: 12 meses aquisitivos + até 11 meses concessivos = 23 meses após admissão
const calcularFeriasInfo = (dataContratacao) => {
  if (!dataContratacao) return null;

  const admissao = new Date(dataContratacao);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const mesesTrabalhados = Math.floor(
    (hoje - admissao) / (1000 * 60 * 60 * 24 * 30.44),
  );

  const periodoAtual = Math.floor(mesesTrabalhados / 12);

  if (periodoAtual === 0) {
    const fimAquisitivo = new Date(admissao);
    fimAquisitivo.setMonth(fimAquisitivo.getMonth() + 12);
    const dias = Math.ceil((fimAquisitivo - hoje) / (1000 * 60 * 60 * 24));
    return {
      status: "em_aquisicao",
      diasParaLimite: dias,
      dataLimite: null,
      label: `Período aquisitivo em ${dias}d`,
    };
  }

  const inicioPeriodo = new Date(admissao);
  inicioPeriodo.setMonth(inicioPeriodo.getMonth() + periodoAtual * 12);

  const dataLimite = new Date(inicioPeriodo);
  dataLimite.setMonth(dataLimite.getMonth() + 23);

  const diasParaLimite = Math.ceil((dataLimite - hoje) / (1000 * 60 * 60 * 24));

  let status;
  if (diasParaLimite < 0) status = "vencido";
  else if (diasParaLimite <= 30) status = "critico";
  else if (diasParaLimite <= 60) status = "atencao";
  else status = "ok";

  return {
    status,
    diasParaLimite,
    dataLimite,
    label:
      diasParaLimite < 0
        ? `Vencido há ${Math.abs(diasParaLimite)} dias`
        : `${diasParaLimite} dias para vencer`,
  };
};

// ─── Card Data Limite ──────────────────────────────────────
const CardDataLimite = ({ dataContratacao }) => {
  const info = calcularFeriasInfo(dataContratacao);
  if (!info) return null;

  const config = {
    em_aquisicao: {
      cor: "blue",
      icon: CalendarDays,
      titulo: "Em Período Aquisitivo",
      desc: info.label,
      bg: "bg-blue-50 border-blue-200",
      text: "text-blue-700",
    },
    ok: {
      cor: "green",
      icon: CheckCircle,
      titulo: "Férias em Dia",
      desc: info.label,
      bg: "bg-green-50 border-green-200",
      text: "text-green-700",
    },
    atencao: {
      cor: "yellow",
      icon: AlertTriangle,
      titulo: "Atenção — Prazo Próximo",
      desc: info.label,
      bg: "bg-yellow-50 border-yellow-200",
      text: "text-yellow-700",
    },
    critico: {
      cor: "orange",
      icon: AlertTriangle,
      titulo: "⚠️ Crítico — Menos de 30 dias!",
      desc: info.label,
      bg: "bg-orange-50 border-orange-200",
      text: "text-orange-700",
    },
    vencido: {
      cor: "red",
      icon: XCircle,
      titulo: "🚨 Prazo Vencido!",
      desc: info.label,
      bg: "bg-red-50 border-red-200",
      text: "text-red-700",
    },
  }[info.status];

  const Icon = config.icon;

  return (
    <div className={`rounded-xl border px-4 py-3 ${config.bg}`}>
      <div className="flex items-start gap-3">
        <Icon size={18} className={config.text} />
        <div className="flex-1 min-w-0">
          <p
            className={`text-xs font-bold uppercase tracking-wide ${config.text}`}
          >
            {config.titulo}
          </p>
          <p className={`text-sm font-semibold mt-0.5 ${config.text}`}>
            {config.desc}
          </p>
          {info.dataLimite && (
            <p className={`text-xs mt-1 opacity-75 ${config.text}`}>
              Data limite: {info.dataLimite.toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Badge no histórico de férias ─────────────────────────
const BadgePrazo = ({ dataInicio, dataLimite }) => {
  if (!dataInicio || !dataLimite) return null;
  const noPrazo = new Date(dataInicio) <= new Date(dataLimite);
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
        noPrazo
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-red-50 text-red-700 border-red-200"
      }`}
    >
      {noPrazo ? "✓ No prazo" : "⚠️ Fora do prazo"}
    </span>
  );
};

// ─── Modal Principal ───────────────────────────────────────
const FSColaboradorModal = ({
  colaborador,
  onSalvar,
  onClose,
  onDelete,
  onCopiar,
  buscarHistorico,
  colaboradoresFS,
}) => {
  const [aba, setAba] = useState("dados");
  const [historico, setHistorico] = useState(null);
  const [loadingH, setLoadingH] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const { regionais } = useRegionais();

  const [form, setForm] = useState({
    nome: colaborador?.nome ?? "",
    matricula: colaborador?.matricula ?? "",
    email: colaborador?.email ?? "",
    codigo_empresa: colaborador?.codigo_empresa ?? "",
    codigo_erp: colaborador?.codigo_erp ?? "",
    cargo: colaborador?.cargo ?? "",
    regional: colaborador?.regional ?? "",
    telefone: colaborador?.telefone ?? "",
    status: colaborador?.status ?? "ativo",
    turno: colaborador?.turno ?? "",
    lider_responsavel: colaborador?.lider_responsavel ?? "",
    data_aniversario: colaborador?.data_aniversario ?? "",
    data_contratacao: colaborador?.data_contratacao ?? "",
    data_demissao: colaborador?.data_demissao ?? "",
    motivo_demissao: colaborador?.motivo_demissao ?? "",
  });

  useEffect(() => {
    if (!["banco_horas", "ferias", "escala"].includes(aba) || historico) return undefined;

    const timer = setTimeout(() => {
      setLoadingH(true);
      buscarHistorico(colaborador.id).then((h) => {
        setHistorico(h);
        setLoadingH(false);
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [aba, buscarHistorico, colaborador.id, historico]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const lideres = (colaboradoresFS ?? []).filter((c) => {
    const r = c.cargo?.toLowerCase() ?? "";
    return (
      r.includes("lider") ||
      r.includes("líder") ||
      r.includes("supervisor") ||
      r.includes("coordenador") ||
      r.includes("gerente")
    );
  });

  const handleSalvar = () => {
    onSalvar(colaborador.id, form);
    onClose();
  };

  const handleCopiar = () => {
    if (onCopiar) onCopiar(colaborador);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleDelete = () => {
    if (onDelete) {
      onClose();
      onDelete(colaborador.id);
    }
  };

  const statusBadgeClass = {
    ativo: "bg-green-50 text-green-700 border-green-100",
    inativo: "bg-gray-50  text-gray-500  border-gray-100",
    demitido: "bg-red-50   text-red-600   border-red-100",
  };

  // Info de férias do colaborador
  const feriasInfo = calcularFeriasInfo(form.data_contratacao);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm">
                {colaborador?.nome?.charAt(0)?.toUpperCase() ?? "C"}
              </span>
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">
                {colaborador?.nome}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-gray-400 capitalize">
                  {colaborador?.cargo ?? "—"}
                </p>
                {colaborador?.status && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${statusBadgeClass[colaborador.status] ?? statusBadgeClass.inativo}`}
                  >
                    {colaborador.status}
                  </span>
                )}
                {/* ── Badge prazo férias no header ── */}
                {feriasInfo &&
                  feriasInfo.status !== "em_aquisicao" &&
                  feriasInfo.status !== "ok" && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                        feriasInfo.status === "vencido"
                          ? "bg-red-50 text-red-600 border-red-200"
                          : feriasInfo.status === "critico"
                            ? "bg-orange-50 text-orange-600 border-orange-200"
                            : "bg-yellow-50 text-yellow-600 border-yellow-200"
                      }`}
                    >
                      🏖️ {feriasInfo.label}
                    </span>
                  )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {colaborador?.origem === "retiradas" && (
              <span className="text-[10px] font-semibold px-2 py-1 bg-orange-50 text-orange-600 border border-orange-100 rounded-lg">
                📦 Retiradas
              </span>
            )}
            {onCopiar && (
              <button
                onClick={handleCopiar}
                title="Copiar para WhatsApp"
                className={`p-2 rounded-xl transition-all text-sm font-bold ${
                  copiado
                    ? "bg-green-100 text-green-600"
                    : "hover:bg-blue-50 text-blue-500"
                }`}
              >
                {copiado ? "✓" : <Copy size={16} />}
              </button>
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                title="Excluir colaborador"
                className="p-2 rounded-xl hover:bg-red-50 text-red-500 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Abas ── */}
        <div className="flex border-b border-gray-100 px-6 gap-1">
          {ABAS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-all ${
                aba === id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {icon({ size: 13 })}
              {label}
              {/* Badge alerta na aba Férias */}
              {id === "ferias" &&
                feriasInfo &&
                (feriasInfo.status === "critico" ||
                  feriasInfo.status === "vencido" ||
                  feriasInfo.status === "atencao") && (
                  <span
                    className={`ml-1 w-2 h-2 rounded-full ${
                      feriasInfo.status === "vencido"
                        ? "bg-red-500"
                        : feriasInfo.status === "critico"
                          ? "bg-orange-500"
                          : "bg-yellow-400"
                    }`}
                  />
                )}
            </button>
          ))}
        </div>

        {/* ── Conteúdo ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ── ABA DADOS ── */}
          {aba === "dados" && (
            <div className="space-y-5">
              {/* Identificação */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Identificação
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Nome */}
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      Nome
                    </label>
                    <input
                      value={form.nome}
                      onChange={(e) => set("nome", e.target.value)}
                      className="input-field w-full"
                      disabled={colaborador?.origem === "retiradas"}
                    />
                  </div>

                  {/* ✅ E-mail */}
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      className="input-field w-full"
                      placeholder="email@empresa.com"
                    />
                  </div>

                  {/* Matrícula */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      Matrícula
                    </label>
                    <input
                      value={form.matricula}
                      onChange={(e) => set("matricula", e.target.value)}
                      className="input-field w-full"
                      placeholder="Ex.: 001234"
                    />
                  </div>

                  {/* Telefone */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      Telefone
                    </label>
                    <input
                      value={form.telefone}
                      onChange={(e) => set("telefone", e.target.value)}
                      className="input-field w-full"
                      placeholder="(31) 9 0000-0000"
                    />
                  </div>

                  {/* ✅ Código Empresa */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      Código Empresa
                    </label>
                    <input
                      value={form.codigo_empresa}
                      onChange={(e) => set("codigo_empresa", e.target.value)}
                      className="input-field w-full font-mono"
                      placeholder="Ex.: EMP-001"
                    />
                  </div>

                  {/* ✅ Código ERP */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      Código ERP
                    </label>
                    <input
                      value={form.codigo_erp}
                      onChange={(e) => set("codigo_erp", e.target.value)}
                      className="input-field w-full font-mono"
                      placeholder="Ex.: ERP-00456"
                    />
                  </div>

                  {/* Aniversário */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      Aniversário
                    </label>
                    <input
                      type="date"
                      value={form.data_aniversario}
                      onChange={(e) => set("data_aniversario", e.target.value)}
                      className="input-field w-full"
                    />
                  </div>

                  {/* Contratação */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      Contratação
                    </label>
                    <input
                      type="date"
                      value={form.data_contratacao}
                      onChange={(e) => set("data_contratacao", e.target.value)}
                      className="input-field w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Cargo & Lotação */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Cargo & Lotação
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      Cargo
                    </label>
                    <select
                      value={form.cargo}
                      onChange={(e) => set("cargo", e.target.value)}
                      className="input-field w-full"
                    >
                      <option value="">Selecione...</option>
                      {CARGOS_FS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      Turno
                    </label>
                    <select
                      value={form.turno}
                      onChange={(e) => set("turno", e.target.value)}
                      className="input-field w-full"
                    >
                      <option value="">Selecione...</option>
                      <option value="12x36">12x36</option>
                      <option value="seg_sex">Segunda a Sexta</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      Regional
                    </label>
                    <select
                      value={form.regional}
                      onChange={(e) => set("regional", e.target.value)}
                      className="input-field w-full"
                    >
                      <option value="">Selecione...</option>
                      {regionais.map((r) => (
                        <option key={r.id} value={r.nome}>
                          {r.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">
                      Líder Imediato
                    </label>
                    <select
                      value={form.lider_responsavel}
                      onChange={(e) => set("lider_responsavel", e.target.value)}
                      className="input-field w-full"
                    >
                      <option value="">Selecione...</option>
                      {lideres.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nome} ({l.cargo})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Status
                </p>
                <div className="flex gap-2 mb-3">
                  {STATUS_OPTS.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => set("status", s.value)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                        form.status === s.value
                          ? s.value === "ativo"
                            ? "bg-green-600 text-white border-green-600"
                            : s.value === "inativo"
                              ? "bg-gray-500 text-white border-gray-500"
                              : "bg-red-500 text-white border-red-500"
                          : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {form.status === "demitido" && (
                  <div className="grid grid-cols-2 gap-3 p-4 bg-red-50 rounded-xl border border-red-100">
                    <div>
                      <label className="text-xs font-semibold text-red-500 mb-1 block">
                        Data da Demissão
                      </label>
                      <input
                        type="date"
                        value={form.data_demissao}
                        onChange={(e) => set("data_demissao", e.target.value)}
                        className="input-field w-full"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-red-500 mb-1 block">
                        Motivo da Demissão
                      </label>
                      <textarea
                        value={form.motivo_demissao}
                        onChange={(e) => set("motivo_demissao", e.target.value)}
                        rows={2}
                        className="input-field w-full resize-none"
                        placeholder="Descreva o motivo..."
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ✅ Card Data Limite Férias na aba Dados */}
              {form.data_contratacao && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Situação das Férias
                  </p>
                  <CardDataLimite dataContratacao={form.data_contratacao} />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvar}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  Salvar
                </button>
              </div>
            </div>
          )}

          {/* ── ABAS HISTÓRICO ── */}
          {["banco_horas", "ferias", "escala"].includes(aba) &&
            (loadingH ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-sm text-gray-400">Carregando...</p>
              </div>
            ) : (
              <div className="space-y-1">
                {/* Banco de Horas */}
                {aba === "banco_horas" &&
                  (historico?.bancoHoras?.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-12">
                      Nenhum registro de banco de horas.
                    </p>
                  ) : (
                    historico?.bancoHoras?.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-700">
                            {r.descricao ?? "—"}
                          </p>
                          <p className="text-xs text-gray-400">
                            {r.data ?? "—"}
                          </p>
                        </div>
                        <span
                          className={`text-sm font-bold ${r.horas > 0 ? "text-green-600" : "text-red-500"}`}
                        >
                          {r.horas > 0 ? "+" : ""}
                          {r.horas}h
                        </span>
                      </div>
                    ))
                  ))}

                {/* ✅ Férias com data limite */}
                {aba === "ferias" && (
                  <>
                    {/* Card Data Limite no topo da aba */}
                    <div className="mb-4">
                      <CardDataLimite dataContratacao={form.data_contratacao} />
                    </div>

                    {historico?.ferias?.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">
                        Nenhuma solicitação de férias.
                      </p>
                    ) : (
                      historico?.ferias?.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-700">
                              {r.data_inicio} → {r.data_fim}
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-gray-400 capitalize">
                                {r.status ?? "—"}
                              </p>
                              {/* ✅ Badge dentro/fora do prazo */}
                              <BadgePrazo
                                dataInicio={r.data_inicio}
                                dataLimite={feriasInfo?.dataLimite}
                              />
                            </div>
                          </div>
                          <span className="text-sm font-bold text-blue-600">
                            {r.dias_gozados ?? "—"}d
                          </span>
                        </div>
                      ))
                    )}
                  </>
                )}

                {/* Escala */}
                {aba === "escala" &&
                  (historico?.escala?.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-12">
                      Nenhuma escala de folga.
                    </p>
                  ) : (
                    historico?.escala?.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        <p className="text-sm font-medium text-gray-700">
                          {r.data ?? "—"}
                        </p>
                        <span className="text-xs text-gray-500">
                          {r.motivo ?? "—"}
                        </span>
                      </div>
                    ))
                  ))}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default FSColaboradorModal;
