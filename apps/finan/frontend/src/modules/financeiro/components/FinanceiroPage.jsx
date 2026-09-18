import {
	ArcElement,
	BarElement,
	CategoryScale,
	Chart as ChartJS,
	Filler,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Tooltip,
} from "chart.js";
import {
	AlertTriangle,
	ArrowRight,
	CalendarClock,
	CheckCircle2,
	ClipboardCheck,
	Copy,
	Download,
	Eye,
	FileText,
	Landmark,
	Loader2,
	Mail,
	Pencil,
	Plus,
	RefreshCw,
	Repeat2,
	Search,
	Settings,
	TableProperties,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import {
	Suspense,
	lazy,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { Link } from "react-router-dom";
import ConfirmDialog from "../../../components/ConfirmDialog";
import {
	budgetEntityId,
	budgetMonthName,
	buildBudgetPeriod,
	DEFAULT_SHEETS_CONFIG,
	findDirectorateByName,
	formatUpdatedAt,
	normalizeDirectorates,
	normalizeImportHeader,
	FeedbackModal,
	BudgetDateRangeModal,
} from "./shared/FinanceiroSharedHelpers";
import ModalShell from "../../../components/ModalShell";
import { hasPermission } from "../financeiroPermissions";
import { useAuthContext } from "../financeiroAuthContext";
import { ROUTES } from "../financeiroRoutes";
import CostCenterMovementsTab from "./budget/costcenter/CostCenterMovementsTab";
import CostCenterRegistrationTab from "./budget/costcenter/CostCenterRegistrationTab";
import FinancialKpiCard from "./kpi/FinancialKpiCard";
import { ChartCard, EmptyState, FinancePanel, PanelActionButton } from "./shared/DashboardPrimitives";
import {
	BUDGET_CATEGORY_CLASSES,
	BUDGET_CATEGORY_CLASS_LABELS,
	FINANCIAL_ACCOUNT_CATEGORY_CATALOG,
} from "../utils/budgetAccountCategories";
import {
	buscarCentrosCustoOrcamentoFinanceiro,
	buscarDashboardFinanceiro,
	salvarCentrosCustoOrcamentoFinanceiro,
} from "../services/financeiroService";
import { integer } from "../utils/financeiroFormatters";
import {
	getBudgetMonthSelectorYear,
	getBudgetReference,
	getFinanceiroPageFlags,
} from "../utils/financeiroPageViewModel";

const TariffsDetailPage = lazy(() =>
	import("./TariffsReportPage").then((m) => ({ default: m.TariffsDetailPage })),
);
const TariffsReportPage = lazy(() =>
	import("./TariffsReportPage").then((m) => ({ default: m.TariffsReportPage })),
);
const SerasaReportPage = lazy(() => import("./SerasaReportPage"));
const BudgetDataImportPage = lazy(() => import("./BudgetDataImportPage"));
const ConfiguracoesPage = lazy(() => import("./ConfiguracoesPage"));
const BudgetOperationalPage = lazy(() =>
	import("./BudgetOrcamentoDomain").then((m) => ({ default: m.BudgetOperationalPage })),
);
const OrcamentoConfiguracoesPage = lazy(() =>
	import("./BudgetOrcamentoDomain").then((m) => ({ default: m.OrcamentoConfiguracoesPage })),
);
const FinanceiroEquipePage = lazy(() => import("./equipe/FinanceiroEquipePage"));

const FINANCE_FONT_STACK =
	"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const centerTextPlugin = {
	id: "centerText",
	afterDraw(chart, _args, options = {}) {
		if (!options.title && !options.value) return;
		const arc = chart.getDatasetMeta(0)?.data?.[0];
		if (!arc) return;
		const { ctx } = chart;
		const x = arc.x;
		const y = arc.y;
		const fitText = (text, maxWidth, baseSize, minSize) => {
			let size = baseSize;
			ctx.font = `900 ${size}px ${FINANCE_FONT_STACK}`;
			while (ctx.measureText(text).width > maxWidth && size > minSize) {
				size -= 1;
				ctx.font = `900 ${size}px ${FINANCE_FONT_STACK}`;
			}
			return size;
		};
		ctx.save();
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = options.titleColor || "#64748b";
		ctx.font = `900 11px ${FINANCE_FONT_STACK}`;
		ctx.fillText(options.title || "", x, y - 9);
		ctx.fillStyle = options.valueColor || "#0f172a";
		fitText(String(options.value || ""), options.maxWidth || 118, 17, 11);
		ctx.fillText(options.value || "", x, y + 9);
		ctx.restore();
	},
};

ChartJS.register(
	CategoryScale,
	LinearScale,
	BarElement,
	ArcElement,
	PointElement,
	LineElement,
	Filler,
	Tooltip,
	Legend,
	centerTextPlugin,
);

ChartJS.defaults.font.family = FINANCE_FONT_STACK;
ChartJS.defaults.font.weight = "600";
ChartJS.defaults.color = "#334155";

const PAGE_META = {
	dashboard: {
		title: "Painel Financeiro",
		subtitle: "Acompanhamento diário de indicadores",
	},
	contasPagar: {
		title: "Contas a Pagar",
		subtitle: "Controle de vencimentos, pagamentos e pendências.",
	},
	contasReceber: {
		title: "Contas a Receber",
		subtitle: "Recebíveis, inadimplência e saldo em aberto.",
	},
	faturamento: {
		title: "Faturamento",
		subtitle: "Receita por período, cidade, empresa e produto.",
	},
	notas: {
		title: "Notas",
		subtitle: "Acompanhamento de notas lançadas no financeiro.",
	},
	reportsSerasa: {
		title: "Reports - Serasa",
		subtitle: "Dashboard de acompanhamento das movimentações Serasa.",
	},
	reportsTarifas: {
		title: "Reports - Tarifas",
		subtitle: "Tarifas, formas de pagamento, faturas e receita por cliente.",
	},
	reportsTarifasFaturas: {
		title: "Reports - Tarifas - Faturas",
		subtitle: "Faturas agrupadas por ano e mês.",
	},
	reportsTarifasRecCliente: {
		title: "Reports - Tarifas - Receita Cliente",
		subtitle: "Receita por cliente separada por ano.",
	},
	reportsTarifasFormasPagamento: {
		title: "Reports - Tarifas - Formas de Pagamento",
		subtitle: "Formas de pagamento, cobrança e tarifas por período.",
	},
	orcamentoDashboard: {
		title: "Gestão Orçamentária",
		subtitle: "Visão executiva do orçamento, realizado, saldo e desvios.",
	},
	orcamentoDados: {
		title: "Dados Orçamentários",
		subtitle:
			"Importe XLSX, confira os campos e alimente a gestão orçamentária.",
	},
	orcamentoCentrosCusto: {
		title: "Orçamento",
		subtitle:
			"Organize categorias, contas financeiras, centros de custo e limites orçamentários.",
	},
	orcamentoDre: {
		title: "DRE",
		subtitle: "Demonstração de Resultado do Exercício por competência.",
	},
	orcamentoAprovacoes: {
		title: "Aprovações de Orçamento",
		subtitle: "Fluxo de solicitações, aprovações e bloqueios.",
	},
	orcamentoConfiguracoes: {
		title: "Configurações de Orçamento",
		subtitle: "Parâmetros, categorias e regras do módulo orçamentário.",
	},
	configuracoes: {
		title: "Configurações Financeiras",
		subtitle: "Metas, categorias, alertas e dados demonstrativos.",
	},
	equipe: {
		title: "Equipe",
		subtitle: "Organograma, cargos e atribuições do time financeiro.",
	},
};

function SectionPage({ page }) {
	const cards =
		{
			contasPagar: [
				"Total a pagar",
				"Vence hoje",
				"Vence esta semana",
				"Vencidas",
				"Pagas no mês",
			],
			contasReceber: [
				"Total a receber",
				"Receber hoje",
				"Recebido hoje",
				"Vencidos",
				"Inadimplência",
			],
			faturamento: [
				"Faturamento do mês",
				"Mês anterior",
				"Crescimento",
				"Receita recorrente",
				"Receita não recorrente",
			],
			notas: [
				"Notas hoje",
				"Notas no mês",
				"Pendentes",
				"Com erro",
				"Valor total",
			],
			chamados: [
				"Abertos",
				"Em andamento",
				"Encerrados no mês",
				"SLA vencido",
				"Tempo médio",
			],
			orcamentoDashboard: [
				"Orçado no mês",
				"Realizado",
				"Saldo disponível",
				"Desvio",
				"Solicitações",
			],
			orcamentoCentrosCusto: [
				"Centros ativos",
				"Sem responsável",
				"No limite",
				"Acima do previsto",
				"Novos no mês",
			],
			orcamentoDre: [
				"Previsto",
				"Realizado",
				"Comprometido",
				"Disponível",
				"Variação",
			],
			orcamentoAprovacoes: [
				"Pendentes",
				"Aprovadas",
				"Reprovadas",
				"SLA vencido",
				"Valor em análise",
			],
			orcamentoConfiguracoes: [
				"Categorias",
				"Alçadas",
				"Responsáveis",
				"Regras ativas",
				"Integrações",
			],
		}[page] || [];
	const isBudgetPage = String(page || "").startsWith("orcamento");
	return (
		<>
			<section className="grid gap-4 md:grid-cols-5">
				{cards.map((card) => (
					<FinancialKpiCard
						key={card}
						item={{
							title: card,
							value: 0,
							type: "number",
							icon: "BadgeDollarSign",
						}}
					/>
				))}
			</section>
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-bold text-slate-950">
					{isBudgetPage ? "Módulo protegido por VPN" : "Estrutura preparada"}
				</h2>
				<p className="mt-2 text-sm font-semibold text-slate-500">
					{isBudgetPage
						? "Esta área já está integrada ao menu, RBAC e trava de VPN. Cadastre as faixas de IP em Configuração > VPN e ative a proteção antes de operar dados reais."
						: "Esta página já está integrada ao menu, RBAC e layout do sistema. A tabela e os filtros estão preparados para receber dados reais da integração financeira."}
				</p>
				<div className="mt-5 grid gap-4 lg:grid-cols-3">
					{[
						[
							"Filtros",
							"Período, empresa, regional, centro de custo e categoria.",
						],
						[
							"Auditoria",
							"Histórico de alterações, aprovações e consumo do orçamento.",
						],
						[
							"Integração",
							"Preparado para receber dados financeiros reais por planilha/API.",
						],
					].map(([title, text]) => (
						<div
							key={title}
							className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
						>
							<h3 className="text-sm font-black text-slate-950">{title}</h3>
							<p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
								{text}
							</p>
						</div>
					))}
				</div>
				<EmptyState
					text={
						isBudgetPage
							? "Nenhum orçamento cadastrado ainda."
							: "Nenhum dado real integrado ainda."
					}
				/>
			</section>
		</>
	);
}

function BudgetDirectoratesQuickConfigModal({
	config = {},
	canManage,
	saving,
	onClose,
	onSave,
}) {
	const existingDirectorates = useMemo(() => {
		const byKey = new Map();
		(config.centers || []).forEach((center) => {
			const name = String(center.diretoria || center.directorate || "").trim();
			if (!name) return;
			const key = normalizeImportHeader(name);
			if (!key || byKey.has(key)) return;
			byKey.set(key, {
				id: budgetEntityId(name, `diretoria-${name}`),
				nome: name,
				centers: 0,
			});
		});
		(config.centers || []).forEach((center) => {
			const key = normalizeImportHeader(center.diretoria || center.directorate || "");
			const item = byKey.get(key);
			if (item && center.tipoPlano !== "S") item.centers += 1;
		});
		return Array.from(byKey.values()).sort((left, right) =>
			left.nome.localeCompare(right.nome, "pt-BR", { numeric: true }),
		);
	}, [config.centers]);
	const savedDirectorates = useMemo(
		() => normalizeDirectorates(config.settings?.directorates, []),
		[config.settings?.directorates],
	);
	const [drafts, setDrafts] = useState(() =>
		existingDirectorates.map((directorate) => {
			const saved = findDirectorateByName(savedDirectorates, directorate.nome);
			return {
				...directorate,
				diretor: saved?.diretor || "",
				emailDiretor: saved?.emailDiretor || "",
				numeroDiretor: saved?.numeroDiretor || "",
			};
		}),
	);

	const updateDraft = (id, field, value) => {
		setDrafts((current) =>
			current.map((item) =>
				item.id === id ? { ...item, [field]: value } : item,
			),
		);
	};

	const save = () => {
		const existingKeys = new Set(
			existingDirectorates.map((item) => normalizeImportHeader(item.nome)),
		);
		const untouched = savedDirectorates.filter(
			(item) => !existingKeys.has(normalizeImportHeader(item.nome)),
		);
		const nextDirectorates = normalizeDirectorates([
			...untouched,
			...drafts.map((item) => ({
				id: item.id,
				nome: item.nome,
				diretor: item.diretor,
				emailDiretor: item.emailDiretor,
				numeroDiretor: item.numeroDiretor,
			})),
		]);
		onSave({
			...config,
			settings: {
				...(config.settings || {}),
				directorates: nextDirectorates,
			},
		});
	};

	return (
		<ModalShell
			title="Diretores por diretoria"
			description="As diretorias vêm dos centros de custo cadastrados. Informe apenas quem responde por cada uma."
			icon={<Settings size={20} />}
			onClose={onClose}
			size="5xl"
			footer={
				<div className="flex flex-wrap justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={save}
						disabled={!canManage || saving}
						className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
					>
						{saving ? (
							<Loader2 size={16} className="animate-spin" />
						) : (
							<CheckCircle2 size={16} />
						)}
						Salvar diretores
					</button>
				</div>
			}
		>
			{drafts.length ? (
				<div className="grid gap-3">
					{drafts.map((directorate) => (
						<section
							key={directorate.id}
							className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
						>
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p className="text-xs font-black uppercase text-slate-500">
										Diretoria
									</p>
									<h3 className="mt-1 text-base font-black text-slate-950">
										{directorate.nome}
									</h3>
									<p className="mt-1 text-xs font-bold text-slate-500">
										{integer.format(directorate.centers)} centro(s) analítico(s)
									</p>
								</div>
								<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
									Campo existente
								</span>
							</div>
							<div className="mt-4 grid gap-3 md:grid-cols-3">
								<label className="text-xs font-black uppercase text-slate-500">
									Diretor
									<input
										value={directorate.diretor}
										disabled={!canManage || saving}
										onChange={(event) =>
											updateDraft(directorate.id, "diretor", event.target.value)
										}
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
										placeholder="Nome do diretor"
									/>
								</label>
								<label className="text-xs font-black uppercase text-slate-500">
									E-mail
									<input
										type="email"
										value={directorate.emailDiretor}
										disabled={!canManage || saving}
										onChange={(event) =>
											updateDraft(
												directorate.id,
												"emailDiretor",
												event.target.value,
											)
										}
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
										placeholder="email@empresa.com"
									/>
								</label>
								<label className="text-xs font-black uppercase text-slate-500">
									Telefone
									<input
										value={directorate.numeroDiretor}
										disabled={!canManage || saving}
										onChange={(event) =>
											updateDraft(
												directorate.id,
												"numeroDiretor",
												event.target.value,
											)
										}
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
										placeholder="Telefone ou WhatsApp"
									/>
								</label>
							</div>
						</section>
					))}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-bold text-slate-500">
					Nenhuma diretoria foi encontrada nos centros de custo.
				</div>
			)}
		</ModalShell>
	);
}

function BudgetPeriodSelector({
	budgetMonthMenuOpen,
	budgetMonthSelectorYear,
	budgetPeriodMode,
	budgetYearMenuOpen,
	budgetYearOptions,
	selectedBudgetReference,
	setBudgetDateModalOpen,
	setBudgetMonthMenuOpen,
	setBudgetMonthOverride,
	setBudgetPeriodMode,
	setBudgetYearMenuOpen,
}) {
	const closeMenus = () => {
		setBudgetMonthMenuOpen(false);
		setBudgetYearMenuOpen(false);
	};
	return (
		<div className="relative flex rounded-xl border border-slate-200">
			<div className="relative">
				<button
					type="button"
					onClick={() => {
						setBudgetPeriodMode("month");
						setBudgetYearMenuOpen(false);
						setBudgetMonthMenuOpen((current) => !current);
					}}
					className={`min-h-11 rounded-l-xl px-5 text-sm font-bold ${budgetPeriodMode === "month" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
				>
					Mês
				</button>
				{budgetMonthMenuOpen ? (
					<div className="absolute left-0 top-[calc(100%+8px)] z-40 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
						<p className="px-3 pb-2 pt-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
							{budgetMonthSelectorYear}
						</p>
						<div className="grid grid-cols-2 gap-1">
							{Array.from({ length: 12 }, (_, index) => index + 1).map(
								(month) => {
									const activeMonth =
										Number(selectedBudgetReference.referenceMonth || 0) ===
											month && budgetPeriodMode === "month";
									return (
										<button
											key={month}
											type="button"
											onClick={() => {
												setBudgetMonthOverride({
													referenceYear: budgetMonthSelectorYear,
													referenceMonth: month,
												});
												setBudgetPeriodMode("month");
												closeMenus();
											}}
											className={`rounded-xl px-3 py-2 text-left text-xs font-black ${activeMonth ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
										>
											{budgetMonthName(month)}
										</button>
									);
								},
							)}
						</div>
					</div>
				) : null}
			</div>
			<div className="relative">
				<button
					type="button"
					onClick={() => {
						setBudgetPeriodMode("year");
						setBudgetMonthMenuOpen(false);
						setBudgetYearMenuOpen((current) => !current);
					}}
					className={`min-h-11 border-l border-slate-200 px-5 text-sm font-bold ${budgetPeriodMode === "year" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
				>
					Ano
				</button>
				{budgetYearMenuOpen ? (
					<div className="absolute left-0 top-[calc(100%+8px)] z-40 w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
						<p className="px-3 pb-2 pt-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
							Ano
						</p>
						<div className="grid gap-1">
							{budgetYearOptions.map((year) => {
								const activeYear =
									Number(selectedBudgetReference.referenceYear || 0) === year &&
									budgetPeriodMode === "year";
								return (
									<button
										key={year}
										type="button"
										onClick={() => {
											setBudgetMonthOverride({
												referenceYear: year,
												referenceMonth:
													selectedBudgetReference.referenceMonth || 1,
											});
											setBudgetPeriodMode("year");
											closeMenus();
										}}
										className={`rounded-xl px-3 py-2 text-left text-xs font-black ${activeYear ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
									>
										{year}
									</button>
								);
							})}
						</div>
					</div>
				) : null}
			</div>
			<button
				type="button"
				onClick={() => {
					closeMenus();
					setBudgetDateModalOpen(true);
				}}
				className={`min-h-11 rounded-r-xl border-l border-slate-200 px-5 text-sm font-bold ${budgetPeriodMode === "custom" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
			>
				Datas
			</button>
		</div>
	);
}

function GeneralPeriodSelector({ period, setPeriod }) {
	return (
		<div className="flex overflow-hidden rounded-xl border border-slate-200">
			{["month", "year"].map((option) => (
				<button
					key={option}
					type="button"
					onClick={() => setPeriod(option)}
					className={`min-h-11 px-5 text-sm font-bold ${period === option ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-50"}`}
				>
					{option === "month" ? "Mês" : "Ano"}
				</button>
			))}
		</div>
	);
}

