import {
	AlertCircle,
	Building2,
	CheckCircle2,
	MapPin,
	Pencil,
	Plus,
	RefreshCw,
	Save,
	Search,
	Settings,
	Trash2,
	Truck,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModalShell from "../../../components/ui/ModalShell";
import Spinner from "../../../components/ui/Spinner";
import { useAuthContext } from "../../../context/AuthContext";
import {
	buscarClientesLogistica,
	buscarCotacoesLogistica,
	buscarLogisticaConfig,
	buscarPontosLogistica,
	buscarSugestoesClientes,
	COTACAO_STATUS,
	criarPontosBasePorCidades,
	DEFAULT_COTACAO_FORM,
	DEFAULT_LOGISTICA_CONFIG,
	DEFAULT_PONTO_FORM,
	excluirCotacaoLogistica,
	excluirPontoLogistica,
	geocodificarEndereco,
	obterCidadesEmpresas,
	salvarCotacaoManual,
	salvarLogisticaConfig,
	salvarPontoLogistica,
	solicitarCotacaoLalamove,
} from "../services/logisticaService";

const PAGE_SIZES = [20, 30, 50, 100];

const inputClass =
	"w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const statusClass = {
	rascunho: "border-slate-200 bg-slate-50 text-slate-600",
	cotado: "border-blue-200 bg-blue-50 text-blue-700",
	aprovado: "border-emerald-200 bg-emerald-50 text-emerald-700",
	solicitado: "border-amber-200 bg-amber-50 text-amber-700",
	coletado: "border-indigo-200 bg-indigo-50 text-indigo-700",
	entregue: "border-green-200 bg-green-50 text-green-700",
	cancelado: "border-red-200 bg-red-50 text-red-700",
};

function normalize(value) {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function resolveCidadeRegional(cidades = [], value = "") {
	const key = normalize(value);
	if (!key) return null;

	const exact = cidades.find((item) => normalize(item.cidade) === key);
	if (exact) return exact;

	if (key.length < 3) return null;

	const matches = cidades.filter((item) => {
		const cidadeKey = normalize(item.cidade);
		return (
			cidadeKey.startsWith(key) ||
			cidadeKey.includes(key) ||
			key.includes(cidadeKey)
		);
	});

	return matches.length === 1 ? matches[0] : null;
}

function formatMoney(value) {
	return Number(value || 0).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	});
}

function Field({ label, children }) {
	return (
		<label className="block">
			<span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
				{label}
			</span>
			{children}
		</label>
	);
}

