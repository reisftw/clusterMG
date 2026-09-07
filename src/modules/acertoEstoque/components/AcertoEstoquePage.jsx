import {
	Boxes,
	Building2,
	CalendarDays,
	ClipboardList,
	Copy,
	Plus,
	RefreshCw,
	Save,
	Trash2,
	UserRound,
	Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { useAuthContext } from "../../../context/AuthContext";
import {
	ACERTO_TAB_ITEMS,
	CADASTRO_TABS,
	DIA_SEMANA_OPTIONS,
	STATUS_OPTIONS,
	TURNO_OPTIONS,
	UNIDADE_OPTIONS,
} from "../constants/options";
import { useAcertoEstoque } from "../hooks/useAcertoEstoque";
import {
	buildAcertoEmailHtml,
	buildAcertoPreviewMessage,
	buildAgendaLabel,
	formatDate,
	formatDateTime,
	formatDiaSemana,
	formatTurno,
	getAgendaWeekdayIndex,
	getStatusBadgeClasses,
} from "../utils/acertoEstoqueUtils";

const today = new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 10;

const EMPTY_AGENDA = {
	id: "",
	cidade: "",
	diaSemana: "segunda",
	turno: "manha",
	status: "ativo",
	observacoes: "",
};

const EMPTY_PRODUTO = {
	id: "",
	nome: "",
	categoria: "",
	unidade: "un",
	status: "ativo",
	observacoes: "",
};

const EMPTY_LANCAMENTO = {
	dataAcerto: today,
	agendaId: "",
	lancamentos: [{ tecnicoId: "", itens: [{ produtoId: "", quantidade: 1 }] }],
};

const iconByCadastro = {
	empresas: Building2,
	tecnicos: UserRound,
	agendas: CalendarDays,
	produtos: Wrench,
};

function SectionCard({ title, subtitle, action = null, children }) {
	return (
		<section className="card overflow-hidden">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
				<div>
					<h3 className="text-sm font-bold text-gray-900">{title}</h3>
					{subtitle ? (
						<p className="mt-1 text-xs text-gray-500">{subtitle}</p>
					) : null}
				</div>
				{action}
			</div>
			<div className="p-5">{children}</div>
		</section>
	);
}

function MetricCard({ label, value, tone = "blue" }) {
	const toneClasses = {
		blue: "from-blue-50 to-white border-blue-100 text-blue-700",
		orange: "from-orange-50 to-white border-orange-100 text-orange-700",
		emerald: "from-emerald-50 to-white border-emerald-100 text-emerald-700",
		slate: "from-slate-50 to-white border-slate-200 text-slate-700",
	};

	return (
		<div
			className={`rounded-2xl border bg-gradient-to-br p-4 shadow-sm ${toneClasses[tone]}`}
		>
			<p className="text-xs font-semibold uppercase tracking-wide opacity-70">
				{label}
			</p>
			<p className="mt-2 text-3xl font-extrabold">{value}</p>
		</div>
	);
}

function TabButton({ active, label, onClick }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
				active
					? "bg-orange-500 text-white shadow-sm"
					: "bg-white text-gray-600 hover:bg-orange-50 hover:text-orange-600"
			}`}
		>
			{label}
		</button>
	);
}

function InputField({ label, children, hint = "" }) {
	return (
		<label className="block space-y-1.5">
			<span className="text-xs font-semibold text-gray-600">{label}</span>
			{children}
			{hint ? (
				<span className="block text-[11px] text-gray-400">{hint}</span>
			) : null}
		</label>
	);
}

function EmptyTableState({ label }) {
	return (
		<div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-400">
			{label}
		</div>
	);
}

function PaginationControls({ page, totalPages, onPageChange }) {
	if (totalPages <= 1) return null;

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
			<p className="text-xs font-semibold text-gray-500">
				Pagina {page} de {totalPages}
			</p>
			<div className="flex gap-2">
				<button
					type="button"
					disabled={page <= 1}
					onClick={() => onPageChange(page - 1)}
					className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Anterior
				</button>
				<button
					type="button"
					disabled={page >= totalPages}
					onClick={() => onPageChange(page + 1)}
					className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Proxima
				</button>
			</div>
		</div>
	);
}

function copyText(text) {
	return navigator.clipboard.writeText(text);
}

async function copyHtml(html, plainText) {
	if (window.ClipboardItem && navigator.clipboard?.write) {
		const item = new window.ClipboardItem({
			"text/html": new Blob([html], { type: "text/html" }),
			"text/plain": new Blob([plainText], { type: "text/plain" }),
		});
		await navigator.clipboard.write([item]);
		return;
	}

	await navigator.clipboard.writeText(plainText);
}

// Extraido do componente (achado javascript:S3776, docs/SONARQUBE-MAP.md)
// pra reduzir a complexidade cognitiva da funcao de render — mesmo
// estado e mesmas chamadas, sem mudanca de comportamento.
function useAcertoEstoqueController() {
	const { currentUser } = useAuthContext();
	const {
		store,
		metrics,
		loading,
		saving,
		error,
		successMessage,
		lastCreatedAcerto,
		carregar,
		salvarEntidade,
		excluirEntidade,
		lancarAcerto,
		excluirAcerto,
		setLastCreatedAcerto,
	} = useAcertoEstoque();

	const [activeTab, setActiveTab] = useState("dashboard");
	const [cadastroTab, setCadastroTab] = useState("agendas");
	const [agendaForm, setAgendaForm] = useState(EMPTY_AGENDA);
	const [produtoForm, setProdutoForm] = useState(EMPTY_PRODUTO);
	const [lancamentoForm, setLancamentoForm] = useState(EMPTY_LANCAMENTO);
	const [cadastroProdutosPage, setCadastroProdutosPage] = useState(1);
	const [selectedAcertoId, setSelectedAcertoId] = useState("");
	const [historyFilter, setHistoryFilter] = useState("");
	const [historicoPage, setHistoricoPage] = useState(1);
	const [copiedMessage, setCopiedMessage] = useState("");
	const [copiedNotice, setCopiedNotice] = useState("");

	const agendasOrdenadas = useMemo(
		() =>
			[...store.agendas].sort((left, right) => {
				const weekdayDiff =
					getAgendaWeekdayIndex(left) - getAgendaWeekdayIndex(right);
				if (weekdayDiff !== 0) return weekdayDiff;
				return String(left.cidade).localeCompare(String(right.cidade), "pt-BR");
			}),
		[store.agendas],
	);

	const empresasMap = useMemo(
		() => new Map(store.empresas.map((item) => [item.id, item])),
		[store.empresas],
	);
	const agendasMap = useMemo(
		() => new Map(store.agendas.map((item) => [item.id, item])),
		[store.agendas],
	);
	const produtosMap = useMemo(
		() => new Map(store.produtos.map((item) => [item.id, item])),
		[store.produtos],
	);

	const tecnicosDisponiveis = useMemo(() => {
		if (!lancamentoForm.agendaId) return store.tecnicos;
		const agenda = agendasMap.get(lancamentoForm.agendaId);
		const agendaCidade = String(agenda?.cidade || "")
			.trim()
			.toLowerCase();
		return store.tecnicos.filter((item) => {
			if (item.agendaId === lancamentoForm.agendaId) return true;
			if (!agendaCidade) return true;
			return (
				String(item.cidade || "")
					.trim()
					.toLowerCase() === agendaCidade
			);
		});
	}, [agendasMap, lancamentoForm.agendaId, store.tecnicos]);

	const cadastroProdutosTotalPages = Math.max(
		1,
		Math.ceil(store.produtos.length / PAGE_SIZE),
	);
	const safeCadastroProdutosPage = Math.min(
		cadastroProdutosPage,
		cadastroProdutosTotalPages,
	);
	const paginatedCadastroProdutos = useMemo(
		() =>
			store.produtos.slice(
				(safeCadastroProdutosPage - 1) * PAGE_SIZE,
				safeCadastroProdutosPage * PAGE_SIZE,
			),
		[safeCadastroProdutosPage, store.produtos],
	);

	const acertosFiltrados = useMemo(() => {
		const query = historyFilter.trim().toLowerCase();
		return store.acertos.filter((item) => {
			if (!query) return true;
			return [
				item.codigo,
				item.cidade,
				...(item.tecnicoNomes || [item.tecnicoNome]),
				...(item.empresaNomes || [item.empresaNome]),
			].some((value) =>
				String(value || "")
					.toLowerCase()
					.includes(query),
			);
		});
	}, [historyFilter, store.acertos]);

	const historicoTotalPages = Math.max(
		1,
		Math.ceil(acertosFiltrados.length / PAGE_SIZE),
	);
	const safeHistoricoPage = Math.min(historicoPage, historicoTotalPages);
	const paginatedAcertosFiltrados = useMemo(
		() =>
			acertosFiltrados.slice(
				(safeHistoricoPage - 1) * PAGE_SIZE,
				safeHistoricoPage * PAGE_SIZE,
			),
		[acertosFiltrados, safeHistoricoPage],
	);

	const effectiveSelectedAcertoId =
		selectedAcertoId || store.acertos[0]?.id || "";
	const selectedAcerto = useMemo(
		() =>
			store.acertos.find((item) => item.id === effectiveSelectedAcertoId) ||
			lastCreatedAcerto ||
			null,
		[effectiveSelectedAcertoId, lastCreatedAcerto, store.acertos],
	);

	const previewData = useMemo(() => {
		const agenda = agendasMap.get(lancamentoForm.agendaId);
		const tecnicoLancamentos = (lancamentoForm.lancamentos || [])
			.map((lancamento) => {
				const tecnico = store.tecnicos.find(
					(item) => item.id === lancamento.tecnicoId,
				);
				const empresa = tecnico ? empresasMap.get(tecnico.empresaId) : null;
				if (!tecnico) return null;

				const itens = (lancamento.itens || [])
					.map((item) => {
						const produto = produtosMap.get(item.produtoId);
						if (!produto || !item.quantidade) return null;
						return {
							nome: produto.nome,
							quantidade: Number(item.quantidade),
							unidade: produto.unidade || "un",
						};
					})
					.filter(Boolean);

				if (itens.length === 0) return null;

				return {
					tecnicoNome: tecnico.nome,
					tecnicoEmail: tecnico.email || "",
					empresaNome: empresa?.nome || "-",
					tipoAtuacao: empresa?.tipoAtuacao || "",
					responsavel: empresa?.responsavel || "",
					itens,
				};
			})
			.filter(Boolean);

		return buildAcertoPreviewMessage({
			dataAcerto: lancamentoForm.dataAcerto,
			cidade: agenda?.cidade,
			turno: agenda?.turno,
			tecnicoLancamentos,
		});
	}, [
		agendasMap,
		empresasMap,
		lancamentoForm.agendaId,
		lancamentoForm.dataAcerto,
		lancamentoForm.lancamentos,
		produtosMap,
		store.tecnicos,
	]);

	const emailPreviewHtml = useMemo(() => {
		const agenda = agendasMap.get(lancamentoForm.agendaId);
		const tecnicoLancamentos = (lancamentoForm.lancamentos || [])
			.map((lancamento) => {
				const tecnico = store.tecnicos.find(
					(item) => item.id === lancamento.tecnicoId,
				);
				const empresa = tecnico ? empresasMap.get(tecnico.empresaId) : null;
				if (!tecnico) return null;

				const itens = (lancamento.itens || [])
					.map((item) => {
						const produto = produtosMap.get(item.produtoId);
						if (!produto || !item.quantidade) return null;
						return {
							nome: produto.nome,
							quantidade: Number(item.quantidade),
							unidade: produto.unidade || "un",
						};
					})
					.filter(Boolean);

				if (itens.length === 0) return null;

				return {
					tecnicoNome: tecnico.nome,
					tecnicoEmail: tecnico.email || "",
					empresaNome: empresa?.nome || "-",
					responsavel: empresa?.responsavel || "",
					itens,
				};
			})
			.filter(Boolean);

		return buildAcertoEmailHtml({
			dataAcerto: lancamentoForm.dataAcerto,
			cidade: agenda?.cidade,
			turno: agenda?.turno,
			tecnicoLancamentos,
		});
	}, [
		agendasMap,
		empresasMap,
		lancamentoForm.agendaId,
		lancamentoForm.dataAcerto,
		lancamentoForm.lancamentos,
		produtosMap,
		store.tecnicos,
	]);

	const selectedAcertoWhatsapp = useMemo(
		() => (selectedAcerto ? buildAcertoPreviewMessage(selectedAcerto) : ""),
		[selectedAcerto],
	);

	const selectedAcertoEmailHtml = useMemo(
		() => (selectedAcerto ? buildAcertoEmailHtml(selectedAcerto) : ""),
		[selectedAcerto],
	);

	const selectedAcertoLancamentos = useMemo(() => {
		if (!selectedAcerto) return [];
		if (
			Array.isArray(selectedAcerto.tecnicoLancamentos) &&
			selectedAcerto.tecnicoLancamentos.length > 0
		) {
			return selectedAcerto.tecnicoLancamentos;
		}

		if (selectedAcerto.tecnicoNome) {
			return [
				{
					tecnicoId: selectedAcerto.tecnicoId || "",
					tecnicoNome: selectedAcerto.tecnicoNome,
					tecnicoEmail: selectedAcerto.tecnicoEmail || "",
					empresaId: selectedAcerto.empresaId || "",
					empresaNome: selectedAcerto.empresaNome || "",
					responsavel: selectedAcerto.responsavel || "",
					itens: Array.isArray(selectedAcerto.itens)
						? selectedAcerto.itens
						: [],
				},
			];
		}

		return [];
	}, [selectedAcerto]);

	useEffect(() => {
		if (!copiedNotice) return undefined;

		const timeoutId = window.setTimeout(() => {
			setCopiedNotice("");
		}, 3500);

		return () => window.clearTimeout(timeoutId);
	}, [copiedNotice]);

	const handleDelete = async (entity, id) => {
		if (!window.confirm("Deseja realmente excluir este cadastro?")) return;

		await excluirEntidade(entity, id, "Cadastro removido com sucesso.");
	};

	const handleAgendaSubmit = async (event) => {
		event.preventDefault();
		const ok = await salvarEntidade(
			"agendas",
			agendaForm,
			agendaForm.id
				? "Agenda atualizada com sucesso."
				: "Agenda criada com sucesso.",
		);
		if (ok) setAgendaForm(EMPTY_AGENDA);
	};

	const handleProdutoSubmit = async (event) => {
		event.preventDefault();
		const ok = await salvarEntidade(
			"produtos",
			produtoForm,
			produtoForm.id
				? "Produto atualizado com sucesso."
				: "Produto criado com sucesso.",
		);
		if (ok) setProdutoForm(EMPTY_PRODUTO);
	};

	const handleLancamentoSubmit = async (event) => {
		event.preventDefault();
		const agenda = agendasMap.get(lancamentoForm.agendaId);

		const lancamentos = (lancamentoForm.lancamentos || [])
			.map((lancamento) => ({
				tecnicoId: lancamento.tecnicoId,
				itens: (lancamento.itens || [])
					.filter((item) => item.produtoId && Number(item.quantidade) > 0)
					.map((item) => ({
						produtoId: item.produtoId,
						quantidade: Number(item.quantidade),
					})),
			}))
			.filter(
				(lancamento) => lancamento.tecnicoId && lancamento.itens.length > 0,
			);

		const tecnicoLancamentos = lancamentos.map((lancamento) => {
			const tecnico = store.tecnicos.find(
				(item) => item.id === lancamento.tecnicoId,
			);
			const empresa = tecnico ? empresasMap.get(tecnico.empresaId) : null;

			return {
				tecnicoId: lancamento.tecnicoId,
				tecnicoNome: tecnico?.nome || "",
				tecnicoEmail: tecnico?.email || "",
				empresaId: tecnico?.empresaId || "",
				empresaNome: empresa?.nome || "",
				responsavel: empresa?.responsavel || "",
				tipoAtuacao: empresa?.tipoAtuacao || "",
				itens: lancamento.itens.map((item) => {
					const produto = produtosMap.get(item.produtoId);

					return {
						produtoId: item.produtoId,
						nome: produto?.nome || "",
						categoria: produto?.categoria || "",
						unidade: produto?.unidade || "un",
						quantidade: item.quantidade,
					};
				}),
			};
		});

		const tecnicoNomes = [
			...new Set(
				tecnicoLancamentos.map((item) => item.tecnicoNome).filter(Boolean),
			),
		];
		const empresaNomes = [
			...new Set(
				tecnicoLancamentos.map((item) => item.empresaNome).filter(Boolean),
			),
		];

		const acerto = await lancarAcerto({
			dataAcerto: lancamentoForm.dataAcerto,
			agendaId: lancamentoForm.agendaId,
			cidade: agenda?.cidade || "",
			turno: agenda?.turno || "",
			lancamentos,
			tecnicoLancamentos,
			tecnicoNomes,
			empresaNomes,
			tecnicoNome: tecnicoNomes[0] || "",
			empresaNome: empresaNomes[0] || "",
			totalTecnicos: tecnicoLancamentos.length,
			createdBy:
				currentUser?.id || currentUser?.uid || currentUser?.email || "",
			createdByName:
				currentUser?.nome || currentUser?.name || currentUser?.email || "",
			createdByEmail: currentUser?.email || "",
		});

		if (acerto) {
			setActiveTab("historico");
			setSelectedAcertoId(acerto.id);
			setLancamentoForm(EMPTY_LANCAMENTO);
		}
	};

	const handleDeleteAcerto = async (id) => {
		if (!window.confirm("Deseja realmente apagar este acerto?")) return;

		const ok = await excluirAcerto(id);
		if (!ok) return;

		const nextAcerto = store.acertos.find((item) => item.id !== id);
		setSelectedAcertoId(nextAcerto?.id || "");
		setCopiedMessage("");
		setCopiedNotice("");
	};

	const showCopiedMessage = (key, message) => {
		setCopiedMessage(key);
		setCopiedNotice(message);
	};

	const addTecnicoLancamento = () => {
		setLancamentoForm((current) => ({
			...current,
			lancamentos: [
				...(current.lancamentos || []),
				{ tecnicoId: "", itens: [{ produtoId: "", quantidade: 1 }] },
			],
		}));
	};

	const updateTecnicoLancamento = (index, field, value) => {
		setLancamentoForm((current) => ({
			...current,
			lancamentos: current.lancamentos.map((item, itemIndex) =>
				itemIndex === index ? { ...item, [field]: value } : item,
			),
		}));
	};

	const removeTecnicoLancamento = (index) => {
		setLancamentoForm((current) => ({
			...current,
			lancamentos:
				current.lancamentos.length === 1
					? current.lancamentos
					: current.lancamentos.filter((_, itemIndex) => itemIndex !== index),
		}));
	};

	const addTecnicoItem = (lancamentoIndex) => {
		setLancamentoForm((current) => ({
			...current,
			lancamentos: current.lancamentos.map((lancamento, index) =>
				index === lancamentoIndex
					? {
							...lancamento,
							itens: [
								...(lancamento.itens || []),
								{ produtoId: "", quantidade: 1 },
							],
						}
					: lancamento,
			),
		}));
	};

	const updateTecnicoItem = (lancamentoIndex, itemIndex, field, value) => {
		setLancamentoForm((current) => ({
			...current,
			lancamentos: current.lancamentos.map((lancamento, index) =>
				index === lancamentoIndex
					? {
							...lancamento,
							itens: lancamento.itens.map((item, currentItemIndex) =>
								currentItemIndex === itemIndex
									? { ...item, [field]: value }
									: item,
							),
						}
					: lancamento,
			),
		}));
	};

	const removeTecnicoItem = (lancamentoIndex, itemIndex) => {
		setLancamentoForm((current) => ({
			...current,
			lancamentos: current.lancamentos.map((lancamento, index) =>
				index === lancamentoIndex
					? {
							...lancamento,
							itens:
								lancamento.itens.length === 1
									? lancamento.itens
									: lancamento.itens.filter(
											(_, currentItemIndex) => currentItemIndex !== itemIndex,
										),
						}
					: lancamento,
			),
		}));
	};

	return {
		store,
		metrics,
		loading,
		saving,
		error,
		successMessage,
		lastCreatedAcerto,
		carregar,
		setLastCreatedAcerto,
		activeTab,
		setActiveTab,
		cadastroTab,
		setCadastroTab,
		agendaForm,
		setAgendaForm,
		produtoForm,
		setProdutoForm,
		lancamentoForm,
		setLancamentoForm,
		cadastroProdutosPage,
		setCadastroProdutosPage,
		selectedAcertoId,
		setSelectedAcertoId,
		historyFilter,
		setHistoryFilter,
		historicoPage,
		setHistoricoPage,
		copiedMessage,
		copiedNotice,
		agendasOrdenadas,
		empresasMap,
		tecnicosDisponiveis,
		cadastroProdutosTotalPages,
		safeCadastroProdutosPage,
		paginatedCadastroProdutos,
		acertosFiltrados,
		historicoTotalPages,
		safeHistoricoPage,
		paginatedAcertosFiltrados,
		selectedAcerto,
		previewData,
		emailPreviewHtml,
		selectedAcertoWhatsapp,
		selectedAcertoEmailHtml,
		selectedAcertoLancamentos,
		handleDelete,
		handleAgendaSubmit,
		handleProdutoSubmit,
		handleLancamentoSubmit,
		handleDeleteAcerto,
		showCopiedMessage,
		addTecnicoLancamento,
		updateTecnicoLancamento,
		removeTecnicoLancamento,
		addTecnicoItem,
		updateTecnicoItem,
		removeTecnicoItem,
	};
}

// Extraido de AcertoEstoquePage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — mesma JSX de antes, sem mudanca de
// comportamento.
function AcertoDashboardTab(props) {
	const {
	metrics,
	setActiveTab,
	setCadastroTab,
	} = props;
	return (
				<div className="space-y-6">
					<SectionCard
						title="Acoes rapidas"
						subtitle="Entradas separadas para cada fluxo principal do modulo"
					>
						<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
							<button
								type="button"
								onClick={() => {
									setActiveTab("cadastros");
									setCadastroTab("agendas");
								}}
								className="rounded-2xl border border-gray-100 bg-white p-4 text-left hover:border-orange-200 hover:bg-orange-50"
							>
								<CalendarDays size={18} className="text-emerald-500" />
								<p className="mt-3 font-semibold text-gray-900">Nova agenda</p>
								<p className="mt-1 text-xs text-gray-500">
									Configurar cidade, dia e turno
								</p>
							</button>
							<button
								type="button"
								onClick={() => {
									setActiveTab("cadastros");
									setCadastroTab("produtos");
								}}
								className="rounded-2xl border border-gray-100 bg-white p-4 text-left hover:border-orange-200 hover:bg-orange-50"
							>
								<Wrench size={18} className="text-violet-500" />
								<p className="mt-3 font-semibold text-gray-900">Novo produto</p>
								<p className="mt-1 text-xs text-gray-500">
									Adicionar item ao estoque de acerto
								</p>
							</button>
							<button
								type="button"
								onClick={() => setActiveTab("lancamento")}
								className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-500 to-orange-400 p-4 text-left text-white shadow-sm"
							>
								<ClipboardList size={18} />
								<p className="mt-3 font-semibold">Novo acerto</p>
								<p className="mt-1 text-xs text-orange-50">
									Ir direto para o lancamento
								</p>
							</button>
						</div>
					</SectionCard>

					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
						<MetricCard
							label="Empresas"
							value={metrics.totals.empresas}
							tone="blue"
						/>
						<MetricCard
							label="Tecnicos"
							value={metrics.totals.tecnicos}
							tone="orange"
						/>
						<MetricCard
							label="Produtos"
							value={metrics.totals.produtos}
							tone="emerald"
						/>
						<MetricCard
							label="Acertos"
							value={metrics.totals.acertos}
							tone="slate"
						/>
						<MetricCard
							label="Acertos da Semana"
							value={metrics.totals.acertosSemana}
							tone="orange"
						/>
					</div>

					<div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
						<SectionCard
							title="Ultimos acertos"
							subtitle="Historico mais recente de movimentacoes registradas"
						>
							{metrics.latestAcertos.length === 0 ? (
								<EmptyTableState label="Nenhum acerto registrado ate o momento." />
							) : (
								<div className="overflow-x-auto">
									<table className="w-full text-sm">
										<thead className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
											<tr>
												<th className="px-2 py-3">Codigo</th>
												<th className="px-2 py-3">Data</th>
												<th className="px-2 py-3">Cidade</th>
												<th className="px-2 py-3">Tecnicos</th>
												<th className="px-2 py-3">Empresas</th>
											</tr>
										</thead>
										<tbody>
											{metrics.latestAcertos.map((item) => (
												<tr
													key={item.id}
													className="border-b border-gray-50 last:border-0"
												>
													<td className="px-2 py-3 font-semibold text-gray-800">
														{item.codigo}
													</td>
													<td className="px-2 py-3 text-gray-500">
														{formatDate(item.dataAcerto)}
													</td>
													<td className="px-2 py-3 text-gray-500">
														{item.cidade}
													</td>
													<td className="px-2 py-3 text-gray-500">
														{item.totalTecnicos ||
															item.tecnicoNomes?.length ||
															1}
													</td>
													<td className="px-2 py-3 text-gray-500">
														{(item.empresaNomes || [item.empresaNome]).join(
															", ",
														)}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</SectionCard>

						<SectionCard
							title="Acertos da semana"
							subtitle="Recorte automatico com base na semana atual"
						>
							{metrics.weeklyAcertos.length === 0 ? (
								<EmptyTableState label="Nenhum acerto registrado nesta semana." />
							) : (
								<div className="space-y-3">
									{metrics.weeklyAcertos.map((item) => (
										<div
											key={item.id}
											className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
										>
											<div className="flex flex-wrap items-center justify-between gap-2">
												<div>
													<p className="font-semibold text-gray-900">
														{item.codigo}
													</p>
													<p className="text-xs text-gray-500">
														{item.cidade} -{" "}
														{item.totalTecnicos ||
															item.tecnicoNomes?.length ||
															1}{" "}
														tecnico(s)
													</p>
												</div>
												<span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-orange-600">
													{formatDate(item.dataAcerto)}
												</span>
											</div>
										</div>
									))}
								</div>
							)}
						</SectionCard>
					</div>

					<div className="grid gap-6 xl:grid-cols-2">
						<SectionCard
							title="Quantitativo por empresa"
							subtitle="Tecnicos vinculados e volume total de acertos"
						>
							{metrics.porEmpresa.length === 0 ? (
								<EmptyTableState label="Cadastre empresas e tecnicos para ver os indicadores." />
							) : (
								<div className="space-y-3">
									{metrics.porEmpresa.map((item) => (
										<div
											key={item.empresaId}
											className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-3"
										>
											<div>
												<p className="font-semibold text-gray-900">
													{item.nome}
												</p>
												<p className="text-xs text-gray-500">
													{item.totalTecnicos} tecnico(s) vinculado(s)
												</p>
											</div>
											<span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
												{item.totalAcertos} acerto(s)
											</span>
										</div>
									))}
								</div>
							)}
						</SectionCard>

						<SectionCard
							title="Acertos por cidade"
							subtitle="Distribuicao acumulada dos acertos registrados"
						>
							{metrics.porCidade.length === 0 ? (
								<EmptyTableState label="Os totais por cidade aparecem apos os primeiros lancamentos." />
							) : (
								<div className="grid gap-3 sm:grid-cols-2">
									{metrics.porCidade.map((item) => (
										<div
											key={item.cidade}
											className="rounded-2xl border border-gray-100 bg-white p-4"
										>
											<p className="text-sm font-semibold text-gray-900">
												{item.cidade}
											</p>
											<p className="mt-2 text-2xl font-extrabold text-orange-600">
												{item.total}
											</p>
											<p className="text-xs text-gray-400">
												acerto(s) registrados
											</p>
										</div>
									))}
								</div>
							)}
						</SectionCard>
					</div>
				</div>
	);
}

// Extraido de AcertoEstoquePage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — mesma JSX de antes, sem mudanca de
// comportamento.
function AcertoCadastrosTab(props) {
	const {
	store,
	saving,
	cadastroTab,
	setCadastroTab,
	agendaForm,
	setAgendaForm,
	produtoForm,
	setProdutoForm,
	setCadastroProdutosPage,
	agendasOrdenadas,
	cadastroProdutosTotalPages,
	safeCadastroProdutosPage,
	paginatedCadastroProdutos,
	handleDelete,
	handleAgendaSubmit,
	handleProdutoSubmit,
	} = props;
	return (
				<div className="space-y-6">
					<div className="flex flex-wrap gap-2">
						{CADASTRO_TABS.map((item) => {
							const Icon = iconByCadastro[item.id];
							return (
								<button
									key={item.id}
									type="button"
									onClick={() => setCadastroTab(item.id)}
									className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
										cadastroTab === item.id
											? "bg-blue-600 text-white"
											: "bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-700"
									}`}
								>
									<Icon size={15} />
									{item.label}
								</button>
							);
						})}
					</div>
					{cadastroTab === "agendas" ? (
						<div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
							<SectionCard
								title="Cadastro de agenda"
								subtitle="Cidade, dia fixo e turno do acerto"
							>
								<form className="space-y-4" onSubmit={handleAgendaSubmit}>
									<InputField label="Cidade / localidade">
										<input
											className="input-field"
											value={agendaForm.cidade}
											onChange={(event) =>
												setAgendaForm((current) => ({
													...current,
													cidade: event.target.value,
												}))
											}
											required
										/>
									</InputField>
									<div className="grid gap-4 sm:grid-cols-2">
										<InputField label="Dia da semana">
											<select
												className="input-field"
												value={agendaForm.diaSemana}
												onChange={(event) =>
													setAgendaForm((current) => ({
														...current,
														diaSemana: event.target.value,
													}))
												}
											>
												{DIA_SEMANA_OPTIONS.map((option) => (
													<option key={option} value={option}>
														{formatDiaSemana(option)}
													</option>
												))}
											</select>
										</InputField>
										<InputField label="Turno">
											<select
												className="input-field"
												value={agendaForm.turno}
												onChange={(event) =>
													setAgendaForm((current) => ({
														...current,
														turno: event.target.value,
													}))
												}
											>
												{TURNO_OPTIONS.map((option) => (
													<option key={option} value={option}>
														{formatTurno(option)}
													</option>
												))}
											</select>
										</InputField>
									</div>
									<InputField label="Observacoes">
										<textarea
											className="input-field min-h-24"
											value={agendaForm.observacoes}
											onChange={(event) =>
												setAgendaForm((current) => ({
													...current,
													observacoes: event.target.value,
												}))
											}
										/>
									</InputField>
									<button
										type="submit"
										disabled={saving}
										className="btn-primary inline-flex items-center gap-2"
									>
										<Save size={16} />
										{agendaForm.id ? "Salvar agenda" : "Criar agenda"}
									</button>
								</form>
							</SectionCard>

							<SectionCard
								title="Agendas cadastradas"
								subtitle={`${store.agendas.length} agenda(s)`}
							>
								{agendasOrdenadas.length === 0 ? (
									<EmptyTableState label="Nenhuma agenda cadastrada." />
								) : (
									<div className="space-y-3">
										{agendasOrdenadas.map((item) => (
											<div
												key={item.id}
												className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3"
											>
												<div>
													<p className="font-semibold text-gray-900">
														{item.cidade}
													</p>
													<p className="text-xs text-gray-500">
														{formatDiaSemana(item.diaSemana)} -{" "}
														{formatTurno(item.turno)}
													</p>
												</div>
												<div className="flex gap-2">
													<button
														type="button"
														className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
														onClick={() => setAgendaForm(item)}
													>
														Editar
													</button>
													<button
														type="button"
														className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
														onClick={() => handleDelete("agendas", item.id)}
													>
														Excluir
													</button>
												</div>
											</div>
										))}
									</div>
								)}
							</SectionCard>
						</div>
					) : null}
					{cadastroTab === "produtos" ? (
						<div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
							<SectionCard
								title="Cadastro de produto"
								subtitle="Materiais usados no acerto"
							>
								<form className="space-y-4" onSubmit={handleProdutoSubmit}>
									<InputField label="Nome do produto">
										<input
											className="input-field"
											value={produtoForm.nome}
											onChange={(event) =>
												setProdutoForm((current) => ({
													...current,
													nome: event.target.value,
												}))
											}
											required
										/>
									</InputField>
									<div className="grid gap-4 sm:grid-cols-2">
										<InputField label="Categoria">
											<input
												className="input-field"
												value={produtoForm.categoria}
												onChange={(event) =>
													setProdutoForm((current) => ({
														...current,
														categoria: event.target.value,
													}))
												}
											/>
										</InputField>
										<InputField label="Unidade">
											<select
												className="input-field"
												value={produtoForm.unidade}
												onChange={(event) =>
													setProdutoForm((current) => ({
														...current,
														unidade: event.target.value,
													}))
												}
											>
												{UNIDADE_OPTIONS.map((option) => (
													<option key={option} value={option}>
														{option}
													</option>
												))}
											</select>
										</InputField>
									</div>
									<div className="grid gap-4 sm:grid-cols-2">
										<InputField label="Status">
											<select
												className="input-field"
												value={produtoForm.status}
												onChange={(event) =>
													setProdutoForm((current) => ({
														...current,
														status: event.target.value,
													}))
												}
											>
												{STATUS_OPTIONS.map((option) => (
													<option key={option} value={option}>
														{option}
													</option>
												))}
											</select>
										</InputField>
										<InputField label="Observacoes">
											<input
												className="input-field"
												value={produtoForm.observacoes}
												onChange={(event) =>
													setProdutoForm((current) => ({
														...current,
														observacoes: event.target.value,
													}))
												}
											/>
										</InputField>
									</div>
									<button
										type="submit"
										disabled={saving}
										className="btn-primary inline-flex items-center gap-2"
									>
										<Save size={16} />
										{produtoForm.id ? "Salvar produto" : "Criar produto"}
									</button>
								</form>
							</SectionCard>

							<SectionCard
								title="Produtos cadastrados"
								subtitle={`${store.produtos.length} produto(s)`}
							>
								{store.produtos.length === 0 ? (
									<EmptyTableState label="Nenhum produto cadastrado." />
								) : (
									<div className="space-y-4">
										<div className="overflow-x-auto">
											<table className="w-full text-sm">
												<thead className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
													<tr>
														<th className="px-2 py-3">Produto</th>
														<th className="px-2 py-3">Categoria</th>
														<th className="px-2 py-3">Unidade</th>
														<th className="px-2 py-3">Status</th>
														<th className="px-2 py-3">Acoes</th>
													</tr>
												</thead>
												<tbody>
													{paginatedCadastroProdutos.map((item) => (
														<tr
															key={item.id}
															className="border-b border-gray-50 last:border-0"
														>
															<td className="px-2 py-3 font-semibold text-gray-800">
																{item.nome}
															</td>
															<td className="px-2 py-3 text-gray-500">
																{item.categoria || "-"}
															</td>
															<td className="px-2 py-3 text-gray-500">
																{item.unidade}
															</td>
															<td className="px-2 py-3">
																<span
																	className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClasses(item.status)}`}
																>
																	{item.status}
																</span>
															</td>
															<td className="px-2 py-3">
																<div className="flex gap-1">
																	<button
																		type="button"
																		className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
																		onClick={() => setProdutoForm(item)}
																	>
																		Editar
																	</button>
																	<button
																		type="button"
																		className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
																		onClick={() =>
																			handleDelete("produtos", item.id)
																		}
																	>
																		Excluir
																	</button>
																</div>
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
										<PaginationControls
											page={safeCadastroProdutosPage}
											totalPages={cadastroProdutosTotalPages}
											onPageChange={setCadastroProdutosPage}
										/>
									</div>
								)}
							</SectionCard>
						</div>
					) : null}
				</div>
	);
}

// Extraido de AcertoEstoquePage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — mesma JSX de antes, sem mudanca de
// comportamento.
function AcertoLancamentoTab(props) {
	const {
	store,
	saving,
	lancamentoForm,
	setLancamentoForm,
	copiedMessage,
	agendasOrdenadas,
	empresasMap,
	tecnicosDisponiveis,
	previewData,
	emailPreviewHtml,
	handleLancamentoSubmit,
	showCopiedMessage,
	addTecnicoLancamento,
	updateTecnicoLancamento,
	removeTecnicoLancamento,
	addTecnicoItem,
	updateTecnicoItem,
	removeTecnicoItem,
	} = props;
	return (
				<div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
					<SectionCard
						title="Novo acerto"
						subtitle="Lancamento por cidade com varios tecnicos no mesmo acerto"
					>
						<form className="space-y-5" onSubmit={handleLancamentoSubmit}>
							<div className="grid gap-4 sm:grid-cols-2">
								<InputField label="Data do acerto">
									<input
										type="date"
										className="input-field"
										value={lancamentoForm.dataAcerto}
										onChange={(event) =>
											setLancamentoForm((current) => ({
												...current,
												dataAcerto: event.target.value,
											}))
										}
										required
									/>
								</InputField>
								<InputField label="Agenda / cidade">
									<select
										className="input-field"
										value={lancamentoForm.agendaId}
										onChange={(event) =>
											setLancamentoForm((current) => ({
												...current,
												agendaId: event.target.value,
												lancamentos: [
													{
														tecnicoId: "",
														itens: [{ produtoId: "", quantidade: 1 }],
													},
												],
											}))
										}
										required
									>
										<option value="">Selecione</option>
										{agendasOrdenadas.map((item) => (
											<option key={item.id} value={item.id}>
												{buildAgendaLabel(item)}
											</option>
										))}
									</select>
								</InputField>
							</div>

							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<p className="text-sm font-bold text-gray-900">
										Tecnicos incluidos no acerto
									</p>
									<button
										type="button"
										className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
										onClick={addTecnicoLancamento}
									>
										<Plus size={14} />
										Adicionar tecnico
									</button>
								</div>

								{(lancamentoForm.lancamentos || []).map(
									(lancamento, lancamentoIndex) => (
										<div
											key={"lancamento-" + lancamentoIndex}
											className="space-y-4 rounded-2xl border border-gray-100 bg-gray-50 p-4"
										>
											<div className="flex items-start justify-between gap-3">
												<div className="flex-1">
													<InputField
														label={"Tecnico " + (lancamentoIndex + 1)}
													>
														<select
															className="input-field"
															value={lancamento.tecnicoId}
															onChange={(event) =>
																updateTecnicoLancamento(
																	lancamentoIndex,
																	"tecnicoId",
																	event.target.value,
																)
															}
															required
														>
															<option value="">Selecione</option>
															{tecnicosDisponiveis.map((item) => (
																<option key={item.id} value={item.id}>
																	{item.nome} •{" "}
																	{empresasMap.get(item.empresaId)?.nome || "-"}
																</option>
															))}
														</select>
													</InputField>
												</div>

												<button
													type="button"
													className="mt-7 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-red-100 bg-white text-red-500 hover:bg-red-50"
													onClick={() =>
														removeTecnicoLancamento(lancamentoIndex)
													}
												>
													<Trash2 size={16} />
												</button>
											</div>

											<div className="space-y-3">
												<div className="flex items-center justify-between">
													<p className="text-xs font-bold uppercase tracking-wide text-gray-500">
														Materiais deste tecnico
													</p>
													<button
														type="button"
														className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
														onClick={() => addTecnicoItem(lancamentoIndex)}
													>
														<Plus size={14} />
														Adicionar item
													</button>
												</div>

												{(lancamento.itens || []).map((item, itemIndex) => (
													<div
														key={lancamentoIndex + "-" + itemIndex}
														className="grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 md:grid-cols-[1fr_120px_48px]"
													>
														<select
															className="input-field"
															value={item.produtoId}
															onChange={(event) =>
																updateTecnicoItem(
																	lancamentoIndex,
																	itemIndex,
																	"produtoId",
																	event.target.value,
																)
															}
															required
														>
															<option value="">Selecione o produto</option>
															{store.produtos.map((produto) => (
																<option key={produto.id} value={produto.id}>
																	{produto.nome} • {produto.unidade}
																</option>
															))}
														</select>

														<input
															type="number"
															min="1"
															className="input-field"
															value={item.quantidade}
															onChange={(event) =>
																updateTecnicoItem(
																	lancamentoIndex,
																	itemIndex,
																	"quantidade",
																	event.target.value,
																)
															}
															required
														/>

														<button
															type="button"
															className="inline-flex h-12 items-center justify-center rounded-xl border border-red-100 bg-white text-red-500 hover:bg-red-50"
															onClick={() =>
																removeTecnicoItem(lancamentoIndex, itemIndex)
															}
														>
															<Trash2 size={16} />
														</button>
													</div>
												))}
											</div>
										</div>
									),
								)}
							</div>
							<button
								type="submit"
								disabled={saving}
								className="btn-primary inline-flex items-center gap-2"
							>
								<ClipboardList size={16} />
								Registrar acerto
							</button>
						</form>
					</SectionCard>

					<div className="space-y-6">
						<SectionCard
							title="Preview de WhatsApp"
							subtitle="Texto enxuto para copiar e enviar"
							action={
								<button
									type="button"
									className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
									onClick={async () => {
										await copyText(previewData);
										showCopiedMessage(
											"preview-whatsapp",
											"WhatsApp copiado com sucesso.",
										);
									}}
								>
									<Copy size={14} />
									Copiar WhatsApp
								</button>
							}
						>
							<div className="space-y-4">
								<textarea
									readOnly
									value={previewData}
									className="min-h-64 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 font-mono text-xs text-gray-700"
								/>
								{copiedMessage === "preview-whatsapp" ? (
									<p className="text-xs font-semibold text-emerald-600">
										Preview de WhatsApp copiado.
									</p>
								) : null}
							</div>
						</SectionCard>

						<SectionCard
							title="Preview de e-mail"
							subtitle="Modelo formatado para copiar e colar com visual mais apresentavel"
							action={
								<button
									type="button"
									className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
									onClick={async () => {
										await copyHtml(emailPreviewHtml, previewData);
										showCopiedMessage(
											"preview-email",
											"E-mail copiado com sucesso.",
										);
									}}
								>
									<Copy size={14} />
									Copiar e-mail formatado
								</button>
							}
						>
							<div className="space-y-4">
								<div
									className="rounded-2xl border border-gray-200 bg-white"
									dangerouslySetInnerHTML={{ __html: emailPreviewHtml }}
								/>
								{copiedMessage === "preview-email" ? (
									<p className="text-xs font-semibold text-emerald-600">
										Preview de e-mail copiado com HTML e texto de apoio.
									</p>
								) : null}
							</div>
						</SectionCard>
					</div>
				</div>
	);
}

// Extraido de AcertoEstoquePage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — mesma JSX de antes, sem mudanca de
// comportamento.
function AcertoHistoricoTab(props) {
	const {
	saving,
	setLastCreatedAcerto,
	setSelectedAcertoId,
	historyFilter,
	setHistoryFilter,
	setHistoricoPage,
	copiedMessage,
	acertosFiltrados,
	historicoTotalPages,
	safeHistoricoPage,
	paginatedAcertosFiltrados,
	selectedAcerto,
	selectedAcertoWhatsapp,
	selectedAcertoEmailHtml,
	selectedAcertoLancamentos,
	handleDeleteAcerto,
	showCopiedMessage,
	} = props;
	return (
				<div className="grid items-start gap-6 xl:grid-cols-[0.95fr_1.05fr]">
					<SectionCard
						title="Historico de acertos"
						subtitle={`${acertosFiltrados.length} acerto(s) encontrado(s) - 10 por pagina`}
					>
						<div className="space-y-4">
							<input
								className="input-field"
								placeholder="Buscar por codigo, cidade, tecnico ou empresa"
								value={historyFilter}
								onChange={(event) => {
									setHistoryFilter(event.target.value);
									setHistoricoPage(1);
								}}
							/>

							{acertosFiltrados.length === 0 ? (
								<EmptyTableState label="Nenhum acerto encontrado com esse filtro." />
							) : (
								<div className="space-y-3">
									{paginatedAcertosFiltrados.map((item) => (
										<button
											key={item.id}
											type="button"
											onClick={() => {
												setSelectedAcertoId(item.id);
												setLastCreatedAcerto(null);
											}}
											className={`w-full rounded-2xl border p-4 text-left transition-colors ${
												selectedAcerto?.id === item.id
													? "border-orange-200 bg-orange-50"
													: "border-gray-100 bg-white hover:bg-gray-50"
											}`}
										>
											<div className="flex flex-wrap items-start justify-between gap-3">
												<div>
													<p className="font-semibold text-gray-900">
														{item.codigo}
													</p>
													<p className="text-xs text-gray-500">
														{item.cidade} -{" "}
														{item.totalTecnicos ||
															item.tecnicoNomes?.length ||
															1}{" "}
														tecnico(s)
													</p>
													<p className="mt-1 text-xs text-gray-500">
														Feito por:{" "}
														{item.createdByName || item.createdBy || "-"}
													</p>
												</div>
												<span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-600">
													{formatDate(item.dataAcerto)}
												</span>
											</div>
										</button>
									))}
									<PaginationControls
										page={safeHistoricoPage}
										totalPages={historicoTotalPages}
										onPageChange={setHistoricoPage}
									/>
								</div>
							)}
						</div>
					</SectionCard>

					<SectionCard
						title="Detalhe do acerto"
						subtitle="Visualizacao detalhada e mensagem pronta"
						action={
							selectedAcerto ? (
								<div className="flex flex-wrap items-center gap-2">
									<button
										type="button"
										className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
										onClick={async () => {
											await copyText(selectedAcertoWhatsapp);
											showCopiedMessage(
												`${selectedAcerto.id}-whatsapp`,
												"WhatsApp copiado com sucesso.",
											);
										}}
									>
										<Copy size={14} />
										Copiar WhatsApp
									</button>
									<button
										type="button"
										className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
										onClick={async () => {
											await copyHtml(
												selectedAcertoEmailHtml,
												selectedAcertoWhatsapp,
											);
											showCopiedMessage(
												`${selectedAcerto.id}-email`,
												"E-mail copiado com sucesso.",
											);
										}}
									>
										<Copy size={14} />
										Copiar e-mail
									</button>
									<button
										type="button"
										disabled={saving}
										className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
										onClick={() => handleDeleteAcerto(selectedAcerto.id)}
									>
										<Trash2 size={14} />
										Apagar acerto
									</button>
								</div>
							) : null
						}
					>
						{!selectedAcerto ? (
							<EmptyTableState label="Selecione um acerto no historico para ver os detalhes." />
						) : (
							<div className="space-y-5">
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="rounded-2xl bg-gray-50 p-4">
										<p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
											Codigo
										</p>
										<p className="mt-2 font-bold text-gray-900">
											{selectedAcerto.codigo}
										</p>
									</div>
									<div className="rounded-2xl bg-gray-50 p-4">
										<p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
											Registrado em
										</p>
										<p className="mt-2 font-bold text-gray-900">
											{formatDateTime(selectedAcerto.createdAt)}
										</p>
									</div>
									<div className="rounded-2xl bg-gray-50 p-4">
										<p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
											Feito por
										</p>
										<p className="mt-2 font-bold text-gray-900">
											{selectedAcerto.createdByName ||
												selectedAcerto.createdBy ||
												"-"}
										</p>
									</div>
									<div className="rounded-2xl bg-gray-50 p-4">
										<p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
											Cidade / turno
										</p>
										<p className="mt-2 font-bold text-gray-900">
											{selectedAcerto.cidade} -{" "}
											{formatTurno(selectedAcerto.turno)}
										</p>
									</div>
									<div className="rounded-2xl bg-gray-50 p-4">
										<p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
											Tecnicos / empresas
										</p>
										<p className="mt-2 font-bold text-gray-900">
											{selectedAcerto.totalTecnicos ||
												selectedAcerto.tecnicoNomes?.length ||
												1}{" "}
											tecnico(s) -{" "}
											{(
												selectedAcerto.empresaNomes || [
													selectedAcerto.empresaNome,
												]
											)
												.filter(Boolean)
												.join(", ")}
										</p>
									</div>
								</div>

								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<p className="text-sm font-bold text-gray-900">
											Tecnicos e materiais do acerto
										</p>
										<span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
											{selectedAcertoLancamentos.length} tecnico(s)
										</span>
									</div>

									<div className="space-y-4">
										{selectedAcertoLancamentos.map((lancamento, index) => (
											<div
												key={`${selectedAcerto.id}-${lancamento.tecnicoId || index}`}
												className="rounded-2xl border border-gray-100 bg-white"
											>
												<div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-4">
													<div>
														<p className="font-semibold text-gray-900">
															{lancamento.tecnicoNome || "-"}
														</p>
														<p className="mt-1 text-xs text-gray-500">
															{lancamento.empresaNome || "-"}
															{lancamento.responsavel
																? ` - Responsavel: ${lancamento.responsavel}`
																: ""}
														</p>
													</div>
													<span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
														{(lancamento.itens || []).length} item(ns)
													</span>
												</div>
												<div className="divide-y divide-gray-100">
													{(lancamento.itens || []).map((item, itemIndex) => (
														<div
															key={`${selectedAcerto.id}-${lancamento.tecnicoId || index}-${item.produtoId || itemIndex}`}
															className="flex items-center justify-between px-4 py-3 text-sm"
														>
															<span className="font-medium text-gray-700">
																{item.nome}
															</span>
															<span className="text-gray-500">
																{item.quantidade} {item.unidade}
															</span>
														</div>
													))}
												</div>
											</div>
										))}
									</div>
								</div>

								<div className="space-y-5">
									<div>
										<p className="mb-2 text-sm font-bold text-gray-900">
											WhatsApp
										</p>
										<textarea
											readOnly
											value={selectedAcertoWhatsapp}
											className="min-h-64 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 font-mono text-xs text-gray-700"
										/>
										{copiedMessage === `${selectedAcerto.id}-whatsapp` ? (
											<p className="mt-2 text-xs font-semibold text-emerald-600">
												Mensagem de WhatsApp copiada.
											</p>
										) : null}
									</div>

									<div>
										<p className="mb-2 text-sm font-bold text-gray-900">
											E-mail
										</p>
										<div
											className="rounded-2xl border border-gray-200 bg-white"
											dangerouslySetInnerHTML={{
												__html: selectedAcertoEmailHtml,
											}}
										/>
										{copiedMessage === `${selectedAcerto.id}-email` ? (
											<p className="mt-2 text-xs font-semibold text-emerald-600">
												Modelo de e-mail copiado com HTML e texto de apoio.
											</p>
										) : null}
									</div>
								</div>
							</div>
						)}
					</SectionCard>
				</div>
	);
}

const AcertoEstoquePage = () => {
	const controller = useAcertoEstoqueController();
	const {
	loading,
	carregar,
	error,
	successMessage,
	copiedNotice,
	activeTab,
	setActiveTab,
	} = controller;

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 rounded-3xl border border-orange-100 bg-gradient-to-r from-orange-50 via-white to-blue-50 p-6 shadow-sm xl:flex-row xl:items-center xl:justify-between">
				<div className="flex items-start gap-4">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-200">
						<Boxes size={22} />
					</div>
					<div>
						<h1 className="text-2xl font-bold text-gray-900">
							Acerto de Estoque
						</h1>
					</div>
				</div>

				<button
					type="button"
					onClick={carregar}
					className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
				>
					<RefreshCw size={16} />
					Atualizar dados
				</button>
			</div>

			{error ? (
				<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{error}
				</div>
			) : null}

			{successMessage ? (
				<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
					{successMessage}
				</div>
			) : null}

			{copiedNotice ? (
				<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
					{copiedNotice}
				</div>
			) : null}

			<div className="flex flex-wrap gap-2">
				{ACERTO_TAB_ITEMS.map((item) => (
					<TabButton
						key={item.id}
						active={activeTab === item.id}
						label={item.label}
						onClick={() => setActiveTab(item.id)}
					/>
				))}
			</div>

			{activeTab === "dashboard" ? <AcertoDashboardTab {...controller} /> : null}

			{activeTab === "cadastros" ? <AcertoCadastrosTab {...controller} /> : null}

			{activeTab === "lancamento" ? <AcertoLancamentoTab {...controller} /> : null}

			{activeTab === "historico" ? <AcertoHistoricoTab {...controller} /> : null}
		</div>
	);
};

export default AcertoEstoquePage;
