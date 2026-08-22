import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import Spinner from "../../../components/ui/Spinner";
import { useRegionais } from "../../regionais/hooks/useRegionais";
import { useVisitas } from "../hooks/useVisitas";
import { STATUS_STYLES, TECNICO_STATUS, VISITA_STATUS } from "../constants";
import { gerarRelatorioVisitasPDF } from "../utils/visitasPdf";

const tabs = [
  { key: "dashboard", label: "Dashboard", icon: BarChart3 },
  { key: "visitas", label: "Visitas", icon: ClipboardCheck },
  { key: "tecnicos", label: "Tecnicos", icon: Users },
  { key: "relatorios", label: "Relatorios", icon: FileText },
  { key: "config", label: "Config", icon: Settings },
];

const emptyVisita = {
  tecnico_id: "",
  tecnico_nome: "",
  tecnico_tipo: "regional",
  regional: "",
  codigo_cliente: "",
  data: "",
  status: "Aprovada",
  observacao: "",
};

const emptyTecnico = {
  nome: "",
  regional: "",
  status: "Ativo",
  tecnico_retirada: false,
};

const money = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const monthKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const formatMonth = (key) => {
  if (!key) return "-";
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
};

const formatDate = (value) => {
  if (!value) return "-";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
};

const buildCalendarDays = (monthValue) => {
  const [year, month] = monthValue.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    return {
      key,
      day: date.getDate(),
      currentMonth: date.getMonth() === month - 1,
    };
  });
};

const previousMonth = (key) => {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(year, month - 2, 1));
};

const nextMonth = (key) => {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(year, month, 1));
};