function StatusBadge({ status }) {
	const option = COTACAO_STATUS.find((item) => item.value === status);
	return (
		<span
			className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${statusClass[status] || statusClass.rascunho}`}
		>
			{option?.label || status || "-"}
		</span>
	);
}

// Extraido do componente (achado javascript:S3776, docs/SONARQUBE-MAP.md)
// pra reduzir a complexidade cognitiva da funcao de render — mesmo
// estado e mesmas chamadas, sem mudanca de comportamento.
function useLogisticaController() {
	const { currentUser } = useAuthContext();
	const [activeTab, setActiveTab] = useState("cotacoes");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [feedback, setFeedback] = useState("");
	const [feedbackType, setFeedbackType] = useState("info");
	const [search, setSearch] = useState("");
	const [pageSize, setPageSize] = useState(20);
	const [page, setPage] = useState(1);
	const [config, setConfig] = useState(DEFAULT_LOGISTICA_CONFIG);
	const [pontos, setPontos] = useState([]);
	const [cotacoes, setCotacoes] = useState([]);
	const [cidades, setCidades] = useState([]);
	const [clientes, setClientes] = useState([]);
	const [clienteBusca, setClienteBusca] = useState("");
	const [geocodingTarget, setGeocodingTarget] = useState("");
	const [cotacaoForm, setCotacaoForm] = useState(DEFAULT_COTACAO_FORM);
	const [pontoForm, setPontoForm] = useState(DEFAULT_PONTO_FORM);
	const [editingPonto, setEditingPonto] = useState(false);

	useEffect(() => {
		setPage(1);
	}, [search, pageSize, activeTab]);

	const filteredCotacoes = useMemo(() => {
		const text = normalize(search);
		if (!text) return cotacoes;
		return cotacoes.filter((item) =>
			normalize(
				[
					item.cliente,
					item.codigoCliente,
					item.telefone,
					item.os,
					item.cidade,
					item.regional,
					item.pontoNome,
					item.fornecedorNome,
					item.status,
				].join(" "),
			).includes(text),
		);
	}, [cotacoes, search]);

	const filteredPontos = useMemo(() => {
		const text = normalize(search);
		if (!text) return pontos;
		return pontos.filter((item) =>
			normalize(
				[
					item.nome,
					item.cidade,
					item.regional,
					item.endereco,
					item.bairro,
					item.contatoNome,
				].join(" "),
			).includes(text),
		);
	}, [pontos, search]);

	const list = activeTab === "pontos" ? filteredPontos : filteredCotacoes;
	const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
	const currentPage = Math.min(page, totalPages);
	const pageItems = list.slice(
		(currentPage - 1) * pageSize,
		currentPage * pageSize,
	);

	const stats = useMemo(
		() => ({
			cotacoes: cotacoes.length,
			solicitadas: cotacoes.filter((item) =>
				["solicitado", "coletado"].includes(item.status),
			).length,
			entregues: cotacoes.filter((item) => item.status === "entregue").length,
			pontosAtivos: pontos.filter((item) => item.ativo).length,
		}),
		[cotacoes, pontos],
	);

	const pontosDaCidade = useMemo(() => {
		const cidade = normalize(cotacaoForm.cidade);
		if (!cidade) return pontos.filter((item) => item.ativo);
		return pontos.filter(
			(item) => item.ativo && normalize(item.cidade) === cidade,
		);
	}, [cotacaoForm.cidade, pontos]);

	const sugestoesClientes = useMemo(
		() => buscarSugestoesClientes(clientes, clienteBusca),
		[clientes, clienteBusca],
	);

	const updateCotacao = (field, value) => {
		setCotacaoForm((current) => ({ ...current, [field]: value }));
	};

	const showFeedback = useCallback((message, type = "info") => {
		setFeedback(message || "");
		setFeedbackType(type);
	}, []);

	const clearFeedback = () => {
		setFeedback("");
		setFeedbackType("info");
	};

	const loadData = useCallback(async () => {
		setLoading(true);
		try {
			const [nextConfig, nextPontos, nextCotacoes, nextCidades, nextClientes] =
				await Promise.all([
					buscarLogisticaConfig(),
					buscarPontosLogistica(),
					buscarCotacoesLogistica(),
					obterCidadesEmpresas(),
					buscarClientesLogistica(),
				]);
			setConfig(nextConfig);
			setPontos(nextPontos);
			setCotacoes(nextCotacoes);
			setCidades(nextCidades);
			setClientes(nextClientes);
		} catch (error) {
			showFeedback(
				error?.message || "Não foi possível carregar a Logística.",
				"error",
			);
		} finally {
			setLoading(false);
		}
	}, [showFeedback]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const aplicarCliente = (cliente) => {
		setClienteBusca(
			`${cliente.codigoCliente || cliente.os || ""} ${cliente.cliente}`.trim(),
		);
		setCotacaoForm((current) => ({
			...current,
			cliente: cliente.cliente || current.cliente,
			codigoCliente: cliente.codigoCliente || current.codigoCliente,
			telefone: cliente.telefone || current.telefone,
			os: cliente.os || current.os,
			cidade: cliente.cidade || current.cidade,
			regional: cliente.regional || current.regional,
			enderecoColeta: cliente.enderecoColeta || current.enderecoColeta,
			numeroColeta: cliente.numeroColeta || current.numeroColeta,
			bairroColeta: cliente.bairroColeta || current.bairroColeta,
			complementoColeta: cliente.complementoColeta || current.complementoColeta,
		}));
	};

	const updatePonto = (field, value) => {
		setPontoForm((current) => {
			const next = { ...current, [field]: value };
			if (field === "cidade") {
				const cidade = resolveCidadeRegional(cidades, value);
				if (cidade?.regional) next.regional = cidade.regional;
			}
			return next;
		});
	};

	const preencherRegionalPonto = (cidadeValue = pontoForm.cidade) => {
		const cidade = resolveCidadeRegional(cidades, cidadeValue);
		if (!cidade?.regional) return;
		setPontoForm((current) => ({
			...current,
			cidade: cidade.cidade || current.cidade,
			regional: cidade.regional,
		}));
	};

	const handleGeocodeCotacao = async () => {
		if (!cotacaoForm.enderecoColeta || !cotacaoForm.cidade) return;
		setGeocodingTarget("cotacao");
		clearFeedback();
		try {
			const result = await geocodificarEndereco({
				endereco: cotacaoForm.enderecoColeta,
				numero: cotacaoForm.numeroColeta,
				bairro: cotacaoForm.bairroColeta,
				cidade: cotacaoForm.cidade,
			});
			setCotacaoForm((current) => ({
				...current,
				latColeta: result.lat,
				lngColeta: result.lng,
			}));
			showFeedback(
				`Coordenadas da coleta encontradas: ${result.lat}, ${result.lng}`,
				"success",
			);
		} catch (error) {
			showFeedback(
				error?.message ||
					"Não foi possível localizar as coordenadas da coleta.",
				"error",
			);
		} finally {
			setGeocodingTarget("");
		}
	};

	const handleGeocodePonto = async () => {
		if (!pontoForm.endereco || !pontoForm.cidade) return;
		setGeocodingTarget("ponto");
		clearFeedback();
		try {
			const result = await geocodificarEndereco({
				endereco: pontoForm.endereco,
				numero: pontoForm.numero,
				bairro: pontoForm.bairro,
				cidade: pontoForm.cidade,
			});
			setPontoForm((current) => ({
				...current,
				lat: result.lat,
				lng: result.lng,
			}));
			showFeedback(
				`Coordenadas do ponto encontradas: ${result.lat}, ${result.lng}`,
				"success",
			);
		} catch (error) {
			showFeedback(
				error?.message || "Não foi possível localizar as coordenadas do ponto.",
				"error",
			);
		} finally {
			setGeocodingTarget("");
		}
	};

	const handleSaveCotacao = async (event) => {
		event.preventDefault();
		setSaving(true);
		clearFeedback();
		try {
			await salvarCotacaoManual(cotacaoForm, pontos, config, currentUser);
			setCotacaoForm(DEFAULT_COTACAO_FORM);
			showFeedback("Cotação manual salva com sucesso.", "success");
			await loadData();
		} catch (error) {
			showFeedback(
				error?.message || "Não foi possível salvar a cotação.",
				"error",
			);
		} finally {
			setSaving(false);
		}
	};

	const handleLalamoveQuote = async () => {
		setSaving(true);
		clearFeedback();
		try {
			const quote = await solicitarCotacaoLalamove(cotacaoForm, pontos);
			setCotacaoForm((current) => ({
				...current,
				fornecedor: "lalamove",
				valorEstimado: quote.price || current.valorEstimado,
				distanciaKm: quote.distance || current.distanciaKm,
				prazoEstimado: quote.expiresAt
					? `Expira em ${formatDate(quote.expiresAt)}`
					: current.prazoEstimado,
				status: "cotado",
				origem: "lalamove",
				apiPayload: quote.raw || quote,
				lalamoveQuotationId: quote.quotationId || "",
			}));
			showFeedback(
				quote.quotationId
					? `Cotação Lalamove gerada: ${quote.quotationId}. Confira os dados e salve.`
					: "Cotação Lalamove gerada. Confira os dados e salve.",
				"success",
			);
		} catch (error) {
			showFeedback(
				error?.message || "Não foi possível cotar na Lalamove.",
				"error",
			);
		} finally {
			setSaving(false);
		}
	};

	const handleSavePonto = async (event) => {
		event.preventDefault();
		setSaving(true);
		clearFeedback();
		try {
			await salvarPontoLogistica(pontoForm);
			setPontoForm(DEFAULT_PONTO_FORM);
			setEditingPonto(false);
			showFeedback("Ponto estratégico salvo com sucesso.", "success");
			await loadData();
		} catch (error) {
			showFeedback(
				error?.message || "Não foi possível salvar o ponto.",
				"error",
			);
		} finally {
			setSaving(false);
		}
	};

	const handleDeletePonto = async (id) => {
		if (!window.confirm("Excluir este ponto estratégico?")) return;
		await excluirPontoLogistica(id);
		await loadData();
	};

	const handleDeleteCotacao = async (id) => {
		if (!window.confirm("Excluir esta cotação?")) return;
		await excluirCotacaoLogistica(id);
		await loadData();
	};

	const handleCreateBasePoints = async () => {
		setSaving(true);
		clearFeedback();
		try {
			const created = await criarPontosBasePorCidades(cidades, pontos);
			showFeedback(
				created
					? `${created} ponto(s) base criado(s). Complete os endereços antes de usar.`
					: "Todas as cidades já possuem ponto base cadastrado.",
				"success",
			);
			await loadData();
		} catch (error) {
			showFeedback(
				error?.message || "Não foi possível criar pontos base.",
				"error",
			);
		} finally {
			setSaving(false);
		}
	};

	const handleSaveConfig = async () => {
		setSaving(true);
		clearFeedback();
		try {
			await salvarLogisticaConfig(config);
			showFeedback("Configuração de Logística salva.", "success");
			await loadData();
		} catch (error) {
			showFeedback(
				error?.message || "Não foi possível salvar a configuração.",
				"error",
			);
		} finally {
			setSaving(false);
		}
	};

	const updateProvider = (providerId, field, value) => {
		setConfig((current) => ({
			...current,
			providers: (current.providers || []).map((provider) =>
				provider.id === providerId ? { ...provider, [field]: value } : provider,
			),
		}));
	};

	return {
		activeTab,
		setActiveTab,
		loading,
		saving,
		feedback,
		feedbackType,
		search,
		setSearch,
		pageSize,
		setPageSize,
		page,
		setPage,
		config,
		setConfig,
		pontos,
		cotacoes,
		cidades,
		clientes,
		clienteBusca,
		setClienteBusca,
		geocodingTarget,
		cotacaoForm,
		setCotacaoForm,
		pontoForm,
		setPontoForm,
		editingPonto,
		setEditingPonto,
		filteredCotacoes,
		filteredPontos,
		list,
		totalPages,
		currentPage,
		pageItems,
		stats,
		pontosDaCidade,
		sugestoesClientes,
		updateCotacao,
		showFeedback,
		clearFeedback,
		loadData,
		aplicarCliente,
		updatePonto,
		preencherRegionalPonto,
		handleGeocodeCotacao,
		handleGeocodePonto,
		handleSaveCotacao,
		handleLalamoveQuote,
		handleSavePonto,
		handleDeletePonto,
		handleDeleteCotacao,
		handleCreateBasePoints,
		handleSaveConfig,
		updateProvider,
	};
}

// Extraido de LogisticaPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — aba "Cotações" inteira (formulario + tabela),
// mesma JSX/logica de antes.
function LogisticaCotacoesTab({
	clienteBusca,
	setClienteBusca,
	sugestoesClientes,
	aplicarCliente,
	cotacaoForm,
	updateCotacao,
	handleGeocodeCotacao,
	geocodingTarget,
	pontosDaCidade,
	config,
	handleLalamoveQuote,
	saving,
	handleSaveCotacao,
	search,
	setSearch,
	pageSize,
	setPageSize,
	pageItems,
	handleDeleteCotacao,
	currentPage,
	totalPages,
	list,
	setPage,
}) {
	return (
		<section className="grid gap-6 xl:grid-cols-[420px_1fr]">
			<form
				onSubmit={handleSaveCotacao}
				className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
			>
				<div className="mb-4 flex items-center gap-2">
					<Plus size={18} className="text-blue-600" />
					<h2 className="text-lg font-black text-slate-950">
						Nova cotação manual
					</h2>
				</div>
				<div className="grid gap-3">
					<Field label="Buscar cliente do mapa">
						<div className="relative">
							<input
								className={inputClass}
								value={clienteBusca}
								onChange={(event) => setClienteBusca(event.target.value)}
								placeholder="Digite primeiro nome, código do cliente ou O.S."
							/>
							{sugestoesClientes.length ? (
								<div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl">
									{sugestoesClientes.map((cliente) => (
										<button
											key={cliente.id}
											type="button"
											onClick={() => aplicarCliente(cliente)}
											className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-blue-50"
										>
											<span className="block font-black text-slate-900">
												{cliente.cliente}
											</span>
											<span className="block text-xs font-semibold text-slate-500">
												{cliente.codigoCliente || "Sem código"} ·{" "}
												{cliente.os || "Sem O.S."} · {cliente.cidade || "Sem cidade"}
											</span>
										</button>
									))}
								</div>
							) : null}
						</div>
					</Field>
					<Field label="Cliente">
						<input
							className={inputClass}
							value={cotacaoForm.cliente}
							onChange={(event) => updateCotacao("cliente", event.target.value)}
						/>
					</Field>
					<div className="grid gap-3 md:grid-cols-2">
						<Field label="Código do cliente">
							<input
								className={inputClass}
								value={cotacaoForm.codigoCliente}
								onChange={(event) =>
									updateCotacao("codigoCliente", event.target.value)
								}
							/>
						</Field>
						<Field label="O.S.">
							<input
								className={inputClass}
								value={cotacaoForm.os}
								onChange={(event) => updateCotacao("os", event.target.value)}
							/>
						</Field>
					</div>
					<Field label="Telefone">
						<input
							className={inputClass}
							value={cotacaoForm.telefone}
							onChange={(event) => updateCotacao("telefone", event.target.value)}
						/>
					</Field>
					<div className="grid gap-3 md:grid-cols-2">
						<Field label="Cidade">
							<input
								list="logistica-cidades"
								className={inputClass}
								value={cotacaoForm.cidade}
								onChange={(event) => updateCotacao("cidade", event.target.value)}
								onBlur={handleGeocodeCotacao}
							/>
						</Field>
						<Field label="Regional">
							<input
								className={inputClass}
								value={cotacaoForm.regional}
								onChange={(event) =>
									updateCotacao("regional", event.target.value)
								}
							/>
						</Field>
					</div>
					<Field label="Endereço de coleta">
						<input
							className={inputClass}
							value={cotacaoForm.enderecoColeta}
							onChange={(event) =>
								updateCotacao("enderecoColeta", event.target.value)
							}
							onBlur={handleGeocodeCotacao}
						/>
					</Field>
					<button
						type="button"
						onClick={handleGeocodeCotacao}
						disabled={
							geocodingTarget === "cotacao" ||
							!cotacaoForm.enderecoColeta ||
							!cotacaoForm.cidade
						}
						className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100 disabled:opacity-60"
					>
						<MapPin size={14} />
						{geocodingTarget === "cotacao"
							? "Buscando coordenadas..."
							: "Buscar coordenadas da coleta"}
					</button>
					<div className="grid gap-3 md:grid-cols-2">
						<Field label="Latitude da coleta">
							<input
								className={inputClass}
								value={cotacaoForm.latColeta || ""}
								onChange={(event) =>
									updateCotacao("latColeta", event.target.value)
								}
								placeholder="-19.9208"
							/>
						</Field>
						<Field label="Longitude da coleta">
							<input
								className={inputClass}
								value={cotacaoForm.lngColeta || ""}
								onChange={(event) =>
									updateCotacao("lngColeta", event.target.value)
								}
								placeholder="-43.9378"
							/>
						</Field>
					</div>
					<div className="grid gap-3 md:grid-cols-3">
						<Field label="Número">
							<input
								className={inputClass}
								value={cotacaoForm.numeroColeta}
								onChange={(event) =>
									updateCotacao("numeroColeta", event.target.value)
								}
							/>
						</Field>
						<Field label="Bairro">
							<input
								className={inputClass}
								value={cotacaoForm.bairroColeta}
								onChange={(event) =>
									updateCotacao("bairroColeta", event.target.value)
								}
							/>
						</Field>
						<Field label="Compl.">
							<input
								className={inputClass}
								value={cotacaoForm.complementoColeta}
								onChange={(event) =>
									updateCotacao("complementoColeta", event.target.value)
								}
							/>
						</Field>
					</div>
					<Field label="Ponto estratégico">
						<select
							className={inputClass}
							value={cotacaoForm.pontoId}
							onChange={(event) => updateCotacao("pontoId", event.target.value)}
						>
							<option value="">Selecione</option>
							{pontosDaCidade.map((ponto) => (
								<option key={ponto.id} value={ponto.id}>
									{ponto.cidade} - {ponto.nome}
								</option>
							))}
						</select>
					</Field>
					<div className="grid gap-3 md:grid-cols-2">
						<Field label="Fornecedor">
							<select
								className={inputClass}
								value={cotacaoForm.fornecedor}
								onChange={(event) =>
									updateCotacao("fornecedor", event.target.value)
								}
							>
								{(config.providers || []).map((provider) => (
									<option key={provider.id} value={provider.id}>
										{provider.nome}
										{provider.tipo === "api" && !provider.ativo
											? " (em preparação)"
											: ""}
									</option>
								))}
							</select>
						</Field>
						<Field label="Veículo">
							<select
								className={inputClass}
								value={cotacaoForm.veiculo}
								onChange={(event) =>
									updateCotacao("veiculo", event.target.value)
								}
							>
								<option>Moto</option>
								<option>Carro</option>
								<option>Utilitário</option>
								<option>Outro</option>
							</select>
						</Field>
					</div>
					<div className="grid gap-3 md:grid-cols-3">
						<Field label="Valor">
							<input
								className={inputClass}
								value={cotacaoForm.valorEstimado}
								onChange={(event) =>
									updateCotacao("valorEstimado", event.target.value)
								}
								placeholder="R$ 0,00"
							/>
						</Field>
						<Field label="Prazo">
							<input
								className={inputClass}
								value={cotacaoForm.prazoEstimado}
								onChange={(event) =>
									updateCotacao("prazoEstimado", event.target.value)
								}
								placeholder="Ex: 45 min"
							/>
						</Field>
						<Field label="Distância">
							<input
								className={inputClass}
								value={cotacaoForm.distanciaKm}
								onChange={(event) =>
									updateCotacao("distanciaKm", event.target.value)
								}
								placeholder="Ex: 8,4 km"
							/>
						</Field>
					</div>
					<Field label="Status">
						<select
							className={inputClass}
							value={cotacaoForm.status}
							onChange={(event) => updateCotacao("status", event.target.value)}
						>
							{COTACAO_STATUS.map((status) => (
								<option key={status.value} value={status.value}>
									{status.label}
								</option>
							))}
						</select>
					</Field>
					<Field label="Observações">
						<textarea
							className={inputClass}
							rows={3}
							value={cotacaoForm.observacoes}
							onChange={(event) =>
								updateCotacao("observacoes", event.target.value)
							}
						/>
					</Field>
					{cotacaoForm.fornecedor === "lalamove" ? (
						<button
							type="button"
							onClick={handleLalamoveQuote}
							disabled={saving}
							className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-black text-orange-700 hover:bg-orange-100 disabled:opacity-60"
						>
							<Truck size={16} />
							Cotar Lalamove
						</button>
					) : null}
					<button
						type="submit"
						disabled={saving}
						className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
					>
						<Save size={16} />
						Salvar cotação
					</button>
				</div>
			</form>

			<div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<ListToolbar
					search={search}
					setSearch={setSearch}
					pageSize={pageSize}
					setPageSize={setPageSize}
				/>
				<div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
					<table className="min-w-[860px] w-full divide-y divide-slate-200 text-sm">
						<thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
							<tr>
								<th className="px-4 py-3">Cliente</th>
								<th className="px-4 py-3">Origem/Destino</th>
								<th className="px-4 py-3">Fornecedor</th>
								<th className="px-4 py-3">Valor</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">Data</th>
								<th className="px-4 py-3">Ações</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 bg-white">
							{pageItems.map((item) => (
								<tr key={item.id} className="hover:bg-slate-50">
									<td className="px-4 py-3">
										<p className="font-black text-slate-950">{item.cliente}</p>
										<p className="text-xs text-slate-500">
											{item.codigoCliente || "-"} · {item.os || "Sem O.S."}
										</p>
									</td>
									<td className="px-4 py-3">
										<p className="font-semibold text-slate-700">
											{item.cidade}
										</p>
										<p className="text-xs text-slate-500">
											Para: {item.pontoNome || "-"}
										</p>
									</td>
									<td className="px-4 py-3 text-slate-600">
										{item.fornecedorNome || item.fornecedor}
									</td>
									<td className="px-4 py-3 font-black text-slate-900">
										{formatMoney(item.valorEstimado)}
									</td>
									<td className="px-4 py-3">
										<StatusBadge status={item.status} />
									</td>
									<td className="px-4 py-3 text-slate-500">
										{formatDate(item.criadoEm)}
									</td>
									<td className="px-4 py-3">
										<button
											type="button"
											onClick={() => handleDeleteCotacao(item.id)}
											className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
										>
											<Trash2 size={15} />
										</button>
									</td>
								</tr>
							))}
							{!pageItems.length ? (
								<EmptyRow colSpan={7} label="Nenhuma cotação encontrada." />
							) : null}
						</tbody>
					</table>
				</div>
				<Pagination
					currentPage={currentPage}
					totalPages={totalPages}
					pageItems={pageItems}
					total={list.length}
					pageSize={pageSize}
					setPage={setPage}
				/>
			</div>
		</section>
	);
}

// Extraido de LogisticaPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — aba "Pontos estratégicos" inteira (formulario
// + lista), mesma JSX/logica de antes.
function LogisticaPontosTab({
	handleSavePonto,
	editingPonto,
	setEditingPonto,
	setPontoForm,
	pontoForm,
	updatePonto,
	preencherRegionalPonto,
	handleGeocodePonto,
	geocodingTarget,
	saving,
	handleCreateBasePoints,
	cidades,
	search,
	setSearch,
	pageSize,
	setPageSize,
	pageItems,
	handleDeletePonto,
	currentPage,
	totalPages,
	list,
	setPage,
}) {
	return (
		<section className="grid gap-6 xl:grid-cols-[420px_1fr]">
			<form
				onSubmit={handleSavePonto}
				className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
			>
				<div className="mb-4 flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<MapPin size={18} className="text-blue-600" />
						<h2 className="text-lg font-black text-slate-950">
							{editingPonto ? "Editar ponto" : "Novo ponto"}
						</h2>
					</div>
					{editingPonto ? (
						<button
							type="button"
							onClick={() => {
								setEditingPonto(false);
								setPontoForm(DEFAULT_PONTO_FORM);
							}}
							className="rounded-lg border border-slate-200 p-2 text-slate-500"
						>
							<X size={16} />
						</button>
					) : null}
				</div>
				<div className="grid gap-3">
					<Field label="Nome do ponto">
						<input
							className={inputClass}
							value={pontoForm.nome}
							onChange={(event) => updatePonto("nome", event.target.value)}
						/>
					</Field>
					<div className="grid gap-3 md:grid-cols-2">
						<Field label="Cidade">
							<input
								list="logistica-cidades"
								className={inputClass}
								value={pontoForm.cidade}
								onChange={(event) => updatePonto("cidade", event.target.value)}
								onBlur={(event) => {
									preencherRegionalPonto(event.target.value);
									handleGeocodePonto();
								}}
							/>
						</Field>
						<Field label="Regional">
							<input
								className={inputClass}
								value={pontoForm.regional}
								onChange={(event) =>
									updatePonto("regional", event.target.value)
								}
							/>
						</Field>
					</div>
					<Field label="Endereço">
						<input
							className={inputClass}
							value={pontoForm.endereco}
							onChange={(event) => updatePonto("endereco", event.target.value)}
							onBlur={handleGeocodePonto}
						/>
					</Field>
					<button
						type="button"
						onClick={handleGeocodePonto}
						disabled={
							geocodingTarget === "ponto" ||
							!pontoForm.endereco ||
							!pontoForm.cidade
						}
						className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100 disabled:opacity-60"
					>
						<MapPin size={14} />
						{geocodingTarget === "ponto"
							? "Buscando coordenadas..."
							: "Buscar coordenadas do ponto"}
					</button>
					<div className="grid gap-3 md:grid-cols-2">
						<Field label="Latitude do ponto">
							<input
								className={inputClass}
								value={pontoForm.lat || ""}
								onChange={(event) => updatePonto("lat", event.target.value)}
								placeholder="-19.9208"
							/>
						</Field>
						<Field label="Longitude do ponto">
							<input
								className={inputClass}
								value={pontoForm.lng || ""}
								onChange={(event) => updatePonto("lng", event.target.value)}
								placeholder="-43.9378"
							/>
						</Field>
					</div>
					<div className="grid gap-3 md:grid-cols-3">
						<Field label="Número">
							<input
								className={inputClass}
								value={pontoForm.numero}
								onChange={(event) => updatePonto("numero", event.target.value)}
								onBlur={handleGeocodePonto}
							/>
						</Field>
						<Field label="Bairro">
							<input
								className={inputClass}
								value={pontoForm.bairro}
								onChange={(event) => updatePonto("bairro", event.target.value)}
								onBlur={handleGeocodePonto}
							/>
						</Field>
						<Field label="Complemento">
							<input
								className={inputClass}
								value={pontoForm.complemento}
								onChange={(event) =>
									updatePonto("complemento", event.target.value)
								}
							/>
						</Field>
					</div>
					<Field label="Referência">
						<input
							className={inputClass}
							value={pontoForm.referencia}
							onChange={(event) =>
								updatePonto("referencia", event.target.value)
							}
						/>
					</Field>
					<div className="grid gap-3 md:grid-cols-2">
						<Field label="Contato">
							<input
								className={inputClass}
								value={pontoForm.contatoNome}
								onChange={(event) =>
									updatePonto("contatoNome", event.target.value)
								}
							/>
						</Field>
						<Field label="Telefone">
							<input
								className={inputClass}
								value={pontoForm.contatoTelefone}
								onChange={(event) =>
									updatePonto("contatoTelefone", event.target.value)
								}
							/>
						</Field>
					</div>
					<label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
						<input
							type="checkbox"
							checked={pontoForm.ativo !== false}
							onChange={(event) => updatePonto("ativo", event.target.checked)}
						/>
						Ponto ativo
					</label>
					<button
						type="submit"
						disabled={saving}
						className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
					>
						<Save size={16} />
						Salvar ponto
					</button>
					<button
						type="button"
						onClick={handleCreateBasePoints}
						disabled={saving || !cidades.length}
						className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 px-4 py-3 text-sm font-black text-blue-700 hover:bg-blue-50 disabled:opacity-60"
					>
						<Building2 size={16} />
						Criar base pelas cidades
					</button>
				</div>
			</form>
			<div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<ListToolbar
					search={search}
					setSearch={setSearch}
					pageSize={pageSize}
					setPageSize={setPageSize}
				/>
				<div className="mt-4 grid gap-3">
					{pageItems.map((ponto) => (
						<div key={ponto.id} className="rounded-lg border border-slate-200 p-4">
							<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
								<div>
									<p className="text-lg font-black text-slate-950">
										{ponto.nome}
									</p>
									<p className="text-sm font-semibold text-slate-600">
										{ponto.cidade} · {ponto.regional || "Sem regional"}
									</p>
									<p className="mt-2 text-sm text-slate-500">
										{[
											ponto.endereco,
											ponto.numero,
											ponto.bairro,
											ponto.complemento,
										]
											.filter(Boolean)
											.join(", ") || "Endereço não preenchido"}
									</p>
									<p className="mt-1 text-xs text-slate-400">
										{ponto.referencia || "-"}
									</p>
								</div>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => {
											setPontoForm(ponto);
											setEditingPonto(true);
										}}
										className="rounded-lg border border-blue-200 p-2 text-blue-700 hover:bg-blue-50"
									>
										<Pencil size={15} />
									</button>
									<button
										type="button"
										onClick={() => handleDeletePonto(ponto.id)}
										className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
									>
										<Trash2 size={15} />
									</button>
								</div>
							</div>
						</div>
					))}
					{!pageItems.length ? (
						<div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">
							Nenhum ponto estratégico encontrado.
						</div>
					) : null}
				</div>
				<Pagination
					currentPage={currentPage}
					totalPages={totalPages}
					pageItems={pageItems}
					total={list.length}
					pageSize={pageSize}
					setPage={setPage}
				/>
			</div>
		</section>
	);
}

// Extraido de LogisticaPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — aba "Configuração" inteira, mesma
// JSX/logica de antes.
function LogisticaConfigTab({
	config,
	updateProvider,
	setConfig,
	handleSaveConfig,
	saving,
}) {
	return (
		<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
			<div className="mb-4 flex items-center gap-2">
				<Settings size={18} className="text-blue-600" />
				<h2 className="text-lg font-black text-slate-950">
					Fornecedores e regras
				</h2>
			</div>
			<div className="grid gap-4">
				{(config.providers || []).map((provider) => (
					<div key={provider.id} className="rounded-lg border border-slate-200 p-4">
						<div className="grid gap-3 lg:grid-cols-[1.2fr_120px_120px_1fr]">
							<Field label="Fornecedor">
								<input
									className={inputClass}
									value={provider.nome}
									onChange={(event) =>
										updateProvider(provider.id, "nome", event.target.value)
									}
								/>
							</Field>
							<Field label="Tipo">
								<input className={inputClass} value={provider.tipo} disabled />
							</Field>
							<Field label="Ativo">
								<select
									className={inputClass}
									value={provider.ativo ? "sim" : "nao"}
									onChange={(event) =>
										updateProvider(
											provider.id,
											"ativo",
											event.target.value === "sim",
										)
									}
								>
									<option value="sim">Sim</option>
									<option value="nao">Não</option>
								</select>
							</Field>
							<Field label="Referência de credencial">
								<input
									className={inputClass}
									value={provider.credentialRef || ""}
									onChange={(event) =>
										updateProvider(
											provider.id,
											"credentialRef",
											event.target.value,
										)
									}
									placeholder="Ex: integração cadastrada / env"
								/>
							</Field>
						</div>
					</div>
				))}
				<div className="grid gap-3 md:grid-cols-3">
					<Field label="Fornecedor preferencial">
						<select
							className={inputClass}
							value={config.providerPreferencial}
							onChange={(event) =>
								setConfig((current) => ({
									...current,
									providerPreferencial: event.target.value,
								}))
							}
						>
							{(config.providers || []).map((provider) => (
								<option key={provider.id} value={provider.id}>
									{provider.nome}
								</option>
							))}
						</select>
					</Field>
					<Field label="Cotação por API">
						<select
							className={inputClass}
							value={config.cotacaoAutomaticaAtiva ? "sim" : "nao"}
							onChange={(event) =>
								setConfig((current) => ({
									...current,
									cotacaoAutomaticaAtiva: event.target.value === "sim",
								}))
							}
						>
							<option value="nao">Desativada</option>
							<option value="sim">Ativada</option>
						</select>
					</Field>
					<Field label="Aprovação antes do pedido">
						<select
							className={inputClass}
							value={config.exigeAprovacaoAntesPedido ? "sim" : "nao"}
							onChange={(event) =>
								setConfig((current) => ({
									...current,
									exigeAprovacaoAntesPedido: event.target.value === "sim",
								}))
							}
						>
							<option value="sim">Obrigatória</option>
							<option value="nao">Não obrigatória</option>
						</select>
					</Field>
				</div>
				<Field label="Observações">
					<textarea
						className={inputClass}
						rows={3}
						value={config.observacoes || ""}
						onChange={(event) =>
							setConfig((current) => ({
								...current,
								observacoes: event.target.value,
							}))
						}
					/>
				</Field>
				<button
					type="button"
					onClick={handleSaveConfig}
					disabled={saving}
					className="inline-flex w-fit items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
				>
					<Save size={16} />
					Salvar configuração
				</button>
			</div>
		</section>
	);
}

const LogisticaPage = () => {
	const {
		activeTab,
		setActiveTab,
		loading,
		saving,
		feedback,
		feedbackType,
		search,
		setSearch,
		pageSize,
		setPageSize,
		setPage,
		config,
		setConfig,
		cidades,
		clienteBusca,
		setClienteBusca,
		geocodingTarget,
		cotacaoForm,
		pontoForm,
		setPontoForm,
		editingPonto,
		setEditingPonto,
		list,
		totalPages,
		currentPage,
		pageItems,
		stats,
		pontosDaCidade,
		sugestoesClientes,
		updateCotacao,
		clearFeedback,
		loadData,
		aplicarCliente,
		updatePonto,
		preencherRegionalPonto,
		handleGeocodeCotacao,
		handleGeocodePonto,
		handleSaveCotacao,
		handleLalamoveQuote,
		handleSavePonto,
		handleDeletePonto,
		handleDeleteCotacao,
		handleCreateBasePoints,
		handleSaveConfig,
		updateProvider,
	} = useLogisticaController();

	if (loading)
		return <Spinner fullScreen={false} label="Carregando Logística..." />;

	return (
		<div className="space-y-6">
			{feedback ? (
				<ModalShell
					onClose={clearFeedback}
					showClose={false}
					size="md"
					bodyClassName="p-0"
				>
					<div className="p-6">
						<div className="flex items-start gap-3">
							<span
								className={`rounded-lg p-2 ${
									feedbackType === "error"
										? "bg-red-50 text-red-600"
										: feedbackType === "success"
											? "bg-emerald-50 text-emerald-600"
											: "bg-blue-50 text-blue-600"
								}`}
							>
								{feedbackType === "error" ? (
									<AlertCircle size={22} />
								) : (
									<CheckCircle2 size={22} />
								)}
							</span>
							<div className="min-w-0 flex-1">
								<h2 className="text-lg font-black text-slate-950">
									{feedbackType === "error" ? "Atenção" : "Tudo certo"}
								</h2>
								<p className="mt-2 whitespace-pre-line break-words text-sm font-semibold leading-6 text-slate-600">
									{feedback}
								</p>
							</div>
						</div>
						<div className="mt-5 flex justify-end">
							<button
								type="button"
								onClick={clearFeedback}
								className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-5 py-2 text-sm font-black text-white hover:bg-blue-700"
							>
								OK
							</button>
						</div>
					</div>
				</ModalShell>
			) : null}

			<section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-center gap-3">
						<span className="rounded-lg bg-blue-50 p-3 text-blue-600">
							<Truck size={24} />
						</span>
						<div>
							<p className="text-xs font-black uppercase tracking-wide text-blue-600">
								Logística sob demanda
							</p>
							<h1 className="text-2xl font-black text-slate-950">
								Cotações e pontos estratégicos
							</h1>
							<p className="text-sm text-slate-500">
								Prepare coletas por cidade, compare fornecedores e registre
								cotações manuais antes de integrar APIs.
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={loadData}
						className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
					>
						<RefreshCw size={16} />
						Atualizar
					</button>
				</div>
			</section>

			<section className="grid gap-4 md:grid-cols-4">
				{[
					{
						label: "Cotações",
						value: stats.cotacoes,
						icon: Truck,
						tone: "border-blue-200 bg-blue-50 text-blue-700",
					},
					{
						label: "Solicitadas",
						value: stats.solicitadas,
						icon: AlertCircle,
						tone: "border-amber-200 bg-amber-50 text-amber-700",
					},
					{
						label: "Entregues",
						value: stats.entregues,
						icon: CheckCircle2,
						tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
					},
					{
						label: "Pontos ativos",
						value: stats.pontosAtivos,
						icon: MapPin,
						tone: "border-indigo-200 bg-indigo-50 text-indigo-700",
					},
				].map((card) => {
					const Icon = card.icon;
					return (
						<div
							key={card.label}
							className={`rounded-lg border p-5 shadow-sm ${card.tone}`}
						>
							<div className="flex items-center justify-between">
								<p className="text-xs font-black uppercase tracking-wide">
									{card.label}
								</p>
								<Icon size={18} />
							</div>
							<p className="mt-3 text-3xl font-black">
								{card.value.toLocaleString("pt-BR")}
							</p>
						</div>
					);
				})}
			</section>

			<section className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
				<div className="flex flex-wrap gap-2">
					{[
						{ id: "cotacoes", label: "Cotações" },
						{ id: "pontos", label: "Pontos estratégicos" },
						{ id: "config", label: "Configuração" },
					].map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={`rounded-lg px-4 py-2 text-sm font-black transition ${
								activeTab === tab.id
									? "bg-blue-600 text-white shadow-sm"
									: "text-slate-600 hover:bg-slate-100"
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>
			</section>

			{activeTab === "cotacoes" ? (
				<LogisticaCotacoesTab
					clienteBusca={clienteBusca}
					setClienteBusca={setClienteBusca}
					sugestoesClientes={sugestoesClientes}
					aplicarCliente={aplicarCliente}
					cotacaoForm={cotacaoForm}
					updateCotacao={updateCotacao}
					handleGeocodeCotacao={handleGeocodeCotacao}
					geocodingTarget={geocodingTarget}
					pontosDaCidade={pontosDaCidade}
					config={config}
					handleLalamoveQuote={handleLalamoveQuote}
					saving={saving}
					handleSaveCotacao={handleSaveCotacao}
					search={search}
					setSearch={setSearch}
					pageSize={pageSize}
					setPageSize={setPageSize}
					pageItems={pageItems}
					handleDeleteCotacao={handleDeleteCotacao}
					currentPage={currentPage}
					totalPages={totalPages}
					list={list}
					setPage={setPage}
				/>
			) : null}

			{activeTab === "pontos" ? (
				<LogisticaPontosTab
					handleSavePonto={handleSavePonto}
					editingPonto={editingPonto}
					setEditingPonto={setEditingPonto}
					setPontoForm={setPontoForm}
					pontoForm={pontoForm}
					updatePonto={updatePonto}
					preencherRegionalPonto={preencherRegionalPonto}
					handleGeocodePonto={handleGeocodePonto}
					geocodingTarget={geocodingTarget}
					saving={saving}
					handleCreateBasePoints={handleCreateBasePoints}
					cidades={cidades}
					search={search}
					setSearch={setSearch}
					pageSize={pageSize}
					setPageSize={setPageSize}
					pageItems={pageItems}
					handleDeletePonto={handleDeletePonto}
					currentPage={currentPage}
					totalPages={totalPages}
					list={list}
					setPage={setPage}
				/>
			) : null}

			{activeTab === "config" ? (
				<LogisticaConfigTab
					config={config}
					updateProvider={updateProvider}
					setConfig={setConfig}
					handleSaveConfig={handleSaveConfig}
					saving={saving}
				/>
			) : null}

			<datalist id="logistica-cidades">
				{cidades.map((item) => (
					<option key={item.cidade} value={item.cidade} />
				))}
			</datalist>
		</div>
	);
};

function ListToolbar({ search, setSearch, pageSize, setPageSize }) {
	return (
		<div className="grid gap-3 md:grid-cols-[1fr_160px]">
			<label className="relative block">
				<Search
					className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
					size={17}
				/>
				<input
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Buscar por cliente, cidade, ponto, fornecedor ou status"
					className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm font-semibold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
				/>
			</label>
			<select
				value={pageSize}
				onChange={(event) => setPageSize(Number(event.target.value))}
				className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
			>
				{PAGE_SIZES.map((size) => (
					<option key={size} value={size}>
						{size} por página
					</option>
				))}
			</select>
		</div>
	);
}

function EmptyRow({ colSpan, label }) {
	return (
		<tr>
			<td
				colSpan={colSpan}
				className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
			>
				{label}
			</td>
		</tr>
	);
}

function Pagination({
	currentPage,
	totalPages,
	pageItems,
	total,
	pageSize,
	setPage,
}) {
	return (
		<div className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
			<span>
				Mostrando {pageItems.length ? (currentPage - 1) * pageSize + 1 : 0} a{" "}
				{Math.min(currentPage * pageSize, total)} de {total} registro(s)
			</span>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={() => setPage((current) => Math.max(1, current - 1))}
					disabled={currentPage <= 1}
					className="rounded-lg border border-slate-300 px-3 py-2 font-bold disabled:opacity-50"
				>
					Anterior
				</button>
				<span className="font-bold text-slate-800">
					Página {currentPage} de {totalPages}
				</span>
				<button
					type="button"
					onClick={() =>
						setPage((current) => Math.min(totalPages, current + 1))
					}
					disabled={currentPage >= totalPages}
					className="rounded-lg border border-slate-300 px-3 py-2 font-bold disabled:opacity-50"
				>
					Próxima
				</button>
			</div>
		</div>
	);
}

export default LogisticaPage;
