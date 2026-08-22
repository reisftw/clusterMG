import { useEffect, useMemo, useState } from "react";
import {
  CheckSquare,
  Clock,
  Filter,
  MessageCircle,
  Phone,
  RefreshCw,
  Save,
  Search,
  Send,
  Square,
} from "lucide-react";
import {
  CENTRAL_WHATSAPP_BUTTON_TEXT,
  CENTRAL_WHATSAPP_PHONE,
  buscarConfigMensageria,
  buscarTemplatesMensageria,
  DEFAULT_MENSAGERIA_CONFIG,
  DEFAULT_TEMPLATES,
  salvarConfigMensageria,
} from "../services/mensageriaService";
import {
  buscarBacklogMensageria,
  enviarBacklogParaFila,
} from "../services/mensageriaBacklogService";

const ALL = "todos";
const PAGE_SIZE_OPTIONS = [20, 50, 100, 400];

const formatNumber = (value) => Number(value || 0).toLocaleString("pt-BR");

const cleanCustomerName = (name) =>
  String(name || "Cliente")
    .replace(/^\s*\(\d+\)\s*/, "")
    .replace(/\s*-\s*\((?:INATIVO|ATIVO)\)\s*$/i, "")
    .replace(/\s*\((?:INATIVO|ATIVO)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

const getFirstName = (name) => cleanCustomerName(name).split(" ")[0] || "Cliente";

const replaceVariables = (text, item) => {
  const phone = String(CENTRAL_WHATSAPP_PHONE || "").replace(/\D/g, "");
  const data = {
    ...item,
    primeiro_nome: getFirstName(item?.cliente),
    central_whatsapp: CENTRAL_WHATSAPP_PHONE,
    link_agendamento: phone ? `https://wa.me/${phone}` : "",
    data_cancelamento: item?.data_cancelamento || item?.data_abertura_os || "",
    protocolo: item?.protocolo || item?.os || "",
  };

  return String(text || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) =>
    data[key] == null || data[key] === "" ? match : data[key],
  );
};

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const getAgeBucket = (item) => {
  const age = Number(item.dias_aberta);
  if (!Number.isFinite(age)) return "sem_data";
  if (age <= 1) return "ate_1";
  if (age <= 3) return "ate_3";
  if (age <= 7) return "ate_7";
  return "mais_7";
};

const ageOptions = [
  { value: ALL, label: "Todas" },
  { value: "ate_1", label: "Até 1 dia" },
  { value: "ate_3", label: "Até 3 dias" },
  { value: "ate_7", label: "Até 7 dias" },
  { value: "mais_7", label: "Mais de 7 dias" },
  { value: "sem_data", label: "Sem data" },
];

const attemptOptions = [
  { value: ALL, label: "Todas" },
  { value: "sem_tentativa", label: "Sem tentativa" },
  { value: "com_tentativa", label: "Com tentativa" },
  { value: "na_fila", label: "Já na fila" },
  { value: "com_telefone", label: "Com telefone" },
];

const MensageriaBacklogPage = () => {
  const [ordens, setOrdens] = useState([]);
  const [config, setConfig] = useState(DEFAULT_MENSAGERIA_CONFIG);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [templateId, setTemplateId] = useState("cancelamento");
  const [selectedIds, setSelectedIds] = useState([]);
  const [autoCities, setAutoCities] = useState([]);
  const [filters, setFilters] = useState({
    regional: ALL,
    cidade: ALL,
    idade: ALL,
    tentativa: ALL,
    busca: "",
  });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const activeTemplate =
    templates.find((template) => template.id === templateId) ||
    templates[0] ||
    DEFAULT_TEMPLATES[0];

  const regionais = useMemo(
    () =>
      [...new Set(ordens.map((item) => item.regional).filter(Boolean))].sort((a, b) =>
        String(a).localeCompare(String(b), "pt-BR"),
      ),
    [ordens],
  );

  const cidades = useMemo(() => {
    const base =
      filters.regional === ALL
        ? ordens
        : ordens.filter((item) => item.regional === filters.regional);
    return [...new Set(base.map((item) => item.cidade).filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b), "pt-BR"),
    );
  }, [filters.regional, ordens]);

  const filteredOrdens = useMemo(() => {
    const search = normalize(filters.busca);
    return ordens.filter((item) => {
      if (filters.regional !== ALL && item.regional !== filters.regional) return false;
      if (filters.cidade !== ALL && item.cidade !== filters.cidade) return false;
      if (filters.idade !== ALL && getAgeBucket(item) !== filters.idade) return false;
      if (filters.tentativa === "sem_tentativa" && Number(item.tentativas || 0) > 0) return false;
      if (filters.tentativa === "com_tentativa" && Number(item.tentativas || 0) === 0) return false;
      if (filters.tentativa === "na_fila" && !item.ja_esta_na_fila) return false;
      if (filters.tentativa === "com_telefone" && !item.telefone) return false;
      if (!search) return true;
      return normalize(
        `${item.cliente} ${item.os} ${item.cidade} ${item.regional} ${item.telefone}`,
      ).includes(search);
    });
  }, [filters, ordens]);

  const totalPages = Math.max(1, Math.ceil(filteredOrdens.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedOrdens = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredOrdens.slice(start, start + pageSize);
  }, [filteredOrdens, pageSize, safeCurrentPage]);

  const groupedOrdens = useMemo(() => {
    const groups = new Map();
    paginatedOrdens.forEach((item) => {
      const key = `${item.regional}||${item.cidade}`;
      const current = groups.get(key) || {
        regional: item.regional,
        cidade: item.cidade,
        items: [],
      };
      current.items.push(item);
      groups.set(key, current);
    });
    return [...groups.values()];
  }, [paginatedOrdens]);

  const selectedOrdens = useMemo(
    () => ordens.filter((item) => selectedSet.has(item.id)),
    [ordens, selectedSet],
  );

  const stats = useMemo(
    () => ({
      total: ordens.length,
      filtradas: filteredOrdens.length,
      selecionadas: selectedOrdens.length,
      semTentativa: filteredOrdens.filter((item) => Number(item.tentativas || 0) === 0).length,
      comTelefone: filteredOrdens.filter((item) => item.telefone).length,
    }),
    [filteredOrdens, ordens.length, selectedOrdens.length],
  );

  const previewItem = selectedOrdens[0] || filteredOrdens[0] || ordens[0];
  const previewMessage = previewItem
    ? replaceVariables(activeTemplate?.conteudo, previewItem)
    : "";
  const previewButtonMessage = previewItem
    ? replaceVariables(config.buttonMessage, previewItem)
    : "";
  const centralWhatsappPhone = String(CENTRAL_WHATSAPP_PHONE || "").replace(/\D/g, "");
  const centralWhatsappLink = `https://wa.me/${centralWhatsappPhone}?text=${encodeURIComponent(
    previewButtonMessage,
  )}`;

  const loadData = async (force = false) => {
    setLoading(true);
    setFeedback("");
    try {
      const [nextConfig, nextTemplates, nextBacklog] = await Promise.all([
        buscarConfigMensageria(),
        buscarTemplatesMensageria(),
        buscarBacklogMensageria({ force }),
      ]);
      setConfig(nextConfig);
      setAutoCities(Array.isArray(nextConfig.autoEnqueueCities) ? nextConfig.autoEnqueueCities : []);
      setTemplates(nextTemplates.length ? nextTemplates : DEFAULT_TEMPLATES);
      setTemplateId(nextConfig.activeTemplateId || nextTemplates[0]?.id || "cancelamento");
      setOrdens(nextBacklog);
      setSelectedIds((current) =>
        current.filter((id) => nextBacklog.some((item) => item.id === id)),
      );
    } catch (error) {
      setFeedback(error?.message || "Não foi possível carregar o backlog.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const updateFilter = (field, value) => {
    setFilters((current) => ({
      ...current,
      [field]: value,
      ...(field === "regional" ? { cidade: ALL } : null),
    }));
  };

  const toggleItem = (id) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const selectVisible = () => {
    setSelectedIds((current) => [
      ...new Set([...current, ...paginatedOrdens.map((item) => item.id)]),
    ]);
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const toggleAutoCity = (cidade) => {
    setAutoCities((current) =>
      current.includes(cidade)
        ? current.filter((item) => item !== cidade)
        : [...current, cidade],
    );
  };

  const saveAutoCities = async () => {
    setSending(true);
    setFeedback("");
    try {
      await salvarConfigMensageria({
        ...config,
        autoEnqueueMapDiff: true,
        autoEnqueueCities: autoCities,
      });
      setConfig((current) => ({ ...current, autoEnqueueMapDiff: true, autoEnqueueCities: autoCities }));
      setFeedback(
        autoCities.length
          ? `${autoCities.length} cidade(s) salvas para entrada autom?tica pelo mapa.`
          : "Regra salva: todas as cidades novas do mapa entram na fila.",
      );
    } catch (error) {
      setFeedback(error?.message || "N?o foi poss?vel salvar as cidades.");
    } finally {
      setSending(false);
    }
  };

  const handleSendToQueue = async () => {
    if (!selectedOrdens.length) {
      setFeedback("Selecione pelo menos uma O.S. para enviar à fila.");
      return;
    }

    setSending(true);
    setFeedback("");
    try {
      const result = await enviarBacklogParaFila(selectedOrdens, {
        templateId,
        status: "aprovado",
        requiredCentralButton: false,
        centralButtonText: CENTRAL_WHATSAPP_BUTTON_TEXT,
        centralButtonPhone: CENTRAL_WHATSAPP_PHONE,
        centralButtonMessage: config.buttonMessage,
      });
      setFeedback(
        `${result.created.length} cliente(s) enviados para a fila. Abra Mensageria > Fila para iniciar ou acompanhar os envios. ${result.skipped.length} já estavam na fila.`,
      );
      setSelectedIds([]);
      await loadData(true);
    } catch (error) {
      setFeedback(error?.message || "Não foi possível enviar o grupo para a fila.");
    } finally {
      setSending(false);
    }
  };

  const buildWhatsappLink = (item) => {
    const phone = String(item?.telefone || "").replace(/\D/g, "");
    if (!phone) return "";
    return `https://wa.me/${phone}?text=${encodeURIComponent(
      replaceVariables(activeTemplate?.conteudo, item),
    )}`;
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
          <RefreshCw size={18} className="animate-spin" />
          Carregando backlog de O.S. abertas...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <MessageCircle size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Backlog</h1>
            <p className="mt-1 text-sm text-slate-500">
              O.S. abertas importadas pelo XLSX do Mapa, agrupadas por regional e cidade para envio em massa.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadData(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw size={17} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={handleSendToQueue}
            disabled={sending || !selectedOrdens.length}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send size={17} />
            {sending ? "Enviando..." : "Enviar selecionados à fila"}
          </button>
        </div>
      </section>

      {feedback ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
          {feedback}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "O.S. abertas", value: stats.total },
          { label: "Filtradas", value: stats.filtradas },
          { label: "Selecionadas", value: stats.selecionadas },
          { label: "Sem tentativa", value: stats.semTentativa },
          { label: "Com telefone", value: stats.comTelefone },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{formatNumber(item.value)}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-slate-900">
          <Filter size={18} />
          <h2 className="text-lg font-bold">Filtros do grupo</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Regional</span>
            <select
              value={filters.regional}
              onChange={(event) => updateFilter("regional", event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value={ALL}>Todas</option>
              {regionais.map((regional) => (
                <option key={regional} value={regional}>{regional}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Cidade</span>
            <select
              value={filters.cidade}
              onChange={(event) => updateFilter("cidade", event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value={ALL}>Todas</option>
              {cidades.map((cidade) => (
                <option key={cidade} value={cidade}>{cidade}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Idade da O.S.</span>
            <select
              value={filters.idade}
              onChange={(event) => updateFilter("idade", event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {ageOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Tentativa</span>
            <select
              value={filters.tentativa}
              onChange={(event) => updateFilter("tentativa", event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {attemptOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block xl:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Buscar</span>
            <div className="relative mt-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
              <input
                value={filters.busca}
                onChange={(event) => updateFilter("busca", event.target.value)}
                placeholder="Cliente, O.S., cidade ou telefone"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-emerald-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Automação por cidades no próximo Mapa</h2>
            <p className="mt-1 text-sm text-slate-500">
              Quando subir um novo mapa, clientes novos das cidades marcadas entram automaticamente na fila. Sem cidade marcada, entram todas.
            </p>
          </div>
          <button
            type="button"
            onClick={saveAutoCities}
            disabled={sending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={16} />
            Salvar cidades
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {cidades.length ? cidades.map((cidade) => (
            <button
              key={cidade}
              type="button"
              onClick={() => toggleAutoCity(cidade)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                autoCities.includes(cidade)
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {cidade}
            </button>
          )) : (
            <span className="text-sm text-slate-500">Nenhuma cidade carregada no backlog atual.</span>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">O.S. por regional e cidade</h2>
              <p className="mt-1 text-sm text-slate-500">
                Selecione cidades inteiras ou clientes específicos para preparar o envio.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectVisible}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <CheckSquare size={16} />
                Selecionar página
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Square size={16} />
                Limpar
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-slate-600">
              Mostrando {formatNumber(paginatedOrdens.length)} de {formatNumber(filteredOrdens.length)} O.S. filtradas
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                Por página
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safeCurrentPage <= 1}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-sm font-semibold text-slate-600">
                Página {safeCurrentPage} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {groupedOrdens.length ? (
              groupedOrdens.map((group) => (
                <div key={`${group.regional}-${group.cidade}`} className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="flex flex-col gap-2 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{group.regional}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        {group.cidade} · {formatNumber(group.items.length)} O.S.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIds((current) => [
                          ...new Set([...current, ...group.items.map((item) => item.id)]),
                        ])
                      }
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-white"
                    >
                      Selecionar visíveis
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[860px] w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Sel.</th>
                          <th className="px-4 py-3">Cliente</th>
                          <th className="px-4 py-3">O.S.</th>
                          <th className="px-4 py-3">Abertura</th>
                          <th className="px-4 py-3">Tentativas</th>
                          <th className="px-4 py-3">Telefone</th>
                          <th className="px-4 py-3">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {group.items.map((item) => {
                          const whatsappLink = buildWhatsappLink(item);
                          return (
                            <tr key={item.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedSet.has(item.id)}
                                  onChange={() => toggleItem(item.id)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-900">{item.cliente}</p>
                                <p className="text-xs text-slate-500">{item.tipo}</p>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{item.os}</td>
                              <td className="px-4 py-3 text-slate-600">
                                {item.data_abertura_os || "Sem data"}
                                {Number.isFinite(Number(item.dias_aberta)) ? (
                                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                    <Clock size={12} />
                                    {item.dias_aberta}d
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {formatNumber(item.tentativas)}
                                {item.ja_esta_na_fila ? (
                                  <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                    Na fila
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{item.telefone || "Não informado"}</td>
                              <td className="px-4 py-3">
                                {whatsappLink ? (
                                  <a
                                    href={whatsappLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                                  >
                                    <MessageCircle size={13} />
                                    WhatsApp
                                  </a>
                                ) : (
                                  <span className="text-xs font-semibold text-slate-400">Sem telefone</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                Nenhuma O.S. encontrada com os filtros atuais.
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Modelo do envio</h2>
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-slate-700">Template</span>
              <select
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.nome}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 rounded-lg bg-[#e5ddd5] p-4">
              <div className="ml-auto max-w-[92%] rounded-lg bg-[#dcf8c6] px-4 py-3 text-sm leading-6 text-slate-900 shadow-sm">
                {previewMessage ? (
                  previewMessage.split("\n").map((line, index) => (
                    <p key={`${line}-${index}`} className={line ? "" : "h-3"}>
                      {line}
                    </p>
                  ))
                ) : (
                  <p>Selecione uma O.S. para visualizar a mensagem.</p>
                )}
                <a
                  href={centralWhatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white"
                >
                  <Phone size={15} />
                  {CENTRAL_WHATSAPP_BUTTON_TEXT}
                </a>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Preparação do grupo</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p><strong className="text-slate-900">{formatNumber(selectedOrdens.length)}</strong> cliente(s) selecionados.</p>
              <p>O envio em massa será registrado na fila da Mensageria para aprovação, retentativa e histórico.</p>
              <p>Quando a API chegar, este Backlog pode trocar a origem XLSX pela consulta automática sem mudar o fluxo da operação.</p>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
};

export default MensageriaBacklogPage;