function FinanceiroPageHeader({
	budgetConfig,
	budgetLoading,
	budgetMonthMenuOpen,
	budgetMonthSelectorYear,
	budgetPeriodDisplayLabel,
	budgetPeriodMode,
	budgetYearMenuOpen,
	budgetYearOptions,
	data,
	hideHeaderControls,
	isBudgetOperationalPage,
	isCompactReportPage,
	load,
	loadBudgetConfig,
	loading,
	meta,
	onOpenDirectoratesConfig,
	page,
	period,
	selectedBudgetReference,
	setBudgetDateModalOpen,
	setBudgetMonthMenuOpen,
	setBudgetMonthOverride,
	setBudgetPeriodMode,
	setBudgetYearMenuOpen,
	setPeriod,
}) {
	const refreshLoading = isBudgetOperationalPage ? budgetLoading : loading;
	return (
		<header>
			<div
				className={`flex flex-col xl:flex-row xl:items-center xl:justify-between ${
					isCompactReportPage ? "gap-2" : "gap-4"
				}`}
			>
				<div>
					<h1
						className={`font-extrabold text-slate-950 ${
							isCompactReportPage ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl"
						}`}
					>
						{meta.title}
					</h1>
					<p
						className={`font-semibold text-slate-600 ${
							isCompactReportPage ? "mt-0 text-sm" : "mt-1 text-base"
						}`}
					>
						{meta.subtitle}
					</p>
				</div>
				{hideHeaderControls ? null : (
					<div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
						<span className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3 text-xs font-bold text-slate-500">
							<CalendarClock size={18} className="text-slate-700" />
							<span>
								<span className="block leading-tight">
									{isBudgetOperationalPage
										? "Última importação:"
										: "Última atualização:"}
								</span>
								<span className="block text-sm text-slate-950">
									{formatUpdatedAt(
										isBudgetOperationalPage
											? budgetConfig?.lastImportInfo?.importedAt
											: data?.updatedAt,
									)}
								</span>
								{isBudgetOperationalPage ? (
									<span className="block text-[11px] font-black text-blue-700">
										{budgetPeriodDisplayLabel}
									</span>
								) : null}
							</span>
						</span>
						{isBudgetOperationalPage ? (
							<BudgetPeriodSelector
								budgetMonthMenuOpen={budgetMonthMenuOpen}
								budgetMonthSelectorYear={budgetMonthSelectorYear}
								budgetPeriodMode={budgetPeriodMode}
								budgetYearMenuOpen={budgetYearMenuOpen}
								budgetYearOptions={budgetYearOptions}
								selectedBudgetReference={selectedBudgetReference}
								setBudgetDateModalOpen={setBudgetDateModalOpen}
								setBudgetMonthMenuOpen={setBudgetMonthMenuOpen}
								setBudgetMonthOverride={setBudgetMonthOverride}
								setBudgetPeriodMode={setBudgetPeriodMode}
								setBudgetYearMenuOpen={setBudgetYearMenuOpen}
							/>
						) : (
							<GeneralPeriodSelector period={period} setPeriod={setPeriod} />
						)}
						<button
							type="button"
							onClick={isBudgetOperationalPage ? () => loadBudgetConfig() : load}
							disabled={refreshLoading}
							className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
						>
							<RefreshCw
								size={16}
								className={refreshLoading ? "animate-spin" : ""}
							/>{" "}
							Atualizar
						</button>
						{page === "orcamentoDashboard" ? (
							<button
								type="button"
								onClick={onOpenDirectoratesConfig}
								disabled={refreshLoading}
								className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
								title="Configurar diretores do ranking"
								aria-label="Configurar diretores do ranking"
							>
								<Settings size={16} />
							</button>
						) : null}
					</div>
				)}
			</div>
		</header>
	);
}