const groupCount = (items, keyGetter) =>
  items.reduce((acc, item) => {
    const key = keyGetter(item) || "Sem informacao";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

const sortedEntries = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

const isTecnicoRetirada = (item) =>
  item?.tecnico_retirada === true || item?.tecnico_tipo === "retirada";

const getTipoTecnico = (visita, tecnico) => {
  if (visita?.tecnico_tipo) return visita.tecnico_tipo;
  return isTecnicoRetirada(tecnico) ? "retirada" : "regional";
};

const StatusBadge = ({ status }) => (
  <span
    className={`rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${
      STATUS_STYLES[status] || "border-gray-200 bg-gray-100 text-gray-600"
    }`}
  >
    {status || "Aprovada"}
  </span>
);

const StatCard = ({ label, value, helper, icon: Icon, tone = "blue" }) => {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-400">{label}</p>
          <p className="truncate text-xl font-bold text-gray-900">{value}</p>
          {helper && <p className="text-xs text-gray-400">{helper}</p>}
        </div>
      </div>
    </div>
  );
};

const VisitasCalendar = ({ visitas, mes }) => {
  const [diaSelecionado, setDiaSelecionado] = useState(null);
  const [modalPage, setModalPage] = useState(1);
  const dias = useMemo(() => buildCalendarDays(mes), [mes]);
  const porData = useMemo(() => {
    const grouped = {};
    visitas.forEach((item) => {
      grouped[item.data] = [...(grouped[item.data] || []), item];
    });
    return grouped;
  }, [visitas]);
  const itensSelecionados = diaSelecionado ? porData[diaSelecionado] || [] : [];
  const modalTotalPages = Math.max(1, Math.ceil(itensSelecionados.length / 10));
  const modalSafePage = Math.min(modalPage, modalTotalPages);
  const itensPaginados = itensSelecionados.slice(
    (modalSafePage - 1) * 10,
    modalSafePage * 10,
  );

  return (
    <>
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
            <CalendarDays size={16} className="text-blue-600" />
          </div>
          <p className="text-sm font-bold capitalize text-gray-900">{formatMonth(mes)}</p>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-gray-400">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((dia) => (
            <div key={dia} className="py-1">
              {dia}
            </div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {dias.map((dia) => {
            const itens = porData[dia.key] || [];
            return (
              <button
                key={dia.key}
                type="button"
                onClick={() => {
                  if (!itens.length) return;
                  setDiaSelecionado(dia.key);
                  setModalPage(1);
                }}
                disabled={!itens.length}
                className={`min-h-16 rounded-xl border p-2 text-left transition-colors disabled:cursor-default ${
                  dia.currentMonth
                    ? "border-gray-100 bg-gray-50 hover:bg-blue-50"
                    : "border-gray-50 bg-gray-50/50 text-gray-300"
                } ${itens.length ? "cursor-pointer" : ""}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`text-xs font-semibold ${
                      dia.currentMonth ? "text-gray-700" : "text-gray-300"
                    }`}
                  >
                    {dia.day}
                  </span>
                  {itens.length > 0 && (
                    <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {itens.length}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {itens.slice(0, 4).map((item) => (
                    <span key={item.id} className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {diaSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-bold text-gray-900">
                  Visitas de {formatDate(diaSelecionado)}
                </p>
                <p className="text-sm text-gray-500">
                  {itensSelecionados.length} visita(s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDiaSelecionado(null)}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>

            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {itensPaginados.map((item) => (
                <div key={item.id} className="rounded-xl bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-gray-800">
                      Codigo do Cliente: {item.codigo_cliente}
                    </p>
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold ${
                          item.tecnico_tipo === "retirada"
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.tecnico_tipo === "retirada" ? "Retirada" : "Regional"}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {item.tecnico_nome || "-"} - {item.regional || "-"}
                  </p>
                  {item.observacao && (
                    <p className="mt-2 text-sm text-gray-500">{item.observacao}</p>
                  )}
                </div>
              ))}
            </div>

            {itensSelecionados.length > 10 && (
              <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-500">
                  Mostrando {(modalSafePage - 1) * 10 + 1}-
                  {Math.min(modalSafePage * 10, itensSelecionados.length)} de{" "}
                  {itensSelecionados.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalPage((current) => Math.max(1, current - 1))}
                    disabled={modalSafePage === 1}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="text-sm font-semibold text-gray-500">
                    {modalSafePage} / {modalTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setModalPage((current) => Math.min(modalTotalPages, current + 1))
                    }
                    disabled={modalSafePage === modalTotalPages}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40"
                  >
                    Proxima
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const VisitasPage = () => {
  const { regionais: regionaisSistema } = useRegionais();
  const {
    visitas,
    tecnicos,
    regionais,
    config,
    loading,
    error,
    carregar,
    criar,
    atualizar,
    excluir,
    criarTecnico,
    atualizarTecnico,
    excluirTecnico,
    salvarConfig,
  } = useVisitas();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [mes, setMes] = useState(monthKey());
  const [regionalFiltro, setRegionalFiltro] = useState("todas");
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [tecnicoPage, setTecnicoPage] = useState(1);
  const [tecnicoBusca, setTecnicoBusca] = useState("");
  const [tecnicoRegionalFiltro, setTecnicoRegionalFiltro] = useState("todas");
  const [visitaForm, setVisitaForm] = useState(emptyVisita);
  const [editingVisitaId, setEditingVisitaId] = useState(null);
  const [tecnicoForm, setTecnicoForm] = useState(emptyTecnico);
  const [editingTecnicoId, setEditingTecnicoId] = useState(null);
  const [valorConfig, setValorConfig] = useState(null);
  const [copiadoId, setCopiadoId] = useState(null);
  const [pdfLoading, setPdfLoading] = useState("");

  const regionaisSistemaOptions = useMemo(
    () =>
      regionaisSistema
        .map((item) => item.nome)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [regionaisSistema],
  );

  const tecnicosAtivos = useMemo(
    () => tecnicos.filter((item) => item.status !== "Inativo"),
    [tecnicos],
  );
  const tecnicoLookup = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    tecnicos.forEach((item) => {
      if (item.id) byId.set(item.id, item);
      if (item.nome) byName.set(item.nome, item);
    });
    return { byId, byName };
  }, [tecnicos]);
  const tecnicosFiltrados = useMemo(() => {
    const termo = tecnicoBusca.trim().toLowerCase();
    return tecnicos.filter((item) => {
      const regionalOk =
        tecnicoRegionalFiltro === "todas" || item.regional === tecnicoRegionalFiltro;
      const textoOk = !termo || String(item.nome || "").toLowerCase().includes(termo);
      return regionalOk && textoOk;
    });
  }, [tecnicoBusca, tecnicoRegionalFiltro, tecnicos]);
  const tecnicoTotalPages = Math.max(1, Math.ceil(tecnicosFiltrados.length / 8));
  const tecnicoSafePage = Math.min(tecnicoPage, tecnicoTotalPages);
  const tecnicosPaginados = useMemo(
    () => tecnicosFiltrados.slice((tecnicoSafePage - 1) * 8, tecnicoSafePage * 8),
    [tecnicoSafePage, tecnicosFiltrados],
  );

  const visitasDoMes = useMemo(
    () => visitas.filter((item) => String(item.data || "").startsWith(mes)),
    [visitas, mes],
  );
  const visitasDoMesClassificadas = useMemo(
    () =>
      visitasDoMes.map((item) => {
        const tecnico =
          tecnicoLookup.byId.get(item.tecnico_id) ||
          tecnicoLookup.byName.get(item.tecnico_nome);
        return {
          ...item,
          tecnico_tipo: getTipoTecnico(item, tecnico),
        };
      }),
    [tecnicoLookup, visitasDoMes],
  );

  const visitasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return visitasDoMesClassificadas.filter((item) => {
      const regionalOk = regionalFiltro === "todas" || item.regional === regionalFiltro;
      const textoOk =
        !termo ||
        `${item.codigo_cliente || ""} ${item.tecnico_nome || ""} ${item.regional || ""}`
          .toLowerCase()
          .includes(termo);
      return regionalOk && textoOk;
    });
  }, [busca, regionalFiltro, visitasDoMesClassificadas]);

  const totalPages = Math.max(1, Math.ceil(visitasFiltradas.length / 10));
  const safePage = Math.min(page, totalPages);
  const visitasPaginadas = useMemo(
    () => visitasFiltradas.slice((safePage - 1) * 10, safePage * 10),
    [safePage, visitasFiltradas],
  );

  const valorVisita = Number(config.valorVisita || 0);
  const resumo = useMemo(() => {
    const porRegional = groupCount(visitasDoMesClassificadas, (item) => item.regional);
    const porTecnico = groupCount(visitasDoMesClassificadas, (item) => item.tecnico_nome);
    const validas = visitasDoMesClassificadas.filter((item) => item.status !== "Recusada");
    const regionaisValidas = validas.filter((item) => item.tecnico_tipo !== "retirada");
    const retiradasValidas = validas.filter((item) => item.tecnico_tipo === "retirada");
    return {
      total: visitasDoMesClassificadas.length,
      aprovadas: validas.length,
      gasto: validas.length * valorVisita,
      regionais: regionaisValidas.length,
      retirada: retiradasValidas.length,
      gastoRegionais: regionaisValidas.length * valorVisita,
      gastoRetirada: retiradasValidas.length * valorVisita,
      porRegional,
      porTecnico,
    };
  }, [valorVisita, visitasDoMesClassificadas]);

  const handleTecnicoVisita = (nome) => {
    const tecnico = tecnicos.find((item) => item.nome === nome);
    setVisitaForm((prev) => ({
      ...prev,
      tecnico_nome: nome,
      tecnico_id: tecnico?.id || "",
      tecnico_tipo: isTecnicoRetirada(tecnico) ? "retirada" : "regional",
      regional: tecnico?.regional || prev.regional,
    }));
  };

  const resetVisita = () => {
    setVisitaForm(emptyVisita);
    setEditingVisitaId(null);
  };

  const salvarVisita = async (event) => {
    event.preventDefault();
    if (!visitaForm.tecnico_nome.trim() || !visitaForm.codigo_cliente.trim() || !visitaForm.data) {
      return;
    }
    const payload = {
      ...visitaForm,
      tecnico_nome: visitaForm.tecnico_nome.trim(),
      tecnico_tipo: visitaForm.tecnico_tipo || "regional",
      codigo_cliente: visitaForm.codigo_cliente.trim(),
      regional: visitaForm.regional.trim(),
      observacao: visitaForm.observacao.trim(),
    };
    if (editingVisitaId) await atualizar(editingVisitaId, payload);
    else await criar(payload);
    resetVisita();
  };

  const editarVisita = (item) => {
    setActiveTab("visitas");
    setEditingVisitaId(item.id);
    setVisitaForm({
      tecnico_id: item.tecnico_id || "",
      tecnico_nome: item.tecnico_nome || "",
      tecnico_tipo: item.tecnico_tipo || "regional",
      regional: item.regional || "",
      codigo_cliente: item.codigo_cliente || "",
      data: item.data || "",
      status: item.status || "Aprovada",
      observacao: item.observacao || "",
    });
  };

  const resetTecnico = () => {
    setTecnicoForm(emptyTecnico);
    setEditingTecnicoId(null);
  };

  const salvarTecnico = async (event) => {
    event.preventDefault();
    if (!tecnicoForm.nome.trim() || !tecnicoForm.regional.trim()) return;
    const payload = {
      ...tecnicoForm,
      nome: tecnicoForm.nome.trim(),
      regional: tecnicoForm.regional.trim(),
    };
    if (editingTecnicoId) await atualizarTecnico(editingTecnicoId, payload);
    else await criarTecnico(payload);
    resetTecnico();
  };

  const editarTecnico = (item) => {
    setActiveTab("tecnicos");
    setEditingTecnicoId(item.id);
    setTecnicoForm({
      nome: item.nome || "",
      regional: item.regional || "",
      status: item.status || "Ativo",
      tecnico_retirada: isTecnicoRetirada(item),
    });
  };

  const salvarValor = async (event) => {
    event.preventDefault();
    await salvarConfig({ valorVisita: Number(valorConfig ?? config.valorVisita ?? 0) });
    setValorConfig(null);
  };

  const exportarRegional = async (regional) => {
    const dados = visitasDoMesClassificadas.filter(
      (item) => item.regional === regional && item.status !== "Recusada",
    );
    setPdfLoading(regional);
    try {
      await gerarRelatorioVisitasPDF({
        visitas: dados,
        regional,
        mesLabel: formatMonth(mes),
        valorVisita,
      });
    } finally {
      setPdfLoading("");
    }
  };

  if (loading) return <Spinner fullScreen />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Central de Visitas</h1>
          <p className="text-sm text-gray-500">
            Controle mensal de visitas por tecnico e regional para pagamento.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMes(previousMonth(mes))}
            className="rounded-xl border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50"
            title="Mes anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="month"
            value={mes}
            onChange={(event) => {
              setMes(event.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-blue-300"
          />
          <button
            type="button"
            onClick={() => setMes(nextMonth(mes))}
            className="rounded-xl border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50"
            title="Proximo mes"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={carregar}
            className="rounded-xl border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
            title="Atualizar"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === key
                ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                : "border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-600"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {activeTab === "dashboard" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-gray-900">Registro rapido</p>
              <p className="text-sm text-gray-500">
                Lance uma visita para contabilizar o pagamento do tecnico.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("visitas")}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              Registrar visita
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Visitas no mes"
              value={resumo.total}
              helper="Regionais + retirada"
              icon={ClipboardCheck}
            />
            <StatCard
              label="Gasto total"
              value={money(resumo.gasto)}
              helper={`${resumo.aprovadas} validas`}
              icon={BarChart3}
              tone="amber"
            />
            <StatCard
              label="Tecnicos regionais"
              value={resumo.regionais}
              helper={money(resumo.gastoRegionais)}
              icon={CheckCircle2}
              tone="emerald"
            />
            <StatCard
              label="Tecnicos retirada"
              value={resumo.retirada}
              helper={money(resumo.gastoRetirada)}
              icon={CheckCircle2}
              tone="blue"
            />
            <StatCard
              label="Tecnicos ativos"
              value={tecnicosAtivos.length}
              helper={`${tecnicosAtivos.filter(isTecnicoRetirada).length} retirada`}
              icon={Users}
              tone="slate"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StatCard
              label="Juntos para pagamento"
              value={resumo.aprovadas}
              helper={money(resumo.gasto)}
              icon={ClipboardCheck}
            />
            <StatCard
              label="Somente regionais"
              value={resumo.regionais}
              helper={money(resumo.gastoRegionais)}
              icon={CheckCircle2}
              tone="emerald"
            />
            <StatCard
              label="Somente retirada"
              value={resumo.retirada}
              helper={money(resumo.gastoRetirada)}
              icon={CheckCircle2}
              tone="amber"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <VisitasCalendar visitas={visitasDoMesClassificadas} mes={mes} />
            </div>
            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="mb-4 text-sm font-bold text-gray-900">Visitas por regional</p>
                <div className="space-y-3">
                  {sortedEntries(resumo.porRegional).map(([regional, total]) => (
                    <div key={regional}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-semibold text-gray-700">{regional}</span>
                        <span className="text-gray-500">{total}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-blue-600"
                          style={{ width: `${(total / Math.max(1, resumo.total)) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {sortedEntries(resumo.porRegional).length === 0 && (
                    <p className="text-sm text-gray-400">Sem visitas neste mes.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="mb-4 text-sm font-bold text-gray-900">Ranking de tecnicos</p>
                <div className="space-y-2">
                  {sortedEntries(resumo.porTecnico)
                    .slice(0, 8)
                    .map(([tecnico, total], index) => (
                      <div
                        key={tecnico}
                        className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2"
                      >
                        <span className="truncate text-sm font-semibold text-gray-700">
                          {index + 1}. {tecnico}
                        </span>
                        <span className="text-sm font-bold text-blue-600">{total}</span>
                      </div>
                    ))}
                  {sortedEntries(resumo.porTecnico).length === 0 && (
                    <p className="text-sm text-gray-400">Sem dados para ranking.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "visitas" && (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[360px_1fr]">
          <form
            onSubmit={salvarVisita}
            className="self-start rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
          >
            <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-900">
                {editingVisitaId ? "Editar visita" : "Nova visita"}
              </p>
              {editingVisitaId && (
                <button
                  type="button"
                  onClick={resetVisita}
                  className="text-xs font-semibold text-gray-400 hover:text-blue-600"
                >
                  Limpar
                </button>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Tecnico *
              </label>
              <input
                list="visitas-tecnicos"
                value={visitaForm.tecnico_nome}
                onChange={(event) => handleTecnicoVisita(event.target.value)}
                className="input-field"
                placeholder="Selecione ou digite"
              />
              <datalist id="visitas-tecnicos">
                {tecnicosAtivos.map((tecnico) => (
                  <option key={tecnico.id} value={tecnico.nome} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Regional *
              </label>
              <div
                className="input-field flex items-center text-gray-700"
                aria-label="Regional do tecnico selecionado"
              >
                {visitaForm.regional || "Selecione um tecnico"}
              </div>
              {visitaForm.tecnico_nome && (
                <p
                  className={`mt-1 inline-flex rounded-lg px-2 py-0.5 text-[10px] font-semibold ${
                    visitaForm.tecnico_tipo === "retirada"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {visitaForm.tecnico_tipo === "retirada"
                    ? "Tecnico de retirada"
                    : "Tecnico regional"}
                </p>
              )}
              <input
                type="hidden"
                value={visitaForm.regional}
                readOnly
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Codigo do cliente *
              </label>
              <input
                value={visitaForm.codigo_cliente}
                onChange={(event) =>
                  setVisitaForm((prev) => ({
                    ...prev,
                    codigo_cliente: event.target.value.replace(/\D/g, ""),
                  }))
                }
                className="input-field"
                inputMode="numeric"
                placeholder="Ex: 326723"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                  Data *
                </label>
                <input
                  type="date"
                  value={visitaForm.data}
                  onChange={(event) =>
                    setVisitaForm((prev) => ({ ...prev, data: event.target.value }))
                  }
                  className="input-field"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                  Status
                </label>
                <select
                  value={visitaForm.status}
                  onChange={(event) =>
                    setVisitaForm((prev) => ({ ...prev, status: event.target.value }))
                  }
                  className="input-field"
                >
                  {VISITA_STATUS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Observacao
              </label>
              <textarea
                value={visitaForm.observacao}
                onChange={(event) =>
                  setVisitaForm((prev) => ({ ...prev, observacao: event.target.value }))
                }
                className="input-field resize-none"
                rows={3}
                placeholder="Opcional"
              />
            </div>

            <button type="submit" className="btn-primary flex w-full items-center justify-center gap-2">
              <Plus size={16} />
              {editingVisitaId ? "Salvar visita" : "Registrar visita"}
            </button>
            </div>
          </form>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:grid-cols-3">
              <label className="relative block">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={busca}
                  onChange={(event) => {
                    setBusca(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar por codigo, tecnico ou regional"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
                />
              </label>
              <select
                value={regionalFiltro}
                onChange={(event) => {
                  setRegionalFiltro(event.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
              >
                <option value="todas">Todas as regionais</option>
                {regionais.map((regional) => (
                  <option key={regional} value={regional}>
                    {regional}
                  </option>
                ))}
              </select>
              <div className="flex items-center rounded-xl bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-500">
                {visitasFiltradas.length} visita(s) em {formatMonth(mes)}
              </div>
            </div>

            <div className="space-y-3">
              {visitasPaginadas.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-gray-900">
                          Codigo do Cliente: {item.codigo_cliente}
                        </h3>
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard?.writeText(item.codigo_cliente || "");
                            setCopiadoId(item.id);
                            window.setTimeout(() => setCopiadoId(null), 1200);
                          }}
                          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                          title="Copiar codigo"
                        >
                          <Copy size={14} />
                        </button>
                        <StatusBadge status={item.status} />
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold ${
                            item.tecnico_tipo === "retirada"
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {item.tecnico_tipo === "retirada" ? "Retirada" : "Regional"}
                        </span>
                        {copiadoId === item.id && (
                          <span className="text-[10px] font-semibold text-blue-600">
                            Codigo copiado
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <UserRound size={12} />
                          {item.tecnico_nome || "-"}
                        </span>
                        <span>{item.regional || "-"}</span>
                        <span>{formatDate(item.data)}</span>
                      </div>
                      {item.observacao && (
                        <p className="mt-3 text-sm text-gray-500">{item.observacao}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => editarVisita(item)}
                        className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => excluir(item.id)}
                        className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {!visitasPaginadas.length && (
                <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
                  <ClipboardCheck size={32} className="mx-auto mb-3 text-gray-200" />
                  <p className="text-sm text-gray-400">Nenhuma visita encontrada.</p>
                </div>
              )}

              {visitasFiltradas.length > 10 && (
                <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <p className="text-sm text-gray-500">
                    Mostrando {(safePage - 1) * 10 + 1}-
                    {Math.min(safePage * 10, visitasFiltradas.length)} de{" "}
                    {visitasFiltradas.length} visita(s)
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={safePage === 1}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      disabled={safePage === totalPages}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40"
                    >
                      Proxima
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "tecnicos" && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
          <form
            onSubmit={salvarTecnico}
            className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-900">
                {editingTecnicoId ? "Editar tecnico" : "Novo tecnico"}
              </p>
              {editingTecnicoId && (
                <button
                  type="button"
                  onClick={resetTecnico}
                  className="text-xs font-semibold text-gray-400 hover:text-blue-600"
                >
                  Limpar
                </button>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Nome *
              </label>
              <input
                value={tecnicoForm.nome}
                onChange={(event) =>
                  setTecnicoForm((prev) => ({ ...prev, nome: event.target.value }))
                }
                className="input-field"
                placeholder="Nome do tecnico"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Regional *
              </label>
              <select
                value={tecnicoForm.regional}
                onChange={(event) =>
                  setTecnicoForm((prev) => ({ ...prev, regional: event.target.value }))
                }
                className="input-field"
              >
                <option value="">Selecione...</option>
                {regionaisSistemaOptions.map((regional) => (
                  <option key={regional} value={regional}>
                    {regional}
                  </option>
                ))}
              </select>
              {!regionaisSistemaOptions.length && (
                <p className="mt-1 text-xs text-amber-600">
                  Nenhuma regional cadastrada no sistema.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Status
              </label>
              <select
                value={tecnicoForm.status}
                onChange={(event) =>
                  setTecnicoForm((prev) => ({ ...prev, status: event.target.value }))
                }
                className="input-field"
              >
                {TECNICO_STATUS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
              <input
                type="checkbox"
                checked={!!tecnicoForm.tecnico_retirada}
                onChange={(event) =>
                  setTecnicoForm((prev) => ({
                    ...prev,
                    tecnico_retirada: event.target.checked,
                  }))
                }
                className="accent-blue-600"
              />
              Tecnico de retirada
            </label>
            <button type="submit" className="btn-primary flex w-full items-center justify-center gap-2">
              <Plus size={16} />
              {editingTecnicoId ? "Salvar tecnico" : "Cadastrar tecnico"}
            </button>
          </form>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:grid-cols-3">
              <label className="relative block lg:col-span-2">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={tecnicoBusca}
                  onChange={(event) => {
                    setTecnicoBusca(event.target.value);
                    setTecnicoPage(1);
                  }}
                  placeholder="Buscar tecnico pelo nome"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
                />
              </label>
              <select
                value={tecnicoRegionalFiltro}
                onChange={(event) => {
                  setTecnicoRegionalFiltro(event.target.value);
                  setTecnicoPage(1);
                }}
                className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-blue-300 focus:bg-white"
              >
                <option value="todas">Todas as regionais</option>
                {regionaisSistemaOptions.map((regional) => (
                  <option key={regional} value={regional}>
                    {regional}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {tecnicosPaginados.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-5 shadow-sm ${
                    isTecnicoRetirada(item)
                      ? "border-blue-200 bg-blue-50/70"
                      : "border-gray-100 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-gray-900">{item.nome}</h3>
                      <p className="mt-1 text-sm text-gray-500">{item.regional}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span
                          className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-semibold ${
                            item.status === "Inativo"
                              ? "bg-gray-100 text-gray-500"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {item.status || "Ativo"}
                        </span>
                        <span
                          className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-semibold ${
                            isTecnicoRetirada(item)
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {isTecnicoRetirada(item) ? "Retirada" : "Regional"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => editarTecnico(item)}
                        className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => excluirTecnico(item.id)}
                        className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!tecnicosFiltrados.length && (
                <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm lg:col-span-2">
                  <Users size={32} className="mx-auto mb-3 text-gray-200" />
                  <p className="text-sm text-gray-400">Nenhum tecnico encontrado.</p>
                </div>
              )}
            </div>

            {tecnicosFiltrados.length > 8 && (
              <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-sm text-gray-500">
                  Pagina {tecnicoSafePage} de {tecnicoTotalPages} -{" "}
                  {tecnicosFiltrados.length} tecnico(s)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTecnicoPage((current) => Math.max(1, current - 1))}
                    disabled={tecnicoSafePage === 1}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTecnicoPage((current) => Math.min(tecnicoTotalPages, current + 1))
                    }
                    disabled={tecnicoSafePage === tecnicoTotalPages}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40"
                  >
                    Proxima
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "relatorios" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-gray-900">
              Relatorios de {formatMonth(mes)}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Gere um PDF por regional para encaminhar aos supervisores.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {regionais.map((regional) => {
              const dados = visitasDoMesClassificadas.filter(
                (item) => item.regional === regional && item.status !== "Recusada",
              );
              const dadosRegionais = dados.filter(
                (item) => item.tecnico_tipo !== "retirada",
              );
              const dadosRetirada = dados.filter(
                (item) => item.tecnico_tipo === "retirada",
              );
              return (
                <div key={regional} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-gray-900">{regional}</h3>
                      <p className="text-sm text-gray-500">{dados.length} visita(s)</p>
                      <p className="mt-1 text-sm font-semibold text-blue-600">
                        {money(dados.length * valorVisita)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => exportarRegional(regional)}
                      disabled={!dados.length || pdfLoading === regional}
                      className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download size={15} />
                      {pdfLoading === regional ? "Gerando..." : "PDF"}
                    </button>
                  </div>
                  <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase text-slate-400">
                        Juntos
                      </p>
                      <p className="text-lg font-bold text-slate-900">{dados.length}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        {money(dados.length * valorVisita)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 p-3">
                      <p className="text-[10px] font-bold uppercase text-emerald-600">
                        Regionais
                      </p>
                      <p className="text-lg font-bold text-emerald-800">
                        {dadosRegionais.length}
                      </p>
                      <p className="text-xs font-semibold text-emerald-700">
                        {money(dadosRegionais.length * valorVisita)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-blue-50 p-3">
                      <p className="text-[10px] font-bold uppercase text-blue-600">
                        Retiradas
                      </p>
                      <p className="text-lg font-bold text-blue-800">
                        {dadosRetirada.length}
                      </p>
                      <p className="text-xs font-semibold text-blue-700">
                        {money(dadosRetirada.length * valorVisita)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {sortedEntries(groupCount(dados, (item) => item.tecnico_nome)).map(
                      ([tecnico, total]) => {
                        const tipo =
                          dados.find((item) => item.tecnico_nome === tecnico)?.tecnico_tipo ===
                          "retirada"
                            ? "Retirada"
                            : "Regional";
                        return (
                        <div
                          key={tecnico}
                          className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <span className="block truncate font-semibold text-gray-700">
                              {tecnico}
                            </span>
                            <span
                              className={`mt-1 inline-flex rounded-lg px-2 py-0.5 text-[10px] font-semibold ${
                                tipo === "Retirada"
                                  ? "bg-blue-600 text-white"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {tipo}
                            </span>
                          </div>
                          <span className="font-bold text-gray-900">{total}</span>
                        </div>
                        );
                      },
                    )}
                    {!dados.length && (
                      <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-400">
                        Sem visitas validas para esta regional.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {!regionais.length && (
              <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm lg:col-span-2">
                <FileText size={32} className="mx-auto mb-3 text-gray-200" />
                <p className="text-sm text-gray-400">Cadastre tecnicos para gerar regionais.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "config" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <form
            onSubmit={salvarValor}
            className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                <Settings size={16} className="text-blue-600" />
              </div>
              <p className="text-sm font-bold text-gray-900">Valor por visita</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                Valor unitario
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={valorConfig ?? String(config.valorVisita || "")}
                onChange={(event) => setValorConfig(event.target.value)}
                className="input-field"
                placeholder="Ex: 25.00"
              />
            </div>
            <button type="submit" className="btn-primary flex items-center gap-2">
              <Save size={16} />
              Salvar valor
            </button>
          </form>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-gray-900">Resumo financeiro</p>
            <p className="mt-2 text-sm text-gray-500">
              O valor configurado e usado para calcular o gasto mensal e os PDFs por regional.
            </p>
            <div className="mt-4 rounded-xl bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-400">Valor atual</p>
              <p className="text-2xl font-bold text-gray-900">{money(valorVisita)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisitasPage;