function FinanceiroPageContent({
	budgetConfig,
	budgetDateRange,
	budgetLoading,
	budgetPeriodMode,
	canManage,
	canManageEquipe,
	loadBudgetConfig,
	onOpenDirectoratesConfig,
	page,
	selectedBudgetReference,
	setBudgetConfig,
}) {
	const selectedPeriod = {
		mode: budgetPeriodMode,
		...budgetDateRange,
		...selectedBudgetReference,
	};
	const tariffDetailTypes = {
		reportsTarifasFaturas: "faturas",
		reportsTarifasRecCliente: "recCliente",
		reportsTarifasFormasPagamento: "formasPagamento",
	};
	return (
		<Suspense fallback={<FinanceiroLazyFallback />}>
			{["contasPagar", "contasReceber", "faturamento", "notas"].includes(
				page,
			) ? (
				<SectionPage page={page} />
			) : null}
			{page === "reportsSerasa" ? (
				<SerasaReportPage canManage={canManage} />
			) : null}
			{page === "reportsTarifas" ? (
				<TariffsReportPage canManage={canManage} />
			) : null}
			{tariffDetailTypes[page] ? (
				<TariffsDetailPage type={tariffDetailTypes[page]} />
			) : null}
			{[
				"orcamentoDashboard",
				"orcamentoCentrosCusto",
				"orcamentoDre",
				"orcamentoAprovacoes",
			].includes(page) ? (
				<BudgetOperationalPage
					page={page}
					config={budgetConfig || {}}
					loading={budgetLoading}
					canManage={canManage}
					onConfigUpdated={setBudgetConfig}
					onOpenDirectoratesConfig={onOpenDirectoratesConfig}
					selectedPeriod={selectedPeriod}
				/>
			) : null}
			{page === "orcamentoDados" ? (
				<BudgetDataImportPage
					canManage={canManage}
					onConfigUpdated={loadBudgetConfig}
				/>
			) : null}
			{page === "orcamentoConfiguracoes" ? (
				<OrcamentoConfiguracoesPage
					canManage={canManage}
					config={budgetConfig || {}}
					selectedPeriod={selectedPeriod}
				/>
			) : null}
			{page === "configuracoes" ? (
				<ConfiguracoesPage canManage={canManage} />
			) : null}
			{page === "equipe" ? (
				<FinanceiroEquipePage canManage={canManageEquipe} />
			) : null}
		</Suspense>
	);
}

const MemoizedFinanceiroPageHeader = memo(FinanceiroPageHeader);
const MemoizedFinanceiroPageContent = memo(FinanceiroPageContent);

function FinanceiroLazyFallback() {
	return (
		<section className="grid gap-4 md:grid-cols-3">
			{Array.from({ length: 3 }, (_, index) => (
				<div
					key={index}
					className="min-h-32 animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
				>
					<div className="h-4 w-24 rounded-full bg-slate-100" />
					<div className="mt-5 h-7 w-2/3 rounded-full bg-slate-100" />
					<div className="mt-4 h-3 w-full rounded-full bg-slate-100" />
				</div>
			))}
		</section>
	);
}

export default function FinanceiroPage({ page = "dashboard" }) {
	const { currentUser } = useAuthContext();
	const [period, setPeriod] = useState("month");
	const [budgetPeriodMode, setBudgetPeriodMode] = useState("month");
	const [budgetMonthMenuOpen, setBudgetMonthMenuOpen] = useState(false);
	const [budgetYearMenuOpen, setBudgetYearMenuOpen] = useState(false);
	const [budgetMonthOverride, setBudgetMonthOverride] = useState(null);
	const [budgetDateRange, setBudgetDateRange] = useState({
		startDate: "",
		endDate: "",
	});
	const [budgetDateModalOpen, setBudgetDateModalOpen] = useState(false);
	const [data, setData] = useState(null);
	const [budgetConfig, setBudgetConfig] = useState(null);
	const [budgetLoading, setBudgetLoading] = useState(false);
	const [loading, setLoading] = useState(true);
	const [directoratesConfigOpen, setDirectoratesConfigOpen] = useState(false);
	const [directoratesConfigSaving, setDirectoratesConfigSaving] = useState(false);
	const [message, setMessage] = useState("");
	const meta = PAGE_META[page] || PAGE_META.dashboard;
	const canManage =
		hasPermission(currentUser, "financeiro.configuracoes.manage") ||
		hasPermission(currentUser, "financeiro.gestao_orcamento.manage");
	const canManageEquipe = hasPermission(currentUser, "financeiro.equipe.manage");
	const {
		hideHeaderControls,
		isBudgetOperationalPage,
		isBudgetPage,
		isCompactReportPage,
	} = getFinanceiroPageFlags(page);
	const budgetReference = getBudgetReference(budgetConfig);
	const selectedBudgetReference = budgetMonthOverride || budgetReference;
	const budgetMonthSelectorYear = getBudgetMonthSelectorYear(
		selectedBudgetReference,
		budgetReference,
	);
	const budgetYearOptions = Array.from(
		{ length: 7 },
		(_, index) => 2026 - index,
	);
	const budgetPeriodDisplayLabel = isBudgetOperationalPage
		? buildBudgetPeriod({
				mode: budgetPeriodMode,
				...budgetDateRange,
				...selectedBudgetReference,
			}).displayLabel
		: "";
	const budgetConfigQueryParams = useMemo(() => {
		if (!["orcamentoDashboard", "orcamentoCentrosCusto"].includes(page)) {
			return {};
		}
		return {
			scope: "period",
			ano:
				selectedBudgetReference.referenceYear ||
				new Date().getFullYear(),
		};
	}, [page, selectedBudgetReference.referenceYear]);

	const load = useCallback(async () => {
		setLoading(true);
		setMessage("");
		try {
			const response = await buscarDashboardFinanceiro({ period });
			setData(response.data);
		} catch (error) {
			setMessage(
				error?.message || "Não foi possível carregar os dados financeiros.",
			);
		} finally {
			setLoading(false);
		}
	}, [period]);

	const loadBudgetConfig = useCallback(async ({ silent = false } = {}) => {
		if (!silent) setBudgetLoading(true);
		try {
			const response =
				await buscarCentrosCustoOrcamentoFinanceiro(budgetConfigQueryParams);
			const nextConfig = response.config || {};
			setBudgetConfig(nextConfig);
		} catch (error) {
			setMessage(
				error?.message || "Não foi possível carregar a gestão orçamentária.",
			);
		} finally {
			if (!silent) setBudgetLoading(false);
		}
	}, [budgetConfigQueryParams]);

	const saveDirectoratesConfig = async (nextConfig) => {
		setDirectoratesConfigSaving(true);
		try {
			const response = await salvarCentrosCustoOrcamentoFinanceiro(nextConfig);
			setBudgetConfig(response.config || nextConfig);
			setDirectoratesConfigOpen(false);
			setMessage("Diretores do ranking atualizados com sucesso.");
		} catch (error) {
			setMessage(error?.message || "Não foi possível salvar os diretores.");
		} finally {
			setDirectoratesConfigSaving(false);
		}
	};
	const openDirectoratesConfig = useCallback(() => {
		setDirectoratesConfigOpen(true);
	}, []);
	const closeDirectoratesConfig = useCallback(() => {
		setDirectoratesConfigOpen(false);
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	useEffect(() => {
		if (isBudgetPage) {
			loadBudgetConfig({ silent: page === "orcamentoConfiguracoes" }).catch(
				() => {},
			);
		}
	}, [isBudgetPage, loadBudgetConfig, page]);

	return (
		<main
			className={isCompactReportPage ? "space-y-3" : "space-y-5"}
			style={{ fontFamily: FINANCE_FONT_STACK }}
		>
			<MemoizedFinanceiroPageHeader
				budgetConfig={budgetConfig}
				budgetLoading={budgetLoading}
				budgetMonthMenuOpen={budgetMonthMenuOpen}
				budgetMonthSelectorYear={budgetMonthSelectorYear}
				budgetPeriodDisplayLabel={budgetPeriodDisplayLabel}
				budgetPeriodMode={budgetPeriodMode}
				budgetYearMenuOpen={budgetYearMenuOpen}
				budgetYearOptions={budgetYearOptions}
				data={data}
				hideHeaderControls={hideHeaderControls}
				isBudgetOperationalPage={isBudgetOperationalPage}
				isCompactReportPage={isCompactReportPage}
				load={load}
				loadBudgetConfig={loadBudgetConfig}
				loading={loading}
				meta={meta}
				onOpenDirectoratesConfig={openDirectoratesConfig}
				page={page}
				period={period}
				selectedBudgetReference={selectedBudgetReference}
				setBudgetDateModalOpen={setBudgetDateModalOpen}
				setBudgetMonthMenuOpen={setBudgetMonthMenuOpen}
				setBudgetMonthOverride={setBudgetMonthOverride}
				setBudgetPeriodMode={setBudgetPeriodMode}
				setBudgetYearMenuOpen={setBudgetYearMenuOpen}
				setPeriod={setPeriod}
			/>
			{message ? (
				<div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800">
					{message}
				</div>
			) : null}
			<MemoizedFinanceiroPageContent
				budgetConfig={budgetConfig}
				budgetDateRange={budgetDateRange}
				budgetLoading={budgetLoading}
				budgetPeriodMode={budgetPeriodMode}
				canManage={canManage}
				canManageEquipe={canManageEquipe}
				loadBudgetConfig={loadBudgetConfig}
				onOpenDirectoratesConfig={openDirectoratesConfig}
				page={page}
				selectedBudgetReference={selectedBudgetReference}
				setBudgetConfig={setBudgetConfig}
			/>
			{budgetDateModalOpen ? (
				<BudgetDateRangeModal
					value={budgetDateRange}
					onClose={() => setBudgetDateModalOpen(false)}
					onApply={(range) => {
						setBudgetDateRange(range);
						setBudgetPeriodMode("custom");
						setBudgetDateModalOpen(false);
					}}
				/>
			) : null}
			{directoratesConfigOpen ? (
				<BudgetDirectoratesQuickConfigModal
					canManage={canManage}
					config={budgetConfig || {}}
					onClose={closeDirectoratesConfig}
					onSave={saveDirectoratesConfig}
					saving={directoratesConfigSaving}
				/>
			) : null}
		</main>
	);
}
