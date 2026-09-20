import {
	Activity,
	AlertTriangle,
	ArrowRightLeft,
	BarChart3,
	Building2,
	CalendarClock,
	Check,
	ChevronRight,
	ClipboardCheck,
	Download,
	Edit3,
	ExternalLink,
	FileText,
	History,
	Home,
	KeyRound,
	LayoutGrid,
	MapPin,
	MoreVertical,
	PackageSearch,
	Plus,
	QrCode,
	RefreshCw,
	RotateCcw,
	Search,
	Settings,
	ShieldCheck,
	SlidersHorizontal,
	Table2,
	Trash2,
	Truck,
	Upload,
	User,
	Wrench,
	X,
	Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { hasAnyPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { ROUTES } from "../../../router/routes";
import { listarImoveis } from "../../imoveisAdministrativos/services/imoveisAdministrativosService";
import {
	criarAchadoPerdido,
	criarChecklistPredial,
	criarConsumoFacilities,
	criarDocumentoContratoFacilities,
	criarDocumentoSeguranca,
	criarExecucaoChecklistPredial,
	criarInspecaoSeguranca,
	criarInventarioPatrimonial,
	criarManutencaoPredial,
	criarMovimentacaoPatrimonial,
	criarNaoConformidadeSeguranca,
	criarOcorrenciaPredial,
	criarReajusteContratoFacilities,
	criarRotinaPredial,
	buscarFornecedoresFacilities,
	buscarImoveisConsumosFacilities,
	buscarImoveisContratosFacilities,
	buscarImoveisSeguranca,
	declararChavePerdidaFacilities,
	devolverChaveFacilities,
	enviarLinkAvaliacaoFornecedorFacilities,
	excluirAtivoPatrimonial,
	inativarChaveFacilities,
	listarAchadosPerdidos,
	listarAvaliacoesFornecedoresFacilities,
	listarChecklistsPrediais,
	listarConsumosFacilities,
	listarContratosFacilities,
	listarDocumentosContratosFacilities,
	listarDocumentosSeguranca,
	listarExecucoesChecklistPredial,
	listarFornecedoresFacilities,
	listarInspecoesSeguranca,
	listarItensSeguranca,
	listarChavesFacilities,
	listarManutencoesPrediais,
	listarHistoricoChaveFacilities,
	listarInventariosPatrimoniais,
	listarAtivosPatrimoniais,
	listarMovimentacoesPatrimoniais,
	listarNaoConformidadesSeguranca,
	listarOcorrenciasPrediais,
	listarReajustesContratosFacilities,
	listarRotinasPrediais,
	obterRegistroPublicoQrFacilities,
	obterDashboardFacilities,
	obterDashboardChavesFacilities,
	obterConfigPatrimonio,
	obterRelatorioFacilities,
	regenerarQrChaveFacilities,
	retirarChaveFacilities,
	salvarAtivoPatrimonial,
	atualizarInventarioPatrimonial,
	salvarChaveFacilities,
	salvarContratoFacilities,
	salvarConfigPatrimonio,
	salvarFornecedorFacilities,
	salvarItemSeguranca,
} from "../services/facilitiesService";

const FACILITY_SECTIONS = [
	{
		key: "visao-geral",
		title: "Visão Geral",
		path: ROUTES.FACILITIES,
		icon: BarChart3,
		description:
			"Painel executivo com imóveis, contratos, consumos, pendências e alertas de Facilities.",
		permissionHint: "facilities.dashboard.view",
	},
	{
		key: "imoveis-espacos",
		title: "Imóveis & Espaços",
		path: ROUTES.FACILITIES_IMOVEIS_ESPACOS,
		icon: Building2,
		description:
			"Usa o módulo de Imóveis administrativos como fonte de verdade para unidades, contratos e espaços.",
		primaryLink: ROUTES.FACILITIES_IMOVEIS,
	},
	{
		key: "patrimonio-inventario",
		title: "Patrimônio",
		path: ROUTES.FACILITIES_PATRIMONIO_INVENTARIO,
		icon: PackageSearch,
		description:
			"Ativos patrimoniais, movimentações, QR Code e baixa operacional.",
	},
	{
		key: "inventarios",
		title: "Inventários",
		path: ROUTES.FACILITIES_INVENTARIOS,
		icon: ClipboardCheck,
		description:
			"Conferência física, rastreabilidade e regularização dos ativos patrimoniais.",
	},
	{
		key: "acessos-chaves",
		title: "Acessos & Chaves",
		path: ROUTES.FACILITIES_ACESSOS_CHAVES,
		icon: KeyRound,
		description:
			"Controle nativo de chaves, retirada, devolução, histórico e QR Code do ADM.",
	},
	{
		key: "operacao-predial",
		title: "Operação Predial",
		path: ROUTES.FACILITIES_OPERACAO_PREDIAL,
		icon: ClipboardCheck,
		description:
			"Checklists, rotinas prediais, limpeza, manutenção preventiva e ocorrências.",
	},
	{
		key: "seguranca-conformidade",
		title: "Segurança & Conformidade",
		path: ROUTES.FACILITIES_SEGURANCA_CONFORMIDADE,
		icon: ShieldCheck,
		description:
			"Extintores, AVCB, laudos, acessibilidade, CIPA predial e vencimentos críticos.",
	},
	{
		key: "fornecedores-contratos",
		title: "Fornecedores & Contratos",
		path: ROUTES.FACILITIES_FORNECEDORES_CONTRATOS,
		icon: FileText,
		description:
			"Contratos terceirizados, SLAs, vigências, reajustes e documentos vinculados.",
		primaryLink: ROUTES.IMOVEIS_ADMINISTRATIVOS_CONTRATOS,
	},
	{
		key: "consumos",
		title: "Consumos & Custos",
		path: ROUTES.FACILITIES_CONSUMOS,
		icon: Zap,
		description:
			"Utilidades, encargos e variações mensais dos imóveis.",
		primaryLink: ROUTES.IMOVEIS_ADMINISTRATIVOS_RELATORIOS,
	},
	{
		key: "score",
		title: "Saúde das Unidades",
		path: ROUTES.FACILITIES_SCORE,
		icon: AlertTriangle,
		description:
			"Indicador de saúde por unidade considerando vencimentos, custos, pendências, chaves e conformidade.",
	},
	{
		key: "relatorios",
		title: "Relatórios",
		path: ROUTES.FACILITIES_RELATORIOS,
		icon: Truck,
		description:
			"Relatórios consolidados de imóveis, contratos, consumo, patrimônio e operação predial.",
		primaryLink: ROUTES.IMOVEIS_ADMINISTRATIVOS_RELATORIOS,
	},
];

const numberFormatter = new Intl.NumberFormat("pt-BR");
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

function formatCurrency(value) {
	return currencyFormatter.format(Number(value || 0));
}

function formatDate(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function currentCompetencia() {
	return new Date().toISOString().slice(0, 7);
}

function getSectionFromPath(pathname) {
	if (pathname === ROUTES.FACILITIES_IMOVEIS) {
		return FACILITY_SECTIONS.find((section) => section.key === "imoveis-espacos");
	}
	if (pathname.startsWith(`${ROUTES.FACILITIES_INVENTARIOS}/`) || pathname === ROUTES.FACILITIES_INVENTARIOS) {
		return FACILITY_SECTIONS.find((section) => section.key === "inventarios");
	}
	return (
		FACILITY_SECTIONS.find((section) => section.path === pathname) ||
		FACILITY_SECTIONS[0]
	);
}

function KpiCard({ label, value, detail, tone = "blue", icon: Icon }) {
	const toneClass = {
		blue: "border-blue-100 bg-blue-50 text-blue-700",
		emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
		orange: "border-orange-100 bg-orange-50 text-orange-700",
		red: "border-red-100 bg-red-50 text-red-700",
		violet: "border-violet-100 bg-violet-50 text-violet-700",
	}[tone];
	const displayValue = String(value ?? "");
	const isLongValue = displayValue.length > 13;
	return (
		<article className="relative min-h-[150px] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="min-w-0 pr-12 pt-2">
				<div className="min-w-0">
					<p className="text-xs font-black uppercase text-slate-500">{label}</p>
					<p className={`mt-2 block max-w-full whitespace-nowrap font-black leading-tight text-slate-950 ${isLongValue ? "text-[clamp(1.05rem,1.35vw,1.35rem)] tracking-tight" : "text-[clamp(1.35rem,1.9vw,1.85rem)]"}`}>{value}</p>
					<p className="mt-1 text-sm font-semibold text-slate-500">{detail}</p>
				</div>
				<span className={`absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-2xl border ${toneClass}`}>
					<Icon size={20} />
				</span>
			</div>
		</article>
	);
}

function SectionCard({ section, active }) {
	const Icon = section.icon;
	return (
		<Link
			to={section.path}
			className={`group rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
				active
					? "border-blue-300 ring-2 ring-blue-100"
					: "border-slate-200 hover:border-blue-200"
			}`}
		>
			<div className="flex items-start gap-4">
				<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-700">
					<Icon size={20} />
				</span>
				<div className="min-w-0 flex-1">
					<h3 className="text-base font-black text-slate-950">{section.title}</h3>
					<p className="mt-1 line-clamp-3 text-sm font-semibold leading-6 text-slate-500">
						{section.description}
					</p>
				</div>
				<ChevronRight
					size={18}
					className="mt-1 shrink-0 text-slate-300 transition group-hover:text-blue-600"
				/>
			</div>
		</Link>
	);
}

function EmptyState({ title = "Sem dados para exibir", description = "Os dados aparecerão aqui assim que forem cadastrados ou integrados.", action = null }) {
	return (
		<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
			<p className="text-sm font-black text-slate-700">{title}</p>
			<p className="mt-1 text-sm font-semibold text-slate-500">{description}</p>
			{action ? <div className="mt-4 flex justify-center">{action}</div> : null}
		</div>
	);
}

function SearchableSelect({
	label,
	value,
	onChange,
	options = [],
	placeholder = "Pesquisar...",
	getOptionValue = (item) => item.value,
	getOptionLabel = (item) => item.label,
	className = "",
}) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const selected = options.find((item) => getOptionValue(item) === value);
	const visibleOptions = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		const base = normalized
			? options.filter((item) =>
					String(getOptionLabel(item) || "").toLowerCase().includes(normalized),
				)
			: options;
		return base.slice(0, 25);
	}, [getOptionLabel, options, query]);

	return (
		<label className={`space-y-2 ${className}`}>
			{label ? (
				<span className="text-xs font-black uppercase text-slate-500">{label}</span>
			) : null}
			<div
				className="relative rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-blue-400"
				onFocus={() => setOpen(true)}
				onBlur={() => window.setTimeout(() => setOpen(false), 120)}
			>
				<input
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						setOpen(true);
					}}
					className="h-10 w-full rounded-xl px-3 text-sm font-semibold outline-none"
					placeholder={selected ? getOptionLabel(selected) : placeholder}
				/>
				{selected ? (
					<div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
						<span className="truncate">{String(getOptionLabel(selected) || "")}</span>
						<button
							type="button"
							onClick={() => {
								onChange("");
								setQuery("");
								setOpen(true);
							}}
							className="text-blue-500 hover:text-red-600"
						>
							<X size={13} />
						</button>
					</div>
				) : null}
				{open ? <div className="absolute left-2 right-2 top-[calc(100%-0.25rem)] z-40 mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-100 bg-white shadow-xl">
					{visibleOptions.length ? (
						visibleOptions.map((item) => {
							const optionValue = getOptionValue(item);
							const active = optionValue === value;
							return (
								<button
									type="button"
									key={optionValue}
									onClick={() => {
										onChange(optionValue, item);
										setQuery("");
										setOpen(false);
									}}
									className={`block w-full px-3 py-2 text-left text-xs font-bold transition ${
										active
											? "bg-blue-600 text-white"
											: "text-slate-600 hover:bg-slate-50 hover:text-blue-700"
									}`}
								>
									{String(getOptionLabel(item) || "")}
								</button>
							);
						})
					) : (
						<p className="px-3 py-3 text-xs font-bold text-slate-400">
							Nenhum resultado encontrado.
						</p>
					)}
				</div> : null}
			</div>
		</label>
	);
}

function AppModal({ title, description, open, onClose, children, footer, maxWidth = "max-w-4xl" }) {
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/50 p-4">
			<div className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl ${maxWidth}`}>
				<div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
					<div>
						<h3 className="text-2xl font-black text-slate-950">{title}</h3>
						{description ? (
							<p className="mt-1 text-sm font-semibold text-slate-500">{description}</p>
						) : null}
					</div>
					<button
						type="button"
						onClick={onClose}
						className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
						aria-label="Fechar"
					>
						<X size={18} />
					</button>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
				{footer ? (
					<div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4">
						{footer}
					</div>
				) : null}
			</div>
		</div>
	);
}

function DataList({ title, description, items = [], renderItem, action }) {
	return (
		<section className="self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
				<div>
					<h3 className="text-lg font-black text-slate-950">{title}</h3>
					{description ? (
						<p className="mt-1 text-sm font-semibold text-slate-500">
							{description}
						</p>
					) : null}
				</div>
				{action}
			</div>
			<div className="space-y-3">
				{items.length ? (
					items.map((item, index) => renderItem(item, index))
				) : (
					<EmptyState />
				)}
			</div>
		</section>
	);
}

function SimpleRow({ title, subtitle, value, tone = "slate" }) {
	const toneClass = {
		slate: "bg-slate-100 text-slate-600",
		red: "bg-red-50 text-red-700",
		orange: "bg-orange-50 text-orange-700",
		emerald: "bg-emerald-50 text-emerald-700",
		blue: "bg-blue-50 text-blue-700",
	}[tone];
	return (
		<div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-3">
			<div className="min-w-0">
				<p className="truncate text-sm font-black text-slate-950">{title}</p>
				{subtitle ? (
					<p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
						{subtitle}
					</p>
				) : null}
			</div>
			{value ? (
				<span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${toneClass}`}>
					{value}
				</span>
			) : null}
		</div>
	);
}

const PATRIMONY_TABS = [
	{ key: "visao", label: "Visão Geral", icon: BarChart3 },
	{ key: "ativos", label: "Ativos", icon: PackageSearch },
	{ key: "movimentacoes", label: "Movimentações", icon: ArrowRightLeft },
	{ key: "qrcodes", label: "QR Codes", icon: QrCode },
	{ key: "configuracoes", label: "Configurações", icon: Settings },
];

const DEFAULT_ASSET_FORM = {
	descricao: "",
	categoria: "",
	marca: "",
	modelo: "",
	numeroSerie: "",
	imovelId: "",
	imovel: "",
	ambiente: "",
	responsavel: "",
	estado: "Bom",
	status: "Ativo",
};

function getImovelId(imovel = {}) {
	return String(imovel.id || imovel.documentId || imovel.codigo || "").trim();
}

function getImovelLabel(imovel = {}) {
	return (
		imovel.nome ||
		imovel.titulo ||
		[imovel.classificacao, imovel.cidade, imovel.endereco]
			.filter(Boolean)
			.join(" - ") ||
		getImovelId(imovel) ||
		"Imóvel"
	);
}

function useDebouncedValue(value, delay = 300) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(value), delay);
		return () => window.clearTimeout(timer);
	}, [delay, value]);
	return debounced;
}

function normalizeText(value = "") {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

function displayTitleCase(value = "") {
	const smallWords = new Set(["de", "da", "do", "das", "dos", "e", "em"]);
	return String(value || "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim()
		.split(" ")
		.map((part, index) => {
			if (!part) return part;
			if (index > 0 && smallWords.has(part)) return part;
			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join(" ");
}

function displayClassification(value = "") {
	const normalized = String(value || "").trim();
	if (!normalized) return "-";
	const aliases = {
		"SITE/POP": "POP",
		POP: "POP",
		LOJA: "Loja",
		ADMINISTRATIVO: "Administrativo",
		TERRENO: "Terreno",
		ESCRITORIO: "Escritório",
		"ESCRITÓRIO": "Escritório",
		DATACENTER: "Datacenter",
		TORRE: "Torre",
		ESTACIONAMENTO: "Estacionamento",
	};
	return aliases[normalized.toUpperCase()] || displayTitleCase(normalized);
}

function cleanAddress(value = "") {
	let result = String(value || "").trim();
	if (!result) return "";
	result = result
		.replace(/\bAV\.?\b/gi, "Av.")
		.replace(/\bR\.?\b/gi, "Rua")
		.replace(/\bN[º°]?\b/gi, ",")
		.replace(/\s*-\s*S\/?\s*BAIRRO\b/gi, "")
		.replace(/\s{2,}/g, " ")
		.replace(/\s+,/g, ",")
		.replace(/,\s*,/g, ",")
		.replace(/\s+-\s+$/g, "")
		.trim();
	return displayTitleCase(result);
}

function getImovelDisplay(imovel = {}) {
	const classificacao = displayClassification(imovel.classificacao);
	const cidade = displayTitleCase(imovel.cidade || "");
	const estado = String(imovel.estado || "").replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase();
	const ruaNumero = [imovel.rua, imovel.numero].filter(Boolean).join(", ");
	const endereco = cleanAddress(ruaNumero || imovel.endereco || "");
	const nome = [classificacao !== "-" ? classificacao : "Imóvel", cidade].filter(Boolean).join(" ");
	const localizacao = [cidade, estado].filter(Boolean).join("/");
	return {
		id: getImovelId(imovel),
		nome: nome || getImovelLabel(imovel),
		endereco: endereco || "Endereço não informado",
		localizacao: localizacao || "Sem localização",
		classificacao,
		empresa: String(imovel.base || imovel.empresa || "Não informada").trim(),
		regional: String(imovel.regional || imovel.diretoria || "Não informada").trim(),
		status: imovel.ativo === false ? "Inativo" : "Ativo",
		tipoContrato: displayTitleCase(imovel.tipoContrato || imovel.situacao || "Não informado"),
	};
}

function daysUntil(value) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function getContractState(imovel = {}) {
	const days = daysUntil(imovel.contratoFim);
	if (!imovel.contratoFim) {
		return { label: "Sem contrato", tone: "slate", days: null, attention: false };
	}
	if (days !== null && days < 0) {
		return { label: "Contrato vencido", detail: formatDate(imovel.contratoFim), tone: "red", days, attention: true };
	}
	if (days !== null && days <= 90) {
		return { label: `Vence em ${days} dia(s)`, detail: formatDate(imovel.contratoFim), tone: "orange", days, attention: true };
	}
	return { label: "Contrato ativo", detail: formatDate(imovel.contratoFim), tone: "emerald", days, attention: false };
}

function getRentValue(imovel = {}) {
	return Number(imovel.valorAluguel || imovel.valorOriginal || 0);
}

function getQualityIssues(imovel = {}, duplicateAddress = false, suspiciousRent = false) {
	const issues = [];
	if (!imovel.endereco && !imovel.rua) issues.push("endereço");
	if (!imovel.cidade) issues.push("cidade");
	if (!imovel.classificacao) issues.push("classificação");
	if (!imovel.contratoFim && getRentValue(imovel) > 0) issues.push("contrato não vinculado");
	if (duplicateAddress) issues.push("endereço duplicado");
	if (suspiciousRent) issues.push("verificar valor");
	return issues;
}

function uniqueOptions(items = [], getter) {
	return Array.from(
		new Set(items.map(getter).map((item) => String(item || "").trim()).filter(Boolean)),
	).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function downloadCsv(filename, rows = []) {
	const csv = rows
		.map((row) =>
			row
				.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
				.join(";"),
		)
		.join("\n");
	const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

function normalizeAssetStatus(value = "") {
	const normalized = normalizeText(value || "Ativo");
	if (normalized.includes("manut")) return "Em manutenção";
	if (normalized.includes("estoque")) return "Em estoque";
	if (normalized.includes("baix")) return "Baixado";
	if (normalized.includes("extravi")) return "Extraviado";
	if (normalized.includes("inativ")) return "Inativo";
	return "Em uso";
}

function getAssetQualityIssues(asset = {}, assets = []) {
	const issues = [];
	const description = normalizeText(asset.descricao);
	const category = normalizeText(asset.categoria);
	if (!asset.imovel) issues.push("Localização pendente");
	if (!asset.ambiente) issues.push("Ambiente pendente");
	if (!asset.responsavel) issues.push("Sem responsável");
	if (!asset.qrToken) issues.push("Sem QR Code");
	if (description.includes("tv") && category.includes("geladeira")) issues.push("Revisar categoria");
	if (asset.codigo && assets.filter((item) => item.codigo === asset.codigo).length > 1) issues.push("Código duplicado");
	if (asset.numeroSerie && assets.filter((item) => item.numeroSerie === asset.numeroSerie).length > 1) issues.push("Série duplicada");
	return issues;
}

function getAssetLocationLabel(asset = {}) {
	const imovel = cleanAddress(asset.imovel || "");
	const ambiente = String(asset.ambiente || "").trim();
	return {
		main: imovel || "Sem imóvel",
		detail: ambiente ? `Ambiente: ${ambiente}` : "Ambiente não informado",
	};
}

function buildAssetQrUrl(asset = {}) {
	const token = asset.qrToken || asset.id || asset.codigo;
	return `${window.location.origin}/q/asset-${encodeURIComponent(token)}`;
}

function openAssetQrLink(asset = {}) {
	const token = asset.qrToken || asset.id || asset.codigo;
	if (!token) return;
	window.open(buildAssetQrUrl(asset), "_blank", "noopener,noreferrer");
}

function buildKeyQrUrl(key = {}) {
	const token = key.qrToken || key.id || key.codigo || key.code;
	return `${window.location.origin}/q/key-${encodeURIComponent(token)}`;
}

function buildSafetyQrUrl(item = {}) {
	const token = item.qrToken || item.id || item.codigo;
	return `${window.location.origin}/q/safety-${encodeURIComponent(token)}`;
}

function safeFileName(value = "arquivo") {
	return String(value || "arquivo")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.toLowerCase();
}

async function generateAssetQrDataUrl(asset) {
	const QRCode = await import("qrcode");
	return QRCode.toDataURL(buildAssetQrUrl(asset), {
		errorCorrectionLevel: "H",
		margin: 3,
		width: 900,
		color: {
			dark: "#0f172a",
			light: "#ffffff",
		},
	});
}

async function generateGenericQrDataUrl(url) {
	const QRCode = await import("qrcode");
	return QRCode.toDataURL(url, {
		errorCorrectionLevel: "H",
		margin: 3,
		width: 900,
		color: {
			dark: "#0f172a",
			light: "#ffffff",
		},
	});
}

async function generateSafetyQrDataUrl(item) {
	const QRCode = await import("qrcode");
	return QRCode.toDataURL(buildSafetyQrUrl(item), {
		errorCorrectionLevel: "H",
		margin: 3,
		width: 900,
		color: {
			dark: "#0f172a",
			light: "#ffffff",
		},
	});
}

async function downloadSafetyQrPng(item) {
	const dataUrl = await generateSafetyQrDataUrl(item);
	const link = document.createElement("a");
	link.href = dataUrl;
	link.download = `${safeFileName(item.codigo || "seguranca")}-qr.png`;
	link.click();
}

async function downloadSafetyQrPdf(item) {
	const [{ default: jsPDF }, qrDataUrl] = await Promise.all([
		import("jspdf"),
		generateSafetyQrDataUrl(item),
	]);
	const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [90, 60] });
	pdf.setFillColor(248, 250, 252);
	pdf.roundedRect(4, 4, 82, 52, 4, 4, "F");
	pdf.setDrawColor(191, 219, 254);
	pdf.roundedRect(4, 4, 82, 52, 4, 4, "S");
	pdf.addImage(qrDataUrl, "PNG", 8, 10, 34, 34);
	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(10);
	pdf.setTextColor(15, 23, 42);
	pdf.text(String(item.codigo || "Item de segurança"), 46, 17, { maxWidth: 35 });
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(8);
	pdf.text(String(item.descricao || item.tipo || ""), 46, 24, { maxWidth: 35 });
	pdf.text(String(item.ambiente || ""), 46, 32, { maxWidth: 35 });
	pdf.text(String(item.imovel || ""), 46, 40, { maxWidth: 35 });
	pdf.save(`${safeFileName(item.codigo || "seguranca")}-qr.pdf`);
}

async function downloadAssetQrPng(asset) {
	const dataUrl = await generateAssetQrDataUrl(asset);
	const link = document.createElement("a");
	link.href = dataUrl;
	link.download = `${safeFileName(asset.codigo || "patrimonio")}-qr.png`;
	link.click();
}

async function downloadAssetQrPdf(asset) {
	const [{ default: jsPDF }, qrDataUrl] = await Promise.all([
		import("jspdf"),
		generateAssetQrDataUrl(asset),
	]);
	const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [90, 60] });
	pdf.setFillColor(248, 250, 252);
	pdf.roundedRect(4, 4, 82, 52, 4, 4, "F");
	pdf.setDrawColor(191, 219, 254);
	pdf.roundedRect(4, 4, 82, 52, 4, 4, "S");
	pdf.addImage(qrDataUrl, "PNG", 8, 10, 34, 34);
	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(12);
	pdf.setTextColor(15, 23, 42);
	pdf.text(asset.codigo || "PAT", 46, 16, { maxWidth: 36 });
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(8);
	pdf.text(asset.descricao || "Ativo patrimonial", 46, 22, { maxWidth: 36 });
	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(7);
	pdf.setTextColor(37, 99, 235);
	pdf.text("ADM Facilities", 46, 31, { maxWidth: 36 });
	pdf.setTextColor(71, 85, 105);
	pdf.setFont("helvetica", "normal");
	pdf.text(asset.imovel || "Imóvel", 46, 37, { maxWidth: 36 });
	pdf.text(asset.ambiente || "Ambiente não informado", 46, 43, { maxWidth: 36 });
	pdf.save(`${safeFileName(asset.codigo || "patrimonio")}-qr.pdf`);
}

async function downloadKeyQrPng(key) {
	const dataUrl = await generateGenericQrDataUrl(buildKeyQrUrl(key));
	const link = document.createElement("a");
	link.href = dataUrl;
	link.download = `${safeFileName(key.codigo || key.code || "chave")}-qr.png`;
	link.click();
}

async function downloadKeyQrPdf(key, size = "medio") {
	const [{ default: jsPDF }, qrDataUrl] = await Promise.all([
		import("jspdf"),
		generateGenericQrDataUrl(buildKeyQrUrl(key)),
	]);
	const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
	const sizes = {
		pequeno: { w: 55, qr: 32 },
		medio: { w: 75, qr: 46 },
		grande: { w: 100, qr: 64 },
	};
	const selected = sizes[size] || sizes.medio;
	const x = 20;
	const y = 20;
	pdf.setDrawColor(203, 213, 225);
	pdf.roundedRect(x, y, selected.w, selected.w + 18, 4, 4);
	pdf.addImage(qrDataUrl, "PNG", x + (selected.w - selected.qr) / 2, y + 5, selected.qr, selected.qr);
	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(13);
	pdf.text(key.codigo || key.code || "CHV", x + selected.w / 2, y + selected.qr + 13, { align: "center" });
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(9);
	pdf.text(String(key.description || key.name || "Chave").slice(0, 34), x + selected.w / 2, y + selected.qr + 20, { align: "center" });
	pdf.text(String(key.locationDescription || key.address || "ADM").slice(0, 34), x + selected.w / 2, y + selected.qr + 25, { align: "center" });
	pdf.save(`${safeFileName(key.codigo || key.code || "chave")}-qr.pdf`);
}

async function downloadKeyQrBatchPdf(keys = []) {
	const [{ default: jsPDF }, QRCode] = await Promise.all([import("jspdf"), import("qrcode")]);
	const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
	const cards = keys.slice(0, 30);
	const cardW = 60;
	const cardH = 78;
	const startX = 12;
	const startY = 12;
	for (let index = 0; index < cards.length; index += 1) {
		const key = cards[index];
		if (index > 0 && index % 9 === 0) pdf.addPage();
		const pageIndex = index % 9;
		const col = pageIndex % 3;
		const row = Math.floor(pageIndex / 3);
		const x = startX + col * 65;
		const y = startY + row * 88;
		const qrDataUrl = await QRCode.toDataURL(buildKeyQrUrl(key), {
			errorCorrectionLevel: "H",
			margin: 2,
			width: 600,
		});
		pdf.setDrawColor(203, 213, 225);
		pdf.roundedRect(x, y, cardW, cardH, 3, 3);
		pdf.addImage(qrDataUrl, "PNG", x + 12, y + 5, 36, 36);
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(10);
		pdf.text(key.codigo || key.code || "CHV", x + cardW / 2, y + 48, { align: "center" });
		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(8);
		pdf.text(String(key.description || key.name || "Chave").slice(0, 28), x + cardW / 2, y + 56, { align: "center" });
		pdf.text(String(key.locationDescription || key.address || "ADM").slice(0, 28), x + cardW / 2, y + 62, { align: "center" });
		pdf.text("Brasil Tecpar", x + cardW / 2, y + 70, { align: "center" });
	}
	pdf.save(`etiquetas-chaves-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function PatrimonyAssetModal({
	open,
	onClose,
	onSave,
	saving,
	config,
	imoveis,
	asset,
}) {
	const [form, setForm] = useState(DEFAULT_ASSET_FORM);

	useEffect(() => {
		if (!open) return;
		setForm(asset ? { ...DEFAULT_ASSET_FORM, ...asset } : DEFAULT_ASSET_FORM);
	}, [asset, open]);

	if (!open) return null;

	function updateField(field, value) {
		setForm((current) => ({ ...current, [field]: value }));
	}

	function updateImovel(value) {
		const selected = (imoveis || []).find((item) => getImovelId(item) === value);
		setForm((current) => ({
			...current,
			imovelId: value,
			imovel: selected ? getImovelLabel(selected) : "",
		}));
	}

	return (
		<div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/50 p-4">
			<div className="w-full max-w-4xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-4">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
							Patrimônio & Inventário
						</p>
						<h3 className="mt-1 text-2xl font-black text-slate-950">
							{asset?.id ? "Editar ativo patrimonial" : "Cadastrar ativo patrimonial"}
						</h3>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							Registre bens físicos de Facilities sem misturar com insumos de solicitação.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
					>
						<X size={18} />
					</button>
				</div>

				<div className="mt-6 grid items-start gap-4 md:grid-cols-2">
					<label className="space-y-2">
						<span className="text-xs font-black uppercase text-slate-500">Descrição</span>
						<input
							value={form.descricao}
							onChange={(event) => updateField("descricao", event.target.value)}
							className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
							placeholder="TV 55, cadeira operacional, ar-condicionado..."
						/>
					</label>
					<label className="space-y-2">
						<span className="text-xs font-black uppercase text-slate-500">Categoria</span>
						<select
							value={form.categoria}
							onChange={(event) => updateField("categoria", event.target.value)}
							className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
						>
							<option value="">Selecione uma categoria</option>
							{(config?.categorias || []).map((categoria) => (
								<option key={categoria} value={categoria}>
									{categoria}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-2">
						<span className="text-xs font-black uppercase text-slate-500">Marca</span>
						<input
							value={form.marca}
							onChange={(event) => updateField("marca", event.target.value)}
							className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
						/>
					</label>
					<label className="space-y-2">
						<span className="text-xs font-black uppercase text-slate-500">Modelo</span>
						<input
							value={form.modelo}
							onChange={(event) => updateField("modelo", event.target.value)}
							className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
						/>
					</label>
					<label className="space-y-2">
						<span className="text-xs font-black uppercase text-slate-500">Número de série</span>
						<input
							value={form.numeroSerie}
							onChange={(event) => updateField("numeroSerie", event.target.value)}
							className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
							placeholder={config?.seriePrefixo ? `${config.seriePrefixo}-0001` : ""}
						/>
					</label>
					<SearchableSelect
						label="Imóvel"
						value={form.imovelId}
						onChange={(optionValue) => updateImovel(optionValue)}
						options={imoveis || []}
						getOptionValue={getImovelId}
						getOptionLabel={getImovelLabel}
						placeholder="Pesquisar imóvel por nome, cidade ou endereço"
					/>
					<label className="space-y-2">
						<span className="text-xs font-black uppercase text-slate-500">Ambiente</span>
						<input
							value={form.ambiente}
							onChange={(event) => updateField("ambiente", event.target.value)}
							className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
						/>
					</label>
					<label className="space-y-2">
						<span className="text-xs font-black uppercase text-slate-500">Responsável</span>
						<input
							value={form.responsavel}
							onChange={(event) => updateField("responsavel", event.target.value)}
							className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
						/>
					</label>
				</div>

				<div className="mt-6 flex justify-end gap-3">
					<button
						type="button"
						onClick={onClose}
						className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-600 hover:bg-slate-50"
					>
						Cancelar
					</button>
					<button
						type="button"
						disabled={saving || !form.descricao.trim() || !form.categoria || !form.imovelId}
						onClick={() => onSave(form)}
						className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{saving ? "Salvando..." : asset?.id ? "Salvar alterações" : "Salvar ativo"}
					</button>
				</div>
			</div>
		</div>
	);
}

function PatrimonyConfigPanel({ config, onSave, saving }) {
	const [draft, setDraft] = useState(config || {});
	const [newCategory, setNewCategory] = useState("");

	useEffect(() => {
		setDraft(config || {});
	}, [config]);

	function updateField(field, value) {
		setDraft((current) => ({ ...current, [field]: value }));
	}

	function addCategory() {
		const category = newCategory.trim();
		if (!category) return;
		setDraft((current) => ({
			...current,
			categorias: Array.from(new Set([...(current.categorias || []), category])),
		}));
		setNewCategory("");
	}

	function removeCategory(category) {
		setDraft((current) => ({
			...current,
			categorias: (current.categorias || []).filter((item) => item !== category),
		}));
	}

	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
				<div>
					<h4 className="text-lg font-black text-slate-950">
						Configurações do patrimônio
					</h4>
					<p className="mt-1 text-sm font-semibold text-slate-500">
						Categorias, padrão de código patrimonial e regra de número de série.
					</p>
				</div>
				<button
					type="button"
					onClick={() => onSave(draft)}
					disabled={saving}
					className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{saving ? "Salvando..." : "Salvar configurações"}
				</button>
			</div>

			<div className="mt-6 grid items-start gap-4 lg:grid-cols-3">
				<label className="space-y-2">
					<span className="text-xs font-black uppercase text-slate-500">
						Prefixo do patrimônio
					</span>
					<input
						value={draft.codigoPrefixo || ""}
						onChange={(event) => updateField("codigoPrefixo", event.target.value.toUpperCase())}
						className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
						placeholder="PAT"
					/>
				</label>
				<label className="space-y-2">
					<span className="text-xs font-black uppercase text-slate-500">
						Dígitos sequenciais
					</span>
					<input
						type="number"
						min="3"
						max="10"
						value={draft.codigoPadding || 6}
						onChange={(event) => updateField("codigoPadding", Number(event.target.value || 6))}
						className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
					/>
				</label>
				<label className="space-y-2">
					<span className="text-xs font-black uppercase text-slate-500">
						Prefixo do número de série
					</span>
					<input
						value={draft.seriePrefixo || ""}
						onChange={(event) => updateField("seriePrefixo", event.target.value.toUpperCase())}
						className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
						placeholder="ADM"
					/>
				</label>
			</div>

			<label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-black text-slate-700">
				<input
					type="checkbox"
					checked={Boolean(draft.serieObrigatoria)}
					onChange={(event) => updateField("serieObrigatoria", event.target.checked)}
					className="h-4 w-4"
				/>
				Exigir número de série ao cadastrar patrimônio
			</label>

			<div className="mt-6">
				<p className="text-xs font-black uppercase text-slate-500">
					Categorias patrimoniais
				</p>
				<div className="mt-3 flex flex-col gap-3 md:flex-row">
					<input
						value={newCategory}
						onChange={(event) => setNewCategory(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								addCategory();
							}
						}}
						className="h-12 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
						placeholder="Ex: Nobreak, Roteador, Projetor..."
					/>
					<button
						type="button"
						onClick={addCategory}
						className="h-12 rounded-xl border border-blue-200 bg-blue-50 px-5 text-sm font-black text-blue-700 hover:bg-blue-100"
					>
						Adicionar categoria
					</button>
				</div>
				<div className="mt-4 flex flex-wrap gap-2">
					{(draft.categorias || []).map((categoria) => (
						<span
							key={categoria}
							className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700"
						>
							{categoria}
							<button
								type="button"
								onClick={() => removeCategory(categoria)}
								className="text-slate-400 hover:text-red-600"
							>
								<X size={13} />
							</button>
						</span>
					))}
				</div>
			</div>
		</section>
	);
}

function PatrimonyInventoryPanel({ standaloneInventory = false }) {
	const [tab, setTab] = useState(standaloneInventory ? "inventarios" : "visao");
	const [assetQuery, setAssetQuery] = useState("");
	const [assetQuickFilter, setAssetQuickFilter] = useState("todos");
	const [assetPage, setAssetPage] = useState(1);
	const [assetPageSize, setAssetPageSize] = useState(25);
	const [assetFilters, setAssetFilters] = useState({
		imovel: "",
		categoria: "",
		status: "",
		responsavel: "",
	});
	const [assets, setAssets] = useState([]);
	const [inventories, setInventories] = useState([]);
	const [movements, setMovements] = useState([]);
	const [imoveis, setImoveis] = useState([]);
	const [config, setConfig] = useState({ categorias: [] });
	const [loading, setLoading] = useState(true);
	const [modalOpen, setModalOpen] = useState(false);
	const [selectedAsset, setSelectedAsset] = useState(null);
	const [editingAsset, setEditingAsset] = useState(null);
	// selectedInventory nao e lido em nenhum lugar (so o setter e usado, pra
	// marcar o item apos salvar/selecionar) — renomeado com _ pra nao
	// disparar no-unused-vars sem apagar a logica que usa o setter.
	const [_selectedInventory, setSelectedInventory] = useState(null);
	const [inventoryDraft, setInventoryDraft] = useState(null);
	const [saving, setSaving] = useState(false);
	const [savingConfig, setSavingConfig] = useState(false);
	const [savingInventory, setSavingInventory] = useState(false);
	const [savingMovement, setSavingMovement] = useState(false);
	const [error, setError] = useState("");
	const [inventoryForm, setInventoryForm] = useState({
		imovelId: "",
		ambiente: "",
		responsavel: "",
	});
	const [movementForm, setMovementForm] = useState({
		assetId: "",
		destinoImovelId: "",
		destinoAmbiente: "",
		responsavelRecebimento: "",
		motivo: "",
	});

	const ativosComQr = assets.filter((item) => item.qrToken).length;
	const debouncedAssetQuery = useDebouncedValue(assetQuery, 250);
	const enrichedAssets = useMemo(() => assets.map((asset) => ({
		...asset,
		_statusLabel: normalizeAssetStatus(asset.status),
		_location: getAssetLocationLabel(asset),
		_qualityIssues: getAssetQualityIssues(asset, assets),
	})), [assets]);
	const patrimonyMetrics = useMemo(() => {
		const total = enrichedAssets.length;
		const emUso = enrichedAssets.filter((item) => item._statusLabel === "Em uso").length;
		const manutencao = enrichedAssets.filter((item) => item._statusLabel === "Em manutenção").length;
		const estoque = enrichedAssets.filter((item) => item._statusLabel === "Em estoque").length;
		const semResponsavel = enrichedAssets.filter((item) => !item.responsavel).length;
		const divergencias = enrichedAssets.filter((item) => item._qualityIssues.length).length;
		const qrPercent = total ? Math.round((ativosComQr / total) * 100) : 0;
		return { total, emUso, manutencao, estoque, semResponsavel, divergencias, qrPercent };
	}, [ativosComQr, enrichedAssets]);
	const assetOptions = useMemo(() => ({
		imoveis: uniqueOptions(enrichedAssets, (asset) => asset.imovel),
		categorias: uniqueOptions(enrichedAssets, (asset) => asset.categoria),
		statuses: uniqueOptions(enrichedAssets, (asset) => asset._statusLabel),
		responsaveis: uniqueOptions(enrichedAssets, (asset) => asset.responsavel),
	}), [enrichedAssets]);
	const filteredAssets = useMemo(() => {
		const normalized = normalizeText(debouncedAssetQuery);
		let next = enrichedAssets.filter((asset) => {
			const searchable = [asset.codigo, asset.descricao, asset.numeroSerie, asset.responsavel, asset.imovel, asset.ambiente, asset.categoria].filter(Boolean).join(" ");
			if (normalized && !normalizeText(searchable).includes(normalized)) return false;
			if (assetFilters.imovel && asset.imovel !== assetFilters.imovel) return false;
			if (assetFilters.categoria && asset.categoria !== assetFilters.categoria) return false;
			if (assetFilters.status && asset._statusLabel !== assetFilters.status) return false;
			if (assetFilters.responsavel && asset.responsavel !== assetFilters.responsavel) return false;
			return true;
		});
		if (assetQuickFilter === "em-uso") next = next.filter((asset) => asset._statusLabel === "Em uso");
		if (assetQuickFilter === "estoque") next = next.filter((asset) => asset._statusLabel === "Em estoque");
		if (assetQuickFilter === "manutencao") next = next.filter((asset) => asset._statusLabel === "Em manutenção");
		if (assetQuickFilter === "sem-responsavel") next = next.filter((asset) => !asset.responsavel);
		if (assetQuickFilter === "sem-localizacao") next = next.filter((asset) => !asset.imovel);
		if (assetQuickFilter === "sem-qr") next = next.filter((asset) => !asset.qrToken);
		return next;
	}, [assetFilters, assetQuickFilter, debouncedAssetQuery, enrichedAssets]);
	useEffect(() => setAssetPage(1), [assetFilters, assetPageSize, assetQuickFilter, debouncedAssetQuery]);
	const assetTotalPages = Math.max(1, Math.ceil(filteredAssets.length / assetPageSize));
	const assetCurrentPage = Math.min(assetPage, assetTotalPages);
	const assetPageItems = filteredAssets.slice((assetCurrentPage - 1) * assetPageSize, assetCurrentPage * assetPageSize);
	const statusDistribution = useMemo(() => {
		const grouped = new Map();
		enrichedAssets.forEach((asset) => grouped.set(asset._statusLabel, (grouped.get(asset._statusLabel) || 0) + 1));
		return Array.from(grouped.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
	}, [enrichedAssets]);
	const categoryDistribution = useMemo(() => {
		const grouped = new Map();
		enrichedAssets.forEach((asset) => grouped.set(asset.categoria || "Sem categoria", (grouped.get(asset.categoria || "Sem categoria") || 0) + 1));
		return Array.from(grouped.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
	}, [enrichedAssets]);
	const selectedInventoryImovel = useMemo(
		() => imoveis.find((item) => getImovelId(item) === inventoryForm.imovelId) || null,
		[imoveis, inventoryForm.imovelId],
	);
	const inventoryScopeAssets = useMemo(() => {
		if (!inventoryForm.imovelId) return [];
		const selectedLabel = getImovelLabel(selectedInventoryImovel || {});
		const selectedKeys = [
			inventoryForm.imovelId,
			selectedLabel,
			selectedInventoryImovel?.nome,
			selectedInventoryImovel?.titulo,
			selectedInventoryImovel?.codigo,
		].filter(Boolean).map(normalizeText);
		return enrichedAssets.filter((asset) => {
			const assetKeys = [asset.imovelId, asset.imovel, asset.localizacao, asset.unidade]
				.filter(Boolean)
				.map(normalizeText);
			const sameProperty = selectedKeys.some((key) => assetKeys.includes(key));
			if (!sameProperty) return false;
			if (inventoryForm.ambiente && normalizeText(asset.ambiente) !== normalizeText(inventoryForm.ambiente)) return false;
			return true;
		});
	}, [enrichedAssets, inventoryForm.ambiente, inventoryForm.imovelId, selectedInventoryImovel]);
	const inventoryMetrics = useMemo(() => {
		const activeInventories = inventories.filter((item) => !["concluido", "cancelado", "excluido"].includes(normalizeText(item.status)));
		const allItems = inventories.flatMap((item) => Array.isArray(item.itens) ? item.itens : []);
		const pendingItems = allItems.filter((item) => normalizeText(item.status || item.inventoryStatus) === "pendente");
		const checkedItems = allItems.filter((item) => ["encontrado", "localizado", "regularizado"].includes(normalizeText(item.status || item.inventoryStatus)));
		const divergentItems = allItems.filter((item) => ["ausente", "divergente", "nao_localizado", "não localizado", "extra"].includes(normalizeText(item.status || item.inventoryStatus)));
		const assetsWithFreshInventory = new Set(
			allItems
				.filter((item) => item.assetId && item.conferidoEm)
				.map((item) => item.assetId),
		);
		const coverage = enrichedAssets.length ? Math.round((assetsWithFreshInventory.size / enrichedAssets.length) * 100) : 0;
		return {
			active: activeInventories.length,
			pending: pendingItems.length,
			checked: checkedItems.length,
			divergences: divergentItems.length,
			coverage,
		};
	}, [enrichedAssets.length, inventories]);
	function exportAssets() {
		downloadCsv(`patrimonio-${new Date().toISOString().slice(0, 10)}.csv`, [
			["Código", "Descrição", "Categoria", "Imóvel", "Ambiente", "Responsável", "Status", "QR", "Qualidade"],
			...filteredAssets.map((asset) => [asset.codigo, asset.descricao, asset.categoria, asset.imovel, asset.ambiente, asset.responsavel, asset._statusLabel, asset.qrToken ? "Disponível" : "Pendente", asset._qualityIssues.join(", ") || "Completo"]),
		]);
	}

	useEffect(() => {
		let active = true;
		Promise.all([
			listarAtivosPatrimoniais(),
			listarInventariosPatrimoniais(),
			listarMovimentacoesPatrimoniais(),
			listarImoveis(),
			obterConfigPatrimonio(),
		])
			.then(([items, inventoriesData, movementsData, imoveisData, configData]) => {
				if (!active) return;
				setAssets(items || []);
				setInventories(inventoriesData || []);
				setMovements(movementsData || []);
				setImoveis(imoveisData || []);
				setConfig(configData || { categorias: [] });
			})
			.catch((err) => {
				if (active) setError(err?.message || "Erro ao carregar patrimônio.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	async function handleSave(form) {
		setSaving(true);
		setError("");
		try {
			const saved = await salvarAtivoPatrimonial(form);
			setAssets((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
			setModalOpen(false);
			setEditingAsset(null);
			setSelectedAsset((current) => (current?.id === saved.id ? saved : current));
		} catch (err) {
			setError(err?.message || "Erro ao salvar ativo patrimonial.");
		} finally {
			setSaving(false);
		}
	}

	async function handleDeleteAsset(asset) {
		if (!asset?.id) return;
		const confirmed = window.confirm(`Excluir o ativo ${asset.codigo || asset.descricao || "selecionado"}? Ele sairá da listagem e dos indicadores, mantendo rastreabilidade interna.`);
		if (!confirmed) return;
		setSaving(true);
		setError("");
		try {
			await excluirAtivoPatrimonial(asset.id);
			setAssets((current) => current.filter((item) => item.id !== asset.id));
			setSelectedAsset((current) => (current?.id === asset.id ? null : current));
			setEditingAsset((current) => (current?.id === asset.id ? null : current));
			setModalOpen(false);
		} catch (err) {
			setError(err?.message || "Erro ao excluir ativo patrimonial.");
		} finally {
			setSaving(false);
		}
	}

	function openAssetForm(asset = null) {
		setEditingAsset(asset);
		setModalOpen(true);
	}

	async function cancelInventoryDraft() {
		if (!inventoryDraft?.id) return;
		const confirmed = window.confirm("Cancelar este inventário em aberto? Ele ficará marcado como cancelado no histórico.");
		if (!confirmed) return;
		setSavingInventory(true);
		setError("");
		try {
			const saved = await atualizarInventarioPatrimonial(inventoryDraft.id, {
				...inventoryDraft,
				status: "cancelado",
			});
			setInventories((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
			setSelectedInventory(null);
			setInventoryDraft(null);
		} catch (err) {
			setError(err?.message || "Erro ao cancelar inventário.");
		} finally {
			setSavingInventory(false);
		}
	}

	async function handleSaveConfig(draft) {
		setSavingConfig(true);
		setError("");
		try {
			const saved = await salvarConfigPatrimonio(draft);
			setConfig(saved);
		} catch (err) {
			setError(err?.message || "Erro ao salvar configurações do patrimônio.");
		} finally {
			setSavingConfig(false);
		}
	}

	function updateInventoryForm(field, value) {
		setInventoryForm((current) => ({ ...current, [field]: value }));
	}

	function updateMovementForm(field, value) {
		setMovementForm((current) => ({ ...current, [field]: value }));
	}

	async function handleCreateInventory() {
		if (!inventoryForm.imovelId) {
			setError("Selecione um imóvel cadastrado para iniciar o inventário.");
			return;
		}
		if (!inventoryScopeAssets.length) {
			setError("Nenhum ativo foi encontrado para este escopo. Cadastre ativos neste imóvel ou selecione o imóvel/ambiente correto.");
			return;
		}
		setSavingInventory(true);
		setError("");
		try {
			const inventory = await criarInventarioPatrimonial(inventoryForm);
			setInventories((current) => [inventory, ...current]);
			setInventoryForm({ imovelId: "", ambiente: "", responsavel: "" });
			openInventory(inventory);
		} catch (err) {
			setError(err?.message || "Erro ao iniciar inventário.");
		} finally {
			setSavingInventory(false);
		}
	}

	function openInventory(inventory) {
		const draft = {
			...(inventory || {}),
			itens: Array.isArray(inventory?.itens) ? inventory.itens.map((item) => ({ ...item })) : [],
		};
		setSelectedInventory(inventory);
		setInventoryDraft(draft);
	}

	function updateInventoryItem(index, field, value) {
		setInventoryDraft((current) => {
			const itens = Array.isArray(current?.itens) ? [...current.itens] : [];
			itens[index] = {
				...(itens[index] || {}),
				[field]: value,
				conferidoEm: field === "status" && value !== "pendente" ? new Date().toISOString() : itens[index]?.conferidoEm,
			};
			return { ...(current || {}), itens };
		});
	}

	function addInventoryExtra() {
		setInventoryDraft((current) => ({
			...(current || {}),
			itens: [
				...(current?.itens || []),
				{ assetId: "", codigo: "", descricao: "", status: "extra", observacao: "" },
			],
		}));
	}

	async function saveInventoryDraft(status = "") {
		if (!inventoryDraft?.id) return;
		if (status === "concluido") {
			const pending = (inventoryDraft.itens || []).filter((item) => normalizeText(item.status) === "pendente").length;
			if (pending > 0) {
				setError("Não é possível concluir inventário com itens pendentes. Finalize a conferência ou cancele o inventário.");
				return;
			}
		}
		setSavingInventory(true);
		setError("");
		try {
			const saved = await atualizarInventarioPatrimonial(inventoryDraft.id, {
				...inventoryDraft,
				status: status || inventoryDraft.status,
			});
			setInventories((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
			setSelectedInventory(saved);
			setInventoryDraft({ ...saved, itens: Array.isArray(saved.itens) ? saved.itens.map((item) => ({ ...item })) : [] });
		} catch (err) {
			setError(err?.message || "Erro ao salvar inventário.");
		} finally {
			setSavingInventory(false);
		}
	}

	async function handleCreateMovement() {
		setSavingMovement(true);
		setError("");
		try {
			const movement = await criarMovimentacaoPatrimonial(movementForm);
			setMovements((current) => [movement, ...current]);
			const refreshed = await listarAtivosPatrimoniais();
			setAssets(refreshed || []);
			setMovementForm({
				assetId: "",
				destinoImovelId: "",
				destinoAmbiente: "",
				responsavelRecebimento: "",
				motivo: "",
			});
		} catch (err) {
			setError(err?.message || "Erro ao registrar movimentação.");
		} finally {
			setSavingMovement(false);
		}
	}

	return (
		<section className="space-y-5">
			<PatrimonyAssetModal
				open={modalOpen}
				onClose={() => {
					setModalOpen(false);
					setEditingAsset(null);
				}}
				onSave={handleSave}
				saving={saving}
				config={config}
				imoveis={imoveis}
				asset={editingAsset}
			/>
			<AppModal
				open={Boolean(selectedAsset)}
				onClose={() => setSelectedAsset(null)}
				title={selectedAsset?.codigo || "Ativo patrimonial"}
				description={selectedAsset?.descricao || "Detalhes do patrimônio"}
				maxWidth="max-w-3xl"
			>
				{selectedAsset ? (
					<div className="grid gap-3 md:grid-cols-2">
						{[
							["Categoria", selectedAsset.categoria],
							["Marca", selectedAsset.marca],
							["Modelo", selectedAsset.modelo],
							["Número de série", selectedAsset.numeroSerie],
							["Imóvel", selectedAsset.imovel],
							["Ambiente", selectedAsset.ambiente],
							["Responsável", selectedAsset.responsavel],
							["Estado", selectedAsset.estado],
							["Status", selectedAsset.status],
							["QR", selectedAsset.qrToken ? "Gerado" : "Pendente"],
						].map(([label, value]) => (
							<div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
								<p className="text-xs font-black uppercase text-slate-500">{label}</p>
								<p className="mt-1 text-sm font-black text-slate-950">{value || "-"}</p>
							</div>
						))}
						<div className="flex flex-wrap gap-2 md:col-span-2">
							<button type="button" onClick={() => openAssetForm(selectedAsset)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 hover:bg-slate-50">
								<Edit3 size={16} /> Editar ativo
							</button>
							<button type="button" disabled={!selectedAsset.qrToken} onClick={() => openAssetQrLink(selectedAsset)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 text-sm font-black text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40">
								<ExternalLink size={16} /> Abrir QR
							</button>
							<button type="button" onClick={() => downloadAssetQrPng(selectedAsset)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white">
								<Download size={16} /> Baixar QR PNG
							</button>
							<button type="button" onClick={() => downloadAssetQrPdf(selectedAsset)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-black text-white">
								<Download size={16} /> Baixar QR PDF
							</button>
							<button type="button" disabled={saving} onClick={() => handleDeleteAsset(selectedAsset)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 text-sm font-black text-red-700 hover:bg-red-100 disabled:opacity-50">
								<Trash2 size={16} /> Excluir ativo
							</button>
						</div>
					</div>
				) : null}
			</AppModal>
			<AppModal
				open={Boolean(inventoryDraft)}
				onClose={() => {
					setSelectedInventory(null);
					setInventoryDraft(null);
				}}
				title={inventoryDraft?.codigo || "Inventário"}
				description={`${inventoryDraft?.imovel || "Imóvel"} · ${inventoryDraft?.ambiente || "Todos os ambientes"}`}
				maxWidth="max-w-6xl"
			>
				{inventoryDraft ? (
					<div className="space-y-4">
						<div className="grid gap-3 md:grid-cols-4">
							<KpiCard label="Esperados" value={numberFormatter.format(Number(inventoryDraft.esperados || 0))} detail="Base do imóvel" tone="blue" icon={PackageSearch} />
							<KpiCard label="Encontrados" value={numberFormatter.format(Number(inventoryDraft.encontrados || 0))} detail="Conferidos" tone="emerald" icon={Check} />
							<KpiCard label="Pendentes" value={numberFormatter.format(Number(inventoryDraft.pendentes ?? inventoryDraft.ausentes ?? 0))} detail="Ainda não conferidos" tone={Number(inventoryDraft.pendentes ?? inventoryDraft.ausentes ?? 0) ? "orange" : "emerald"} icon={AlertTriangle} />
							<KpiCard label="Extras" value={numberFormatter.format(Number(inventoryDraft.extras || 0))} detail="Fora da base esperada" tone={Number(inventoryDraft.extras || 0) ? "orange" : "blue"} icon={Plus} />
						</div>
						<div className="rounded-2xl border border-slate-200 bg-white">
							<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
								<div>
									<p className="text-sm font-black text-slate-950">Itens do inventário</p>
									<p className="text-xs font-semibold text-slate-500">Marque cada item conferido e salve a evolução.</p>
								</div>
							<button type="button" onClick={addInventoryExtra} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50"><Plus size={15} /> Item extra</button>
							</div>
							<div className="max-h-[46vh] overflow-y-auto">
								{(inventoryDraft.itens || []).length ? (
									<div className="divide-y divide-slate-100">
										{inventoryDraft.itens.map((item, index) => (
											<div key={`${item.assetId || item.codigo || "extra"}-${index}`} className="grid gap-3 p-4 md:grid-cols-[1fr_150px_1fr]">
												<div>
													<input
														value={item.codigo || ""}
														onChange={(event) => updateInventoryItem(index, "codigo", event.target.value)}
														className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-black text-blue-700 outline-none focus:border-blue-400"
														placeholder="Código"
													/>
													<input
														value={item.descricao || ""}
														onChange={(event) => updateInventoryItem(index, "descricao", event.target.value)}
														className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400"
														placeholder="Descrição"
													/>
												</div>
												<select
													value={item.status || "pendente"}
													onChange={(event) => updateInventoryItem(index, "status", event.target.value)}
													className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-400"
												>
													<option value="pendente">Pendente</option>
													<option value="encontrado">Encontrado</option>
													<option value="ausente">Ausente</option>
													<option value="extra">Extra</option>
												</select>
												<input
													value={item.observacao || ""}
													onChange={(event) => updateInventoryItem(index, "observacao", event.target.value)}
													className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400"
													placeholder="Observação"
												/>
											</div>
										))}
									</div>
								) : (
									<EmptyState title="Nenhum ativo esperado para este escopo" description="Adicione item extra se encontrou patrimônio fora da base cadastrada." />
								)}
							</div>
						</div>
						<div className="flex flex-wrap justify-end gap-2">
							<button type="button" onClick={cancelInventoryDraft} disabled={savingInventory} className="h-11 rounded-xl border border-red-200 bg-red-50 px-5 text-sm font-black text-red-700 hover:bg-red-100 disabled:opacity-50">Cancelar inventário</button>
							<button type="button" onClick={() => saveInventoryDraft("em_andamento")} disabled={savingInventory} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700 disabled:opacity-50">Salvar andamento</button>
							<button type="button" onClick={() => saveInventoryDraft("concluido")} disabled={savingInventory} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">Concluir inventário</button>
						</div>
					</div>
				) : null}
			</AppModal>
			<header className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">{standaloneInventory ? "Facilities > Inventários" : "Facilities > Patrimônio"}</p>
						<h3 className="mt-2 text-2xl font-black text-slate-950">{standaloneInventory ? "Inventários" : "Patrimônio"}</h3>
						<p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
							{standaloneInventory
								? "Conferência física, rastreabilidade e regularização dos ativos patrimoniais."
								: "Controle ativos físicos, movimentações e identificação por QR Code."}
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{standaloneInventory ? (
							<Link to={ROUTES.FACILITIES_PATRIMONIO_INVENTARIO} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"><PackageSearch size={16} /> Ver patrimônio</Link>
						) : (
							<>
								<button type="button" onClick={() => openAssetForm(null)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"><Plus size={17} /> Novo ativo</button>
								<Link to={ROUTES.FACILITIES_INVENTARIOS} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"><ClipboardCheck size={16} /> Inventários</Link>
								<button type="button" onClick={exportAssets} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"><Download size={16} /> Exportar</button>
							</>
						)}
					</div>
				</div>
				{standaloneInventory ? null : <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
					{PATRIMONY_TABS.map((item) => {
						const Icon = item.icon;
						const active = tab === item.key;
						return (
							<button
								type="button"
								key={item.key}
								onClick={() => setTab(item.key)}
								className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-black transition ${
									active
										? "border-blue-600 bg-blue-600 text-white shadow-sm"
										: "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
								}`}
							>
								<Icon size={16} />
								{item.label}
							</button>
						);
					})}
				</div>}
			</header>

			{error ? (
				<div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700">
					{error}
				</div>
			) : null}

			{tab === "visao" ? (
				<>
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
						<KpiCard label="Total de ativos" value={loading ? "..." : numberFormatter.format(patrimonyMetrics.total)} detail="Base patrimonial" tone="blue" icon={PackageSearch} />
						<KpiCard label="Em uso" value={loading ? "..." : numberFormatter.format(patrimonyMetrics.emUso)} detail="Ativos operacionais" tone="emerald" icon={Check} />
						<KpiCard label="Em manutenção" value={loading ? "..." : numberFormatter.format(patrimonyMetrics.manutencao)} detail="Fora de operação" tone={patrimonyMetrics.manutencao ? "orange" : "emerald"} icon={AlertTriangle} />
						<KpiCard label="Com QR Code" value={loading ? "..." : numberFormatter.format(ativosComQr)} detail={`${patrimonyMetrics.qrPercent}% da base identificada`} tone="violet" icon={QrCode} />
						<KpiCard label="Sem responsável" value={loading ? "..." : numberFormatter.format(patrimonyMetrics.semResponsavel)} detail="Requer atribuição" tone={patrimonyMetrics.semResponsavel ? "orange" : "emerald"} icon={User} />
						<KpiCard label="Divergências" value={loading ? "..." : numberFormatter.format(patrimonyMetrics.divergencias)} detail="Pontos para revisão" tone={patrimonyMetrics.divergencias ? "red" : "emerald"} icon={AlertTriangle} />
					</div>
					<div className="grid items-start gap-4 xl:grid-cols-[0.9fr_1.1fr]">
						<PatrimonyAttentionPanel assets={enrichedAssets} inventories={inventories} />
						<div className="grid items-start gap-4 lg:grid-cols-2">
							<DistributionPanel title="Ativos por status" items={statusDistribution} />
							<DistributionPanel title="Patrimônio por categoria" items={categoryDistribution} />
						</div>
					</div>
				</>
			) : null}

			{tab === "ativos" || tab === "visao" ? (
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
						<div>
							<h4 className="text-lg font-black text-slate-950">Ativos</h4>
							<p className="text-sm font-semibold text-slate-500">Localize, audite e movimente os bens físicos de Facilities.</p>
						</div>
						<div className="flex flex-wrap gap-2">
							{[["todos", "Todos"], ["em-uso", "Em uso"], ["estoque", "Estoque"], ["manutencao", "Manutenção"], ["sem-responsavel", "Sem responsável"], ["sem-localizacao", "Sem localização"], ["sem-qr", "Sem QR"]].map(([id, label]) => (
								<button key={id} type="button" onClick={() => setAssetQuickFilter(id)} className={`rounded-full border px-3 py-1.5 text-xs font-black ${assetQuickFilter === id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-700"}`}>{label}</button>
							))}
						</div>
					</div>
					<div className="mb-4 grid items-start gap-3 lg:grid-cols-[1fr_180px_180px_180px_180px_auto]">
						<label className="relative block">
							<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
							<input value={assetQuery} onChange={(event) => setAssetQuery(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 pl-11 pr-4 text-sm font-semibold outline-none focus:border-blue-400" placeholder="Buscar ativo, código, série ou responsável..." />
						</label>
						<FilterSelect label="Imóvel" value={assetFilters.imovel} options={assetOptions.imoveis} onChange={(value) => setAssetFilters((current) => ({ ...current, imovel: value }))} />
						<FilterSelect label="Categoria" value={assetFilters.categoria} options={assetOptions.categorias} onChange={(value) => setAssetFilters((current) => ({ ...current, categoria: value }))} />
						<FilterSelect label="Status" value={assetFilters.status} options={assetOptions.statuses} onChange={(value) => setAssetFilters((current) => ({ ...current, status: value }))} />
						<FilterSelect label="Responsável" value={assetFilters.responsavel} options={assetOptions.responsaveis} onChange={(value) => setAssetFilters((current) => ({ ...current, responsavel: value }))} />
						<select value={assetPageSize} onChange={(event) => setAssetPageSize(Number(event.target.value))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-400">
							<option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
						</select>
					</div>
					{assets.length ? (
						<div className="overflow-hidden rounded-2xl border border-slate-100">
							<table className="w-full min-w-[920px] text-left text-sm">
								<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
									<tr>
										<th className="px-4 py-3">Ativo</th>
										<th className="px-4 py-3">Categoria</th>
										<th className="px-4 py-3">Localização</th>
										<th className="px-4 py-3">Responsável</th>
										<th className="px-4 py-3">Status</th>
										<th className="px-4 py-3">Inventário</th>
										<th className="px-4 py-3">QR</th>
										<th className="px-4 py-3 text-right">Ações</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{assetPageItems.map((asset) => (
										<tr key={asset.id} onClick={() => setSelectedAsset(asset)} className="cursor-pointer font-semibold text-slate-700 hover:bg-blue-50/50">
											<td className="px-4 py-3">
												<p className="font-black text-blue-700">{asset.codigo || "Sem código"}</p>
												<p className="mt-1 font-black text-slate-950">{asset.descricao || "Ativo sem descrição"}</p>
												<p className="mt-0.5 text-xs text-slate-500">Série: {asset.numeroSerie || "não informada"}</p>
											</td>
											<td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">{asset.categoria || "Sem categoria"}</span></td>
											<td className="px-4 py-3">
												<p className="font-black text-slate-800">{asset._location.main}</p>
												<p className="text-xs text-slate-500">{asset._location.detail}</p>
											</td>
											<td className="px-4 py-3">{asset.responsavel || "Sem responsável"}</td>
											<td className="px-4 py-3">
												<AssetStatusBadge status={asset._statusLabel} />
											</td>
											<td className="px-4 py-3">
												{asset._qualityIssues.length ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700">{asset._qualityIssues[0]}</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">Conferível</span>}
											</td>
											<td className="px-4 py-3">{asset.qrToken ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">QR disponível</span> : <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-black text-orange-700">Sem QR</span>}</td>
											<td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
												<AssetActions asset={asset} onOpen={() => setSelectedAsset(asset)} onEdit={() => openAssetForm(asset)} onDelete={() => handleDeleteAsset(asset)} />
											</td>
										</tr>
									))}
								</tbody>
							</table>
							<div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3">
								<p className="text-xs font-bold text-slate-500">Mostrando {numberFormatter.format(assetPageItems.length)} de {numberFormatter.format(filteredAssets.length)} ativo(s)</p>
								<div className="flex gap-2">
									<button type="button" disabled={assetCurrentPage <= 1} onClick={() => setAssetPage((current) => Math.max(1, current - 1))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Anterior</button>
									<button type="button" disabled={assetCurrentPage >= assetTotalPages} onClick={() => setAssetPage((current) => Math.min(assetTotalPages, current + 1))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Próxima</button>
								</div>
							</div>
						</div>
					) : (
						<EmptyState
							title="Nenhum ativo patrimonial cadastrado"
							description="Cadastre mesas, cadeiras, equipamentos e bens físicos pelo botão Novo ativo."
						/>
					)}
				</section>
			) : null}

			{tab === "inventarios" ? (
				<section className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
						<KpiCard label="Em andamento" value={loading ? "..." : numberFormatter.format(inventoryMetrics.active)} detail="Ciclos abertos" tone="blue" icon={ClipboardCheck} />
						<KpiCard label="Ativos a conferir" value={loading ? "..." : numberFormatter.format(inventoryMetrics.pending)} detail="Itens pendentes" tone={inventoryMetrics.pending ? "orange" : "emerald"} icon={PackageSearch} />
						<KpiCard label="Ativos conferidos" value={loading ? "..." : numberFormatter.format(inventoryMetrics.checked)} detail="Localizados ou regularizados" tone="emerald" icon={Check} />
						<KpiCard label="Divergências abertas" value={loading ? "..." : numberFormatter.format(inventoryMetrics.divergences)} detail="Ausentes, extras ou divergentes" tone={inventoryMetrics.divergences ? "red" : "emerald"} icon={AlertTriangle} />
						<KpiCard label="Cobertura patrimonial" value={loading ? "..." : `${inventoryMetrics.coverage}%`} detail="Ativos com conferência registrada" tone="violet" icon={BarChart3} />
					</div>
					<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<h4 className="text-lg font-black text-slate-950">Novo inventário por escopo</h4>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							Selecione o imóvel cadastrado. O sistema carrega automaticamente os ativos do escopo e vincula cada item ao ativo patrimonial.
						</p>
						<div className="mt-4 grid gap-4 md:grid-cols-4">
							<SearchableSelect
								value={inventoryForm.imovelId}
								onChange={(optionValue) => updateInventoryForm("imovelId", optionValue)}
								options={imoveis}
								getOptionValue={getImovelId}
								getOptionLabel={getImovelLabel}
								placeholder="Pesquisar imóvel para inventário"
								className="md:col-span-2"
							/>
							<input
								value={inventoryForm.ambiente}
								onChange={(event) => updateInventoryForm("ambiente", event.target.value)}
								className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
								placeholder="Ambiente"
							/>
							<input
								value={inventoryForm.responsavel}
								onChange={(event) => updateInventoryForm("responsavel", event.target.value)}
								className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
								placeholder="Responsável"
							/>
						</div>
						<div className={`mt-4 rounded-2xl border p-4 text-sm font-black ${
							inventoryForm.imovelId && inventoryScopeAssets.length
								? "border-emerald-100 bg-emerald-50 text-emerald-700"
								: "border-amber-100 bg-amber-50 text-amber-700"
						}`}>
							{inventoryForm.imovelId
								? `${numberFormatter.format(inventoryScopeAssets.length)} ativo(s) serão incluídos neste inventário.`
								: "Selecione um imóvel para visualizar quantos ativos serão carregados automaticamente."}
						</div>
						<div className="mt-4 flex justify-end">
							<button
								type="button"
								disabled={savingInventory || !inventoryForm.imovelId || !inventoryScopeAssets.length}
								onClick={handleCreateInventory}
								className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{savingInventory ? "Criando..." : "Iniciar inventário"}
							</button>
						</div>
					</div>
					<DataList
						title="Inventários em andamento e histórico"
						description="Comparativo de esperados, conferidos, pendentes, divergentes e extras."
						items={inventories.map((item) => ({
							id: item.id,
							raw: item,
							title: `${item.nome || item.codigo || "Inventário"} · ${item.imovel || "Imóvel"}`,
							subtitle: `${item.ambiente || "Todos os ambientes"} · Esperados ${item.esperados || 0} · Conferidos ${item.encontrados || 0} · Pendentes ${item.pendentes ?? item.ausentes ?? 0} · Divergências ${item.divergencias || 0}`,
							value: item.status || "em_andamento",
							tone: item.status === "concluido" ? "emerald" : "orange",
						}))}
						renderItem={(item) => (
							<button key={item.id} type="button" onClick={() => openInventory(item.raw)} className="block w-full text-left">
								<SimpleRow {...item} />
							</button>
						)}
					/>
				</section>
			) : null}

			{tab === "movimentacoes" ? (
				<section className="space-y-4">
					<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<h4 className="text-lg font-black text-slate-950">Transferir ativo</h4>
						<p className="mt-1 text-sm font-semibold text-slate-500">
							Registre movimentações entre imóveis e ambientes. O ativo é atualizado após salvar.
						</p>
					<div className="mt-4 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
							<SearchableSelect
								value={movementForm.assetId}
								onChange={(optionValue) => updateMovementForm("assetId", optionValue)}
								options={assets}
								getOptionValue={(asset) => asset.id}
								getOptionLabel={(asset) => `${asset.codigo || ""} · ${asset.descricao || ""} · ${asset.imovel || ""}`}
								placeholder="Pesquisar por código, nome ou local"
							/>
							<SearchableSelect
								value={movementForm.destinoImovelId}
								onChange={(optionValue) => updateMovementForm("destinoImovelId", optionValue)}
								options={imoveis}
								getOptionValue={getImovelId}
								getOptionLabel={getImovelLabel}
								placeholder="Pesquisar destino"
							/>
							<input
								value={movementForm.destinoAmbiente}
								onChange={(event) => updateMovementForm("destinoAmbiente", event.target.value)}
								className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
								placeholder="Ambiente destino"
							/>
							<input
								value={movementForm.responsavelRecebimento}
								onChange={(event) => updateMovementForm("responsavelRecebimento", event.target.value)}
								className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
								placeholder="Responsável recebimento"
							/>
							<input
								value={movementForm.motivo}
								onChange={(event) => updateMovementForm("motivo", event.target.value)}
								className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400 xl:col-span-2"
								placeholder="Motivo"
							/>
						</div>
						<div className="mt-4 flex justify-end">
							<button
								type="button"
								disabled={savingMovement || !movementForm.assetId || !movementForm.destinoImovelId}
								onClick={handleCreateMovement}
								className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{savingMovement ? "Registrando..." : "Registrar movimentação"}
							</button>
						</div>
					</div>
					<DataList
						title="Histórico de movimentações"
						description="Transferências registradas para rastreabilidade patrimonial."
						items={movements.map((item) => ({
							id: item.id,
							title: `${item.assetCodigo || "PAT"} · ${item.assetDescricao || "Ativo"}`,
							subtitle: `${item.origemImovel || "Origem"} → ${item.destinoImovel || "Destino"} · ${item.destinoAmbiente || "Sem ambiente"}`,
							value: item.tipo || "transferencia",
							tone: "blue",
						}))}
						renderItem={(item) => <SimpleRow key={item.id} {...item} />}
					/>
				</section>
			) : null}

			{tab === "qrcodes" ? (
				<DataList
					title="Etiquetas e QR Codes"
					description="Identificação visual dos ativos para consulta, conferência e inventário em campo."
					items={enrichedAssets.slice(0, 10).map((asset) => ({
						id: asset.id,
						title: asset.codigo || "Sem código",
						subtitle: `${asset.descricao || "Ativo sem descrição"} · ${asset._location.main}`,
						value: asset.qrToken ? "Disponível" : "Pendente",
						tone: asset.qrToken ? "emerald" : "orange",
					}))}
					renderItem={(item) => <SimpleRow key={item.id} {...item} />}
				/>
			) : null}

			{tab === "configuracoes" ? (
				<PatrimonyConfigPanel
					config={config}
					onSave={handleSaveConfig}
					saving={savingConfig}
				/>
			) : null}
		</section>
	);
}

function PatrimonyAttentionPanel({ assets = [], inventories = [] }) {
	const items = [
		{
			id: "sem-localizacao",
			label: "Ativos sem localização",
			description: "Precisam de imóvel ou ambiente para rastreio.",
			value: assets.filter((asset) => !asset.imovel).length,
			tone: "orange",
		},
		{
			id: "sem-responsavel",
			label: "Ativos sem responsável",
			description: "Bens sem pessoa ou área vinculada.",
			value: assets.filter((asset) => !asset.responsavel).length,
			tone: "orange",
		},
		{
			id: "sem-qr",
			label: "Ativos sem QR Code",
			description: "Itens que ainda não possuem etiqueta para conferência.",
			value: assets.filter((asset) => !asset.qrToken).length,
			tone: "blue",
		},
		{
			id: "divergencias",
			label: "Possíveis divergências",
			description: "Cadastro incompleto, duplicado ou incoerente.",
			value: assets.filter((asset) => asset._qualityIssues?.length).length,
			tone: "red",
		},
		{
			id: "inventarios",
			label: "Inventários em andamento",
			description: "Conferências abertas que ainda precisam de conclusão.",
			value: inventories.filter((item) => normalizeText(item.status) !== "concluido").length,
			tone: "violet",
		},
	].filter((item) => item.value > 0);

	const toneClass = {
		red: "border-red-100 bg-red-50 text-red-700",
		orange: "border-orange-100 bg-orange-50 text-orange-700",
		blue: "border-blue-100 bg-blue-50 text-blue-700",
		violet: "border-violet-100 bg-violet-50 text-violet-700",
	};

	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h4 className="text-lg font-black text-slate-950">Requer atenção</h4>
					<p className="mt-1 text-sm font-semibold text-slate-500">Pontos de cadastro e inventário que merecem revisão.</p>
				</div>
				<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{items.length || "OK"}</span>
			</div>
			<div className="mt-4 space-y-3">
				{items.length ? (
					items.map((item) => (
						<div key={item.id} className={`rounded-2xl border p-4 ${toneClass[item.tone] || toneClass.blue}`}>
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="text-sm font-black">{item.label}</p>
									<p className="mt-1 text-xs font-bold opacity-80">{item.description}</p>
								</div>
								<strong className="text-xl font-black">{numberFormatter.format(item.value)}</strong>
							</div>
						</div>
					))
				) : (
					<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-black text-emerald-700">
						Nenhuma pendência crítica encontrada na base patrimonial.
					</div>
				)}
			</div>
		</section>
	);
}

function DistributionPanel({ title, items = [] }) {
	const visibleItems = items.filter((item) => Number(item.value || 0) > 0).slice(0, 6);
	const max = Math.max(1, ...visibleItems.map((item) => Number(item.value || 0)));

	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<h4 className="text-lg font-black text-slate-950">{title}</h4>
			<div className="mt-4 space-y-3">
				{visibleItems.length ? (
					visibleItems.map((item) => {
						const width = Math.max(8, Math.round((Number(item.value || 0) / max) * 100));
						return (
							<div key={item.label}>
								<div className="mb-1 flex items-center justify-between gap-3 text-xs font-black text-slate-600">
									<span className="truncate">{item.label}</span>
									<span>{numberFormatter.format(item.value)}</span>
								</div>
								<div className="h-2 overflow-hidden rounded-full bg-slate-100">
									<div className="h-full rounded-full bg-blue-600" style={{ width: `${width}%` }} />
								</div>
							</div>
						);
					})
				) : (
					<p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Ainda não há dados suficientes para esta distribuição.</p>
				)}
			</div>
		</section>
	);
}

function AssetStatusBadge({ status }) {
	const normalized = normalizeText(status);
	const className = normalized.includes("manut")
		? "bg-orange-50 text-orange-700"
		: normalized.includes("estoque")
			? "bg-blue-50 text-blue-700"
			: normalized.includes("baix") || normalized.includes("extravi") || normalized.includes("inativ")
				? "bg-red-50 text-red-700"
				: "bg-emerald-50 text-emerald-700";

	return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${className}`}>{status || "Em uso"}</span>;
}

function AssetActions({ asset, onOpen, onEdit, onDelete }) {
	const disabled = !asset?.qrToken;

	return (
		<details className="relative inline-block text-left">
			<summary className="inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
				<MoreVertical size={16} />
			</summary>
			<div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 text-left shadow-xl">
				<button type="button" onClick={onOpen} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
					<Search size={14} /> Ver ficha
				</button>
				<button type="button" onClick={onEdit} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
					<Edit3 size={14} /> Editar ativo
				</button>
				<button type="button" disabled={disabled} onClick={() => openAssetQrLink(asset)} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
					<ExternalLink size={14} /> Abrir QR
				</button>
				<button type="button" disabled={disabled} onClick={() => downloadAssetQrPng(asset)} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
					<Download size={14} /> Baixar QR PNG
				</button>
				<button type="button" disabled={disabled} onClick={() => downloadAssetQrPdf(asset)} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
					<FileText size={14} /> Baixar QR PDF
				</button>
				<div className="my-1 border-t border-slate-100" />
				<button type="button" onClick={onDelete} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-red-700 hover:bg-red-50">
					<Trash2 size={14} /> Excluir ativo
				</button>
			</div>
		</details>
	);
}

const SAFETY_TABS = [
	{ key: "visao", label: "Visão Geral", icon: BarChart3 },
	{ key: "itens", label: "Itens de Segurança", icon: ShieldCheck },
	{ key: "inspecoes", label: "Inspeções", icon: ClipboardCheck },
	{ key: "documentos", label: "Documentos & Licenças", icon: FileText },
	{ key: "nao-conformidades", label: "Não Conformidades", icon: AlertTriangle },
	{ key: "vencimentos", label: "Vencimentos", icon: History },
	{ key: "configuracoes", label: "Configurações", icon: Settings },
];

function getSafetyDue(item = {}) {
	return item.validade || item.proximaRecarga || item.proximaManutencao || item.dataProgramada || "";
}

function safetyStatus(item = {}) {
	const status = item.status || "";
	const due = getSafetyDue(item);
	const days = daysUntil(due);
	if (days !== null && days < 0) return "Vencido";
	if (days !== null && days <= 60) return "Em atenção";
	return status || "Ativo";
}

const SAFETY_ITEM_TYPE_CONFIG = {
	Extintor: {
		showFireAgent: true,
		showCapacity: true,
		showClassification: true,
		showRecharge: true,
		showHydrostatic: true,
		technicalHint: "Informe agente, capacidade, classificação e dados do equipamento.",
	},
	Hidrante: {
		showManufacturer: true,
		showModel: true,
		showSerial: true,
		showCapacity: false,
		showClassification: false,
		showRecharge: false,
		showHydrostatic: true,
		technicalHint: "Informe fabricante, modelo, identificação e teste quando aplicável.",
	},
	"Iluminação de emergência": {
		showManufacturer: true,
		showModel: true,
		showSerial: true,
		showCapacity: false,
		showClassification: false,
		showRecharge: false,
		showHydrostatic: false,
		technicalHint: "Informe fabricante, modelo e número de série quando houver.",
	},
	Sinalização: {
		showManufacturer: false,
		showModel: false,
		showSerial: false,
		showCapacity: false,
		showClassification: false,
		showRecharge: false,
		showHydrostatic: false,
		technicalHint: "Para sinalização, priorize descrição, localização e validade quando aplicável.",
	},
	default: {
		showManufacturer: true,
		showModel: true,
		showSerial: true,
		showCapacity: false,
		showClassification: false,
		showRecharge: false,
		showHydrostatic: false,
		technicalHint: "Informe apenas as especificações disponíveis para este tipo de item.",
	},
};

function safetyTypeConfig(type) {
	return SAFETY_ITEM_TYPE_CONFIG[type] || SAFETY_ITEM_TYPE_CONFIG.default;
}

function addMonthsToDate(value, months) {
	if (!value || !months) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	date.setMonth(date.getMonth() + months);
	return date.toISOString().slice(0, 10);
}

function periodicityMonths(value) {
	const normalized = normalizeText(value);
	if (normalized.includes("trimestral")) return 3;
	if (normalized.includes("semestral")) return 6;
	if (normalized.includes("anual")) return 12;
	return 1;
}

function SafetyPropertySearch({ value, onChange }) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState([]);
	const [loading, setLoading] = useState(false);
	const [selected, setSelected] = useState(null);
	const debounced = useDebouncedValue(query, 300);

	useEffect(() => {
		let active = true;
		if (debounced.trim().length < 2) {
			setResults([]);
			return () => {
				active = false;
			};
		}
		setLoading(true);
		buscarImoveisSeguranca({ q: debounced, limit: 8 })
			.then((items) => {
				if (active) setResults(items || []);
			})
			.catch(() => {
				if (active) setResults([]);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [debounced]);

	return (
		<label className="space-y-2">
			<span className="text-xs font-black uppercase text-slate-500">Imóvel</span>
			<div className="rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-blue-400">
				<div className="flex items-center gap-2 rounded-xl px-2">
					<Search size={16} className="text-slate-400" />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						className="h-10 min-w-0 flex-1 text-sm font-semibold outline-none"
						placeholder={selected ? selected.nome : "Buscar imóvel por nome, cidade ou código..."}
					/>
				</div>
				{selected || value ? (
					<div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
						<span className="truncate">{selected?.nome || value}</span>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								onChange("", null);
							}}
							className="text-blue-500 hover:text-red-600"
						>
							<X size={14} />
						</button>
					</div>
				) : null}
				{query.trim().length >= 2 ? (
					<div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-100">
						{loading ? (
							<p className="px-3 py-3 text-xs font-bold text-slate-400">Buscando imóveis...</p>
						) : results.length ? (
							results.map((item) => (
								<button
									type="button"
									key={item.id}
									onClick={() => {
										setSelected(item);
										onChange(item.id, item);
										setQuery("");
									}}
									className="block w-full px-3 py-2 text-left transition hover:bg-blue-50"
								>
									<p className="text-xs font-black text-slate-700">{item.nome}</p>
									<p className="text-xs font-semibold text-slate-500">{[item.cidade, item.estado].filter(Boolean).join("/") || "Localidade não informada"}</p>
								</button>
							))
						) : (
							<p className="px-3 py-3 text-xs font-bold text-slate-400">Nenhum imóvel encontrado.</p>
						)}
					</div>
				) : (
					<p className="mt-2 px-2 text-xs font-semibold text-slate-400">Digite pelo menos 2 caracteres.</p>
				)}
			</div>
		</label>
	);
}

function SafetyCompliancePanel() {
	const [activeTab, setActiveTab] = useState("visao");
	const [items, setItems] = useState([]);
	const [inspections, setInspections] = useState([]);
	const [documents, setDocuments] = useState([]);
	const [nonconformities, setNonconformities] = useState([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [modal, setModal] = useState("");
	const [quickFilter, setQuickFilter] = useState("todos");
	const [itemForm, setItemForm] = useState({
		tipo: "Extintor",
		descricao: "",
		imovelId: "",
		ambiente: "",
		localizacaoComplementar: "",
		fabricante: "",
		modelo: "",
		numeroSerie: "",
		dataInstalacao: "",
		validade: "",
		periodicidadeInspecao: "Mensal",
		fornecedor: "",
		responsavel: "",
		status: "Ativo",
		carga: "ABC",
		capacidade: "",
		ultimaRecarga: "",
		proximaRecarga: "",
		testeHidrostatico: "",
		observacoes: "",
	});
	const [inspectionForm, setInspectionForm] = useState({
		itemId: "",
		tipoInspecao: "Periódica",
		responsavel: "",
		criticidade: "Alta",
		prazoCorrecao: "",
		observacao: "",
		respostas: {
			Lacre: "conforme",
			Pressão: "conforme",
			Mangueira: "conforme",
			Sinalização: "conforme",
			"Acesso livre": "conforme",
			Validade: "conforme",
		},
	});
	const [documentForm, setDocumentForm] = useState({
		tipo: "AVCB",
		numero: "",
		imovelId: "",
		orgaoEmissor: "",
		dataEmissao: "",
		validade: "",
		responsavel: "",
		arquivoUrl: "",
		observacoes: "",
	});
	const [ncForm, setNcForm] = useState({
		descricao: "",
		origem: "Registro manual",
		imovelId: "",
		criticidade: "Média",
		responsavel: "",
		prazo: "",
		acaoCorretiva: "",
	});

	const loadSafety = async () => {
		setLoading(true);
		setError("");
		try {
			const [itemsData, inspectionsData, docsData, ncsData] = await Promise.all([
				listarItensSeguranca(),
				listarInspecoesSeguranca(),
				listarDocumentosSeguranca(),
				listarNaoConformidadesSeguranca(),
			]);
			setItems(itemsData || []);
			setInspections(inspectionsData || []);
			setDocuments(docsData || []);
			setNonconformities(ncsData || []);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os dados de segurança e conformidade.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadSafety();
	}, []);

	const update = (setter) => (field, value) => setter((current) => ({ ...current, [field]: value }));
	const updateItem = update(setItemForm);
	const updateInspection = update(setInspectionForm);
	const updateDocument = update(setDocumentForm);
	const updateNc = update(setNcForm);

	async function withSave(action, fallback) {
		setSaving(true);
		setError("");
		try {
			await action();
			setModal("");
		} catch (err) {
			setError(err?.message || fallback);
		} finally {
			setSaving(false);
		}
	}

	const itemAttention = items.filter((item) => ["em atencao", "em atenção", "vencido", "substituir", "em manutencao", "em manutenção"].includes(normalizeText(safetyStatus(item))));
	const pendingInspections = items.filter((item) => {
		const last = inspections.find((inspection) => inspection.itemId === item.id);
		return !last;
	});
	const openNcs = nonconformities.filter((nc) => !["resolvida", "cancelada"].includes(normalizeText(nc.status)));
	const docsDue = documents.filter((doc) => {
		const days = daysUntil(doc.validade);
		return days !== null && days >= 0 && days <= 60;
	});
	const docsExpired = documents.filter((doc) => {
		const days = daysUntil(doc.validade);
		return days !== null && days < 0;
	});
	const dueEvents = [
		...items.map((item) => ({ id: `item-${item.id}`, type: "Item físico", title: `${item.codigo || ""} ${item.descricao || item.tipo}`.trim(), subtitle: item.imovel, due: getSafetyDue(item), severity: safetyStatus(item) })),
		...documents.map((doc) => ({ id: `doc-${doc.id}`, type: "Documento", title: `${doc.tipo}${doc.numero ? ` ${doc.numero}` : ""}`, subtitle: doc.imovel, due: doc.validade, severity: doc.status })),
	].filter((event) => event.due).sort((a, b) => new Date(a.due) - new Date(b.due));
	const attention = [
		...docsExpired.map((doc) => ({ id: `doc-${doc.id}`, title: `${doc.tipo} vencido`, subtitle: doc.imovel, value: "CRÍTICO", tone: "red" })),
		...itemAttention.map((item) => ({ id: `item-${item.id}`, title: `${safetyStatus(item)} · ${item.codigo || item.tipo}`, subtitle: item.imovel || item.ambiente, value: safetyStatus(item), tone: operationTone(safetyStatus(item)) })),
		...openNcs.map((nc) => ({ id: `nc-${nc.id}`, title: nc.descricao, subtitle: nc.imovel || nc.origem, value: nc.criticidade, tone: operationTone(nc.criticidade) })),
	].slice(0, 8);
	const riskByUnit = Object.entries([...itemAttention, ...openNcs, ...docsExpired].reduce((acc, item) => {
		const key = item.imovel || "Unidade não informada";
		acc[key] = (acc[key] || 0) + 1;
		return acc;
	}, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([title, count]) => ({ id: title, title, subtitle: `${count} pendência(s)`, value: "risco", tone: count >= 3 ? "red" : "orange" }));

	const filteredItems = items.filter((item) => {
		if (quickFilter === "todos") return true;
		if (quickFilter === "vencidos") return safetyStatus(item) === "Vencido";
		if (quickFilter === "atencao") return safetyStatus(item) === "Em atenção";
		if (quickFilter === "sem-inspecao") return pendingInspections.some((pending) => pending.id === item.id);
		if (quickFilter === "nao-conformes") return inspections.some((inspection) => inspection.itemId === item.id && inspection.status === "nao_conforme");
		return normalizeText(item.status) === normalizeText(quickFilter);
	});

	function actionForTab() {
		if (activeTab === "inspecoes") return { label: "Nova inspeção", modal: "inspection", icon: ClipboardCheck };
		if (activeTab === "documentos") return { label: "Novo documento", modal: "document", icon: FileText };
		if (activeTab === "nao-conformidades") return { label: "Nova NC", modal: "nc", icon: AlertTriangle };
		if (activeTab === "configuracoes") return { label: "Novo item", modal: "item", icon: Plus };
		return { label: "Novo item", modal: "item", icon: Plus };
	}
	const action = actionForTab();
	const ActionIcon = action.icon;

	return (
		<section className="space-y-5">
			<header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Facilities &gt; Segurança & Conformidade</p>
						<h2 className="mt-2 text-3xl font-black text-slate-950">Segurança & Conformidade</h2>
						<p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
							Controle itens de segurança, inspeções, documentos obrigatórios, vencimentos e não conformidades.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button type="button" onClick={() => setModal(action.modal)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 hover:bg-slate-50"><ActionIcon size={17} /> {action.label}</button>
					</div>
				</div>
				<div className="mt-5 flex gap-2 overflow-x-auto pb-1">
					{SAFETY_TABS.map((tab) => {
						const Icon = tab.icon;
						const active = activeTab === tab.key;
						return (
							<button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-4 text-xs font-black transition ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"}`}>
								<Icon size={16} /> {tab.label}
							</button>
						);
					})}
				</div>
			</header>

			{error ? (
				<div className="flex items-center justify-between gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700">
					<span>{error}</span>
					<button type="button" onClick={loadSafety} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-red-700">Tentar novamente</button>
				</div>
			) : null}

			{activeTab === "visao" ? (
				<div className="space-y-5">
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
						<KpiCard label="Itens de segurança" value={loading ? "..." : numberFormatter.format(items.length)} detail="Itens cadastrados" tone="blue" icon={ShieldCheck} />
						<KpiCard label="Itens em atenção" value={loading ? "..." : numberFormatter.format(itemAttention.length)} detail="Vencidos ou críticos" tone={itemAttention.length ? "orange" : "emerald"} icon={AlertTriangle} />
						<KpiCard label="Inspeções pendentes" value={loading ? "..." : numberFormatter.format(pendingInspections.length)} detail="Itens sem inspeção" tone={pendingInspections.length ? "orange" : "emerald"} icon={ClipboardCheck} />
						<KpiCard label="Não conformidades" value={loading ? "..." : numberFormatter.format(openNcs.length)} detail="Abertas" tone={openNcs.length ? "red" : "emerald"} icon={AlertTriangle} />
						<KpiCard label="Docs vencendo" value={loading ? "..." : numberFormatter.format(docsDue.length)} detail="Próximos 60 dias" tone="orange" icon={FileText} />
						<KpiCard label="Docs vencidos" value={loading ? "..." : numberFormatter.format(docsExpired.length)} detail="Ação imediata" tone={docsExpired.length ? "red" : "emerald"} icon={FileText} />
					</div>
					<div className="grid items-start gap-5 xl:grid-cols-[1.1fr_0.9fr]">
						<DataList title="Requer atenção" description="Riscos físicos, documentos vencidos e não conformidades abertas." items={attention} renderItem={(item) => <SimpleRow key={item.id} {...item} />} />
						<DataList title="Próximos vencimentos" description="Eventos canônicos de itens físicos e documentos." items={dueEvents.slice(0, 8).map((event) => ({ id: event.id, title: event.title, subtitle: event.subtitle, value: formatDate(event.due), tone: daysUntil(event.due) < 0 ? "red" : daysUntil(event.due) <= 30 ? "orange" : "blue" }))} renderItem={(item) => <SimpleRow key={item.id} {...item} />} />
					</div>
					<DataList title="Unidades com maior risco" description="Ranking por quantidade de pendências, sem score arbitrário." items={riskByUnit} renderItem={(item) => <SimpleRow key={item.id} {...item} />} />
				</div>
			) : null}

			{activeTab === "itens" ? (
				<div className="space-y-4">
					<div className="flex flex-wrap gap-2">
						{[["todos", "Todos"], ["Ativo", "Ativos"], ["atencao", "Em atenção"], ["vencidos", "Vencidos"], ["sem-inspecao", "Sem inspeção"], ["nao-conformes", "Não conformes"]].map(([value, label]) => (
							<button key={value} type="button" onClick={() => setQuickFilter(value)} className={`h-9 rounded-xl border px-4 text-xs font-black ${quickFilter === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{label}</button>
						))}
					</div>
					<OperationTable
						columns={[
							{ key: "item", label: "Item", render: (row) => <div><p className="font-black text-blue-700">{row.codigo}</p><p className="text-slate-950">{row.descricao || row.tipo}</p></div> },
							{ key: "tipo", label: "Tipo" },
							{ key: "local", label: "Localização", render: (row) => <div><p className="font-black text-slate-800">{row.imovel || "Unidade não informada"}</p><p className="text-xs text-slate-500">{row.ambiente || "Ambiente não informado"}</p></div> },
							{ key: "ultima", label: "Última inspeção", render: (row) => formatDate(inspections.find((inspection) => inspection.itemId === row.id)?.createdAt) },
							{ key: "proxima", label: "Próxima inspeção", render: (row) => formatDate(row.proximaManutencao || row.proximaRecarga) },
							{ key: "validade", label: "Validade", render: (row) => formatDate(row.validade) },
							{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(safetyStatus(row))}>{safetyStatus(row)}</OperationBadge> },
							{ key: "acoes", label: "Ações", render: (row) => (
								<div className="flex flex-wrap gap-2">
									<button type="button" onClick={() => window.open(buildSafetyQrUrl(row), "_blank", "noopener,noreferrer")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">Visualizar</button>
									<button type="button" onClick={() => downloadSafetyQrPng(row)} className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">PNG</button>
									<button type="button" onClick={() => downloadSafetyQrPdf(row)} className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-xs font-black text-orange-700">PDF</button>
								</div>
							) },
						]}
						rows={filteredItems}
						emptyTitle="Nenhum item de segurança cadastrado."
						emptyDescription="Cadastre o primeiro item para iniciar o controle."
					/>
				</div>
			) : null}

			{activeTab === "inspecoes" ? (
				<OperationTable
					columns={[
						{ key: "id", label: "Inspeção", render: (row) => <span className="font-black text-blue-700">{row.id}</span> },
						{ key: "item", label: "Item", render: (row) => <div><p className="font-black text-slate-950">{row.itemCodigo}</p><p className="text-xs text-slate-500">{row.itemDescricao}</p></div> },
						{ key: "imovel", label: "Unidade" },
						{ key: "responsavel", label: "Responsável" },
						{ key: "createdAt", label: "Data", render: (row) => formatDateTime(row.createdAt) },
						{ key: "resultado", label: "Resultado", render: (row) => `${row.naoConformes || 0} não conforme(s)` },
						{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(row.status)}>{row.status}</OperationBadge> },
					]}
					rows={inspections}
					emptyTitle="Nenhuma inspeção registrada."
					emptyDescription="Execute a primeira inspeção para criar histórico do item."
				/>
			) : null}

			{activeTab === "documentos" ? (
				<OperationTable
					columns={[
						{ key: "tipo", label: "Documento", render: (row) => <div><p className="font-black text-slate-950">{row.tipo}</p><p className="text-xs text-slate-500">{row.numero || "Sem número"}</p></div> },
						{ key: "imovel", label: "Unidade" },
						{ key: "orgaoEmissor", label: "Órgão" },
						{ key: "dataEmissao", label: "Emissão", render: (row) => formatDate(row.dataEmissao) },
						{ key: "validade", label: "Validade", render: (row) => formatDate(row.validade) },
						{ key: "responsavel", label: "Responsável" },
						{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(row.status)}>{row.status}</OperationBadge> },
					]}
					rows={documents}
					emptyTitle="Nenhum documento de conformidade cadastrado."
					emptyDescription="Cadastre AVCB, laudos, licenças ou certificados com validade."
				/>
			) : null}

			{activeTab === "nao-conformidades" ? (
				<OperationTable
					columns={[
						{ key: "codigo", label: "Código", render: (row) => <span className="font-black text-blue-700">{row.codigo}</span> },
						{ key: "descricao", label: "Descrição" },
						{ key: "origem", label: "Origem" },
						{ key: "imovel", label: "Unidade" },
						{ key: "criticidade", label: "Criticidade", render: (row) => <OperationBadge tone={operationTone(row.criticidade)}>{row.criticidade}</OperationBadge> },
						{ key: "responsavel", label: "Responsável" },
						{ key: "prazo", label: "Prazo", render: (row) => formatDate(row.prazo) },
						{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(row.status)}>{row.status}</OperationBadge> },
					]}
					rows={nonconformities}
					emptyTitle="Nenhuma não conformidade aberta."
					emptyDescription="Nenhuma pendência crítica encontrada."
				/>
			) : null}

			{activeTab === "vencimentos" ? (
				<div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-5">
					{[
						["Vencidos", dueEvents.filter((event) => daysUntil(event.due) < 0), "red"],
						["Próximos 7 dias", dueEvents.filter((event) => daysUntil(event.due) >= 0 && daysUntil(event.due) <= 7), "orange"],
						["Próximos 30 dias", dueEvents.filter((event) => daysUntil(event.due) > 7 && daysUntil(event.due) <= 30), "orange"],
						["Próximos 60 dias", dueEvents.filter((event) => daysUntil(event.due) > 30 && daysUntil(event.due) <= 60), "blue"],
						["Próximos 90 dias", dueEvents.filter((event) => daysUntil(event.due) > 60 && daysUntil(event.due) <= 90), "blue"],
					].map(([title, rows, tone]) => (
						<DataList key={title} title={title} items={rows.map((event) => ({ id: event.id, title: event.title, subtitle: event.subtitle, value: formatDate(event.due), tone }))} renderItem={(item) => <SimpleRow key={item.id} {...item} />} />
					))}
				</div>
			) : null}

			{activeTab === "configuracoes" ? (
				<div className="grid gap-4 lg:grid-cols-3">
					<DataList title="Tipos de itens" items={["Extintor", "Hidrante", "Iluminação de emergência", "Alarme", "Detector", "Sinalização", "Porta corta-fogo", "Kit primeiros socorros"].map((item) => ({ id: item, title: item, value: "ativo", tone: "blue" }))} renderItem={(item) => <SimpleRow key={item.id} {...item} />} />
					<DataList title="Tipos de documentos" items={["AVCB", "CLCB", "Laudo elétrico", "Laudo SPDA", "Laudo estrutural", "Acessibilidade", "Licença municipal", "Seguro"].map((item) => ({ id: item, title: item, value: "ativo", tone: "emerald" }))} renderItem={(item) => <SimpleRow key={item.id} {...item} />} />
					<DataList title="Modelos de inspeção" description="Templates serão versionados em etapa dedicada." items={[{ id: "ext", title: "Extintor - Inspeção periódica", subtitle: "Lacre, pressão, mangueira, sinalização, acesso livre e validade", value: "v1", tone: "orange" }]} renderItem={(item) => <SimpleRow key={item.id} {...item} />} />
				</div>
			) : null}

			<SafetyForms
				modal={modal}
				setModal={setModal}
				saving={saving}
				items={items}
				forms={{ itemForm, inspectionForm, documentForm, ncForm }}
				update={{ updateItem, updateInspection, updateDocument, updateNc }}
				save={{
					item: () => withSave(async () => {
						const saved = await salvarItemSeguranca(itemForm);
						setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
					}, "Não foi possível salvar o item de segurança."),
					inspection: () => withSave(async () => {
						const respostas = Object.entries(inspectionForm.respostas || {}).map(([item, status]) => ({ item, status }));
						const saved = await criarInspecaoSeguranca({ ...inspectionForm, respostas });
						setInspections((current) => [saved, ...current]);
						await loadSafety();
					}, "Não foi possível registrar a inspeção."),
					document: () => withSave(async () => {
						const saved = await criarDocumentoSeguranca(documentForm);
						setDocuments((current) => [saved, ...current]);
						await loadSafety();
					}, "Não foi possível cadastrar o documento."),
					nc: () => withSave(async () => {
						const saved = await criarNaoConformidadeSeguranca(ncForm);
						setNonconformities((current) => [saved, ...current]);
					}, "Não foi possível criar a não conformidade."),
				}}
			/>
		</section>
	);
}

function SafetyForms({ modal, setModal, saving, items, forms, update, save }) {
	const { itemForm, inspectionForm, documentForm, ncForm } = forms;
	const { updateItem, updateInspection, updateDocument, updateNc } = update;
	const inputClass = "h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400";
	const textareaClass = "min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400";
	const setProperty = (updater) => (value) => updater("imovelId", value);
	const [selectedItemProperty, setSelectedItemProperty] = useState(null);
	const [itemErrors, setItemErrors] = useState({});
	const typeConfig = safetyTypeConfig(itemForm.tipo);
	const locationPreview = [
		selectedItemProperty?.nome || itemForm.imovelId,
		itemForm.ambiente,
		itemForm.localizacaoComplementar,
	].filter(Boolean);
	const suggestedNextInspection = addMonthsToDate(itemForm.dataInstalacao, periodicityMonths(itemForm.periodicidadeInspecao));
	const dueReference = itemForm.validade || itemForm.proximaRecarga || suggestedNextInspection;
	const dueDays = daysUntil(dueReference);
	const duplicateSerial = itemForm.numeroSerie
		? items.find((item) => normalizeText(item.numeroSerie || "") === normalizeText(itemForm.numeroSerie || "") && normalizeText(item.fabricante || "") === normalizeText(itemForm.fabricante || ""))
		: null;
	const submitItem = async () => {
		const errors = {};
		if (!itemForm.tipo) errors.tipo = "Selecione o tipo do item.";
		if (!itemForm.descricao.trim()) errors.descricao = "Informe uma descrição.";
		if (!itemForm.imovelId) errors.imovelId = "Selecione o imóvel.";
		if (itemForm.validade && itemForm.dataInstalacao && new Date(itemForm.validade) < new Date(itemForm.dataInstalacao)) {
			errors.validade = "A validade não pode ser anterior à data de instalação.";
		}
		setItemErrors(errors);
		if (Object.keys(errors).length) return;
		await save.item();
	};
	const closeItemModal = () => {
		setItemErrors({});
		setSelectedItemProperty(null);
		setModal("");
	};

	return (
		<>
			<AppModal
				title="Novo item de segurança"
				description="Cadastre o item, sua localização, especificações e controles de manutenção."
				open={modal === "item"}
				onClose={closeItemModal}
				maxWidth="max-w-4xl"
				footer={<ModalFooterActions onCancel={closeItemModal} onConfirm={submitItem} confirmLabel="Cadastrar item" savingLabel="Cadastrando..." saving={saving} disabled={!itemForm.descricao.trim() || !itemForm.imovelId} />}
			>
				<div className="space-y-6">
					<DetailSection title="Identificação">
						<div className="grid gap-3 md:grid-cols-2">
							<FormField label="Tipo de item" required error={itemErrors.tipo}>
								<select value={itemForm.tipo} onChange={(event) => updateItem("tipo", event.target.value)} className={inputClass}>
									<option>Extintor</option><option>Hidrante</option><option>Iluminação de emergência</option><option>Alarme</option><option>Detector</option><option>Sinalização</option><option>Porta corta-fogo</option><option>Kit primeiros socorros</option><option>Outro</option>
								</select>
							</FormField>
							<FormField label="Descrição" required error={itemErrors.descricao} helper="Use uma descrição clara para identificar o item em inspeções e vencimentos.">
								<input value={itemForm.descricao} onChange={(event) => updateItem("descricao", event.target.value)} className={inputClass} placeholder="Ex.: Extintor CO₂ da sala elétrica" />
							</FormField>
						</div>
					</DetailSection>

					<DetailSection title="Localização" description="Vincule o item ao imóvel e informe o ponto exato de instalação.">
						<div className="space-y-3">
							<div>
								<SafetyPropertySearch value={itemForm.imovelId} onChange={(value, property) => {
									updateItem("imovelId", value);
									setSelectedItemProperty(property || null);
									setItemErrors((current) => ({ ...current, imovelId: "" }));
								}} />
								{itemErrors.imovelId ? <p className="mt-2 text-xs font-black text-red-600">⚠ {itemErrors.imovelId}</p> : null}
							</div>
							{selectedItemProperty ? (
								<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
									<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
										<div>
											<p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600">Imóvel selecionado</p>
											<h4 className="mt-1 text-base font-black text-slate-950">{selectedItemProperty.nome}</h4>
											<p className="mt-1 text-sm font-semibold text-slate-600">{[selectedItemProperty.cidade, selectedItemProperty.estado].filter(Boolean).join("/") || "Localidade não informada"}</p>
										</div>
										<button type="button" onClick={() => { updateItem("imovelId", ""); setSelectedItemProperty(null); }} className="h-9 rounded-xl border border-blue-200 bg-white px-3 text-xs font-black text-blue-700 hover:bg-blue-100">Trocar imóvel</button>
									</div>
								</div>
							) : null}
							<div className="grid gap-3 md:grid-cols-2">
								<FormField label="Ambiente">
									<input value={itemForm.ambiente} onChange={(event) => updateItem("ambiente", event.target.value)} className={inputClass} placeholder="Ex.: Sala técnica" />
								</FormField>
								<FormField label="Ponto exato de instalação">
									<input value={itemForm.localizacaoComplementar} onChange={(event) => updateItem("localizacaoComplementar", event.target.value)} className={inputClass} placeholder="Ex.: Ao lado da porta principal, corredor 2" />
								</FormField>
							</div>
							{locationPreview.length ? (
								<div className="rounded-2xl bg-slate-50 p-4">
									<p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Localização</p>
									<div className="mt-2 text-sm font-black text-slate-800">
										{locationPreview.map((item, index) => <span key={`${item}-${index}`} className="inline-flex items-center">{index ? <ChevronRight size={14} className="mx-1 text-slate-400" /> : null}{item}</span>)}
									</div>
								</div>
							) : null}
						</div>
					</DetailSection>

					<DetailSection title="Especificações técnicas" description={typeConfig.technicalHint}>
						<div className="grid gap-3 md:grid-cols-2">
							{typeConfig.showManufacturer !== false ? <FormField label="Fabricante"><input value={itemForm.fabricante} onChange={(event) => updateItem("fabricante", event.target.value)} className={inputClass} placeholder="Digite o fabricante" /></FormField> : null}
							{typeConfig.showModel !== false ? <FormField label="Modelo"><input value={itemForm.modelo} onChange={(event) => updateItem("modelo", event.target.value)} className={inputClass} placeholder="Digite o modelo" /></FormField> : null}
							{typeConfig.showSerial !== false ? <FormField label="Número de série" helper={duplicateSerial ? "Já existe um item com este número de série e fabricante." : ""} error={duplicateSerial ? "Verifique possível duplicidade antes de cadastrar." : ""} className="md:col-span-2"><input value={itemForm.numeroSerie} onChange={(event) => updateItem("numeroSerie", event.target.value)} className={inputClass} placeholder="Ex.: 123456789" /></FormField> : null}
							{typeConfig.showFireAgent ? <FormField label="Agente / carga"><input value={itemForm.carga} onChange={(event) => updateItem("carga", event.target.value)} className={inputClass} placeholder="Ex.: ABC, CO₂, Água" /></FormField> : null}
							{typeConfig.showCapacity ? <FormField label="Capacidade"><input value={itemForm.capacidade} onChange={(event) => updateItem("capacidade", event.target.value)} className={inputClass} placeholder="Ex.: 6 kg, 10 L" /></FormField> : null}
						</div>
					</DetailSection>

					<DetailSection title="Conformidade e manutenção" description="Controle datas de instalação, recarga, validade e inspeção periódica.">
						<div className="grid gap-3 md:grid-cols-2">
							<FormField label="Data de instalação / fabricação">
								<input type="date" value={itemForm.dataInstalacao} onChange={(event) => updateItem("dataInstalacao", event.target.value)} className={inputClass} />
							</FormField>
							<FormField label="Validade" error={itemErrors.validade}>
								<input type="date" value={itemForm.validade} onChange={(event) => updateItem("validade", event.target.value)} className={inputClass} />
							</FormField>
							{typeConfig.showRecharge ? <FormField label="Última recarga"><input type="date" value={itemForm.ultimaRecarga} onChange={(event) => updateItem("ultimaRecarga", event.target.value)} className={inputClass} /></FormField> : null}
							{typeConfig.showRecharge ? <FormField label="Próxima recarga"><input type="date" value={itemForm.proximaRecarga} onChange={(event) => updateItem("proximaRecarga", event.target.value)} className={inputClass} /></FormField> : null}
							{typeConfig.showHydrostatic ? <FormField label="Teste hidrostático"><input type="date" value={itemForm.testeHidrostatico} onChange={(event) => updateItem("testeHidrostatico", event.target.value)} className={inputClass} /></FormField> : null}
							<FormField label="Periodicidade de inspeção" helper="Define a frequência esperada para inspeção deste item.">
								<select value={itemForm.periodicidadeInspecao} onChange={(event) => updateItem("periodicidadeInspecao", event.target.value)} className={inputClass}><option>Mensal</option><option>Trimestral</option><option>Semestral</option><option>Anual</option></select>
							</FormField>
						</div>
						<div className="mt-4 grid gap-3 md:grid-cols-2">
							<div className="rounded-2xl bg-blue-50 p-4">
								<p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600">Próxima inspeção estimada</p>
								<p className="mt-1 text-lg font-black text-blue-950">{suggestedNextInspection ? formatDate(suggestedNextInspection) : "Informe a data de instalação"}</p>
							</div>
							<div className={`rounded-2xl p-4 ${dueDays === null ? "bg-slate-50" : dueDays < 0 ? "bg-red-50" : dueDays <= 60 ? "bg-orange-50" : "bg-emerald-50"}`}>
								<p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Situação</p>
								<p className={`mt-1 text-lg font-black ${dueDays === null ? "text-slate-700" : dueDays < 0 ? "text-red-700" : dueDays <= 60 ? "text-orange-700" : "text-emerald-700"}`}>{dueDays === null ? "Sem vencimento informado" : dueDays < 0 ? `Vencido há ${Math.abs(dueDays)} dia(s)` : dueDays <= 60 ? `Vence em ${dueDays} dia(s)` : "Em conformidade"}</p>
							</div>
						</div>
					</DetailSection>

					<DetailSection title="Fornecedor e responsabilidade">
						<div className="grid gap-3 md:grid-cols-2">
							<FormField label="Fornecedor">
								<input value={itemForm.fornecedor} onChange={(event) => updateItem("fornecedor", event.target.value)} className={inputClass} placeholder="Fornecedor responsável pelo item ou manutenção" />
							</FormField>
							<FormField label="Responsável interno">
								<input value={itemForm.responsavel} onChange={(event) => updateItem("responsavel", event.target.value)} className={inputClass} placeholder="Pessoa responsável pelo acompanhamento" />
							</FormField>
							<FormField label="Status" helper="Use apenas se o item já nasce em atenção, manutenção ou baixa.">
								<select value={itemForm.status} onChange={(event) => updateItem("status", event.target.value)} className={inputClass}><option>Ativo</option><option>Em atenção</option><option>Vencido</option><option>Em manutenção</option><option>Substituir</option><option>Baixado</option></select>
							</FormField>
						</div>
						<div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
							Status inicial: {itemForm.status || "Ativo"}
						</div>
					</DetailSection>

					<DetailSection title="Observações">
						<FormField label="Observações" helper="Opcional. Use para condições, restrições ou particularidades.">
							<textarea value={itemForm.observacoes} onChange={(event) => updateItem("observacoes", event.target.value)} className={textareaClass} placeholder="Adicione informações adicionais, restrições, condições ou particularidades..." />
						</FormField>
					</DetailSection>

					<div className="rounded-2xl border border-slate-200 bg-white p-4">
						<p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Resumo</p>
						<div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
							<div>
								<p className="font-black text-slate-950">{itemForm.tipo}</p>
								<p className="text-xs font-semibold text-slate-500">{[itemForm.capacidade, itemForm.carga].filter(Boolean).join(" • ") || "Especificação pendente"}</p>
							</div>
							<div>
								<p className="font-black text-slate-950">{selectedItemProperty?.nome || itemForm.imovelId || "Imóvel pendente"}</p>
								<p className="text-xs font-semibold text-slate-500">{[itemForm.ambiente, itemForm.localizacaoComplementar].filter(Boolean).join(" › ") || "Localização pendente"}</p>
							</div>
							<div>
								<p className="font-black text-slate-950">Próxima inspeção: {suggestedNextInspection ? formatDate(suggestedNextInspection) : "-"}</p>
								<p className="text-xs font-semibold text-slate-500">Validade: {formatDate(itemForm.validade)}</p>
							</div>
						</div>
					</div>
				</div>
			</AppModal>

			<AppModal title="Nova inspeção" description="Execute o checklist aplicável. Não conformidades geram NC automaticamente." open={modal === "inspection"} onClose={() => setModal("")}>
				<div className="grid gap-3 md:grid-cols-2">
					<select value={inspectionForm.itemId} onChange={(event) => updateInspection("itemId", event.target.value)} className={`${inputClass} md:col-span-2`}>
						<option value="">Selecione o item</option>
						{items.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.descricao || item.tipo} · {item.imovel}</option>)}
					</select>
					<select value={inspectionForm.tipoInspecao} onChange={(event) => updateInspection("tipoInspecao", event.target.value)} className={inputClass}><option>Periódica</option><option>Extraordinária</option><option>Instalação</option><option>Pós-manutenção</option><option>Auditoria</option><option>Outro</option></select>
					<input value={inspectionForm.responsavel} onChange={(event) => updateInspection("responsavel", event.target.value)} className={inputClass} placeholder="Responsável" />
					<div className="space-y-2 md:col-span-2">
						{Object.entries(inspectionForm.respostas || {}).map(([label, status]) => (
							<div key={label} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 md:grid-cols-[1fr_auto] md:items-center">
								<p className="text-sm font-black text-slate-800">{label}</p>
								<select value={status} onChange={(event) => updateInspection("respostas", { ...inspectionForm.respostas, [label]: event.target.value })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
									<option value="conforme">Conforme</option>
									<option value="nao_conforme">Não conforme</option>
									<option value="na">N/A</option>
								</select>
							</div>
						))}
					</div>
					<select value={inspectionForm.criticidade} onChange={(event) => updateInspection("criticidade", event.target.value)} className={inputClass}><option>Baixa</option><option>Média</option><option>Alta</option><option>Crítica</option></select>
					<input type="date" value={inspectionForm.prazoCorrecao} onChange={(event) => updateInspection("prazoCorrecao", event.target.value)} className={inputClass} />
					<textarea value={inspectionForm.observacao} onChange={(event) => updateInspection("observacao", event.target.value)} className={`${textareaClass} md:col-span-2`} placeholder="Fotos/evidências podem ser adicionadas no fluxo documental. Observações da inspeção." />
					<button type="button" disabled={saving || !inspectionForm.itemId} onClick={save.inspection} className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white disabled:opacity-50 md:col-span-2">Concluir inspeção</button>
				</div>
			</AppModal>

			<AppModal title="Novo documento ou licença" description="Controle AVCB, CLCB, laudos, acessibilidade, licenças e seguros." open={modal === "document"} onClose={() => setModal("")}>
				<div className="grid gap-3 md:grid-cols-2">
					<select value={documentForm.tipo} onChange={(event) => updateDocument("tipo", event.target.value)} className={inputClass}><option>AVCB</option><option>CLCB</option><option>Laudo elétrico</option><option>Laudo SPDA</option><option>Laudo estrutural</option><option>Acessibilidade</option><option>Licença municipal</option><option>Certificado de inspeção</option><option>Seguro</option><option>Outro</option></select>
					<input value={documentForm.numero} onChange={(event) => updateDocument("numero", event.target.value)} className={inputClass} placeholder="Número" />
					<div className="md:col-span-2"><SafetyPropertySearch value={documentForm.imovelId} onChange={setProperty(updateDocument)} /></div>
					<input value={documentForm.orgaoEmissor} onChange={(event) => updateDocument("orgaoEmissor", event.target.value)} className={inputClass} placeholder="Órgão emissor" />
					<input type="date" value={documentForm.dataEmissao} onChange={(event) => updateDocument("dataEmissao", event.target.value)} className={inputClass} />
					<input type="date" value={documentForm.validade} onChange={(event) => updateDocument("validade", event.target.value)} className={inputClass} />
					<input value={documentForm.responsavel} onChange={(event) => updateDocument("responsavel", event.target.value)} className={inputClass} placeholder="Responsável pela renovação" />
					<input value={documentForm.arquivoUrl} onChange={(event) => updateDocument("arquivoUrl", event.target.value)} className={`${inputClass} md:col-span-2`} placeholder="Link do arquivo/documento" />
					<textarea value={documentForm.observacoes} onChange={(event) => updateDocument("observacoes", event.target.value)} className={`${textareaClass} md:col-span-2`} placeholder="Observações" />
					<button type="button" disabled={saving || !documentForm.tipo || !documentForm.imovelId} onClick={save.document} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50 md:col-span-2">Salvar documento</button>
				</div>
			</AppModal>

			<AppModal title="Nova não conformidade" description="Registre pendência manual ou plano de ação originado fora de inspeção." open={modal === "nc"} onClose={() => setModal("")}>
				<div className="grid gap-3 md:grid-cols-2">
					<input value={ncForm.descricao} onChange={(event) => updateNc("descricao", event.target.value)} className={`${inputClass} md:col-span-2`} placeholder="Descrição" />
					<select value={ncForm.origem} onChange={(event) => updateNc("origem", event.target.value)} className={inputClass}><option>Registro manual</option><option>Inspeção</option><option>Checklist predial</option><option>Auditoria</option><option>Documento vencido</option></select>
					<select value={ncForm.criticidade} onChange={(event) => updateNc("criticidade", event.target.value)} className={inputClass}><option>Baixa</option><option>Média</option><option>Alta</option><option>Crítica</option></select>
					<div className="md:col-span-2"><SafetyPropertySearch value={ncForm.imovelId} onChange={setProperty(updateNc)} /></div>
					<input value={ncForm.responsavel} onChange={(event) => updateNc("responsavel", event.target.value)} className={inputClass} placeholder="Responsável" />
					<input type="date" value={ncForm.prazo} onChange={(event) => updateNc("prazo", event.target.value)} className={inputClass} />
					<textarea value={ncForm.acaoCorretiva} onChange={(event) => updateNc("acaoCorretiva", event.target.value)} className={`${textareaClass} md:col-span-2`} placeholder="Plano de ação / ação corretiva" />
					<button type="button" disabled={saving || !ncForm.descricao} onClick={save.nc} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50 md:col-span-2">Salvar não conformidade</button>
				</div>
			</AppModal>
		</>
	);
}

function AccessKeysPanel() {
	const { currentUser } = useAuthContext();
	const [tab, setTab] = useState("visao");
	const [keys, setKeys] = useState([]);
	const [dashboard, setDashboard] = useState(null);
	const [history, setHistory] = useState([]);
	const [imoveis, setImoveis] = useState([]);
	const [selectedKey, setSelectedKey] = useState(null);
	const [modal, setModal] = useState(null);
	const [selectedIds, setSelectedIds] = useState([]);
	const [loading, setLoading] = useState(true);
	const [historyLoading, setHistoryLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [formErrors, setFormErrors] = useState({});
	const [query, setQuery] = useState("");
	const [filters, setFilters] = useState({ status: "", type: "", propertyId: "", holder: "", withoutQr: "" });
	const [sort, setSort] = useState("codigo");
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(25);
	const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
	const debouncedQuery = useDebouncedValue(query, 300);
	const [form, setForm] = useState({
		code: "",
		description: "",
		type: "Chave física",
		companyId: "",
		regionalId: "",
		propertyId: "",
		environmentId: "",
		locationDescription: "",
		notes: "",
	});
	const [custodyForm, setCustodyForm] = useState({ holderName: "", expectedReturnAt: "", notes: "" });
	const canManageKeys = hasAnyPermission(currentUser, [
		"facilities.manage",
		"facilities.chaves.create",
		"facilities.chaves.edit",
		"facilities.chaves.checkout",
		"facilities.chaves.return",
		"facilities.chaves.declare_lost",
		"facilities.chaves.deactivate",
		"manage_imoveis_administrativos",
	]);

	const loadDashboard = async () => {
		const data = await obterDashboardChavesFacilities();
		setDashboard(data || null);
	};

	const loadKeys = async () => {
		setLoading(true);
		setError("");
		try {
			const params = {
				page,
				pageSize,
				search: debouncedQuery,
				sort,
				status: filters.status,
				type: filters.type,
				propertyId: filters.propertyId,
				holder: filters.holder,
				withoutQr: filters.withoutQr,
			};
			const [keysResult] = await Promise.all([listarChavesFacilities(params), loadDashboard()]);
			setKeys(keysResult.items || []);
			setPagination(keysResult.pagination || { page, pageSize, total: 0, totalPages: 1 });
			setSelectedIds([]);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as chaves.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		let active = true;
		listarImoveis()
			.then((items) => {
				if (active) setImoveis(items || []);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		loadKeys();
	}, [page, pageSize, debouncedQuery, filters, sort]);

	useEffect(() => {
		setPage(1);
	}, [debouncedQuery, filters, sort, pageSize]);

	async function loadHistory(key) {
		if (!key?.id) return;
		setHistoryLoading(true);
		setError("");
		try {
			setHistory(await listarHistoricoChaveFacilities(key.id));
		} catch (err) {
			setError(err?.message || "Erro ao carregar histórico da chave.");
		} finally {
			setHistoryLoading(false);
		}
	}

	const openDetail = async (key) => {
		setSelectedKey(key);
		setModal("detail");
		await loadHistory(key);
	};

	const openForm = (key = null) => {
		if (!canManageKeys) return;
		setSelectedKey(key);
		setFormErrors({});
		setForm({
			code: key?.code || key?.codigo || "",
			description: key?.description || key?.name || "",
			type: key?.type || "Chave física",
			companyId: key?.companyId || "",
			regionalId: key?.regionalId || "",
			propertyId: key?.propertyId || "",
			environmentId: key?.environmentId || "",
			locationDescription: key?.locationDescription || key?.address || "",
			notes: key?.notes || "",
		});
		setModal("form");
	};

	const openCustody = (key, type) => {
		if (!canManageKeys) return;
		setSelectedKey(key);
		setCustodyForm({
			holderName: key?.currentHolderName || key?.currentUser || "",
			expectedReturnAt: "",
			notes: "",
		});
		setModal(type);
	};

	const applyQuickFilter = (nextTab, nextFilters = {}) => {
		setTab(nextTab);
		setFilters({ status: "", type: "", propertyId: "", holder: "", withoutQr: "", ...nextFilters });
		setPage(1);
	};

	const saveKey = async () => {
		if (!canManageKeys) {
			setError("Você não tem permissão para gerenciar chaves.");
			return;
		}
		const errors = {};
		const duplicateCode = form.code.trim()
			? keys.find((key) => key.id !== selectedKey?.id && normalizeText(key.codigo || key.code) === normalizeText(form.code))
			: null;
		if (duplicateCode) errors.code = "Já existe uma chave com este código.";
		if (!form.description.trim()) errors.description = "Informe uma descrição para identificar a chave.";
		if (!form.propertyId) errors.propertyId = "Selecione o imóvel vinculado.";
		setFormErrors(errors);
		if (Object.keys(errors).length) return;
		setSaving(true);
		setError("");
		try {
			await salvarChaveFacilities({ ...(selectedKey || {}), ...form });
			setModal(null);
			await loadKeys();
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a chave.");
		} finally {
			setSaving(false);
		}
	};

	const runKeyAction = async (action, fallbackMessage) => {
		if (!selectedKey) return;
		if (!canManageKeys) {
			setError("Você não tem permissão para gerenciar chaves.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			await action(selectedKey.id);
			setModal(null);
			await loadKeys();
		} catch (err) {
			setError(err?.message || fallbackMessage);
		} finally {
			setSaving(false);
		}
	};

	const quickKeyAction = async (key, action, fallbackMessage) => {
		if (!canManageKeys) {
			setError("Você não tem permissão para gerenciar chaves.");
			return;
		}
		setSelectedKey(key);
		setSaving(true);
		setError("");
		try {
			await action(key.id);
			await loadKeys();
		} catch (err) {
			setError(err?.message || fallbackMessage);
		} finally {
			setSaving(false);
		}
	};

	const selectedKeys = keys.filter((key) => selectedIds.includes(key.id));
	const typeOptions = ["Chave física", "Controle remoto", "Tag", "Cartão", "Credencial", "Outro"];
	const selectedProperty = imoveis.find((item) => getImovelId(item) === form.propertyId) || null;
	const selectedPropertyDisplay = selectedProperty ? getImovelDisplay(selectedProperty) : null;
	const similarKey = form.description.trim() && form.propertyId
		? keys.find((key) => {
				if (key.id === selectedKey?.id) return false;
				const sameProperty = String(key.propertyId || "") === String(form.propertyId || "");
				const sameEnvironment = normalizeText(key.environmentId || "") === normalizeText(form.environmentId || "");
				const sameAccessPoint = normalizeText(key.locationDescription || key.address || "") === normalizeText(form.locationDescription || "");
				const sameDescription = normalizeText(key.description || key.name || "") === normalizeText(form.description || "");
				return sameProperty && (sameDescription || (sameEnvironment && sameAccessPoint));
			})
		: null;
	const keySummaryLocation = [
		selectedPropertyDisplay?.nome,
		form.environmentId,
		form.locationDescription,
	].filter(Boolean);
	return (
		<section className="space-y-5">
			<header className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Facilities &gt; Acessos & Chaves</p>
						<h3 className="mt-2 text-2xl font-black text-slate-950">Acessos & Chaves</h3>
						<p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">Controle retirada, devolução, custódia e identificação das chaves das unidades.</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{canManageKeys ? (
							<>
								<button type="button" onClick={() => openForm(null)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700"><Plus size={17} /> Nova chave</button>
								<button type="button" onClick={() => setModal("checkoutPicker")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"><KeyRound size={16} /> Registrar retirada</button>
							</>
						) : null}
						<button type="button" disabled={!selectedKeys.length} onClick={() => downloadKeyQrBatchPdf(selectedKeys)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 text-sm font-black text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"><Download size={16} /> Exportar</button>
					</div>
				</div>
				<div className="mt-5 flex gap-2 overflow-x-auto pb-1">
					{[
						["visao", "Visão Geral"],
						["chaves", "Chaves"],
						["em-posse", "Em Posse"],
						["atrasadas", "Atrasadas"],
						["historico", "Histórico"],
					].map(([id, label]) => (
						<button key={id} type="button" onClick={() => {
							if (id === "em-posse") applyQuickFilter(id, { status: "EM_POSSE" });
							else if (id === "atrasadas") applyQuickFilter(id, { status: "ATRASADA" });
							else { setTab(id); if (id === "chaves" || id === "visao" || id === "historico") setFilters((current) => ({ ...current, status: "", withoutQr: "" })); }
						}} className={`h-11 shrink-0 rounded-xl border px-4 text-sm font-black transition ${tab === id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-700"}`}>
							{label}
						</button>
					))}
				</div>
			</header>

			{error ? (
				<div className="flex items-center justify-between gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700">
					<span>{error}</span>
					<button type="button" onClick={loadKeys} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-red-700">Tentar novamente</button>
				</div>
			) : null}

			{tab === "visao" ? (
				<>
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
						<button type="button" onClick={() => applyQuickFilter("chaves")} className="text-left"><KpiCard label="Total" value={loading ? "..." : numberFormatter.format(dashboard?.total || 0)} detail="Chaves cadastradas" tone="blue" icon={KeyRound} /></button>
						<button type="button" onClick={() => applyQuickFilter("chaves", { status: "DISPONIVEL" })} className="text-left"><KpiCard label="Disponíveis" value={loading ? "..." : numberFormatter.format(dashboard?.available || 0)} detail="Prontas para retirada" tone="emerald" icon={ShieldCheck} /></button>
						<button type="button" onClick={() => applyQuickFilter("em-posse", { status: "EM_POSSE" })} className="text-left"><KpiCard label="Em posse" value={loading ? "..." : numberFormatter.format(dashboard?.checkedOut || 0)} detail="Custódia ativa" tone="orange" icon={User} /></button>
						<button type="button" onClick={() => applyQuickFilter("atrasadas", { status: "ATRASADA" })} className="text-left"><KpiCard label="Atrasadas" value={loading ? "..." : numberFormatter.format(dashboard?.overdue || 0)} detail="Fora do prazo" tone={dashboard?.overdue ? "red" : "emerald"} icon={AlertTriangle} /></button>
						<button type="button" onClick={() => applyQuickFilter("chaves", { status: "PERDIDA" })} className="text-left"><KpiCard label="Perdidas" value={loading ? "..." : numberFormatter.format(dashboard?.lost || 0)} detail="Ação crítica" tone={dashboard?.lost ? "red" : "emerald"} icon={X} /></button>
						<button type="button" onClick={() => applyQuickFilter("chaves", { withoutQr: "true" })} className="text-left"><KpiCard label="Sem QR" value={loading ? "..." : numberFormatter.format(dashboard?.withoutQr || 0)} detail="Sem etiqueta ativa" tone={dashboard?.withoutQr ? "orange" : "emerald"} icon={QrCode} /></button>
					</div>
					<div className="grid items-start gap-4 xl:grid-cols-2">
						<KeyAttentionPanel items={dashboard?.attentionItems || []} onOpen={openDetail} />
						<KeyRecentEventsPanel items={dashboard?.recentEvents || []} />
					</div>
				</>
			) : null}

			{["visao", "chaves", "em-posse", "atrasadas"].includes(tab) ? (
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
						<div>
							<h4 className="text-lg font-black text-slate-950">{tab === "atrasadas" ? "Chaves atrasadas" : tab === "em-posse" ? "Chaves em posse" : "Chaves"}</h4>
							<p className="text-sm font-semibold text-slate-500">Busca, filtros e movimentações da base de chaves do ADM.</p>
						</div>
						<div className="flex flex-wrap gap-2">
							{[
								["", "Todas"],
								["DISPONIVEL", "Disponíveis"],
								["EM_POSSE", "Em posse"],
								["ATRASADA", "Atrasadas"],
								["PERDIDA", "Perdidas"],
							].map(([value, label]) => (
								<button key={label} type="button" onClick={() => setFilters((current) => ({ ...current, status: value, withoutQr: "" }))} className={`rounded-full border px-3 py-1.5 text-xs font-black ${filters.status === value && !filters.withoutQr ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-700"}`}>{label}</button>
							))}
							<button type="button" onClick={() => setFilters((current) => ({ ...current, status: "", withoutQr: current.withoutQr ? "" : "true" }))} className={`rounded-full border px-3 py-1.5 text-xs font-black ${filters.withoutQr ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-700"}`}>Sem QR</button>
						</div>
					</div>
					<div className="mb-4 grid gap-3 xl:grid-cols-[1fr_170px_170px_170px_150px_auto]">
						<label className="relative block">
							<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
							<input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 pl-11 pr-4 text-sm font-semibold outline-none focus:border-blue-400" placeholder="Buscar código, descrição, imóvel, ambiente ou portador..." />
						</label>
						<SearchableSelect
							value={filters.propertyId}
							onChange={(value) => setFilters((current) => ({ ...current, propertyId: value }))}
							options={imoveis}
							getOptionValue={getImovelId}
							getOptionLabel={getImovelLabel}
							placeholder="Pesquisar imóvel"
						/>
						<select value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-400">
							<option value="">Tipo</option>
							{typeOptions.map((item) => <option key={item}>{item}</option>)}
						</select>
						<select value={sort} onChange={(event) => setSort(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-400">
							<option value="codigo">Código</option>
							<option value="recentes">Mais recentes</option>
							<option value="retiradas">Retiradas recentemente</option>
							<option value="atrasadas">Mais atrasadas</option>
							<option value="imovel">Imóvel</option>
						</select>
						<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-400">
							<option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
						</select>
						<button type="button" onClick={loadKeys} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50"><RefreshCw size={15} /> Atualizar</button>
					</div>
					{loading ? (
						<KeyTableSkeleton />
					) : keys.length ? (
						<div className="overflow-hidden rounded-2xl border border-slate-100">
							<table className="w-full min-w-[1080px] text-left text-sm">
								<thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
									<tr>
										<th className="px-4 py-3"><input type="checkbox" checked={Boolean(keys.length) && selectedIds.length === keys.length} onChange={(event) => setSelectedIds(event.target.checked ? keys.map((key) => key.id) : [])} /></th>
										<th className="px-4 py-3">Chave</th>
										<th className="px-4 py-3">Localização</th>
										<th className="px-4 py-3">Tipo</th>
										<th className="px-4 py-3">Status</th>
										<th className="px-4 py-3">Portador</th>
										<th className="px-4 py-3">Retirada</th>
										<th className="px-4 py-3">Previsão</th>
										<th className="px-4 py-3">QR</th>
										<th className="px-4 py-3 text-right">Ações</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{keys.map((key) => (
										<tr key={key.id} onClick={() => openDetail(key)} className="cursor-pointer font-semibold text-slate-700 hover:bg-blue-50/50">
											<td className="px-4 py-3" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(key.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, key.id])] : current.filter((id) => id !== key.id))} /></td>
											<td className="px-4 py-3"><p className="font-black text-blue-700">{key.codigo || key.code}</p><p className="mt-1 font-black text-slate-950">{key.description || key.name || "Chave sem descrição"}</p></td>
											<td className="px-4 py-3"><p className="font-black text-slate-800">{key.locationDescription || key.address || "Sem localização"}</p><p className="text-xs text-slate-500">{key.environmentId || "Ambiente não informado"}</p></td>
											<td className="px-4 py-3">{key.type || "-"}</td>
											<td className="px-4 py-3"><KeyStatusBadge status={key.status} label={key.statusLabel} /></td>
											<td className="px-4 py-3">{key.currentHolderName || key.currentUser || "—"}</td>
											<td className="px-4 py-3">{formatKeyDateTime(key.checkedOutAt)}</td>
											<td className="px-4 py-3">{formatKeyDateTime(key.expectedReturnAt)}</td>
											<td className="px-4 py-3">{key.qrToken ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">QR ativo</span> : <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-black text-orange-700">Sem QR</span>}</td>
											<td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}><KeyActions keyItem={key} canManage={canManageKeys} onOpen={() => openDetail(key)} onEdit={() => openForm(key)} onCheckout={() => openCustody(key, "checkout")} onReturn={() => openCustody(key, "return")} onLost={() => { if (!canManageKeys) return; setSelectedKey(key); setModal("lost"); }} onDeactivate={() => quickKeyAction(key, inativarChaveFacilities, "Não foi possível inativar a chave.")} onRegenerate={() => quickKeyAction(key, regenerarQrChaveFacilities, "Não foi possível regenerar o QR.")} /></td>
										</tr>
									))}
								</tbody>
							</table>
							<div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3">
								<p className="text-xs font-bold text-slate-500">Página {pagination.page} de {pagination.totalPages} · {numberFormatter.format(pagination.total)} chave(s)</p>
								<div className="flex gap-2">
									<button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Anterior</button>
									<button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Próxima</button>
								</div>
							</div>
						</div>
					) : (
						<EmptyState title="Nenhuma chave cadastrada" description="Cadastre a primeira chave para começar a controlar retiradas e devoluções." />
					)}
				</section>
			) : null}

			{tab === "historico" ? (
				<KeyRecentEventsPanel items={dashboard?.recentEvents || []} expanded />
			) : null}

			<AppModal open={modal === "detail"} title={selectedKey?.codigo || selectedKey?.code || "Chave"} description={selectedKey?.description || selectedKey?.name || "Ficha 360º da chave"} onClose={() => setModal(null)} maxWidth="max-w-5xl">
				{selectedKey ? (
					<KeyDetailPanel keyItem={selectedKey} canManage={canManageKeys} history={history} historyLoading={historyLoading} onCheckout={() => openCustody(selectedKey, "checkout")} onReturn={() => openCustody(selectedKey, "return")} onEdit={() => openForm(selectedKey)} />
				) : null}
			</AppModal>

			<AppModal
				open={modal === "form"}
				title={selectedKey ? "Editar chave" : "Nova chave"}
				description={selectedKey ? "Atualize a identificação e localização física da chave." : "Cadastre uma chave e vincule-a ao imóvel e local onde será utilizada."}
				onClose={() => setModal(null)}
				maxWidth="max-w-3xl"
				footer={(
					<ModalFooterActions
						onCancel={() => setModal(null)}
						onConfirm={saveKey}
						confirmLabel={selectedKey ? "Salvar alterações" : "Cadastrar chave"}
						savingLabel={selectedKey ? "Salvando..." : "Cadastrando..."}
						saving={saving}
						disabled={!form.description.trim() || !form.propertyId}
					/>
				)}
			>
				<div className="space-y-6">
					<DetailSection title="Identificação" description="Defina como a chave será reconhecida no controle físico.">
						<div className="grid gap-3 md:grid-cols-2">
							<FormField
								label="Código da chave"
								error={formErrors.code}
								helper={form.code.trim() ? "Código manual informado. Ele deve ser único." : selectedKey ? "Mantenha em branco apenas se o código já for automático." : "Deixe em branco para gerar um código único automaticamente."}
							>
								<input
									value={form.code}
									onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
									className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
									placeholder={selectedKey ? "Código atual" : "Será gerado ao cadastrar"}
								/>
							</FormField>
							<FormField label="Tipo de chave" required>
								<select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-400">
									{typeOptions.map((item) => <option key={item}>{item}</option>)}
								</select>
							</FormField>
							<FormField
								label="Descrição"
								required
								error={formErrors.description}
								helper="Use uma descrição que permita identificar rapidamente a finalidade desta chave."
								className="md:col-span-2"
							>
								<input
									value={form.description}
									onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
									className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
									placeholder="Ex.: Chave da porta principal da loja"
								/>
							</FormField>
						</div>
					</DetailSection>

					<DetailSection title="Imóvel vinculado" description="O imóvel é a fonte da verdade para empresa e regional.">
						<div className="space-y-3">
							<div>
								<SearchableSelect
									label="Imóvel *"
									value={form.propertyId}
									onChange={(value, option) => {
										const display = option ? getImovelDisplay(option) : null;
										setForm((current) => ({
											...current,
											propertyId: value,
											companyId: display?.empresa || "",
											regionalId: display?.regional || "",
										}));
										setFormErrors((current) => ({ ...current, propertyId: "" }));
									}}
									options={imoveis}
									getOptionValue={getImovelId}
									getOptionLabel={(item) => {
										const display = getImovelDisplay(item);
										return `${display.nome} · ${display.endereco} · ${display.empresa} • ${display.regional}`;
									}}
									placeholder="Buscar imóvel por nome, endereço, cidade ou código..."
								/>
								{formErrors.propertyId ? <p className="mt-2 text-xs font-black text-red-600">⚠ {formErrors.propertyId}</p> : null}
							</div>
							{selectedPropertyDisplay ? (
								<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
									<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
										<div>
											<p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600">Imóvel selecionado</p>
											<h4 className="mt-1 text-base font-black text-slate-950">{selectedPropertyDisplay.nome}</h4>
											<p className="mt-1 text-sm font-semibold text-slate-600">{selectedPropertyDisplay.endereco}</p>
										</div>
										<button
											type="button"
											onClick={() => setForm((current) => ({ ...current, propertyId: "", companyId: "", regionalId: "" }))}
											className="h-9 rounded-xl border border-blue-200 bg-white px-3 text-xs font-black text-blue-700 hover:bg-blue-100"
										>
											Trocar imóvel
										</button>
									</div>
									<div className="mt-4 grid gap-3 md:grid-cols-2">
										<div className="rounded-xl bg-white px-3 py-2">
											<p className="text-[10px] font-black uppercase text-slate-400">Empresa</p>
											<p className="mt-1 font-black text-slate-900">{selectedPropertyDisplay.empresa}</p>
										</div>
										<div className="rounded-xl bg-white px-3 py-2">
											<p className="text-[10px] font-black uppercase text-slate-400">Regional</p>
											<p className="mt-1 font-black text-slate-900">{selectedPropertyDisplay.regional}</p>
										</div>
									</div>
								</div>
							) : (
								<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
									Selecione um imóvel para preencher empresa e regional automaticamente.
								</div>
							)}
						</div>
					</DetailSection>

					<DetailSection title="Local de uso" description="Informe onde exatamente esta chave é utilizada dentro do imóvel.">
						<div className="grid gap-3 md:grid-cols-2">
							<FormField label="Ambiente">
								<input value={form.environmentId} onChange={(event) => setForm((current) => ({ ...current, environmentId: event.target.value }))} className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400" placeholder="Ex.: Sala técnica" />
							</FormField>
							<FormField label="Porta / ponto de acesso">
								<input value={form.locationDescription} onChange={(event) => setForm((current) => ({ ...current, locationDescription: event.target.value }))} className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400" placeholder="Ex.: Porta principal, portão lateral, armário 02" />
							</FormField>
						</div>
						{keySummaryLocation.length ? (
							<div className="mt-4 rounded-2xl bg-slate-50 p-4">
								<p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Localização da chave</p>
								<div className="mt-2 text-sm font-black text-slate-800">
									{keySummaryLocation.map((item, index) => (
										<span key={`${item}-${index}`} className="inline-flex items-center">
											{index ? <ChevronRight size={14} className="mx-1 text-slate-400" /> : null}
											{item}
										</span>
									))}
								</div>
							</div>
						) : null}
					</DetailSection>

					{similarKey ? (
						<div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
							<p className="text-sm font-black text-orange-800">Já existe uma chave semelhante cadastrada neste local.</p>
							<p className="mt-1 text-xs font-semibold text-orange-700">
								{similarKey.codigo || similarKey.code || "Código não informado"} · {similarKey.type || "Tipo não informado"} · {similarKey.environmentId || "Ambiente não informado"} · {similarKey.locationDescription || similarKey.address || "Local não informado"}
							</p>
						</div>
					) : null}

					<DetailSection title="Observações">
						<FormField label="Observações" helper="Opcional. Use para registrar particularidades importantes.">
							<textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400" placeholder="Informações adicionais sobre uso, restrições ou identificação..." />
						</FormField>
						<div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
							<ShieldCheck size={16} />
							Status inicial: Disponível para retirada
						</div>
					</DetailSection>

					<div className="rounded-2xl border border-slate-200 bg-white p-4">
						<p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Resumo antes de salvar</p>
						<div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
							<div>
								<p className="font-black text-slate-950">{form.code.trim() || "Código automático"}</p>
								<p className="text-xs font-semibold text-slate-500">{form.type}</p>
							</div>
							<div className="md:col-span-2">
								<p className="font-black text-slate-950">{form.description || "Descrição não informada"}</p>
								<p className="text-xs font-semibold text-slate-500">{keySummaryLocation.join(" › ") || "Localização pendente"}</p>
							</div>
						</div>
					</div>
				</div>
			</AppModal>

			<AppModal open={modal === "checkoutPicker"} title="Registrar retirada" description="Selecione uma chave disponível na tabela ou busque pelo código." onClose={() => setModal(null)} maxWidth="max-w-xl">
				<p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">Use a busca da tabela para localizar a chave e clique em Retirar no menu de ações.</p>
			</AppModal>

			<AppModal open={modal === "checkout"} title="Confirmar retirada?" description={selectedKey ? `${selectedKey.codigo || selectedKey.code} · ${selectedKey.description}` : ""} onClose={() => setModal(null)} maxWidth="max-w-2xl">
				<div className="grid gap-3">
					<input value={custodyForm.holderName} onChange={(event) => setCustodyForm((current) => ({ ...current, holderName: event.target.value }))} className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400" placeholder="Portador" />
					<input type="datetime-local" value={custodyForm.expectedReturnAt} onChange={(event) => setCustodyForm((current) => ({ ...current, expectedReturnAt: event.target.value }))} className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400" />
					<textarea value={custodyForm.notes} onChange={(event) => setCustodyForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-24 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400" placeholder="Motivo ou observação" />
				</div>
				<div className="mt-5 flex justify-end gap-2">
					<button type="button" onClick={() => setModal(null)} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700">Cancelar</button>
					<button type="button" disabled={saving || !custodyForm.holderName.trim()} onClick={() => runKeyAction((id) => retirarChaveFacilities(id, custodyForm), "Não foi possível retirar a chave.")} className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50">Confirmar retirada</button>
				</div>
			</AppModal>

			<AppModal open={modal === "return"} title="Confirmar devolução" description={selectedKey ? `${selectedKey.codigo || selectedKey.code} · ${selectedKey.description}` : ""} onClose={() => setModal(null)} maxWidth="max-w-xl">
				<p className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-800">Confirme a devolução para liberar a chave novamente.</p>
				<div className="mt-5 flex justify-end gap-2">
					<button type="button" onClick={() => setModal(null)} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700">Cancelar</button>
					<button type="button" disabled={saving} onClick={() => runKeyAction((id) => devolverChaveFacilities(id, custodyForm), "Não foi possível devolver a chave.")} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">Confirmar devolução</button>
				</div>
			</AppModal>

			<AppModal open={modal === "lost"} title="Declarar chave perdida" description="Ação crítica auditada. Informe uma justificativa." onClose={() => setModal(null)} maxWidth="max-w-xl">
				<textarea value={custodyForm.notes} onChange={(event) => setCustodyForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-28 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-red-400" placeholder="Justificativa obrigatória" />
				<div className="mt-5 flex justify-end gap-2">
					<button type="button" onClick={() => setModal(null)} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700">Cancelar</button>
					<button type="button" disabled={saving || !custodyForm.notes.trim()} onClick={() => runKeyAction((id) => declararChavePerdidaFacilities(id, { justification: custodyForm.notes }), "Não foi possível declarar perda.")} className="h-11 rounded-xl bg-red-600 px-5 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50">Declarar perdida</button>
				</div>
			</AppModal>
		</section>
	);
}

function formatKeyDateTime(value) {
	if (!value) return "—";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function KeyStatusBadge({ status, label }) {
	const tone = status === "DISPONIVEL" ? "bg-emerald-50 text-emerald-700" : ["ATRASADA", "PERDIDA"].includes(status) ? "bg-red-50 text-red-700" : status === "INATIVA" ? "bg-slate-100 text-slate-600" : "bg-orange-50 text-orange-700";
	return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${tone}`}>{label || status || "Sem status"}</span>;
}

function KeyAttentionPanel({ items = [], onOpen }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<h4 className="text-lg font-black text-slate-950">Requer atenção</h4>
			<div className="mt-4 space-y-3">
				{items.length ? items.map((item) => (
					<button key={item.id} type="button" onClick={() => onOpen(item)} className="block w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left hover:border-blue-200 hover:bg-blue-50">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="font-black text-slate-950">{item.codigo || item.code} · {item.description}</p>
								<p className="mt-1 text-sm font-semibold text-slate-500">{item.locationDescription || "Sem localização"}</p>
							</div>
							<KeyStatusBadge status={item.status} label={item.statusLabel} />
						</div>
					</button>
				)) : <p className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-black text-emerald-700">Nenhuma chave crítica no momento.</p>}
			</div>
		</section>
	);
}

function KeyRecentEventsPanel({ items = [], expanded = false }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<h4 className="text-lg font-black text-slate-950">Últimas movimentações</h4>
			<div className="mt-4 space-y-3">
				{items.length ? items.slice(0, expanded ? 30 : 8).map((item) => (
					<div key={item.id} className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
						<p className="text-sm font-black text-slate-950">{item.keyCode || "CHV"} · {eventLabel(item.eventType || item.action)}</p>
						<p className="mt-1 text-xs font-semibold text-slate-500">{item.holderName || item.userName || "Sistema"} · {formatKeyDateTime(item.occurredAt || item.createdAt)}</p>
					</div>
				)) : <EmptyState title="Nenhuma movimentação" description="Retiradas e devoluções aparecerão aqui." />}
			</div>
		</section>
	);
}

function eventLabel(value = "") {
	return {
		CREATED: "cadastrada",
		UPDATED: "atualizada",
		CHECKED_OUT: "retirada",
		RETURNED: "devolvida",
		LOST: "declarada perdida",
		DEACTIVATED: "inativada",
		QR_REGENERATED: "QR regenerado",
	}[value] || value || "evento";
}

function KeyActions({ keyItem, canManage = false, onOpen, onEdit, onCheckout, onReturn, onLost, onDeactivate, onRegenerate }) {
	return (
		<details className="relative inline-block text-left">
			<summary className="inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 [&::-webkit-details-marker]:hidden"><MoreVertical size={16} /></summary>
			<div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 text-left shadow-xl">
				<button type="button" onClick={onOpen} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><Search size={14} /> Ver ficha</button>
				{canManage ? <button type="button" onClick={onEdit} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><Edit3 size={14} /> Editar</button> : null}
				{canManage && keyItem.status === "DISPONIVEL" ? <button type="button" onClick={onCheckout} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"><KeyRound size={14} /> Retirar</button> : null}
				{canManage && ["EM_POSSE", "ATRASADA"].includes(keyItem.status) ? <button type="button" onClick={onReturn} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-blue-700 hover:bg-blue-50"><RotateCcw size={14} /> Devolver</button> : null}
				<button type="button" onClick={() => downloadKeyQrPng(keyItem)} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><Download size={14} /> Baixar PNG</button>
				<button type="button" onClick={() => downloadKeyQrPdf(keyItem)} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><FileText size={14} /> Baixar PDF</button>
				{canManage ? <button type="button" onClick={() => window.confirm("Regenerar QR Code? O QR atual será invalidado.") && onRegenerate()} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-violet-700 hover:bg-violet-50"><QrCode size={14} /> Regenerar</button> : null}
				{canManage ? <button type="button" onClick={onLost} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-red-700 hover:bg-red-50"><AlertTriangle size={14} /> Declarar perda</button> : null}
				{canManage ? <button type="button" onClick={() => window.confirm(`Inativar a chave ${keyItem.codigo || keyItem.code}?`) && onDeactivate()} className="flex w-full items-center gap-2 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"><X size={14} /> Inativar</button> : null}
			</div>
		</details>
	);
}

function KeyTableSkeleton() {
	return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm font-black text-slate-500">Carregando chaves...</div>;
}

function KeyDetailPanel({ keyItem, canManage = false, history = [], historyLoading, onCheckout, onReturn, onEdit }) {
	return (
		<div className="space-y-5">
			<div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 md:flex-row md:items-center md:justify-between">
				<div>
					<p className="text-xl font-black text-slate-950">{keyItem.codigo || keyItem.code}</p>
					<p className="text-sm font-bold text-slate-600">{keyItem.description}</p>
					<p className="text-sm font-semibold text-blue-700">{keyItem.locationDescription || "Sem localização"}</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<KeyStatusBadge status={keyItem.status} label={keyItem.statusLabel} />
					{canManage ? <button type="button" onClick={onEdit} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">Editar</button> : null}
					{canManage && keyItem.status === "DISPONIVEL" ? <button type="button" onClick={onCheckout} className="h-9 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white">Retirar</button> : null}
					{canManage && ["EM_POSSE", "ATRASADA"].includes(keyItem.status) ? <button type="button" onClick={onReturn} className="h-9 rounded-xl bg-blue-600 px-3 text-xs font-black text-white">Devolver</button> : null}
				</div>
			</div>
			<div className="grid gap-3 md:grid-cols-3">
				{[
					["Tipo", keyItem.type],
					["Imóvel/local", keyItem.locationDescription],
					["Ambiente", keyItem.environmentId],
					["Portador atual", keyItem.currentHolderName || "Nenhum"],
					["Retirada", formatKeyDateTime(keyItem.checkedOutAt)],
					["QR Code", keyItem.qrToken ? "Ativo" : "Pendente"],
				].map(([label, value]) => (
					<div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
						<p className="text-xs font-black uppercase text-slate-500">{label}</p>
						<p className="mt-1 text-sm font-black text-slate-950">{value || "—"}</p>
					</div>
				))}
			</div>
			<div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
				<section className="rounded-2xl border border-slate-200 bg-white p-5">
					<h4 className="font-black text-slate-950">QR Code</h4>
					<div className="mt-4 flex flex-wrap gap-2">
						<button type="button" onClick={() => downloadKeyQrPng(keyItem)} className="h-10 rounded-xl border border-blue-100 bg-blue-50 px-4 text-xs font-black text-blue-700">Baixar PNG</button>
						<button type="button" onClick={() => downloadKeyQrPdf(keyItem)} className="h-10 rounded-xl border border-orange-100 bg-orange-50 px-4 text-xs font-black text-orange-700">Baixar PDF</button>
						<button type="button" onClick={() => window.print()} className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-700">Imprimir</button>
					</div>
				</section>
				<section className="rounded-2xl border border-slate-200 bg-white p-5">
					<h4 className="font-black text-slate-950">Movimentações</h4>
					<div className="mt-3 space-y-2">
						{historyLoading ? <p className="text-sm font-bold text-slate-500">Carregando histórico...</p> : history.length ? history.map((item) => <SimpleRow key={item.id} title={eventLabel(item.eventType || item.action)} subtitle={`${item.holderName || item.userName || "Sistema"} · ${formatKeyDateTime(item.occurredAt || item.createdAt)}`} value="ADM" tone="blue" />) : <EmptyState title="Sem histórico" description="Movimentações desta chave aparecerão aqui." />}
					</div>
				</section>
			</div>
		</div>
	);
}

const OPERATION_TABS = [
	{ key: "visao", label: "Visão Geral", icon: BarChart3 },
	{ key: "checklists", label: "Checklists", icon: ClipboardCheck },
	{ key: "execucoes", label: "Execuções", icon: ShieldCheck },
	{ key: "rotinas", label: "Rotinas", icon: RotateCcw },
	{ key: "manutencao", label: "Manutenção", icon: Settings },
	{ key: "ocorrencias", label: "Ocorrências", icon: AlertTriangle },
	{ key: "achados", label: "Achados & Perdidos", icon: PackageSearch },
	{ key: "agenda", label: "Agenda", icon: History },
];

function todayDateKey() {
	return new Date().toISOString().slice(0, 10);
}

function isSameDay(value, dateKey = todayDateKey()) {
	if (!value) return false;
	return String(value).slice(0, 10) === dateKey;
}

function formatDateTime(value) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function operationTone(status = "") {
	const normalized = normalizeText(status);
	if (["conforme", "concluida", "concluido", "resolvida", "entregue", "ativo"].includes(normalized)) return "emerald";
	if (["atencao", "atrasada", "vencida", "nao_conforme", "alta", "critica", "aberta"].includes(normalized)) return "red";
	if (["programada", "pendente", "em_andamento", "aguardando_retirada", "media"].includes(normalized)) return "orange";
	return "blue";
}

function OperationBadge({ children, tone = "blue" }) {
	const classes = {
		blue: "bg-blue-50 text-blue-700",
		emerald: "bg-emerald-50 text-emerald-700",
		orange: "bg-orange-50 text-orange-700",
		red: "bg-red-50 text-red-700",
		slate: "bg-slate-100 text-slate-600",
	}[tone] || "bg-blue-50 text-blue-700";
	return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${classes}`}>{children || "-"}</span>;
}

function OperationTable({ columns = [], rows = [], emptyTitle, emptyDescription, onRowClick }) {
	return (
		<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
			<div className="overflow-x-auto">
				<table className="min-w-full divide-y divide-slate-100">
					<thead className="bg-slate-50">
						<tr>
							{columns.map((column) => (
								<th key={column.key} className="px-4 py-3 text-left text-xs font-black uppercase text-slate-500">
									{column.label}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100 bg-white">
						{rows.length ? rows.map((row) => (
							<tr
								key={row.id}
								onClick={onRowClick ? () => onRowClick(row) : undefined}
								className={`${onRowClick ? "cursor-pointer" : ""} hover:bg-slate-50/80`}
							>
								{columns.map((column) => (
									<td key={column.key} className="px-4 py-4 text-sm font-semibold text-slate-700">
										{column.render ? column.render(row) : row[column.key] || "-"}
									</td>
								))}
							</tr>
						)) : (
							<tr>
								<td colSpan={columns.length} className="p-5">
									<EmptyState title={emptyTitle} description={emptyDescription} />
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function PropertyLookup({ label, value, onChange, imoveis = [], placeholder = "Buscar imóvel por nome, cidade, endereço ou código..." }) {
	const [query, setQuery] = useState("");
	const selected = imoveis.find((item) => getImovelId(item) === value);
	const visible = useMemo(() => {
		const normalized = normalizeText(query);
		if (!normalized || normalized.length < 2) return [];
		return imoveis
			.filter((item) =>
				normalizeText([
					getImovelLabel(item),
					item.cidade,
					item.estado,
					item.endereco,
					item.codigo,
					item.regional,
				].filter(Boolean).join(" ")).includes(normalized),
			)
			.slice(0, 8);
	}, [imoveis, query]);

	return (
		<label className="space-y-2">
			{label ? <span className="text-xs font-black uppercase text-slate-500">{label}</span> : null}
			<div className="rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-blue-400">
				<div className="flex items-center gap-2 rounded-xl px-2">
					<Search size={16} className="text-slate-400" />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						className="h-10 min-w-0 flex-1 text-sm font-semibold outline-none"
						placeholder={selected ? getImovelLabel(selected) : placeholder}
					/>
				</div>
				{selected ? (
					<div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
						<span className="truncate">{getImovelLabel(selected)}</span>
						<button type="button" onClick={() => onChange("", null)} className="text-blue-500 hover:text-red-600">
							<X size={14} />
						</button>
					</div>
				) : null}
				{query.trim().length >= 2 ? (
					<div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-100">
						{visible.length ? visible.map((item) => (
							<button
								type="button"
								key={getImovelId(item)}
								onClick={() => {
									onChange(getImovelId(item), item);
									setQuery("");
								}}
								className="block w-full px-3 py-2 text-left text-xs font-bold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
							>
								{getImovelLabel(item)}
							</button>
						)) : (
							<p className="px-3 py-3 text-xs font-bold text-slate-400">Nenhum imóvel encontrado.</p>
						)}
					</div>
				) : (
					<p className="mt-2 px-2 text-xs font-semibold text-slate-400">Digite pelo menos 2 caracteres para pesquisar.</p>
				)}
			</div>
		</label>
	);
}

function BuildingOperationPanel() {
	const [activeTab, setActiveTab] = useState("visao");
	const [checklists, setChecklists] = useState([]);
	const [runs, setRuns] = useState([]);
	const [routines, setRoutines] = useState([]);
	const [maintenance, setMaintenance] = useState([]);
	const [incidents, setIncidents] = useState([]);
	const [lostFound, setLostFound] = useState([]);
	const [imoveis, setImoveis] = useState([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [modal, setModal] = useState("");
	const [filters, setFilters] = useState({ checklistStatus: "todos", runStatus: "todos" });
	const [checklistForm, setChecklistForm] = useState({
		nome: "",
		tipoUnidade: "Loja",
		tipoChecklist: "Abertura",
		itens: "Portas e janelas conferidas\nIluminação funcionando\nAr-condicionado conferido\nAlarmes e câmeras conferidos",
	});
	const [runForm, setRunForm] = useState({ checklistId: "", imovelId: "", ambiente: "", responsavel: "" });
	const [routineForm, setRoutineForm] = useState({ nome: "", categoria: "Limpeza", frequencia: "Semanal", proximaExecucao: todayDateKey(), imovelId: "", ambiente: "", responsavel: "", prioridade: "Média", observacao: "" });
	const [maintenanceForm, setMaintenanceForm] = useState({ titulo: "", tipo: "Preventiva", equipamento: "", dataProgramada: todayDateKey(), imovelId: "", ambiente: "", responsavel: "", fornecedor: "", prioridade: "Média", observacao: "" });
	const [incidentForm, setIncidentForm] = useState({ titulo: "", tipo: "Predial", imovelId: "", ambiente: "", responsavel: "", prioridade: "Média", descricao: "", acaoImediata: "" });
	const [lostForm, setLostForm] = useState({ imovelId: "", ambiente: "", categoria: "", descricao: "", responsavelGuarda: "" });

	useEffect(() => {
		let active = true;
		Promise.all([
			listarChecklistsPrediais(),
			listarExecucoesChecklistPredial(),
			listarRotinasPrediais(),
			listarManutencoesPrediais(),
			listarOcorrenciasPrediais(),
			listarAchadosPerdidos(),
			listarImoveis(),
		])
			.then(([checklistsData, runsData, routinesData, maintenanceData, incidentsData, lostData, imoveisData]) => {
				if (!active) return;
				setChecklists(checklistsData || []);
				setRuns(runsData || []);
				setRoutines(routinesData || []);
				setMaintenance(maintenanceData || []);
				setIncidents(incidentsData || []);
				setLostFound(lostData || []);
				setImoveis(imoveisData || []);
			})
			.catch((err) => {
				if (active) setError(err?.message || "Erro ao carregar operação predial.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	const update = (setter) => (field, value) => setter((current) => ({ ...current, [field]: value }));
	const updateChecklist = update(setChecklistForm);
	const updateRun = update(setRunForm);
	const updateRoutine = update(setRoutineForm);
	const updateMaintenance = update(setMaintenanceForm);
	const updateIncident = update(setIncidentForm);
	const updateLost = update(setLostForm);

	async function withSave(action, message) {
		setSaving(true);
		setError("");
		try {
			await action();
			setModal("");
		} catch (err) {
			setError(err?.message || message || "Erro ao salvar registro.");
		} finally {
			setSaving(false);
		}
	}

	const todayRuns = runs.filter((run) => isSameDay(run.createdAt));
	const pendingRuns = runs.filter((run) => normalizeText(run.status) !== "conforme");
	const overdueRoutines = routines.filter((item) => item.proximaExecucao && item.proximaExecucao < todayDateKey() && normalizeText(item.status) !== "concluida");
	const upcomingMaintenance = maintenance.filter((item) => item.dataProgramada && daysUntil(item.dataProgramada) !== null && daysUntil(item.dataProgramada) <= 7 && normalizeText(item.status) !== "concluida");
	const openIncidents = incidents.filter((item) => !["resolvida", "concluida"].includes(normalizeText(item.status)));
	const waitingLost = lostFound.filter((item) => normalizeText(item.status) === "aguardando_retirada");
	const attentionItems = [
		...pendingRuns.map((item) => ({ id: `run-${item.id}`, title: item.checklistNome, subtitle: item.imovel || item.ambiente, value: "Checklist", tone: "orange" })),
		...overdueRoutines.map((item) => ({ id: `routine-${item.id}`, title: item.nome, subtitle: item.imovel, value: "Rotina atrasada", tone: "red" })),
		...upcomingMaintenance.map((item) => ({ id: `maintenance-${item.id}`, title: item.titulo, subtitle: item.imovel, value: "Manutenção", tone: daysUntil(item.dataProgramada) < 0 ? "red" : "orange" })),
		...openIncidents.map((item) => ({ id: `incident-${item.id}`, title: item.titulo, subtitle: item.imovel, value: "Ocorrência", tone: operationTone(item.prioridade || item.status) })),
		...waitingLost.map((item) => ({ id: `lost-${item.id}`, title: item.descricao, subtitle: item.imovel, value: "Achado", tone: "blue" })),
	].slice(0, 8);
	const todayAgenda = [
		...todayRuns.map((item) => ({ id: `run-${item.id}`, title: item.checklistNome, subtitle: item.imovel, value: "Executado", tone: "emerald" })),
		...routines.filter((item) => isSameDay(item.proximaExecucao)).map((item) => ({ id: `routine-${item.id}`, title: item.nome, subtitle: item.imovel, value: item.frequencia, tone: "blue" })),
		...maintenance.filter((item) => isSameDay(item.dataProgramada)).map((item) => ({ id: `maintenance-${item.id}`, title: item.titulo, subtitle: item.imovel, value: item.tipo, tone: "orange" })),
		...incidents.filter((item) => isSameDay(item.createdAt)).map((item) => ({ id: `incident-${item.id}`, title: item.titulo, subtitle: item.imovel, value: "Ocorrência", tone: "red" })),
	];

	function actionForTab() {
		if (activeTab === "checklists") return { label: "Novo template", modal: "checklist", icon: Plus };
		if (activeTab === "execucoes") return { label: "Iniciar execução", modal: "run", icon: ClipboardCheck };
		if (activeTab === "rotinas") return { label: "Nova rotina", modal: "routine", icon: RotateCcw };
		if (activeTab === "manutencao") return { label: "Nova manutenção", modal: "maintenance", icon: Settings };
		if (activeTab === "ocorrencias") return { label: "Nova ocorrência", modal: "incident", icon: AlertTriangle };
		if (activeTab === "achados") return { label: "Registrar achado", modal: "lost", icon: PackageSearch };
		return { label: "Nova ocorrência", modal: "incident", icon: Plus };
	}
	const action = actionForTab();
	const ActionIcon = action.icon;

	const checklistRows = checklists.filter((item) => filters.checklistStatus === "todos" || normalizeText(item.status) === normalizeText(filters.checklistStatus));
	const runRows = runs.filter((item) => filters.runStatus === "todos" || normalizeText(item.status) === normalizeText(filters.runStatus));

	return (
		<section className="space-y-5">
			<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Facilities / Rotina operacional</p>
						<h2 className="mt-2 text-3xl font-black text-slate-950">Operação Predial</h2>
						<p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
							Central de rotinas, checklists, manutenções, ocorrências, achados e agenda das unidades administrativas.
						</p>
					</div>
					<button
						type="button"
						onClick={() => setModal(action.modal)}
						className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm hover:bg-blue-700"
					>
						<ActionIcon size={17} /> {action.label}
					</button>
				</div>
				<div className="mt-5 flex gap-2 overflow-x-auto pb-1">
					{OPERATION_TABS.map((tab) => {
						const Icon = tab.icon;
						const active = activeTab === tab.key;
						return (
							<button
								type="button"
								key={tab.key}
								onClick={() => setActiveTab(tab.key)}
								className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-4 text-xs font-black transition ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"}`}
							>
								<Icon size={16} /> {tab.label}
							</button>
						);
					})}
				</div>
			</div>

			{error ? <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700">{error}</div> : null}

			{activeTab === "visao" ? (
				<div className="space-y-5">
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
						<KpiCard label="Checklists pendentes" value={loading ? "..." : numberFormatter.format(pendingRuns.length)} detail="Execuções com atenção" tone={pendingRuns.length ? "orange" : "emerald"} icon={ClipboardCheck} />
						<KpiCard label="Executados hoje" value={loading ? "..." : numberFormatter.format(todayRuns.length)} detail="Checklists do dia" tone="emerald" icon={ShieldCheck} />
						<KpiCard label="Rotinas atrasadas" value={loading ? "..." : numberFormatter.format(overdueRoutines.length)} detail="Fora do prazo" tone={overdueRoutines.length ? "red" : "emerald"} icon={RotateCcw} />
						<KpiCard label="Manutenções próximas" value={loading ? "..." : numberFormatter.format(upcomingMaintenance.length)} detail="Próximos 7 dias" tone="orange" icon={Settings} />
						<KpiCard label="Ocorrências abertas" value={loading ? "..." : numberFormatter.format(openIncidents.length)} detail="Sem conclusão" tone={openIncidents.length ? "red" : "emerald"} icon={AlertTriangle} />
						<KpiCard label="Achados aguardando" value={loading ? "..." : numberFormatter.format(waitingLost.length)} detail="Aguardando retirada" tone="blue" icon={PackageSearch} />
					</div>
					<div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
						<DataList
							title="Requer atenção"
							description="Itens que precisam de ação da equipe predial."
							items={attentionItems}
							renderItem={(item) => <SimpleRow key={item.id} {...item} />}
						/>
						<DataList
							title="Hoje"
							description="Execuções, rotinas, manutenções e ocorrências previstas para o dia."
							items={todayAgenda}
							renderItem={(item) => <SimpleRow key={item.id} {...item} />}
						/>
					</div>
				</div>
			) : null}

			{activeTab === "checklists" ? (
				<div className="space-y-4">
					<div className="flex flex-wrap gap-2">
						{["todos", "ativo", "inativo"].map((status) => (
							<button key={status} type="button" onClick={() => setFilters((current) => ({ ...current, checklistStatus: status }))} className={`h-9 rounded-xl border px-4 text-xs font-black ${filters.checklistStatus === status ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{status === "todos" ? "Todos" : status}</button>
						))}
					</div>
					<OperationTable
						columns={[
							{ key: "nome", label: "Template", render: (row) => <div><p className="font-black text-slate-950">{row.nome}</p><p className="text-xs text-slate-500">{row.tipoChecklist}</p></div> },
							{ key: "tipoUnidade", label: "Tipo de unidade" },
							{ key: "itens", label: "Itens", render: (row) => `${Array.isArray(row.itens) ? row.itens.length : 0} item(ns)` },
							{ key: "versao", label: "Versão", render: (row) => `v${row.versao || 1}` },
							{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(row.status)}>{row.status || "ativo"}</OperationBadge> },
							{ key: "updatedAt", label: "Atualizado", render: (row) => formatDateTime(row.updatedAt || row.createdAt) },
						]}
						rows={checklistRows}
						emptyTitle="Nenhum template de checklist cadastrado"
						emptyDescription="Crie templates por tipo de unidade para padronizar vistorias e rotinas."
					/>
				</div>
			) : null}

			{activeTab === "execucoes" ? (
				<div className="space-y-4">
					<div className="flex flex-wrap gap-2">
						{["todos", "conforme", "atenção"].map((status) => (
							<button key={status} type="button" onClick={() => setFilters((current) => ({ ...current, runStatus: status }))} className={`h-9 rounded-xl border px-4 text-xs font-black ${filters.runStatus === status ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{status === "todos" ? "Todos" : status}</button>
						))}
					</div>
					<OperationTable
						columns={[
							{ key: "checklistNome", label: "Checklist", render: (row) => <div><p className="font-black text-slate-950">{row.checklistNome}</p><p className="text-xs text-slate-500">{row.ambiente || "Ambiente não informado"}</p></div> },
							{ key: "imovel", label: "Unidade" },
							{ key: "responsavel", label: "Responsável" },
							{ key: "createdAt", label: "Início", render: (row) => formatDateTime(row.createdAt) },
							{ key: "naoConformes", label: "Resultado", render: (row) => `${row.naoConformes || 0} não conforme(s)` },
							{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(row.status)}>{row.status}</OperationBadge> },
						]}
						rows={runRows}
						emptyTitle="Nenhuma execução registrada"
						emptyDescription="As execuções de checklist aparecerão aqui com unidade, responsável e resultado."
					/>
				</div>
			) : null}

			{activeTab === "rotinas" ? (
				<OperationTable
					columns={[
						{ key: "nome", label: "Rotina", render: (row) => <div><p className="font-black text-slate-950">{row.nome}</p><p className="text-xs text-slate-500">{row.categoria}</p></div> },
						{ key: "imovel", label: "Unidade" },
						{ key: "frequencia", label: "Frequência" },
						{ key: "responsavel", label: "Responsável" },
						{ key: "proximaExecucao", label: "Próxima execução", render: (row) => formatDate(row.proximaExecucao) },
						{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(row.proximaExecucao < todayDateKey() ? "atrasada" : row.status)}>{row.proximaExecucao < todayDateKey() ? "atrasada" : row.status}</OperationBadge> },
					]}
					rows={routines}
					emptyTitle="Nenhuma rotina predial cadastrada"
					emptyDescription="Cadastre limpeza, abertura, fechamento, vistorias e conferências recorrentes."
				/>
			) : null}

			{activeTab === "manutencao" ? (
				<OperationTable
					columns={[
						{ key: "titulo", label: "Manutenção", render: (row) => <div><p className="font-black text-slate-950">{row.titulo}</p><p className="text-xs text-slate-500">{row.tipo}</p></div> },
						{ key: "imovel", label: "Unidade" },
						{ key: "equipamento", label: "Equipamento" },
						{ key: "responsavel", label: "Responsável" },
						{ key: "dataProgramada", label: "Programada", render: (row) => formatDate(row.dataProgramada) },
						{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(row.prioridade || row.status)}>{row.status}</OperationBadge> },
					]}
					rows={maintenance}
					emptyTitle="Nenhuma manutenção programada"
					emptyDescription="Registre preventivas, corretivas e chamados prediais com responsável e prazo."
				/>
			) : null}

			{activeTab === "ocorrencias" ? (
				<OperationTable
					columns={[
						{ key: "codigo", label: "Ocorrência", render: (row) => <div><p className="font-black text-slate-950">{row.codigo}</p><p className="text-xs text-slate-500">{row.titulo}</p></div> },
						{ key: "imovel", label: "Unidade" },
						{ key: "tipo", label: "Tipo" },
						{ key: "responsavel", label: "Responsável" },
						{ key: "createdAt", label: "Abertura", render: (row) => formatDateTime(row.createdAt) },
						{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(row.prioridade || row.status)}>{row.status}</OperationBadge> },
					]}
					rows={incidents}
					emptyTitle="Nenhuma ocorrência aberta"
					emptyDescription="Ocorrências prediais, danos, falhas e riscos aparecerão aqui."
				/>
			) : null}

			{activeTab === "achados" ? (
				<OperationTable
					columns={[
						{ key: "codigo", label: "Código", render: (row) => <span className="font-black text-blue-700">{row.codigo}</span> },
						{ key: "descricao", label: "Item", render: (row) => <div><p className="font-black text-slate-950">{row.descricao}</p><p className="text-xs text-slate-500">{row.categoria}</p></div> },
						{ key: "imovel", label: "Local encontrado" },
						{ key: "createdAt", label: "Data", render: (row) => formatDateTime(row.createdAt) },
						{ key: "responsavelGuarda", label: "Guarda" },
						{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(row.status)}>{row.status}</OperationBadge> },
					]}
					rows={lostFound}
					emptyTitle="Nenhum item em achados e perdidos"
					emptyDescription="Itens encontrados nas unidades serão controlados aqui até a retirada."
				/>
			) : null}

			{activeTab === "agenda" ? (
				<div className="grid gap-4 lg:grid-cols-7">
					{Array.from({ length: 7 }).map((_, index) => {
						const date = new Date();
						date.setDate(date.getDate() + index);
						const key = date.toISOString().slice(0, 10);
						const items = [
							...routines.filter((item) => isSameDay(item.proximaExecucao, key)).map((item) => ({ id: `r-${item.id}`, title: item.nome, tone: "blue" })),
							...maintenance.filter((item) => isSameDay(item.dataProgramada, key)).map((item) => ({ id: `m-${item.id}`, title: item.titulo, tone: "orange" })),
							...runs.filter((item) => isSameDay(item.createdAt, key)).map((item) => ({ id: `e-${item.id}`, title: item.checklistNome, tone: "emerald" })),
						];
						return (
							<div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
								<p className="text-xs font-black uppercase text-slate-500">{date.toLocaleDateString("pt-BR", { weekday: "short" })}</p>
								<p className="mt-1 text-xl font-black text-slate-950">{date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</p>
								<div className="mt-3 space-y-2">
									{items.length ? items.slice(0, 4).map((item) => <SimpleRow key={item.id} title={item.title} value="" tone={item.tone} />) : <p className="text-xs font-semibold text-slate-400">Sem agenda.</p>}
								</div>
							</div>
						);
					})}
				</div>
			) : null}

			<OperationForms
				modal={modal}
				setModal={setModal}
				saving={saving}
				imoveis={imoveis}
				checklists={checklists}
				incidents={incidents}
				forms={{ checklistForm, runForm, routineForm, maintenanceForm, incidentForm, lostForm }}
				update={{ updateChecklist, updateRun, updateRoutine, updateMaintenance, updateIncident, updateLost }}
				save={{
					checklist: () => withSave(async () => {
						const saved = await criarChecklistPredial(checklistForm);
						setChecklists((current) => [saved, ...current]);
						setChecklistForm((current) => ({ ...current, nome: "" }));
					}, "Erro ao criar checklist."),
					run: () => withSave(async () => {
						const saved = await criarExecucaoChecklistPredial(runForm);
						setRuns((current) => [saved, ...current]);
						setRunForm({ checklistId: "", imovelId: "", ambiente: "", responsavel: "" });
					}, "Erro ao registrar execução."),
					routine: () => withSave(async () => {
						const saved = await criarRotinaPredial(routineForm);
						setRoutines((current) => [saved, ...current]);
						setRoutineForm({ nome: "", categoria: "Limpeza", frequencia: "Semanal", proximaExecucao: todayDateKey(), imovelId: "", ambiente: "", responsavel: "", prioridade: "Média", observacao: "" });
					}, "Erro ao criar rotina."),
					maintenance: () => withSave(async () => {
						const saved = await criarManutencaoPredial(maintenanceForm);
						setMaintenance((current) => [saved, ...current]);
						setMaintenanceForm({ titulo: "", tipo: "Preventiva", equipamento: "", dataProgramada: todayDateKey(), imovelId: "", ambiente: "", responsavel: "", fornecedor: "", prioridade: "Média", observacao: "" });
					}, "Erro ao criar manutenção."),
					incident: () => withSave(async () => {
						const saved = await criarOcorrenciaPredial(incidentForm);
						setIncidents((current) => [saved, ...current]);
						setIncidentForm({ titulo: "", tipo: "Predial", imovelId: "", ambiente: "", responsavel: "", prioridade: "Média", descricao: "", acaoImediata: "" });
					}, "Erro ao criar ocorrência."),
					lost: () => withSave(async () => {
						const saved = await criarAchadoPerdido(lostForm);
						setLostFound((current) => [saved, ...current]);
						setLostForm({ imovelId: "", ambiente: "", categoria: "", descricao: "", responsavelGuarda: "" });
					}, "Erro ao registrar achado."),
				}}
			/>
		</section>
	);
}

function OperationForms({ modal, setModal, saving, imoveis, checklists, incidents = [], forms, update, save }) {
	const { checklistForm, runForm, routineForm, maintenanceForm, incidentForm, lostForm } = forms;
	const { updateChecklist, updateRun, updateRoutine, updateMaintenance, updateIncident, updateLost } = update;
	const inputClass = "h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400";
	const textareaClass = "min-h-28 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400";

	return (
		<>
			<AppModal title="Novo template de checklist" description="Monte um checklist reutilizável por tipo de unidade e categoria." open={modal === "checklist"} onClose={() => setModal("")}>
				<div className="grid gap-3 md:grid-cols-2">
					<input value={checklistForm.nome} onChange={(event) => updateChecklist("nome", event.target.value)} className={`${inputClass} md:col-span-2`} placeholder="Nome do checklist" />
					<select value={checklistForm.tipoUnidade} onChange={(event) => updateChecklist("tipoUnidade", event.target.value)} className={inputClass}>
						<option>Loja</option><option>Escritório</option><option>POP</option><option>Datacenter</option><option>Almoxarifado</option>
					</select>
					<select value={checklistForm.tipoChecklist} onChange={(event) => updateChecklist("tipoChecklist", event.target.value)} className={inputClass}>
						<option>Abertura</option><option>Fechamento</option><option>Vistoria</option><option>Rotina</option><option>Segurança</option>
					</select>
					<textarea value={checklistForm.itens} onChange={(event) => updateChecklist("itens", event.target.value)} className={`${textareaClass} md:col-span-2`} placeholder="Um item por linha" />
					<button type="button" disabled={saving || !checklistForm.nome} onClick={save.checklist} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50 md:col-span-2">Salvar template</button>
				</div>
			</AppModal>

			<AppModal title="Iniciar execução de checklist" description="Escolha o checklist, pesquise a unidade e registre a execução." open={modal === "run"} onClose={() => setModal("")}>
				<div className="grid gap-3 md:grid-cols-2">
					<select value={runForm.checklistId} onChange={(event) => updateRun("checklistId", event.target.value)} className={`${inputClass} md:col-span-2`}>
						<option value="">Selecione o checklist</option>
						{checklists.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
					</select>
					<div className="md:col-span-2"><PropertyLookup value={runForm.imovelId} onChange={(value) => updateRun("imovelId", value)} imoveis={imoveis} /></div>
					<input value={runForm.ambiente} onChange={(event) => updateRun("ambiente", event.target.value)} className={inputClass} placeholder="Ambiente" />
					<input value={runForm.responsavel} onChange={(event) => updateRun("responsavel", event.target.value)} className={inputClass} placeholder="Responsável" />
					<button type="button" disabled={saving || !runForm.checklistId || !runForm.imovelId} onClick={save.run} className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white disabled:opacity-50 md:col-span-2">Registrar execução conforme</button>
				</div>
			</AppModal>

			<AppModal title="Nova rotina predial" description="Programe atividades recorrentes de limpeza, abertura, fechamento ou vistoria." open={modal === "routine"} onClose={() => setModal("")}>
				<div className="grid gap-3 md:grid-cols-2">
					<input value={routineForm.nome} onChange={(event) => updateRoutine("nome", event.target.value)} className={`${inputClass} md:col-span-2`} placeholder="Nome da rotina" />
					<select value={routineForm.categoria} onChange={(event) => updateRoutine("categoria", event.target.value)} className={inputClass}><option>Limpeza</option><option>Abertura</option><option>Fechamento</option><option>Vistoria</option><option>Jardinagem</option></select>
					<select value={routineForm.frequencia} onChange={(event) => updateRoutine("frequencia", event.target.value)} className={inputClass}><option>Diária</option><option>Semanal</option><option>Quinzenal</option><option>Mensal</option><option>Sob demanda</option></select>
					<div className="md:col-span-2"><PropertyLookup value={routineForm.imovelId} onChange={(value) => updateRoutine("imovelId", value)} imoveis={imoveis} /></div>
					<input type="date" value={routineForm.proximaExecucao} onChange={(event) => updateRoutine("proximaExecucao", event.target.value)} className={inputClass} />
					<input value={routineForm.responsavel} onChange={(event) => updateRoutine("responsavel", event.target.value)} className={inputClass} placeholder="Responsável" />
					<input value={routineForm.ambiente} onChange={(event) => updateRoutine("ambiente", event.target.value)} className={inputClass} placeholder="Ambiente" />
					<select value={routineForm.prioridade} onChange={(event) => updateRoutine("prioridade", event.target.value)} className={inputClass}><option>Baixa</option><option>Média</option><option>Alta</option><option>Crítica</option></select>
					<textarea value={routineForm.observacao} onChange={(event) => updateRoutine("observacao", event.target.value)} className={`${textareaClass} md:col-span-2`} placeholder="Observações" />
					<button type="button" disabled={saving || !routineForm.nome || !routineForm.imovelId} onClick={save.routine} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50 md:col-span-2">Salvar rotina</button>
				</div>
			</AppModal>

			<AppModal title="Nova manutenção" description="Registre preventiva, corretiva ou chamado técnico predial." open={modal === "maintenance"} onClose={() => setModal("")}>
				<div className="grid gap-3 md:grid-cols-2">
					<input value={maintenanceForm.titulo} onChange={(event) => updateMaintenance("titulo", event.target.value)} className={`${inputClass} md:col-span-2`} placeholder="Título da manutenção" />
					<select value={maintenanceForm.tipo} onChange={(event) => updateMaintenance("tipo", event.target.value)} className={inputClass}><option>Preventiva</option><option>Corretiva</option><option>Inspeção</option><option>Emergencial</option></select>
					<input type="date" value={maintenanceForm.dataProgramada} onChange={(event) => updateMaintenance("dataProgramada", event.target.value)} className={inputClass} />
					<div className="md:col-span-2"><PropertyLookup value={maintenanceForm.imovelId} onChange={(value) => updateMaintenance("imovelId", value)} imoveis={imoveis} /></div>
					<input value={maintenanceForm.equipamento} onChange={(event) => updateMaintenance("equipamento", event.target.value)} className={inputClass} placeholder="Equipamento ou sistema" />
					<input value={maintenanceForm.ambiente} onChange={(event) => updateMaintenance("ambiente", event.target.value)} className={inputClass} placeholder="Ambiente" />
					<input value={maintenanceForm.responsavel} onChange={(event) => updateMaintenance("responsavel", event.target.value)} className={inputClass} placeholder="Responsável" />
					<input value={maintenanceForm.fornecedor} onChange={(event) => updateMaintenance("fornecedor", event.target.value)} className={inputClass} placeholder="Fornecedor" />
					<select value={maintenanceForm.prioridade} onChange={(event) => updateMaintenance("prioridade", event.target.value)} className={inputClass}><option>Baixa</option><option>Média</option><option>Alta</option><option>Crítica</option></select>
					<textarea value={maintenanceForm.observacao} onChange={(event) => updateMaintenance("observacao", event.target.value)} className={`${textareaClass} md:col-span-2`} placeholder="Observações" />
					<button type="button" disabled={saving || !maintenanceForm.titulo || !maintenanceForm.imovelId} onClick={save.maintenance} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50 md:col-span-2">Salvar manutenção</button>
				</div>
			</AppModal>

			<BuildingIncidentDialog
				open={modal === "incident"}
				onClose={() => setModal("")}
				form={incidentForm}
				update={updateIncident}
				imoveis={imoveis}
				incidents={incidents}
				saving={saving}
				onSubmit={save.incident}
			/>

			<AppModal title="Registrar achado ou perdido" description="Controle itens encontrados nas unidades até a retirada." open={modal === "lost"} onClose={() => setModal("")}>
				<div className="grid gap-3 md:grid-cols-2">
					<div className="md:col-span-2"><PropertyLookup value={lostForm.imovelId} onChange={(value) => updateLost("imovelId", value)} imoveis={imoveis} /></div>
					<input value={lostForm.ambiente} onChange={(event) => updateLost("ambiente", event.target.value)} className={inputClass} placeholder="Ambiente" />
					<input value={lostForm.categoria} onChange={(event) => updateLost("categoria", event.target.value)} className={inputClass} placeholder="Categoria" />
					<textarea value={lostForm.descricao} onChange={(event) => updateLost("descricao", event.target.value)} className={`${textareaClass} md:col-span-2`} placeholder="Descrição do item" />
					<input value={lostForm.responsavelGuarda} onChange={(event) => updateLost("responsavelGuarda", event.target.value)} className={`${inputClass} md:col-span-2`} placeholder="Responsável pela guarda" />
					<button type="button" disabled={saving || !lostForm.imovelId || !lostForm.descricao} onClick={save.lost} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50 md:col-span-2">Salvar achado</button>
				</div>
			</AppModal>
		</>
	);
}

const INCIDENT_TYPES = ["Predial", "Segurança", "Limpeza", "Infraestrutura", "Outro"];
const INCIDENT_PRIORITIES = ["Baixa", "Média", "Alta", "Crítica"];
const INCIDENT_PRIORITY_HELP = {
	Baixa: "Registro preventivo ou ponto sem impacto imediato.",
	Média: "Requer tratamento, mas não interrompe operação crítica.",
	Alta: "Pode afetar operação ou gerar risco relevante.",
	Crítica: "Exige ação imediata e acompanhamento próximo.",
};

function incidentPriorityTone(priority = "Média") {
	const normalized = normalizeText(priority);
	if (normalized === "critica") return "red";
	if (normalized === "alta") return "orange";
	if (normalized === "media") return "blue";
	return "slate";
}

function isIncidentOpen(item = {}) {
	return !["resolvida", "concluida", "cancelada"].includes(normalizeText(item.status));
}

function BuildingIncidentDialog({ open, onClose, form, update, imoveis = [], incidents = [], saving, onSubmit }) {
	const inputClass = "h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400";
	const textareaClass = "min-h-28 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400";
	const [selectedProperty, setSelectedProperty] = useState(null);
	const [errors, setErrors] = useState({});
	const selected = selectedProperty || imoveis.find((item) => getImovelId(item) === form.imovelId);
	const dirty = Boolean(form.titulo || form.imovelId || form.ambiente || form.responsavel || form.descricao || form.acaoImediata);
	const duplicate = incidents.find((item) =>
		isIncidentOpen(item)
		&& String(item.imovelId || "") === String(form.imovelId || "")
		&& normalizeText(item.tipo || item.categoria) === normalizeText(form.tipo)
		&& (!form.ambiente || !item.ambiente || normalizeText(item.ambiente) === normalizeText(form.ambiente)),
	);
	const priorityTone = incidentPriorityTone(form.prioridade);
	const close = () => {
		if (dirty && !saving && !window.confirm("Descartar ocorrência? Existem informações ainda não registradas.")) return;
		setErrors({});
		setSelectedProperty(null);
		onClose();
	};
	const change = (field, value) => {
		update(field, value);
		if (errors[field]) setErrors((current) => ({ ...current, [field]: "" }));
	};
	const submit = async () => {
		const nextErrors = {};
		if (!form.titulo?.trim()) nextErrors.titulo = "Informe o título da ocorrência.";
		if (!form.tipo?.trim()) nextErrors.tipo = "Selecione a categoria.";
		if (!form.prioridade?.trim()) nextErrors.prioridade = "Selecione a prioridade.";
		if (!form.imovelId) nextErrors.imovelId = "Selecione o imóvel.";
		if (!form.descricao?.trim()) nextErrors.descricao = "Descreva o que aconteceu.";
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length) return;
		await onSubmit();
	};

	return (
		<AppModal
			title="Nova ocorrência predial"
			description="Registre falhas, danos, riscos e ações imediatas para acompanhamento operacional."
			open={open}
			onClose={close}
			maxWidth="max-w-5xl"
			footer={<ModalFooterActions onCancel={close} onConfirm={submit} confirmLabel="Registrar ocorrência" savingLabel="Registrando..." saving={saving} disabled={!form.titulo || !form.imovelId || !form.tipo || !form.prioridade || !form.descricao} />}
		>
			<div className="space-y-6">
				<DetailSection title="Identificação" description="Comece pelo problema principal e pela categoria operacional.">
					<div className="grid gap-4 md:grid-cols-2">
						<FormField label="Título da ocorrência" required error={errors.titulo} helper="Descreva em poucas palavras o problema principal." className="md:col-span-2">
							<input value={form.titulo} onChange={(event) => change("titulo", event.target.value)} className={inputClass} placeholder="Ex.: Vazamento próximo ao quadro elétrico" />
						</FormField>
						<FormField label="Categoria" required error={errors.tipo}>
							<select value={form.tipo} onChange={(event) => change("tipo", event.target.value)} className={inputClass}>
								{INCIDENT_TYPES.map((item) => <option key={item}>{item}</option>)}
							</select>
						</FormField>
						<FormField label="Status inicial" helper="Toda nova ocorrência predial nasce aberta para acompanhamento.">
							<div className="flex h-12 items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 text-sm font-black text-emerald-700">
								<span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
								Aberta
							</div>
						</FormField>
					</div>
				</DetailSection>

				<DetailSection title="Localização" description="Informe a unidade e detalhe o ponto da ocorrência.">
					<div className="space-y-4">
						<FormField label="Imóvel" required error={errors.imovelId}>
							<PropertyLookup
								value={form.imovelId}
								onChange={(value, item) => {
									change("imovelId", value);
									setSelectedProperty(item || null);
								}}
								imoveis={imoveis}
								placeholder="Buscar imóvel por nome, cidade, endereço ou código..."
							/>
						</FormField>
						{selected ? (
							<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
								<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
									<div className="min-w-0">
										<p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600">Imóvel selecionado</p>
										<h4 className="mt-1 truncate text-base font-black text-slate-950">{getImovelLabel(selected)}</h4>
										<p className="mt-1 text-sm font-semibold text-slate-600">
											{[selected.base || selected.empresa, selected.regional || selected.cidade].filter(Boolean).join(" • ") || "Unidade ADM"}
										</p>
									</div>
									<button type="button" onClick={() => { change("imovelId", ""); setSelectedProperty(null); }} className="h-9 rounded-xl border border-blue-200 bg-white px-3 text-xs font-black text-blue-700 hover:bg-blue-100">Trocar imóvel</button>
								</div>
							</div>
						) : null}
						<div className="grid gap-4 md:grid-cols-2">
							<FormField label="Ambiente" helper="Ex.: banheiro masculino, recepção, sala técnica.">
								<input value={form.ambiente} onChange={(event) => change("ambiente", event.target.value)} className={inputClass} placeholder="Ambiente ou área afetada" />
							</FormField>
							<FormField label="Ponto exato" helper="Campo ainda não persistido separadamente; registre detalhes na descrição.">
								<input value="" readOnly className={`${inputClass} bg-slate-50 text-slate-400`} placeholder="Use a descrição para detalhar o ponto exato" />
							</FormField>
						</div>
					</div>
				</DetailSection>

				<DetailSection title="Prioridade e impacto" description="Classifique a criticidade para orientar a tratativa.">
					<div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
						<FormField label="Prioridade" required error={errors.prioridade}>
							<select value={form.prioridade} onChange={(event) => change("prioridade", event.target.value)} className={inputClass}>
								{INCIDENT_PRIORITIES.map((item) => <option key={item}>{item}</option>)}
							</select>
						</FormField>
						<div className={`rounded-2xl border p-4 ${priorityTone === "red" ? "border-red-200 bg-red-50" : priorityTone === "orange" ? "border-orange-200 bg-orange-50" : priorityTone === "blue" ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
							<div className="flex flex-wrap items-center gap-2">
								<DetailBadge tone={priorityTone}>{form.prioridade || "Prioridade"}</DetailBadge>
								{normalizeText(form.prioridade) === "critica" ? <DetailBadge tone="red">Ação imediata</DetailBadge> : null}
							</div>
							<p className="mt-2 text-sm font-semibold text-slate-700">{INCIDENT_PRIORITY_HELP[form.prioridade] || INCIDENT_PRIORITY_HELP.Média}</p>
						</div>
					</div>
					{normalizeText(form.prioridade) === "critica" ? (
						<div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
							Ocorrência crítica: confirme responsável e ação imediata antes de registrar.
						</div>
					) : null}
				</DetailSection>

				<DetailSection title="Descrição do problema" description="Separe claramente o que aconteceu da ação tomada.">
					<FormField label="Descreva o que aconteceu" required error={errors.descricao}>
						<textarea value={form.descricao} onChange={(event) => change("descricao", event.target.value)} className={textareaClass} placeholder="Informe o problema, quando foi identificado, sintomas observados e impacto percebido." />
					</FormField>
				</DetailSection>

				<DetailSection title="Ação imediata" description="Registre providências tomadas antes da resolução definitiva.">
					<FormField label="O que foi feito até agora?" helper="Ex.: área isolada, energia desligada, fornecedor acionado.">
						<textarea value={form.acaoImediata} onChange={(event) => change("acaoImediata", event.target.value)} className={textareaClass} placeholder="Ex.: área isolada, energia desligada, fornecedor acionado..." />
					</FormField>
				</DetailSection>

				<DetailSection title="Responsabilidade" description="A ocorrência pode ser criada sem responsável; o backend assume o usuário atual quando vazio.">
					<div className="grid gap-4 md:grid-cols-2">
						<FormField label="Responsável pela ocorrência" helper="Informe o nome quando já houver responsável definido.">
							<input value={form.responsavel} onChange={(event) => change("responsavel", event.target.value)} className={inputClass} placeholder="Buscar colaborador ou informar responsável" />
						</FormField>
						<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Próximo passo</p>
							<p className="mt-2 text-sm font-bold text-slate-700">{form.responsavel ? "Responsável definido para acompanhar a tratativa." : "Sem responsável informado; ficará atribuído ao usuário atual."}</p>
						</div>
					</div>
				</DetailSection>

				<DetailSection title="Evidências" description="Fotos e documentos ajudam na análise da ocorrência.">
					<div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
						<div className="flex items-start gap-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm"><Upload size={18} /></div>
							<div>
								<p className="text-sm font-black text-slate-950">Anexos ainda não são enviados por este modal.</p>
								<p className="mt-1 text-xs font-semibold text-slate-500">A rota atual de ocorrência predial não possui campo de upload. Mantive o cadastro compatível com o backend existente e deixei a área preparada para integrar ao storage oficial do ADM.</p>
							</div>
						</div>
					</div>
				</DetailSection>

				{duplicate ? (
					<div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
						<p className="text-sm font-black text-orange-800">Existe uma ocorrência aberta semelhante neste local.</p>
						<p className="mt-1 text-xs font-semibold text-orange-700">{duplicate.codigo || "Ocorrência"} • {duplicate.titulo || duplicate.descricao || "Sem título"} • {duplicate.status || "aberta"}</p>
						<p className="mt-2 text-xs font-bold text-orange-700">Verifique antes de registrar uma nova ocorrência.</p>
					</div>
				) : null}

				<div className="rounded-2xl border border-slate-200 bg-white p-4">
					<p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Resumo da ocorrência</p>
					<div className="mt-3 grid gap-3 md:grid-cols-4">
						<div><p className="text-sm font-black text-slate-950">{form.titulo || "Título pendente"}</p><p className="text-xs font-semibold text-slate-500">Ocorrência</p></div>
						<div><p className="text-sm font-black text-slate-950">{selected ? getImovelLabel(selected) : "Imóvel pendente"}</p><p className="text-xs font-semibold text-slate-500">{form.ambiente || "Sem ambiente"}</p></div>
						<div><p className="text-sm font-black text-slate-950">{form.tipo || "-"}</p><p className="text-xs font-semibold text-slate-500">Categoria</p></div>
						<div><p className="text-sm font-black text-slate-950">{form.responsavel || "Usuário atual"}</p><p className="text-xs font-semibold text-slate-500">Responsável</p></div>
					</div>
				</div>
			</div>
		</AppModal>
	);
}

function ImoveisSpacesPanel() {
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");
	const [items, setItems] = useState([]);
	const [error, setError] = useState("");
	const [quickFilter, setQuickFilter] = useState("todos");
	const [viewMode, setViewMode] = useState("table");
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(25);
	const [sortBy, setSortBy] = useState("nome");
	const [filters, setFilters] = useState({
		empresa: "",
		regional: "",
		estado: "",
		cidade: "",
		classificacao: "",
		status: "",
		tipoContrato: "",
		contrato: "",
	});
	const debouncedQuery = useDebouncedValue(query, 300);

	useEffect(() => {
		let active = true;
		setLoading(true);
		listarImoveis()
			.then((data) => {
				if (active) setItems(data || []);
			})
			.catch((err) => {
				if (active) setError(err?.message || "Não foi possível carregar imóveis.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	const rentValues = useMemo(() => items.map(getRentValue).filter((value) => value > 0).sort((a, b) => a - b), [items]);
	const medianRent = rentValues.length ? rentValues[Math.floor(rentValues.length / 2)] : 0;
	const duplicateAddressKeys = useMemo(() => {
		const counts = new Map();
		items.forEach((item) => {
			const display = getImovelDisplay(item);
			const key = normalizeText(`${display.endereco}|${display.localizacao}`);
			if (key) counts.set(key, (counts.get(key) || 0) + 1);
		});
		return counts;
	}, [items]);
	const enrichedItems = useMemo(() => items.map((item) => {
		const display = getImovelDisplay(item);
		const contract = getContractState(item);
		const rent = getRentValue(item);
		const addressKey = normalizeText(`${display.endereco}|${display.localizacao}`);
		const duplicateAddress = addressKey && (duplicateAddressKeys.get(addressKey) || 0) > 1;
		const suspiciousRent = Boolean(medianRent && rent > medianRent * 4);
		return {
			...item,
			_display: display,
			_contract: contract,
			_rent: rent,
			_qualityIssues: getQualityIssues(item, duplicateAddress, suspiciousRent),
		};
	}), [duplicateAddressKeys, items, medianRent]);
	const metrics = useMemo(() => {
		const total = enrichedItems.length;
		const ativos = enrichedItems.filter((item) => item.ativo !== false).length;
		const alugados = enrichedItems.filter((item) => normalizeText(item.tipoContrato).includes("alug")).length;
		const proprios = enrichedItems.filter((item) => normalizeText(item.tipoContrato || item.situacao).includes("propr")).length;
		const contratosAtivos = enrichedItems.filter((item) => item.contratoFim && !item._contract.attention).length;
		const contratosAtencao = enrichedItems.filter((item) => item._contract.attention).length;
		const custoMensal = enrichedItems.filter((item) => normalizeText(item.tipoContrato).includes("alug")).reduce((sum, item) => sum + item._rent, 0);
		return { total, ativos, alugados, proprios, contratosAtivos, contratosAtencao, custoMensal };
	}, [enrichedItems]);
	const filterOptions = useMemo(() => ({
		empresas: uniqueOptions(enrichedItems, (item) => item._display.empresa),
		regionais: uniqueOptions(enrichedItems, (item) => item._display.regional),
		estados: uniqueOptions(enrichedItems, (item) => String(item.estado || "").toUpperCase()),
		cidades: uniqueOptions(enrichedItems, (item) => item.cidade),
		classificacoes: uniqueOptions(enrichedItems, (item) => item._display.classificacao),
		tiposContrato: uniqueOptions(enrichedItems, (item) => item.tipoContrato || item.situacao),
	}), [enrichedItems]);
	const filtered = useMemo(() => {
		const normalized = normalizeText(debouncedQuery);
		let next = enrichedItems.filter((item) => {
			const display = item._display;
			const searchable = [display.nome, display.endereco, display.localizacao, display.empresa, display.regional, display.classificacao, item.id, item.seniorId, item.codigo, item.cidade, item.estado, item.endereco, item.rua, item.numero, item.base].filter(Boolean).join(" ");
			if (normalized && !normalizeText(searchable).includes(normalized)) return false;
			if (filters.empresa && display.empresa !== filters.empresa) return false;
			if (filters.regional && display.regional !== filters.regional) return false;
			if (filters.estado && String(item.estado || "").toUpperCase() !== filters.estado) return false;
			if (filters.cidade && item.cidade !== filters.cidade) return false;
			if (filters.classificacao && display.classificacao !== filters.classificacao) return false;
			if (filters.status && display.status !== filters.status) return false;
			if (filters.tipoContrato && item.tipoContrato !== filters.tipoContrato) return false;
			if (filters.contrato === "com" && !item.contratoFim) return false;
			if (filters.contrato === "sem" && item.contratoFim) return false;
			if (filters.contrato === "atencao" && !item._contract.attention) return false;
			return true;
		});
		if (quickFilter === "ativos") next = next.filter((item) => item.ativo !== false);
		if (quickFilter === "alugados") next = next.filter((item) => normalizeText(item.tipoContrato).includes("alug"));
		if (quickFilter === "proprios") next = next.filter((item) => normalizeText(item.tipoContrato || item.situacao).includes("propr"));
		if (quickFilter === "com-contrato") next = next.filter((item) => item.contratoFim);
		if (quickFilter === "sem-contrato") next = next.filter((item) => !item.contratoFim);
		if (quickFilter === "atencao") next = next.filter((item) => item._contract.attention);
		return [...next].sort((a, b) => {
			if (sortBy === "cidade") return a._display.localizacao.localeCompare(b._display.localizacao, "pt-BR");
			if (sortBy === "maior-aluguel") return b._rent - a._rent;
			if (sortBy === "menor-aluguel") return a._rent - b._rent;
			if (sortBy === "contrato-proximo") return (a._contract.days ?? 99999) - (b._contract.days ?? 99999);
			if (sortBy === "recente") return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
			return a._display.nome.localeCompare(b._display.nome, "pt-BR");
		});
	}, [debouncedQuery, enrichedItems, filters, quickFilter, sortBy]);

	useEffect(() => setPage(1), [debouncedQuery, filters, pageSize, quickFilter, sortBy, viewMode]);

	const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
	const currentPage = Math.min(page, totalPages);
	const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
	const activeFilters = [
		["empresa", filters.empresa],
		["regional", filters.regional],
		["estado", filters.estado],
		["cidade", filters.cidade],
		["classificacao", filters.classificacao],
		["status", filters.status],
		["contrato", filters.contrato],
	].filter(([, value]) => value);
	const qualitySummary = useMemo(() => ({
		total: enrichedItems.filter((item) => item._qualityIssues.length).length,
		noContractWithRent: enrichedItems.filter((item) => !item.contratoFim && item._rent > 0).length,
		duplicates: enrichedItems.filter((item) => item._qualityIssues.includes("endereço duplicado")).length,
		suspiciousRent: enrichedItems.filter((item) => item._qualityIssues.includes("verificar valor")).length,
	}), [enrichedItems]);
	const quickFilters = [
		["todos", "Todos", enrichedItems.length],
		["ativos", "Ativos", metrics.ativos],
		["alugados", "Alugados", metrics.alugados],
		["proprios", "Próprios", metrics.proprios],
		["com-contrato", "Com contrato", enrichedItems.filter((item) => item.contratoFim).length],
		["sem-contrato", "Sem contrato", enrichedItems.filter((item) => !item.contratoFim).length],
		["atencao", "Em atenção", metrics.contratosAtencao],
	];
	function clearFilters() {
		setQuery("");
		setQuickFilter("todos");
		setFilters({ empresa: "", regional: "", estado: "", cidade: "", classificacao: "", status: "", tipoContrato: "", contrato: "" });
		setSortBy("nome");
	}
	function exportFiltered() {
		downloadCsv(`imoveis-espacos-${new Date().toISOString().slice(0, 10)}.csv`, [
			["Imóvel", "Endereço", "Cidade/UF", "Empresa", "Regional", "Classificação", "Tipo", "Contrato", "Aluguel", "Status", "Qualidade"],
			...filtered.map((item) => [item._display.nome, item._display.endereco, item._display.localizacao, item._display.empresa, item._display.regional, item._display.classificacao, item._display.tipoContrato, item._contract.label, formatCurrency(item._rent), item._display.status, item._qualityIssues.length ? item._qualityIssues.join(", ") : "Completo"]),
		]);
	}

	if (loading) {
		return (
			<section className="space-y-5">
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
					{Array.from({ length: 6 }).map((_, index) => (
						<div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white p-5">
							<div className="h-3 w-24 rounded bg-slate-100" />
							<div className="mt-4 h-8 w-16 rounded bg-slate-100" />
							<div className="mt-3 h-3 w-32 rounded bg-slate-100" />
						</div>
					))}
				</div>
				<div className="h-96 animate-pulse rounded-3xl border border-slate-200 bg-white" />
			</section>
		);
	}

	return (
		<section className="space-y-5">
			<header className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Central de imóveis</p>
						<h3 className="mt-2 text-2xl font-black text-slate-950">Imóveis & Espaços</h3>
						<p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">Gerencie unidades, contratos, localização, ocupação e estrutura física com os dados do cadastro oficial do ADM.</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button type="button" onClick={exportFiltered} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"><Download size={16} /> Exportar</button>
						<Link to={ROUTES.FACILITIES_IMOVEIS_NOVO} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700"><Plus size={16} /> Novo imóvel</Link>
					</div>
				</div>
			</header>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
				<KpiCard label="Total de imóveis" value={numberFormatter.format(metrics.total)} detail="Base cadastrada" tone="blue" icon={Building2} />
				<KpiCard label="Imóveis ativos" value={numberFormatter.format(metrics.ativos)} detail="Em acompanhamento" tone="emerald" icon={ShieldCheck} />
				<KpiCard label="Alugados" value={numberFormatter.format(metrics.alugados)} detail="Tipo de contrato" tone="orange" icon={Home} />
				<KpiCard label="Próprios" value={numberFormatter.format(metrics.proprios)} detail="Patrimônio próprio" tone="violet" icon={Building2} />
				<KpiCard label="Contratos ativos" value={numberFormatter.format(metrics.contratosAtivos)} detail="Com vigência segura" tone="emerald" icon={FileText} />
				<KpiCard label="Em atenção" value={numberFormatter.format(metrics.contratosAtencao)} detail="Vencidos ou até 90 dias" tone={metrics.contratosAtencao ? "red" : "emerald"} icon={AlertTriangle} />
			</div>
			<div className="grid items-start gap-4 xl:grid-cols-[1.2fr_0.8fr]">
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h4 className="font-black text-slate-950">Resumo financeiro</h4>
					<p className="mt-1 text-sm font-semibold text-slate-500">Custo mensal calculado apenas com imóveis alugados e valor informado.</p>
					<p className="mt-3 text-3xl font-black text-slate-950">{formatCurrency(metrics.custoMensal)}</p>
				</section>
				<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h4 className="font-black text-slate-950">Qualidade da base</h4>
					<p className="mt-1 text-sm font-semibold text-slate-500">{qualitySummary.total ? `${qualitySummary.total} imóvel(is) com ponto de revisão.` : "Cadastros sem alertas críticos no recorte atual."}</p>
					<div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
						<span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{qualitySummary.noContractWithRent} aluguel sem contrato</span>
						<span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{qualitySummary.duplicates} endereço duplicado</span>
						<span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{qualitySummary.suspiciousRent} valor suspeito</span>
					</div>
				</section>
			</div>
			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap gap-2">
					{["Imóveis", "Ambientes", "Ocupação", "Mapa"].map((tab, index) => (
						<button key={tab} type="button" disabled={index > 0} className={`rounded-xl border px-4 py-2 text-sm font-black ${index === 0 ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-slate-50 text-slate-400"}`} title={index > 0 ? "Área reservada para a próxima evolução da central." : undefined}>{tab}</button>
					))}
				</div>
			</section>
			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="grid items-start gap-3 lg:grid-cols-[1fr_auto_auto]">
					<label className="relative block">
						<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
						<input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" placeholder="Buscar imóvel, cidade, endereço, código, empresa ou classificação..." />
					</label>
					<div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
						<button type="button" onClick={() => setViewMode("table")} className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-black ${viewMode === "table" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}><Table2 size={16} /> Tabela</button>
						<button type="button" onClick={() => setViewMode("cards")} className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-black ${viewMode === "cards" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}><LayoutGrid size={16} /> Cards</button>
					</div>
					<button type="button" onClick={() => setShowAdvanced((current) => !current)} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700 hover:bg-slate-50"><SlidersHorizontal size={16} /> Filtros</button>
				</div>
				<div className="mt-4 flex flex-wrap gap-2">
					{quickFilters.map(([id, label, count]) => (
						<button key={id} type="button" onClick={() => setQuickFilter(id)} className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${quickFilter === id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"}`}>{label} {numberFormatter.format(count)}</button>
					))}
				</div>
				{showAdvanced ? <ImoveisAdvancedFilters filters={filters} setFilters={setFilters} options={filterOptions} /> : null}
				<div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-sm font-black text-slate-900">{numberFormatter.format(filtered.length)} encontrado(s)</p>
						{activeFilters.map(([key, value]) => (
							<button key={`${key}-${value}`} type="button" onClick={() => setFilters((current) => ({ ...current, [key]: "" }))} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{value} <X size={12} /></button>
						))}
						{activeFilters.length || query || quickFilter !== "todos" ? <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 hover:bg-slate-200"><RotateCcw size={12} /> Limpar tudo</button> : null}
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-400">
							<option value="nome">Ordenar por nome</option><option value="cidade">Cidade</option><option value="maior-aluguel">Maior aluguel</option><option value="menor-aluguel">Menor aluguel</option><option value="contrato-proximo">Contrato mais próximo</option><option value="recente">Mais recente</option>
						</select>
						<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none focus:border-blue-400">
							<option value={25}>25 por página</option><option value={50}>50 por página</option><option value={100}>100 por página</option>
						</select>
					</div>
				</div>
			</section>
			{error ? <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700">{error}</div> : null}
			<ImoveisListPanel filtered={filtered} pageItems={pageItems} viewMode={viewMode} currentPage={currentPage} pageSize={pageSize} totalPages={totalPages} setPage={setPage} clearFilters={clearFilters} />
		</section>
	);
}

function ImoveisAdvancedFilters({ filters, setFilters, options }) {
	const update = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
	return (
		<div className="mt-4 grid items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
			<FilterSelect label="Empresa" value={filters.empresa} options={options.empresas} onChange={(value) => update("empresa", value)} />
			<FilterSelect label="Regional" value={filters.regional} options={options.regionais} onChange={(value) => update("regional", value)} />
			<FilterSelect label="Estado" value={filters.estado} options={options.estados} onChange={(value) => update("estado", value)} />
			<FilterSelect label="Cidade" value={filters.cidade} options={options.cidades} onChange={(value) => update("cidade", value)} />
			<FilterSelect label="Classificação" value={filters.classificacao} options={options.classificacoes} onChange={(value) => update("classificacao", value)} />
			<FilterSelect label="Status" value={filters.status} options={["Ativo", "Inativo"]} onChange={(value) => update("status", value)} />
			<FilterSelect label="Tipo de contrato" value={filters.tipoContrato} options={options.tiposContrato} onChange={(value) => update("tipoContrato", value)} />
			<FilterSelect label="Contrato" value={filters.contrato} options={[["com", "Com contrato"], ["sem", "Sem contrato"], ["atencao", "Em atenção"]]} onChange={(value) => update("contrato", value)} />
		</div>
	);
}

function FilterSelect({ label, value, options = [], onChange }) {
	const normalizedOptions = options.map((item) => Array.isArray(item) ? { value: item[0], label: item[1] } : { value: item, label: item });
	return (
		<label className="space-y-1">
			<span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
			<select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-400">
				<option value="">Todos</option>
				{normalizedOptions.map((option) => (
					<option key={option.value} value={option.value}>{option.label}</option>
				))}
			</select>
		</label>
	);
}

function StatusBadge({ label }) {
	const active = label === "Ativo";
	return (
		<span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
			{label}
		</span>
	);
}

function ContractBadge({ contract }) {
	const classes = {
		slate: "bg-slate-100 text-slate-600",
		emerald: "bg-emerald-50 text-emerald-700",
		orange: "bg-orange-50 text-orange-700",
		red: "bg-red-50 text-red-700",
	};
	return (
		<div className="space-y-1">
			<span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${classes[contract.tone] || classes.slate}`}>{contract.label}</span>
			{contract.detail ? <p className="text-xs font-semibold text-slate-500">{contract.detail}</p> : null}
		</div>
	);
}

function ImovelActions({ imovel }) {
	const id = getImovelId(imovel);
	const mapUrl = imovel.mapsUrl || imovel.streetViewUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([imovel.endereco, imovel.cidade, imovel.estado].filter(Boolean).join(" "))}`;
	return (
		<details className="relative inline-block">
			<summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Abrir ações do imóvel">
				<MoreVertical size={16} />
			</summary>
			<div className="absolute right-0 z-20 mt-2 w-44 rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-xl">
				<Link to={`${ROUTES.FACILITIES_IMOVEIS}/${encodeURIComponent(id)}`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-slate-700 hover:bg-blue-50 hover:text-blue-700"><ExternalLink size={14} /> Ver detalhes</Link>
				<Link to={`${ROUTES.FACILITIES_IMOVEIS}/${encodeURIComponent(id)}/editar`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-slate-700 hover:bg-blue-50 hover:text-blue-700"><Edit3 size={14} /> Editar</Link>
				<a href={mapUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-slate-700 hover:bg-blue-50 hover:text-blue-700"><MapPin size={14} /> Ver no mapa</a>
			</div>
		</details>
	);
}

function ImoveisListPanel({ filtered, pageItems, viewMode, currentPage, pageSize, totalPages, setPage, clearFilters }) {
	return (
		<section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
			<div className="flex flex-col gap-2 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between">
				<div>
					<h4 className="text-lg font-black text-slate-950">Imóveis</h4>
					<p className="text-sm font-semibold text-slate-500">
						Mostrando {filtered.length ? numberFormatter.format((currentPage - 1) * pageSize + 1) : 0}–{numberFormatter.format(Math.min(currentPage * pageSize, filtered.length))} de {numberFormatter.format(filtered.length)}.
					</p>
				</div>
			</div>
			{viewMode === "table" ? (
				<div className="overflow-x-auto">
					<table className="w-full min-w-[1040px] text-left text-sm">
						<thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
							<tr>
								<th className="px-5 py-3">Imóvel</th>
								<th className="px-5 py-3">Cidade / UF</th>
								<th className="px-5 py-3">Empresa</th>
								<th className="px-5 py-3">Classificação</th>
								<th className="px-5 py-3">Tipo</th>
								<th className="px-5 py-3">Contrato</th>
								<th className="px-5 py-3">Aluguel</th>
								<th className="px-5 py-3">Status</th>
								<th className="px-5 py-3">Qualidade</th>
								<th className="px-5 py-3 text-right">Ações</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{pageItems.map((imovel) => <ImovelTableRow key={getImovelId(imovel)} imovel={imovel} />)}
						</tbody>
					</table>
				</div>
			) : (
				<div className="grid items-start gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
					{pageItems.map((imovel) => <ImovelCompactCard key={getImovelId(imovel)} imovel={imovel} />)}
				</div>
			)}
			{!filtered.length ? (
				<div className="p-5">
					<EmptyState title="Nenhum imóvel encontrado" description="Tente remover alguns filtros ou buscar por outro termo." />
					<div className="mt-4 flex justify-center">
						<button type="button" onClick={clearFilters} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white">Limpar filtros</button>
					</div>
				</div>
			) : null}
			<div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 md:flex-row md:items-center md:justify-between">
				<p className="text-xs font-bold text-slate-500">Página {numberFormatter.format(currentPage)} de {numberFormatter.format(totalPages)}</p>
				<div className="flex items-center gap-2">
					<button type="button" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Anterior</button>
					<button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Próxima</button>
				</div>
			</div>
		</section>
	);
}

function ImovelTableRow({ imovel }) {
	const id = getImovelId(imovel);
	const display = imovel._display;
	return (
		<tr className="cursor-pointer transition hover:bg-blue-50/50" onClick={() => { window.location.href = `${ROUTES.FACILITIES_IMOVEIS}/${encodeURIComponent(id)}`; }}>
			<td className="px-5 py-4"><p className="font-black text-slate-950">{display.nome}</p><p className="mt-1 max-w-md truncate text-xs font-semibold text-slate-500">{display.endereco}</p></td>
			<td className="px-5 py-4 font-bold text-slate-700">{display.localizacao}</td>
			<td className="px-5 py-4 font-bold text-slate-700">{display.empresa}</td>
			<td className="px-5 py-4"><span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">{display.classificacao}</span></td>
			<td className="px-5 py-4 font-bold text-slate-600">{display.tipoContrato}</td>
			<td className="px-5 py-4"><ContractBadge contract={imovel._contract} /></td>
			<td className="px-5 py-4 font-black text-slate-900">{imovel._rent > 0 ? formatCurrency(imovel._rent) : "-"}</td>
			<td className="px-5 py-4"><StatusBadge label={display.status} /></td>
			<td className="px-5 py-4">{imovel._qualityIssues.length ? <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700">{imovel._qualityIssues.length} pendência(s)</span> : <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">Completo</span>}</td>
			<td className="px-5 py-4 text-right" onClick={(event) => event.stopPropagation()}><ImovelActions imovel={imovel} /></td>
		</tr>
	);
}

function ImovelCompactCard({ imovel }) {
	const id = getImovelId(imovel);
	const display = imovel._display;
	return (
		<article className="self-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0"><h4 className="truncate text-base font-black text-slate-950">{display.nome}</h4><p className="mt-1 text-sm font-semibold text-slate-500">{display.localizacao}</p><p className="mt-1 truncate text-xs font-semibold text-slate-400">{display.endereco}</p></div>
				<StatusBadge label={display.status} />
			</div>
			<div className="mt-4 flex flex-wrap gap-2">
				<span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">{display.classificacao}</span>
				<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{display.tipoContrato}</span>
				<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{display.empresa}</span>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-3">
				<div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase text-slate-400">Aluguel</p><p className="mt-1 text-sm font-black text-slate-950">{imovel._rent > 0 ? formatCurrency(imovel._rent) : "-"}</p></div>
				<div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase text-slate-400">Contrato</p><p className="mt-1 text-sm font-black text-slate-950">{imovel._contract.label}</p></div>
			</div>
			<div className="mt-4 flex items-center justify-between gap-2">
				<Link to={`${ROUTES.FACILITIES_IMOVEIS}/${encodeURIComponent(id)}`} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700">Ver imóvel <ExternalLink size={14} /></Link>
				<ImovelActions imovel={imovel} />
			</div>
		</article>
	);
}

const SUPPLIERS_TABS = [
	{ key: "visao", label: "Visão Geral", icon: BarChart3 },
	{ key: "fornecedores", label: "Fornecedores", icon: Truck },
	{ key: "contratos", label: "Contratos", icon: FileText },
	{ key: "vencimentos", label: "Vencimentos", icon: History },
	{ key: "reajustes", label: "Reajustes", icon: RefreshCw },
	{ key: "avaliacoes", label: "Avaliações", icon: ShieldCheck },
	{ key: "documentos", label: "Documentos", icon: Download },
];

function normalizeContractWeekDays(days = []) {
	const values = Array.isArray(days)
		? days
		: String(days || "").split(",");
	return [...new Set(values
		.map((day) => WEEK_DAY_INDEX[normalizeText(day)] ?? null)
		.filter((day) => day !== null))];
}

function countWeekDaysInMonth(days = [], referenceDate = new Date()) {
	const selectedDays = normalizeContractWeekDays(days);
	if (!selectedDays.length) return 0;
	const year = referenceDate.getFullYear();
	const month = referenceDate.getMonth();
	const lastDay = new Date(year, month + 1, 0).getDate();
	let total = 0;
	for (let day = 1; day <= lastDay; day += 1) {
		if (selectedDays.includes(new Date(year, month, day).getDay())) total += 1;
	}
	return total;
}

function contractMonthlyValue(contract = {}) {
	const value = Number(contract.valorMensal || 0);
	const periodicity = normalizeText(contract.periodicidadeCobranca || "Mensal");
	if (periodicity.includes("anual")) return value / 12;
	if (periodicity.includes("semestral")) return value / 6;
	if (periodicity.includes("trimestral")) return value / 3;
	if (periodicity.includes("bimestral")) return value / 2;
	if (periodicity.includes("diaria") || periodicity.includes("diária")) return value * countWeekDaysInMonth(contract.diasAtuacao);
	if (periodicity.includes("pontual")) return 0;
	return value;
}

function contractStatus(contract = {}) {
	const days = daysUntil(contract.fimVigencia);
	if (days !== null && days < 0) return "Vencido";
	if (days !== null && days <= 90) return "Próximo do vencimento";
	return contract.status || "Ativo";
}

function buildSupplierEvaluationLink(supplier = {}) {
	const token = supplier.avaliacaoToken || `sup-${supplier.id || "fornecedor"}-${Date.now()}`;
	const origin = typeof window !== "undefined" ? window.location.origin : "https://adm.retiradas.tech";
	return `${origin}/avaliacao-fornecedor?fornecedor=${encodeURIComponent(supplier.id || "")}&token=${encodeURIComponent(token)}`;
}

function supplierEvaluationFields(supplier = {}) {
	return Array.isArray(supplier.avaliacaoCampos) && supplier.avaliacaoCampos.length
		? supplier.avaliacaoCampos
		: DEFAULT_SUPPLIER_EVALUATION_FIELDS;
}

function supplierEvaluationAverage(evaluations = [], supplierId = "") {
	const rows = evaluations.filter((item) => item.fornecedorId === supplierId);
	if (!rows.length) return null;
	const latest = rows.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
	return latest?.score ?? null;
}

const SUPPLIER_CATEGORIES = ["Manutenção predial", "Limpeza", "Vigilância", "Segurança", "Jardinagem", "Climatização", "Elevadores", "Geradores", "Dedetização", "Obras", "Energia", "Água/Saneamento", "Internet/Telecom", "Materiais", "Outros"];
const PERSON_TYPES = [
	{ value: "juridica", label: "Pessoa jurídica" },
	{ value: "fisica", label: "Pessoa física" },
];
const WEEK_DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const WEEK_DAY_INDEX = {
	domingo: 0,
	segunda: 1,
	"segunda-feira": 1,
	terca: 2,
	"terça": 2,
	"terca-feira": 2,
	"terça-feira": 2,
	quarta: 3,
	"quarta-feira": 3,
	quinta: 4,
	"quinta-feira": 4,
	sexta: 5,
	"sexta-feira": 5,
	sabado: 6,
	"sábado": 6,
};
const DEFAULT_SUPPLIER_EVALUATION_FIELDS = ["Atendimento", "Prazo", "Qualidade", "Comunicação", "Documentação"];

function SupplierLookup({ value, onChange }) {
	const [query, setQuery] = useState("");
	const [items, setItems] = useState([]);
	const [selected, setSelected] = useState(null);
	const debounced = useDebouncedValue(query, 300);
	useEffect(() => {
		let active = true;
		if (debounced.trim().length < 2) {
			setItems([]);
			return () => { active = false; };
		}
		buscarFornecedoresFacilities({ q: debounced, limit: 8 }).then((data) => {
			if (active) setItems(data || []);
		}).catch(() => {
			if (active) setItems([]);
		});
		return () => { active = false; };
	}, [debounced]);
	return (
		<label className="space-y-2">
			<span className="text-xs font-black uppercase text-slate-500">Fornecedor</span>
			<div className="rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-blue-400">
				<input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl px-3 text-sm font-semibold outline-none" placeholder={selected ? selected.nome : "Buscar fornecedor por nome, CPF/CNPJ ou serviço..."} />
				{selected || value ? <div className="mt-2 flex justify-between gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"><span className="truncate">{selected?.nome || value}</span><button type="button" onClick={() => { setSelected(null); onChange("", null); }}><X size={14} /></button></div> : null}
				{query.trim().length >= 2 ? <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-100">
					{items.length ? items.map((item) => <button type="button" key={item.id} onClick={() => { setSelected(item); onChange(item.id, item); setQuery(""); }} className="block w-full px-3 py-2 text-left hover:bg-blue-50"><p className="text-xs font-black text-slate-700">{item.nome}</p><p className="text-xs font-semibold text-slate-500">{item.tipoPessoa === "fisica" ? "PF" : "PJ"} · {item.cnpjCpf || item.categoria || "Sem CPF/CNPJ"}</p></button>) : <p className="px-3 py-3 text-xs font-bold text-slate-400">Nenhum fornecedor encontrado.</p>}
				</div> : <p className="mt-2 px-2 text-xs font-semibold text-slate-400">Digite pelo menos 2 caracteres.</p>}
			</div>
		</label>
	);
}

function ContractPropertyLookup({ value, onChange }) {
	const [query, setQuery] = useState("");
	const [items, setItems] = useState([]);
	const [selected, setSelected] = useState(null);
	const debounced = useDebouncedValue(query, 300);
	useEffect(() => {
		let active = true;
		if (debounced.trim().length < 2) {
			setItems([]);
			return () => { active = false; };
		}
		buscarImoveisContratosFacilities({ q: debounced, limit: 8 }).then((data) => {
			if (active) setItems(data || []);
		}).catch(() => {
			if (active) setItems([]);
		});
		return () => { active = false; };
	}, [debounced]);
	return (
		<label className="space-y-2">
			<span className="text-xs font-black uppercase text-slate-500">Imóvel</span>
			<div className="rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-blue-400">
				<input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl px-3 text-sm font-semibold outline-none" placeholder={selected ? selected.nome : "Buscar imóvel por nome, cidade ou código..."} />
				{selected || value ? <div className="mt-2 flex justify-between gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"><span className="truncate">{selected?.nome || value}</span><button type="button" onClick={() => { setSelected(null); onChange("", null); }}><X size={14} /></button></div> : null}
				{query.trim().length >= 2 ? <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-100">
					{items.length ? items.map((item) => <button type="button" key={item.id} onClick={() => { setSelected(item); onChange(item.id, item); setQuery(""); }} className="block w-full px-3 py-2 text-left hover:bg-blue-50"><p className="text-xs font-black text-slate-700">{item.nome}</p><p className="text-xs font-semibold text-slate-500">{[item.cidade, item.estado].filter(Boolean).join("/")}</p></button>) : <p className="px-3 py-3 text-xs font-bold text-slate-400">Nenhum imóvel encontrado.</p>}
				</div> : <p className="mt-2 px-2 text-xs font-semibold text-slate-400">Digite pelo menos 2 caracteres.</p>}
			</div>
		</label>
	);
}

function SuppliersContractsPanel() {
	const [tab, setTab] = useState("visao");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [suppliers, setSuppliers] = useState([]);
	const [contracts, setContracts] = useState([]);
	const [documents, setDocuments] = useState([]);
	const [adjustments, setAdjustments] = useState([]);
	const [evaluations, setEvaluations] = useState([]);
	const [modal, setModal] = useState("");
	const [selectedSupplier, setSelectedSupplier] = useState(null);
	const [selectedContract, setSelectedContract] = useState(null);
	const [selectedEvaluation, setSelectedEvaluation] = useState(null);
	const [supplierForm, setSupplierForm] = useState({ tipoPessoa: "juridica", razaoSocial: "", nomeFantasia: "", cnpjCpf: "", categoria: "Manutenção predial", categoriaOutra: "", contato: "", email: "", telefone: "", cidadeUf: "", servicos: "", status: "Ativo", observacao: "" });
	const [contractForm, setContractForm] = useState({ fornecedorId: "", contratadoTipoPessoa: "juridica", contratadoDocumento: "", contratadoNome: "", tipo: "Manutenção", servico: "", imovelId: "", valorMensal: "", periodicidadeCobranca: "Mensal", inicioVigencia: "", fimVigencia: "", indiceReajuste: "IPCA", periodicidadeReajuste: "Anual", proximoReajuste: "", sla: "", responsavelInterno: "", diasAtuacao: [], horarioAtuacao: "", frequenciaAtuacao: "", escopoLimpeza: "", status: "Ativo", observacao: "" });
	const [documentForm, setDocumentForm] = useState({ contratoId: "", fornecedorId: "", tipo: "Contrato assinado", numero: "", dataEmissao: "", validade: "", arquivoUrl: "", status: "Válido" });
	const [adjustmentForm, setAdjustmentForm] = useState({ contratoId: "", indice: "IPCA", percentual: "", valorAnterior: "", novoValor: "", dataBase: todayDateKey(), responsavel: "", observacao: "" });
	const [evaluationForm, setEvaluationForm] = useState({ fornecedorId: "", responsavelNome: "", responsavelEmail: "", competencia: currentCompetencia(), feedback: "", criteria: DEFAULT_SUPPLIER_EVALUATION_FIELDS.map((label) => ({ label, rating: 5 })) });

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [nextSuppliers, nextContracts, nextDocs, nextAdjustments, nextEvaluations] = await Promise.all([
				listarFornecedoresFacilities(),
				listarContratosFacilities(),
				listarDocumentosContratosFacilities(),
				listarReajustesContratosFacilities(),
				listarAvaliacoesFornecedoresFacilities(),
			]);
			setSuppliers(nextSuppliers || []);
			setContracts(nextContracts || []);
			setDocuments(nextDocs || []);
			setAdjustments(nextAdjustments || []);
			setEvaluations(nextEvaluations || []);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os contratos.");
		} finally {
			setLoading(false);
		}
	};
	useEffect(() => { load(); }, []);

	const update = (setter) => (field, value) => setter((current) => ({ ...current, [field]: value }));
	const updateSupplier = update(setSupplierForm);
	const updateContract = update(setContractForm);
	const withSave = async (action, fallback) => {
		setSaving(true); setError("");
		try { await action(); setModal(""); await load(); } catch (err) { setError(err?.message || fallback); } finally { setSaving(false); }
	};
	const saveSelectedSupplier = async (patch = {}) => {
		if (!selectedSupplier) return;
		setSaving(true); setError("");
		try {
			const payload = { ...selectedSupplier, ...patch };
			const saved = await salvarFornecedorFacilities(payload);
			setSelectedSupplier(saved || payload);
			await load();
		} catch (err) {
			setError(err?.message || "Falha ao salvar fornecedor.");
		} finally {
			setSaving(false);
		}
	};
	const saveSelectedContract = async (patch = {}) => {
		if (!selectedContract) return;
		setSaving(true); setError("");
		try {
			const payload = { ...selectedContract, ...patch };
			const saved = await salvarContratoFacilities(payload);
			setSelectedContract(saved || payload);
			await load();
		} catch (err) {
			setError(err?.message || "Falha ao salvar contrato.");
		} finally {
			setSaving(false);
		}
	};
	const openSupplier = (supplier) => {
		setSelectedSupplier({
			avaliacaoCampos: supplierEvaluationFields(supplier),
			...supplier,
			avaliacaoCamposText: supplierEvaluationFields(supplier).join("\n"),
			avaliacaoDiaMensal: supplier.avaliacaoDiaMensal || 5,
			avaliacaoToken: supplier.avaliacaoToken || `sup-${supplier.id}-${Date.now()}`,
		});
	};
	const openContract = (contract) => setSelectedContract({ ...contract });
	const openContractSupplier = (contract) => {
		const supplier = suppliers.find((item) => item.id === contract.fornecedorId);
		if (supplier) openSupplier(supplier);
		else openContract(contract);
	};
	const openSupplierLatestEvaluation = (supplier) => {
		const latest = evaluations
			.filter((item) => item.fornecedorId === supplier.id)
			.sort((a, b) => String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || "")))[0];
		if (latest) setSelectedEvaluation(latest);
		else openSupplier(supplier);
	};

	const activeSuppliers = suppliers.filter((item) => normalizeText(item.status || "Ativo") === "ativo");
	const activeContracts = contracts.filter((item) => ["ativo", "proximo do vencimento", "próximo do vencimento", ""].includes(normalizeText(contractStatus(item))));
	const dueContracts = contracts.filter((item) => { const days = daysUntil(item.fimVigencia); return days !== null && days <= 90; });
	const nextAdjustments = contracts.filter((item) => { const days = daysUntil(item.proximoReajuste); return days !== null && days >= 0 && days <= 60; });
	const dueDocs = documents.filter((item) => { const days = daysUntil(item.validade); return days !== null && days <= 60; });
	const monthlyTotal = contracts.reduce((total, item) => total + contractMonthlyValue(item), 0);
	const attention = [
		...dueContracts.map((item) => ({ id: `ctr-${item.id}`, title: `${item.codigo || "Contrato"} vence ${daysUntil(item.fimVigencia) < 0 ? "vencido" : `em ${daysUntil(item.fimVigencia)} dias`}`, subtitle: `${item.fornecedor || "Fornecedor"} · ${item.imovel || "Sem unidade"}`, value: daysUntil(item.fimVigencia) < 0 ? "CRÍTICO" : "ATENÇÃO", tone: daysUntil(item.fimVigencia) < 0 ? "red" : "orange" })),
		...nextAdjustments.map((item) => ({ id: `rea-${item.id}`, title: `Reajuste previsto em ${daysUntil(item.proximoReajuste)} dias`, subtitle: item.codigo || item.servico, value: item.indiceReajuste || "Índice", tone: "orange" })),
		...dueDocs.map((item) => ({ id: `doc-${item.id}`, title: `${item.tipo} vencendo`, subtitle: item.numero || item.contratoId || item.fornecedorId, value: formatDate(item.validade), tone: daysUntil(item.validade) < 0 ? "red" : "orange" })),
	].slice(0, 8);
	const dueEvents = [
		...contracts.map((item) => ({ id: `ctr-${item.id}`, title: item.codigo || item.servico, subtitle: item.fornecedor, due: item.fimVigencia, type: "Contrato" })),
		...contracts.map((item) => ({ id: `rea-${item.id}`, title: `Reajuste ${item.codigo || item.servico}`, subtitle: item.indiceReajuste, due: item.proximoReajuste, type: "Reajuste" })),
		...documents.map((item) => ({ id: `doc-${item.id}`, title: item.tipo, subtitle: item.numero, due: item.validade, type: "Documento" })),
	].filter((item) => item.due).sort((a, b) => new Date(a.due) - new Date(b.due));

	function exportData() {
		downloadCsv(`fornecedores-contratos-${todayDateKey()}.csv`, [
			["Tipo", "Código/Nome", "Fornecedor", "Serviço/Categoria", "Valor mensal", "Vigência", "Status"],
			...suppliers.map((item) => ["Fornecedor", item.nome, item.cnpjCpf, item.categoria, "", "", item.status]),
			...contracts.map((item) => ["Contrato", item.codigo, item.fornecedor, item.servico, formatCurrency(contractMonthlyValue(item)), formatDate(item.fimVigencia), contractStatus(item)]),
		]);
	}

	const action = tab === "fornecedores" ? ["supplier", "Novo fornecedor", Truck] : tab === "contratos" ? ["contract", "Novo contrato", FileText] : tab === "reajustes" ? ["adjustment", "Novo reajuste", RefreshCw] : tab === "avaliacoes" ? ["evaluation", "Enviar link", ShieldCheck] : tab === "documentos" ? ["document", "Novo documento", Download] : ["contract", "Novo contrato", Plus];
	const ActionIcon = action[2];

	return (
		<section className="space-y-5">
			<header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Facilities &gt; Fornecedores & Contratos</p>
						<h2 className="mt-2 text-3xl font-black text-slate-950">Fornecedores & Contratos</h2>
						<p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">Gerencie fornecedores, contratos, SLAs, reajustes, documentos e vencimentos de Facilities.</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button type="button" onClick={() => setModal("supplier")} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white"><Plus size={17} /> Novo fornecedor</button>
						<button type="button" onClick={() => setModal("contract")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700"><Plus size={17} /> Novo contrato</button>
						<button type="button" onClick={exportData} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700"><Download size={17} /> Exportar</button>
					</div>
				</div>
				<div className="mt-5 flex gap-2 overflow-x-auto pb-1">
					{SUPPLIERS_TABS.map((item) => {
						const Icon = item.icon;
						return <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-4 text-xs font-black ${tab === item.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}><Icon size={16} /> {item.label}</button>;
					})}
				</div>
			</header>
			{error ? <div className="flex items-center justify-between rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700"><span>{error}</span><button type="button" onClick={load} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-red-700">Tentar novamente</button></div> : null}
			{tab !== "visao" ? <div className="flex justify-end"><button type="button" onClick={() => setModal(action[0])} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white"><ActionIcon size={17} /> {action[1]}</button></div> : null}
			{tab === "visao" ? (
				<div className="space-y-5">
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
						<KpiCard label="Fornecedores ativos" value={loading ? "..." : numberFormatter.format(activeSuppliers.length)} detail="Aptos para contratação" tone="blue" icon={Truck} />
						<KpiCard label="Contratos vigentes" value={loading ? "..." : numberFormatter.format(activeContracts.length)} detail="Em acompanhamento" tone="emerald" icon={FileText} />
						<KpiCard label="Custo contratual mensal" value={loading ? "..." : formatCurrency(monthlyTotal)} detail="Valor previsto normalizado" tone="violet" icon={BarChart3} />
						<KpiCard label="Vencendo em 90 dias" value={loading ? "..." : numberFormatter.format(dueContracts.length)} detail="Contratos em atenção" tone={dueContracts.length ? "red" : "emerald"} icon={AlertTriangle} />
						<KpiCard label="Reajustes próximos" value={loading ? "..." : numberFormatter.format(nextAdjustments.length)} detail="Próximos 60 dias" tone="orange" icon={RefreshCw} />
						<KpiCard label="Documentos pendentes" value={loading ? "..." : numberFormatter.format(dueDocs.length)} detail="Vencidos ou vencendo" tone={dueDocs.length ? "orange" : "emerald"} icon={Download} />
					</div>
					<div className="grid items-start gap-5 xl:grid-cols-[1.1fr_0.9fr]">
						<DataList title="Requer atenção" description="Contratos, reajustes, documentos e SLAs com ação próxima." items={attention} renderItem={(item) => <SimpleRow key={item.id} {...item} />} />
						<DataList title="Próximos vencimentos" description="Contratos, reajustes e documentos em ordem de prazo." items={dueEvents.slice(0, 8).map((item) => ({ id: item.id, title: item.title, subtitle: item.subtitle || item.type, value: formatDate(item.due), tone: daysUntil(item.due) < 0 ? "red" : daysUntil(item.due) <= 30 ? "orange" : "blue" }))} renderItem={(item) => <SimpleRow key={item.id} {...item} />} />
					</div>
					<DataList title="Contratos com maior impacto mensal" items={[...contracts].sort((a, b) => contractMonthlyValue(b) - contractMonthlyValue(a)).slice(0, 6).map((item) => ({ id: item.id, title: item.codigo || item.servico, subtitle: item.fornecedor, value: formatCurrency(contractMonthlyValue(item)), tone: "violet" }))} renderItem={(item) => <SimpleRow key={item.id} {...item} />} />
				</div>
			) : null}
			{tab === "fornecedores" ? <OperationTable columns={[
				{ key: "fornecedor", label: "Fornecedor", render: (row) => <button type="button" onClick={(event) => { event.stopPropagation(); openSupplier(row); }} className="block text-left hover:text-blue-700"><p className="font-black text-slate-950">{row.nome}</p><p className="text-xs text-slate-500">{row.tipoPessoa === "fisica" ? "Pessoa física" : "Pessoa jurídica"} · {row.cnpjCpf || "Sem CPF/CNPJ"}</p></button> },
				{ key: "categoria", label: "Categoria", render: (row) => (row.categorias || [row.categoria]).join(", ") },
				{ key: "servicos", label: "Serviços" },
				{ key: "contratos", label: "Contratos Ativos", render: (row) => contracts.filter((contract) => contract.fornecedorId === row.id && normalizeText(contractStatus(contract)) !== "vencido").length },
				{ key: "sla", label: "SLA", render: (row) => row.sla || "-" },
				{ key: "avaliacao", label: "Avaliação", render: (row) => { const score = supplierEvaluationAverage(evaluations, row.id); return score ? <button type="button" onClick={(event) => { event.stopPropagation(); openSupplierLatestEvaluation(row); }} className={`font-black hover:underline ${score < 3 ? "text-red-700" : "text-amber-600"}`}>{Number(score).toFixed(1)} ★</button> : "-"; } },
				{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(row.status)}>{row.status}</OperationBadge> },
			]} rows={suppliers} onRowClick={openSupplier} emptyTitle="Nenhum fornecedor encontrado." emptyDescription="Cadastre ou vincule um fornecedor para começar." /> : null}
			{tab === "contratos" ? <OperationTable columns={[
				{ key: "contrato", label: "Contrato", render: (row) => <button type="button" onClick={(event) => { event.stopPropagation(); openContract(row); }} className="block text-left hover:text-blue-700"><p className="font-black text-blue-700">{row.codigo}</p><p className="text-xs text-slate-500">{row.servico}</p></button> },
				{ key: "fornecedor", label: "Fornecedor", render: (row) => <button type="button" onClick={(event) => { event.stopPropagation(); openContractSupplier(row); }} className="block text-left hover:text-blue-700"><p className="font-black text-slate-950">{row.fornecedor}</p><p className="text-xs text-slate-500">{row.contratadoTipoPessoa === "fisica" ? "PF" : "PJ"} · {row.contratadoDocumento || "Documento não informado"}</p></button> },
				{ key: "tipo", label: "Serviço" },
				{ key: "unidades", label: "Unidades", render: (row) => row.imovel || `${row.imoveisIds?.length || 0} unidade(s)` },
				{ key: "valor", label: "Valor", render: (row) => formatCurrency(contractMonthlyValue(row)) },
				{ key: "vigencia", label: "Vigência", render: (row) => `${formatDate(row.inicioVigencia)} até ${formatDate(row.fimVigencia)}` },
				{ key: "reajuste", label: "Próximo reajuste", render: (row) => formatDate(row.proximoReajuste) },
				{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(contractStatus(row))}>{contractStatus(row)}</OperationBadge> },
			]} rows={contracts} onRowClick={openContract} emptyTitle="Nenhum contrato cadastrado." emptyDescription="Cadastre o primeiro contrato para acompanhar vigência e reajustes." /> : null}
			{tab === "vencimentos" ? <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-5">{[["Vencidos", -1, "red"], ["7 dias", 7, "orange"], ["30 dias", 30, "orange"], ["60 dias", 60, "blue"], ["90 dias", 90, "blue"]].map(([title, limit, tone]) => {
				const rows = dueEvents.filter((item) => limit === -1 ? daysUntil(item.due) < 0 : daysUntil(item.due) >= 0 && daysUntil(item.due) <= limit);
				return <DataList key={title} title={title} items={rows.map((item) => ({ id: item.id, title: item.title, subtitle: item.subtitle || item.type, value: formatDate(item.due), tone }))} renderItem={(item) => <SimpleRow key={item.id} {...item} />} />;
			})}</div> : null}
			{tab === "reajustes" ? <OperationTable columns={[
				{ key: "contratoCodigo", label: "Contrato" },
				{ key: "fornecedor", label: "Fornecedor" },
				{ key: "valorAnterior", label: "Valor atual", render: (row) => formatCurrency(row.valorAnterior) },
				{ key: "indice", label: "Índice" },
				{ key: "dataBase", label: "Data-base", render: (row) => formatDate(row.dataBase) },
				{ key: "percentual", label: "Reajuste", render: (row) => `${row.percentual || 0}%` },
				{ key: "novoValor", label: "Novo valor", render: (row) => formatCurrency(row.novoValor) },
				{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(row.status)}>{row.status}</OperationBadge> },
			]} rows={adjustments} emptyTitle="Nenhum reajuste registrado." emptyDescription="Registre sugestões e aprovações de reajuste sem sobrescrever histórico." /> : null}
			{tab === "avaliacoes" ? <OperationTable columns={[
				{ key: "fornecedor", label: "Fornecedor", render: (row) => <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedEvaluation(row); }} className="font-black text-slate-950 hover:text-blue-700">{row.fornecedor}</button> },
				{ key: "link", label: "Link", render: (row) => row.link ? <a href={row.link} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="font-black text-blue-700 hover:underline">Abrir link</a> : "-" },
				{ key: "score", label: "Nota", render: (row) => row.respondido ? <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedEvaluation(row); }} className={`font-black hover:underline ${Number(row.score || 0) < 3 ? "text-red-700" : "text-amber-600"}`}>{Number(row.score || 0).toFixed(1)} ★</button> : "-" },
				{ key: "responsavelEmail", label: "Responsável", render: (row) => <div><p>{row.responsavelNome || "-"}</p><p className="text-xs text-slate-500">{row.responsavelEmail || "-"}</p></div> },
				{ key: "feedback", label: "Feedback", render: (row) => row.feedback || row.observacao || "-" },
				{ key: "status", label: "Status", render: (row) => <OperationBadge tone={row.status === "erro" ? "red" : row.respondido ? "emerald" : "orange"}>{row.status === "erro" ? "Erro no envio" : row.respondido ? "Respondido" : "Não respondido"}</OperationBadge> },
				{ key: "createdAt", label: "Data", render: (row) => formatDateTime(row.createdAt) },
			]} rows={evaluations} onRowClick={setSelectedEvaluation} emptyTitle="Nenhum link de avaliação enviado." emptyDescription="Envie links externos para que o responsável responda a avaliação." /> : null}
			{tab === "documentos" ? <OperationTable columns={[
				{ key: "tipo", label: "Documento", render: (row) => <div><p className="font-black text-slate-950">{row.tipo}</p><p className="text-xs text-slate-500">{row.numero || "Sem número"}</p></div> },
				{ key: "contratoId", label: "Contrato" },
				{ key: "fornecedorId", label: "Fornecedor" },
				{ key: "dataEmissao", label: "Emissão", render: (row) => formatDate(row.dataEmissao) },
				{ key: "validade", label: "Validade", render: (row) => formatDate(row.validade) },
				{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(row.status)}>{row.status}</OperationBadge> },
			]} rows={documents} emptyTitle="Nenhum documento cadastrado." emptyDescription="Vincule contratos assinados, aditivos, certidões, seguros e licenças." /> : null}
			<SuppliersForms modal={modal} setModal={setModal} saving={saving} suppliers={suppliers} contracts={contracts} forms={{ supplierForm, contractForm, documentForm, adjustmentForm, evaluationForm }} update={{ updateSupplier, updateContract, updateDocument: update(setDocumentForm), updateAdjustment: update(setAdjustmentForm), updateEvaluation: update(setEvaluationForm) }} save={{ supplier: () => withSave(() => salvarFornecedorFacilities({ ...supplierForm, categoria: supplierForm.categoria === "Outros" ? supplierForm.categoriaOutra || "Outros" : supplierForm.categoria }), "Falha ao salvar fornecedor."), contract: () => withSave(() => salvarContratoFacilities(contractForm), "Falha ao salvar contrato."), document: () => withSave(() => criarDocumentoContratoFacilities(documentForm), "Falha ao salvar documento."), adjustment: () => withSave(() => criarReajusteContratoFacilities(adjustmentForm), "Falha ao registrar reajuste."), evaluation: () => withSave(() => enviarLinkAvaliacaoFornecedorFacilities(evaluationForm), "Falha ao enviar link de avaliação.") }} />
			<SupplierDetailModal supplier={selectedSupplier} setSupplier={setSelectedSupplier} contracts={contracts} evaluations={evaluations} saving={saving} onClose={() => setSelectedSupplier(null)} onSave={saveSelectedSupplier} onOpenContract={setSelectedContract} onSendEvaluationLink={async (payload) => { await withSave(() => enviarLinkAvaliacaoFornecedorFacilities(payload), "Falha ao enviar link de avaliação."); setSelectedSupplier(null); }} />
			<ContractDetailModal contract={selectedContract} setContract={setSelectedContract} suppliers={suppliers} saving={saving} onClose={() => setSelectedContract(null)} onSave={saveSelectedContract} />
			<SupplierEvaluationDetailModal evaluation={selectedEvaluation} supplier={suppliers.find((item) => item.id === selectedEvaluation?.fornecedorId)} onClose={() => setSelectedEvaluation(null)} />
		</section>
	);
}

function DetailBadge({ children, tone = "slate" }) {
	const styles = {
		emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
		blue: "border-blue-200 bg-blue-50 text-blue-700",
		orange: "border-orange-200 bg-orange-50 text-orange-700",
		red: "border-red-200 bg-red-50 text-red-700",
		purple: "border-purple-200 bg-purple-50 text-purple-700",
		slate: "border-slate-200 bg-slate-50 text-slate-700",
	};
	return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black ${styles[tone] || styles.slate}`}>{children}</span>;
}

function DetailSection({ title, description, children, className = "" }) {
	return (
		<section className={className}>
			<div className="mb-4 border-b border-slate-100 pb-3">
				<h4 className="text-sm font-black uppercase tracking-[0.08em] text-slate-800">{title}</h4>
				{description ? <p className="mt-1 text-xs font-semibold text-slate-500">{description}</p> : null}
			</div>
			{children}
		</section>
	);
}

function DetailSummary({ items }) {
	return (
		<div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
			{items.map((item) => {
				const Icon = item.icon;
				return (
					<div key={item.label} className="rounded-xl bg-white px-4 py-3 shadow-sm">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="truncate text-base font-black text-slate-950">{item.value || "-"}</p>
								<p className="mt-1 text-[11px] font-black uppercase text-slate-400">{item.label}</p>
							</div>
							{Icon ? <Icon size={16} className="mt-1 shrink-0 text-blue-600" /> : null}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function DetailFooter({ saving, onCancel, onSave, destructiveLabel, onDestructive }) {
	return (
		<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<details className="relative">
				<summary className="inline-flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
					<MoreVertical size={16} /> Mais ações
				</summary>
				<div className="absolute bottom-12 left-0 z-10 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
					<button type="button" disabled={saving} onClick={onDestructive} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-black text-red-700 hover:bg-red-50 disabled:opacity-50">
						<AlertTriangle size={15} /> {destructiveLabel}
					</button>
				</div>
			</details>
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<button type="button" onClick={onCancel} className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 hover:bg-slate-50">Cancelar</button>
				<button type="button" disabled={saving} onClick={() => onSave()} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50">{saving ? "Salvando..." : "Salvar alterações"}</button>
			</div>
		</div>
	);
}

function evaluationTone(score) {
	const value = Number(score || 0);
	if (value >= 4) return "emerald";
	if (value >= 3) return "orange";
	return "red";
}

function weekDayShort(day) {
	return ({ Segunda: "Seg", Terça: "Ter", Quarta: "Qua", Quinta: "Qui", Sexta: "Sex", Sábado: "Sáb", Domingo: "Dom" })[day] || day;
}

function SupplierDetailModal({ supplier, setSupplier, contracts = [], evaluations = [], saving, onClose, onSave, onOpenContract, onSendEvaluationLink }) {
	if (!supplier) return null;
	const inputClass = "h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400";
	const textAreaClass = "min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400";
	const supplierContracts = contracts.filter((contract) => contract.fornecedorId === supplier.id);
	const supplierEvaluations = evaluations.filter((item) => item.fornecedorId === supplier.id).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
	const fields = supplierEvaluationFields(supplier);
	const link = buildSupplierEvaluationLink(supplier);
	const answeredEvaluations = supplierEvaluations.filter((item) => item.respondido || item.score);
	const averageScore = answeredEvaluations.length ? answeredEvaluations.reduce((sum, item) => sum + Number(item.score || 0), 0) / answeredEvaluations.length : null;
	const latestEvaluation = answeredEvaluations[0];
	const personLabel = supplier.tipoPessoa === "fisica" ? "Pessoa física" : "Pessoa jurídica";
	const documentLabel = supplier.tipoPessoa === "fisica" ? "CPF" : "CNPJ";
	const supplierStatus = supplier.status || "Ativo";
	const isInactive = normalizeText(supplierStatus) === "inativo";
	const copyLink = async () => {
		await onSave({ avaliacaoToken: supplier.avaliacaoToken || link.split("token=")[1], avaliacaoCampos: fields, avaliacaoAtiva: true });
		if (navigator?.clipboard) await navigator.clipboard.writeText(link);
	};
	const sendLink = async () => {
		await onSendEvaluationLink({
			fornecedorId: supplier.id,
			responsavelNome: supplier.avaliacaoResponsavelNome || supplier.responsavelNome || supplier.nome || "",
			responsavelEmail: supplier.avaliacaoResponsavelEmail || supplier.responsavelEmail || supplier.email,
			competencia: currentCompetencia(),
			avaliacaoCampos: supplier.avaliacaoCamposText?.split(/\n|,/).map((item) => item.trim()).filter(Boolean) || fields,
			avaliacaoToken: supplier.avaliacaoToken || link.split("token=")[1],
		});
	};
	return (
		<AppModal
			title={supplier.nome || "Fornecedor"}
			description={`Fornecedor • ${personLabel} • ${supplier.categoria || "Sem categoria"}`}
			open={Boolean(supplier)}
			onClose={onClose}
			maxWidth="max-w-6xl"
			footer={<DetailFooter saving={saving} onCancel={onClose} onSave={onSave} destructiveLabel={isInactive ? "Reativar fornecedor" : "Inativar fornecedor"} onDestructive={() => onSave({ status: isInactive ? "Ativo" : "Inativo" })} />}
		>
			<div className="space-y-5">
				<div className="flex flex-wrap gap-2">
					<DetailBadge tone={isInactive ? "red" : "emerald"}>{supplierStatus}</DetailBadge>
					<DetailBadge tone="blue">{personLabel}</DetailBadge>
					<DetailBadge tone="purple">{supplier.categoria || "Sem categoria"}</DetailBadge>
				</div>

				<DetailSummary
					items={[
						{ label: "Status", value: supplierStatus, icon: ShieldCheck },
						{ label: "Categoria", value: supplier.categoria || "-", icon: Truck },
						{ label: "Contratos ativos", value: numberFormatter.format(supplierContracts.filter((contract) => normalizeText(contractStatus(contract)) !== "vencido").length), icon: FileText },
						{ label: "Avaliação média", value: averageScore === null ? "-" : `${averageScore.toFixed(1)} ★`, icon: ShieldCheck },
					]}
				/>

				<div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)]">
				<div className="space-y-4">
					<DetailSection title="Dados do fornecedor">
						<div className="grid gap-3 md:grid-cols-2">
							<FormField label="Nome / Razão social" required>
								<input value={supplier.nome || supplier.razaoSocial || ""} onChange={(event) => setSupplier((cur) => ({ ...cur, nome: event.target.value, razaoSocial: event.target.value }))} className={inputClass} placeholder="Ex: Rodrigo Reis" />
							</FormField>
							<FormField label="Tipo de pessoa">
								<select value={supplier.tipoPessoa || "juridica"} onChange={(event) => setSupplier((cur) => ({ ...cur, tipoPessoa: event.target.value }))} className={inputClass}>{PERSON_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
							</FormField>
							<FormField label={documentLabel}>
								<input value={supplier.cnpjCpf || ""} onChange={(event) => setSupplier((cur) => ({ ...cur, cnpjCpf: event.target.value }))} className={inputClass} placeholder={supplier.tipoPessoa === "fisica" ? "000.000.000-00" : "00.000.000/0000-00"} />
							</FormField>
							<FormField label="Categoria principal">
								<input value={supplier.categoria || ""} onChange={(event) => setSupplier((cur) => ({ ...cur, categoria: event.target.value, categorias: [event.target.value] }))} className={inputClass} placeholder="Ex: Limpeza" />
							</FormField>
							<FormField label="Status">
								<select value={supplier.status || "Ativo"} onChange={(event) => setSupplier((cur) => ({ ...cur, status: event.target.value }))} className={inputClass}><option>Ativo</option><option>Em homologação</option><option>Suspenso</option><option>Inativo</option><option>Bloqueado</option></select>
							</FormField>
						</div>
					</DetailSection>

					<DetailSection title="Contato">
						<div className="grid gap-3 md:grid-cols-2">
							<FormField label="Nome do contato">
								<input value={supplier.responsavelNome || supplier.contato || ""} onChange={(event) => setSupplier((cur) => ({ ...cur, responsavelNome: event.target.value, contato: event.target.value }))} className={inputClass} placeholder="Responsável do fornecedor" />
							</FormField>
							<FormField label="E-mail">
								<input value={supplier.responsavelEmail || supplier.email || ""} onChange={(event) => setSupplier((cur) => ({ ...cur, responsavelEmail: event.target.value, email: event.target.value }))} className={inputClass} placeholder="email@empresa.com.br" />
							</FormField>
							<FormField label="Telefone">
								<input value={supplier.telefone || ""} onChange={(event) => setSupplier((cur) => ({ ...cur, telefone: event.target.value }))} className={inputClass} placeholder="(31) 99999-9999" />
							</FormField>
						</div>
					</DetailSection>

					<DetailSection title="Serviços prestados" description="Use este campo para serviços adicionais, quando a categoria principal não for suficiente.">
						<FormField label="Serviços adicionais">
							<textarea value={supplier.servicos || ""} onChange={(event) => setSupplier((cur) => ({ ...cur, servicos: event.target.value }))} className={textAreaClass} placeholder="Ex: higienização, limpeza técnica, apoio eventual" />
						</FormField>
					</DetailSection>

					<section className="rounded-2xl border border-slate-200 bg-white p-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<h3 className="font-black text-slate-950">Contratos vinculados</h3>
								<p className="text-xs font-semibold text-slate-500">{supplierContracts.length} contrato(s) encontrado(s)</p>
							</div>
							<DetailBadge tone="blue">{supplierContracts.filter((contract) => normalizeText(contractStatus(contract)) !== "vencido").length} ativo(s)</DetailBadge>
						</div>
						<div className="mt-3 space-y-2">
							{supplierContracts.length ? supplierContracts.map((contract) => (
								<div key={contract.id} className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3 text-sm md:flex-row md:items-center md:justify-between">
									<div className="min-w-0">
										<p className="font-black text-slate-900">{contract.codigo || contract.servico}</p>
										<p className="text-xs font-semibold text-slate-500">{contract.servico} · {contractStatus(contract)} · {formatCurrency(contractMonthlyValue(contract))} estimado/mês</p>
										<p className="text-[11px] font-bold text-slate-400">{formatDate(contract.inicioVigencia)} → {formatDate(contract.fimVigencia)}</p>
									</div>
									<button type="button" onClick={() => onOpenContract?.(contract)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-blue-700 hover:bg-blue-50">Ver contrato</button>
								</div>
							)) : <p className="rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-500">Nenhum contrato vinculado.</p>}
						</div>
					</section>
				</div>
				<div className="space-y-4">
					<section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4">
						<div className="flex items-start justify-between gap-3">
							<div>
								<h3 className="font-black text-blue-950">Avaliação do fornecedor</h3>
								<p className="mt-1 text-xs font-semibold text-blue-700">{supplier.avaliacaoAtiva ? "Envio mensal ativo" : "Envio mensal pausado"}</p>
							</div>
							<div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
								<p className={`text-2xl font-black ${averageScore === null ? "text-slate-500" : averageScore >= 3 ? "text-emerald-700" : "text-red-700"}`}>{averageScore === null ? "-" : averageScore.toFixed(1)} ★</p>
								<p className="text-[10px] font-black uppercase text-slate-400">Média</p>
							</div>
						</div>

						<div className="mt-4 grid gap-3 text-sm">
							<div className="rounded-xl bg-white p-3 shadow-sm">
								<p className="text-[10px] font-black uppercase text-slate-400">Periodicidade</p>
								<p className="mt-1 font-black text-slate-900">Mensal · dia {supplier.avaliacaoDiaMensal || 5}</p>
							</div>
							<div className="rounded-xl bg-white p-3 shadow-sm">
								<p className="text-[10px] font-black uppercase text-slate-400">Destinatário</p>
								<p className="mt-1 break-words font-black text-slate-900">{supplier.avaliacaoResponsavelNome || supplier.responsavelNome || supplier.nome || "-"}</p>
								<p className="text-xs font-semibold text-slate-500">{supplier.avaliacaoResponsavelEmail || supplier.responsavelEmail || supplier.email || "E-mail não informado"}</p>
							</div>
							<details className="rounded-xl bg-white p-3 shadow-sm">
								<summary className="cursor-pointer list-none text-sm font-black text-blue-700 [&::-webkit-details-marker]:hidden">Editar configuração</summary>
								<div className="mt-3 grid gap-3">
									<FormField label="Responsável pela avaliação">
										<input value={supplier.avaliacaoResponsavelNome || supplier.responsavelNome || ""} onChange={(event) => setSupplier((cur) => ({ ...cur, avaliacaoResponsavelNome: event.target.value }))} className={inputClass} placeholder="Nome do responsável" />
									</FormField>
									<FormField label="E-mail para envio mensal">
										<input value={supplier.avaliacaoResponsavelEmail || supplier.responsavelEmail || ""} onChange={(event) => setSupplier((cur) => ({ ...cur, avaliacaoResponsavelEmail: event.target.value }))} className={inputClass} placeholder="email@empresa.com.br" />
									</FormField>
									<div className="grid gap-3 md:grid-cols-2">
										<FormField label="Dia de envio">
											<input type="number" min="1" max="28" value={supplier.avaliacaoDiaMensal || 5} onChange={(event) => setSupplier((cur) => ({ ...cur, avaliacaoDiaMensal: event.target.value }))} className={inputClass} />
										</FormField>
										<FormField label="Envio automático">
											<select value={supplier.avaliacaoAtiva ? "sim" : "nao"} onChange={(event) => setSupplier((cur) => ({ ...cur, avaliacaoAtiva: event.target.value === "sim" }))} className={inputClass}><option value="sim">Ativo</option><option value="nao">Pausado</option></select>
										</FormField>
									</div>
									<FormField label="Critérios avaliados" helper="Informe um critério por linha ou separado por vírgula.">
										<textarea value={supplier.avaliacaoCamposText || fields.join("\n")} onChange={(event) => setSupplier((cur) => ({ ...cur, avaliacaoCamposText: event.target.value, avaliacaoCampos: event.target.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean) }))} className={textAreaClass} placeholder="Atendimento&#10;Prazo&#10;Qualidade" />
									</FormField>
									<button type="button" disabled={saving} onClick={() => onSave({ avaliacaoCampos: supplier.avaliacaoCamposText?.split(/\n|,/).map((item) => item.trim()).filter(Boolean) || fields, avaliacaoAtiva: true })} className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:opacity-50">Salvar configuração</button>
								</div>
							</details>
						</div>

						<div className="mt-4 border-t border-blue-100 pt-4">
							<h4 className="text-xs font-black uppercase tracking-[0.08em] text-blue-900">Compartilhar avaliação</h4>
							<div className="mt-3 flex flex-wrap gap-2">
								<button type="button" disabled={saving} onClick={sendLink} className="h-10 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white disabled:opacity-50">Enviar avaliação</button>
								<button type="button" onClick={copyLink} className="h-10 rounded-xl border border-blue-200 bg-white px-4 text-xs font-black text-blue-700">Copiar link</button>
							</div>
						</div>
					</section>

					<section className="rounded-2xl border border-slate-200 p-4">
						<div className="flex items-start justify-between gap-3">
							<div>
								<h3 className="font-black text-slate-950">Últimas avaliações</h3>
								<p className="text-xs font-semibold text-slate-500">{answeredEvaluations.length} avaliação(ões) respondida(s)</p>
							</div>
							{latestEvaluation ? <DetailBadge tone={evaluationTone(latestEvaluation.score)}>Última: {formatDateTime(latestEvaluation.respondidoEm || latestEvaluation.createdAt)}</DetailBadge> : null}
						</div>
						<div className="mt-3 space-y-3">
							{supplierEvaluations.length ? supplierEvaluations.slice(0, 6).map((item) => {
								const score = Number(item.score || 0);
								const tone = item.respondido || item.score ? evaluationTone(score) : "orange";
								return (
									<div key={item.id} className="rounded-xl border border-slate-100 bg-white p-3 text-sm shadow-sm">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<p className={`font-black ${tone === "emerald" ? "text-emerald-700" : tone === "red" ? "text-red-700" : "text-orange-700"}`}>{item.respondido || item.score ? `${score.toFixed(1)} ★` : "Aguardando resposta"}</p>
											<p className="text-xs font-bold text-slate-500">{formatDateTime(item.respondidoEm || item.createdAt)}</p>
										</div>
										<p className="mt-2 text-xs font-semibold text-slate-600">{item.feedback || item.link || "Link enviado."}</p>
									</div>
								);
							}) : <p className="rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-500">Nenhum link enviado.</p>}
						</div>
					</section>
				</div>
				</div>
			</div>
		</AppModal>
	);
}

function ContractDetailModal({ contract, setContract, suppliers = [], saving, onClose, onSave }) {
	if (!contract) return null;
	const inputClass = "h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400";
	const textAreaClass = "min-h-28 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400";
	const isDaily = normalizeText(contract.periodicidadeCobranca).includes("diaria") || normalizeText(contract.periodicidadeCobranca).includes("diária");
	const selectedDays = Array.isArray(contract.diasAtuacao) ? contract.diasAtuacao : String(contract.diasAtuacao || "").split(",").map((item) => item.trim()).filter(Boolean);
	const supplier = suppliers.find((item) => item.id === contract.fornecedorId);
	const status = contractStatus(contract);
	const isInactive = normalizeText(contract.status) === "inativo";
	const monthlyEstimate = contractMonthlyValue({ ...contract, diasAtuacao: selectedDays });
	const dailyCount = countWeekDaysInMonth(selectedDays);
	const dueDays = daysUntil(contract.fimVigencia);
	const toggleDay = (day) => {
		setContract((cur) => {
			const current = Array.isArray(cur.diasAtuacao) ? cur.diasAtuacao : String(cur.diasAtuacao || "").split(",").map((item) => item.trim()).filter(Boolean);
			return {
				...cur,
				diasAtuacao: current.includes(day)
					? current.filter((item) => item !== day)
					: [...current, day],
			};
		});
	};
	return (
		<AppModal
			title={`Contrato ${contract.codigo || ""}`.trim() || "Contrato"}
			description="Detalhes, valores, vigência, responsáveis e gestão do contrato."
			open={Boolean(contract)}
			onClose={onClose}
			maxWidth="max-w-5xl"
			footer={<DetailFooter saving={saving} onCancel={onClose} onSave={onSave} destructiveLabel={isInactive ? "Reativar contrato" : "Inativar contrato"} onDestructive={() => onSave({ status: isInactive ? "Ativo" : "Inativo" })} />}
		>
			<div className="space-y-5">
				<div className="flex flex-wrap gap-2">
					<DetailBadge tone={normalizeText(status) === "vencido" ? "red" : normalizeText(status).includes("proximo") ? "orange" : "emerald"}>{status}</DetailBadge>
					<DetailBadge tone="blue">{contract.tipo || "Sem categoria"}</DetailBadge>
					<DetailBadge tone={isDaily ? "purple" : "slate"}>{contract.periodicidadeCobranca || "Mensal"}</DetailBadge>
				</div>

				<DetailSummary
					items={[
						{ label: "Fornecedor", value: supplier?.nome || contract.fornecedor || "-", icon: Truck },
						{ label: `Valor / ${contract.periodicidadeCobranca || "mensal"}`, value: formatCurrency(contract.valorMensal), icon: FileText },
						{ label: "Estimativa atual", value: formatCurrency(monthlyEstimate), icon: CalendarClock },
						{ label: "Vigência", value: `${formatDate(contract.inicioVigencia)} → ${formatDate(contract.fimVigencia)}`, icon: ShieldCheck },
					]}
				/>

				<div className="grid gap-5 lg:grid-cols-2">
					<DetailSection title="Identificação">
						<div className="grid gap-3">
							<FormField label="Código do contrato" helper="Identificador interno do contrato.">
								<input value={contract.codigo || ""} readOnly className={`${inputClass} bg-slate-50 text-slate-500`} />
							</FormField>
							<FormField label="Status">
								<select value={contract.status || "Ativo"} onChange={(event) => setContract((cur) => ({ ...cur, status: event.target.value }))} className={inputClass}><option>Ativo</option><option>Próximo do vencimento</option><option>Suspenso</option><option>Inativo</option><option>Encerrado</option></select>
							</FormField>
							<FormField label="Fornecedor" required>
								<SupplierLookup suppliers={suppliers} value={contract.fornecedorId || ""} onChange={(value, selected) => setContract((cur) => ({ ...cur, fornecedorId: value, fornecedor: selected?.nome || cur.fornecedor, responsavelFornecedorEmail: selected?.responsavelEmail || selected?.email || cur.responsavelFornecedorEmail }))} inputClass={inputClass} />
							</FormField>
						</div>
					</DetailSection>

					<DetailSection title="Serviço contratado">
						<div className="grid gap-3">
							<FormField label="Categoria">
								<select value={contract.tipo || "Manutenção"} onChange={(event) => setContract((cur) => ({ ...cur, tipo: event.target.value }))} className={inputClass}><option>Limpeza</option><option>Vigilância</option><option>Manutenção</option><option>Climatização</option><option>Elevadores</option><option>Geradores</option><option>Dedetização</option><option>Jardinagem</option><option>Obras</option><option>Segurança contra incêndio</option><option>Outros</option></select>
							</FormField>
							<FormField label="Descrição do serviço" required>
								<input value={contract.servico || ""} onChange={(event) => setContract((cur) => ({ ...cur, servico: event.target.value, descricao: event.target.value }))} className={inputClass} placeholder="Ex: Limpeza" />
							</FormField>
						</div>
					</DetailSection>

					<DetailSection title="Valor e cobrança">
						<div className="grid gap-3 md:grid-cols-2">
							<FormField label="Valor contratado" helper={`${formatCurrency(contract.valorMensal)} por ${contract.periodicidadeCobranca || "mensal"}`}>
								<input value={contract.valorMensal || ""} onChange={(event) => setContract((cur) => ({ ...cur, valorMensal: event.target.value }))} className={inputClass} placeholder="R$ 0,00" />
							</FormField>
							<FormField label="Periodicidade">
								<select value={contract.periodicidadeCobranca || "Mensal"} onChange={(event) => setContract((cur) => ({ ...cur, periodicidadeCobranca: event.target.value }))} className={inputClass}><option>Diária</option><option>Mensal</option><option>Bimestral</option><option>Trimestral</option><option>Semestral</option><option>Anual</option><option>Pontual</option><option>Outro</option></select>
							</FormField>
						</div>
					</DetailSection>

					<DetailSection title="Vigência">
						<div className="grid gap-3 md:grid-cols-2">
							<FormField label="Data de início">
								<input type="date" value={String(contract.inicioVigencia || "").slice(0, 10)} onChange={(event) => setContract((cur) => ({ ...cur, inicioVigencia: event.target.value }))} className={inputClass} />
							</FormField>
							<FormField label="Data de término">
								<input type="date" value={String(contract.fimVigencia || "").slice(0, 10)} onChange={(event) => setContract((cur) => ({ ...cur, fimVigencia: event.target.value }))} className={inputClass} />
							</FormField>
						</div>
						{dueDays !== null ? <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-black ${dueDays < 0 ? "bg-red-50 text-red-700" : dueDays <= 90 ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>
							{dueDays < 0 ? `Contrato vencido em ${formatDate(contract.fimVigencia)}.` : dueDays <= 90 ? `Este contrato vence em ${dueDays} dia(s).` : "Vigência sem alerta crítico."}
						</p> : null}
					</DetailSection>
				</div>

				{isDaily ? (
					<section className="rounded-2xl border border-slate-200 bg-white p-4">
						<div className="mb-4 border-b border-slate-100 pb-3">
							<h4 className="text-sm font-black uppercase tracking-[0.08em] text-slate-800">Dias de atuação</h4>
							<p className="mt-1 text-xs font-semibold text-slate-500">Selecione os dias da semana considerados para o cálculo mensal estimado.</p>
						</div>
						<div className="flex flex-wrap gap-2">
							{WEEK_DAYS.map((day) => <button key={day} type="button" onClick={() => toggleDay(day)} className={`rounded-xl border px-4 py-2 text-xs font-black ${selectedDays.includes(day) ? "border-blue-600 bg-blue-600 text-white shadow-sm" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"}`}>{weekDayShort(day)}</button>)}
						</div>
						<div className="mt-4 grid gap-3 md:grid-cols-2">
							<div className="rounded-xl bg-blue-50 p-4">
								<p className="text-2xl font-black text-blue-900">{dailyCount}</p>
								<p className="text-xs font-black uppercase text-blue-600">diárias previstas no mês atual</p>
							</div>
							<div className="rounded-xl bg-emerald-50 p-4">
								<p className="text-2xl font-black text-emerald-900">{formatCurrency(monthlyEstimate)}</p>
								<p className="text-xs font-black uppercase text-emerald-600">estimados para o mês</p>
							</div>
						</div>
					</section>
				) : null}

				<div className="grid gap-5 lg:grid-cols-2">
					<DetailSection title="Responsáveis">
						<div className="grid gap-3">
							<FormField label="Responsável do fornecedor">
								<input value={contract.responsavelFornecedorNome || contract.contratadoNome || ""} onChange={(event) => setContract((cur) => ({ ...cur, responsavelFornecedorNome: event.target.value, contratadoNome: event.target.value }))} className={inputClass} placeholder="Nome do responsável" />
							</FormField>
							<FormField label="E-mail do responsável">
								<input value={contract.responsavelFornecedorEmail || ""} onChange={(event) => setContract((cur) => ({ ...cur, responsavelFornecedorEmail: event.target.value }))} className={inputClass} placeholder="email@empresa.com.br" />
							</FormField>
						</div>
					</DetailSection>

					<DetailSection title="Observações">
						<FormField label="Observações do contrato">
							<textarea value={contract.observacao || ""} onChange={(event) => setContract((cur) => ({ ...cur, observacao: event.target.value }))} className={textAreaClass} placeholder="Adicione informações adicionais, exceções, particularidades ou instruções deste contrato." />
						</FormField>
					</DetailSection>
				</div>

				<DetailSection title="Auditoria / metadados">
					<div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600 md:grid-cols-3">
						<div><p className="text-[10px] font-black uppercase text-slate-400">Criado em</p><p className="mt-1 text-slate-900">{formatDateTime(contract.createdAt)}</p></div>
						<div><p className="text-[10px] font-black uppercase text-slate-400">Atualizado em</p><p className="mt-1 text-slate-900">{formatDateTime(contract.updatedAt)}</p></div>
						<div><p className="text-[10px] font-black uppercase text-slate-400">Status calculado</p><p className="mt-1 text-slate-900">{status}</p></div>
					</div>
				</DetailSection>
			</div>
		</AppModal>
	);
}

function SupplierEvaluationDetailModal({ evaluation, supplier, onClose }) {
	if (!evaluation) return null;
	const criteria = Array.isArray(evaluation.criteria) && evaluation.criteria.length
		? evaluation.criteria
		: Object.entries(evaluation.metrics || {}).map(([label, rating]) => ({ label, rating }));
	const score = Number(evaluation.score || 0);
	return (
		<AppModal
			title={`Avaliação de ${evaluation.fornecedor || supplier?.nome || "fornecedor"}`}
			description="Resposta do responsável, critérios avaliados e histórico do link."
			open={Boolean(evaluation)}
			onClose={onClose}
			maxWidth="max-w-3xl"
		>
			<div className="space-y-4">
				<div className={`rounded-2xl border p-4 ${score && score < 3 ? "border-red-200 bg-red-50" : evaluation.respondido ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
					<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<div>
							<p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Status</p>
							<p className="text-xl font-black text-slate-950">
								{evaluation.respondido ? "Respondido" : evaluation.status === "erro" ? "Erro no envio" : "Aguardando resposta"}
							</p>
							<p className="text-sm font-semibold text-slate-600">
								{evaluation.competencia || currentCompetencia()} · {formatDateTime(evaluation.respondidoEm || evaluation.createdAt || evaluation.updatedAt)}
							</p>
						</div>
						{evaluation.respondido ? (
							<div className={`rounded-2xl px-5 py-3 text-center ${score < 3 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
								<p className="text-xs font-black uppercase">Nota média</p>
								<p className="text-3xl font-black">{score.toFixed(1)} ★</p>
							</div>
						) : null}
					</div>
				</div>

				<div className="grid gap-3 md:grid-cols-2">
					<div className="rounded-2xl border border-slate-200 bg-white p-4">
						<p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Responsável</p>
						<p className="mt-2 font-black text-slate-950">{evaluation.responsavelNome || "-"}</p>
						<p className="text-sm font-semibold text-slate-500">{evaluation.responsavelEmail || "-"}</p>
					</div>
					<div className="rounded-2xl border border-slate-200 bg-white p-4">
						<p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Fornecedor</p>
						<p className="mt-2 font-black text-slate-950">{evaluation.fornecedor || supplier?.nome || "-"}</p>
						<p className="text-sm font-semibold text-slate-500">{supplier?.categoria || "-"}</p>
					</div>
				</div>

				{criteria.length ? (
					<div className="grid gap-3 md:grid-cols-2">
						{criteria.map((item, index) => {
							const rating = Number(item.rating ?? item.valor ?? item.nota ?? 0);
							return (
								<div key={`${item.label}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
									<div className="flex items-center justify-between gap-3">
										<p className="font-black text-slate-900">{item.label || item.campo || item.nome}</p>
										<span className={`rounded-full px-3 py-1 text-xs font-black ${rating < 3 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
											{rating}/5
										</span>
									</div>
									<div className="mt-3 flex gap-1 text-amber-500">
										{[1, 2, 3, 4, 5].map((star) => (
											<span key={star} className={star <= rating ? "opacity-100" : "opacity-20"}>★</span>
										))}
									</div>
								</div>
							);
						})}
					</div>
				) : null}

				<div className="rounded-2xl border border-slate-200 bg-white p-4">
					<p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Feedback</p>
					<p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">
						{evaluation.feedback || evaluation.observacao || "Nenhum comentário informado."}
					</p>
				</div>

				{evaluation.link ? (
					<a href={evaluation.link} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-700 hover:bg-blue-100">
						Abrir link enviado
					</a>
				) : null}
			</div>
		</AppModal>
	);
}

function FormSection({ title, description, children }) {
	return (
		<section className="space-y-4">
			<div className="border-b border-slate-100 pb-2">
				<h4 className="text-sm font-black uppercase tracking-[0.12em] text-slate-800">{title}</h4>
				{description ? <p className="mt-1 text-xs font-semibold text-slate-500">{description}</p> : null}
			</div>
			<div className="grid gap-4 md:grid-cols-2">{children}</div>
		</section>
	);
}

function FormField({ label, required, error, helper, children, className = "" }) {
	return (
		<label className={`block space-y-2 ${className}`}>
			<span className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">
				{label}{required ? " *" : ""}
			</span>
			{children}
			{helper && !error ? <span className="block text-xs font-semibold text-slate-400">{helper}</span> : null}
			{error ? <span className="block text-xs font-black text-red-600">⚠ {error}</span> : null}
		</label>
	);
}

function ModalFooterActions({ onCancel, onConfirm, confirmLabel, savingLabel = "Salvando...", saving, disabled }) {
	return (
		<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
			<button
				type="button"
				onClick={onCancel}
				disabled={saving}
				className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
			>
				Cancelar
			</button>
			<button
				type="button"
				onClick={onConfirm}
				disabled={saving || disabled}
				className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
			>
				{saving ? savingLabel : confirmLabel}
			</button>
		</div>
	);
}

function SupplierSummaryCard({ supplier }) {
	if (!supplier) return null;
	return (
		<div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 md:col-span-2">
			<p className="text-xs font-black uppercase tracking-[0.12em] text-blue-700">Fornecedor selecionado</p>
			<p className="mt-1 text-sm font-black text-slate-950">{supplier.nome}</p>
			<p className="text-xs font-semibold text-slate-600">
				{supplier.tipoPessoa === "fisica" ? "PF" : "PJ"} · {supplier.cnpjCpf || "Documento não informado"} · {supplier.categoria || "Categoria não informada"}
			</p>
		</div>
	);
}

function SuppliersForms({ modal, setModal, saving, suppliers, contracts, forms, update, save }) {
	const { supplierForm, contractForm, documentForm, adjustmentForm, evaluationForm } = forms;
	const { updateSupplier, updateContract, updateDocument, updateAdjustment, updateEvaluation } = update;
	const inputClass = "h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400";
	const textAreaClass = "min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400";
	const supplierDocumentLabel = supplierForm.tipoPessoa === "fisica" ? "CPF" : "CNPJ";
	const contractDocumentLabel = contractForm.contratadoTipoPessoa === "fisica" ? "CPF do prestador" : "CNPJ do fornecedor";
	const isCleaningContract = normalizeText(`${contractForm.tipo} ${contractForm.servico}`).includes("limpeza") || contractForm.contratadoTipoPessoa === "fisica";
	const isDailyContract = normalizeText(contractForm.periodicidadeCobranca).includes("diaria") || normalizeText(contractForm.periodicidadeCobranca).includes("diária");
	const selectedContractSupplier = suppliers.find((item) => item.id === contractForm.fornecedorId);
	const [formErrors, setFormErrors] = useState({});
	const toggleContractDay = (day) => {
		const selected = Array.isArray(contractForm.diasAtuacao) ? contractForm.diasAtuacao : [];
		updateContract("diasAtuacao", selected.includes(day) ? selected.filter((item) => item !== day) : [...selected, day]);
	};
	const closeSupplierModal = () => {
		setFormErrors({});
		setModal("");
	};
	const closeContractModal = () => {
		setFormErrors({});
		setModal("");
	};
	const submitSupplier = async () => {
		const errors = {};
		if (!String(supplierForm.razaoSocial || "").trim()) {
			errors.razaoSocial = supplierForm.tipoPessoa === "fisica" ? "Informe o nome completo." : "Informe a razão social.";
		}
		if (!String(supplierForm.cnpjCpf || "").trim()) {
			errors.cnpjCpf = supplierForm.tipoPessoa === "fisica" ? "Informe o CPF." : "Informe o CNPJ.";
		}
		setFormErrors(errors);
		if (Object.keys(errors).length) return;
		await save.supplier();
	};
	const submitContract = async () => {
		const errors = {};
		if (!contractForm.fornecedorId) errors.fornecedorId = "Selecione um fornecedor.";
		if (!String(contractForm.servico || "").trim()) errors.servico = "Informe a descrição do serviço.";
		if (!String(contractForm.valorMensal || "").trim()) errors.valorMensal = "Informe o valor contratual.";
		if (contractForm.inicioVigencia && contractForm.fimVigencia && new Date(contractForm.fimVigencia) < new Date(contractForm.inicioVigencia)) {
			errors.fimVigencia = "A data final deve ser maior ou igual à data inicial.";
		}
		if (isDailyContract && !contractForm.diasAtuacao?.length) errors.diasAtuacao = "Selecione ao menos um dia de atuação.";
		setFormErrors(errors);
		if (Object.keys(errors).length) return;
		await save.contract();
	};
	return (
		<>
			<AppModal
				title="Novo fornecedor"
				description="Cadastre um fornecedor para utilização em contratos e serviços do Facilities."
				open={modal === "supplier"}
				onClose={closeSupplierModal}
				maxWidth="max-w-3xl"
				footer={<ModalFooterActions onCancel={closeSupplierModal} onConfirm={submitSupplier} confirmLabel="Salvar fornecedor" saving={saving} />}
			>
				<div className="space-y-8">
					<FormSection title="Identificação">
						<FormField label="Tipo de pessoa">
							<select value={supplierForm.tipoPessoa} onChange={(event) => updateSupplier("tipoPessoa", event.target.value)} className={inputClass}>{PERSON_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
						</FormField>
						<FormField label="Categoria">
							<select value={supplierForm.categoria} onChange={(event) => updateSupplier("categoria", event.target.value)} className={inputClass}>{SUPPLIER_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
						</FormField>
						<FormField label={supplierForm.tipoPessoa === "fisica" ? "Nome completo" : "Razão social"} required error={formErrors.razaoSocial} className="md:col-span-2">
							<input value={supplierForm.razaoSocial} onChange={(event) => updateSupplier("razaoSocial", event.target.value)} className={inputClass} placeholder={supplierForm.tipoPessoa === "fisica" ? "Digite o nome completo" : "Digite a razão social da empresa"} />
						</FormField>
						<FormField label={supplierForm.tipoPessoa === "fisica" ? "Nome de uso" : "Nome fantasia"}>
							<input value={supplierForm.nomeFantasia} onChange={(event) => updateSupplier("nomeFantasia", event.target.value)} className={inputClass} placeholder={supplierForm.tipoPessoa === "fisica" ? "Nome de uso/apelido" : "Nome comercial"} />
						</FormField>
						<FormField label={supplierDocumentLabel} required error={formErrors.cnpjCpf}>
							<input value={supplierForm.cnpjCpf} onChange={(event) => updateSupplier("cnpjCpf", event.target.value)} className={inputClass} placeholder={supplierForm.tipoPessoa === "fisica" ? "000.000.000-00" : "00.000.000/0000-00"} />
						</FormField>
						{supplierForm.categoria === "Outros" ? <FormField label="Categoria do fornecedor" className="md:col-span-2">
							<input value={supplierForm.categoriaOutra || ""} onChange={(event) => updateSupplier("categoriaOutra", event.target.value)} className={inputClass} placeholder="Informe a categoria do fornecedor" />
						</FormField> : null}
					</FormSection>

					<FormSection title="Contato">
						<FormField label="Contato principal" className="md:col-span-2">
							<input value={supplierForm.contato} onChange={(event) => updateSupplier("contato", event.target.value)} className={inputClass} placeholder="Nome da pessoa de contato" />
						</FormField>
						<FormField label="E-mail">
							<input value={supplierForm.email} onChange={(event) => updateSupplier("email", event.target.value)} className={inputClass} placeholder="contato@empresa.com" />
						</FormField>
						<FormField label="Telefone">
							<input value={supplierForm.telefone} onChange={(event) => updateSupplier("telefone", event.target.value)} className={inputClass} placeholder="(00) 00000-0000" />
						</FormField>
						<FormField label="Cidade / UF" className="md:col-span-2">
							<input value={supplierForm.cidadeUf} onChange={(event) => updateSupplier("cidadeUf", event.target.value)} className={inputClass} placeholder="Buscar cidade ou informar cidade/UF" />
						</FormField>
					</FormSection>

					<FormSection title="Serviços prestados" description="Informe os principais serviços prestados pelo fornecedor.">
						<FormField label="Serviços" className="md:col-span-2">
							<input value={supplierForm.servicos} onChange={(event) => updateSupplier("servicos", event.target.value)} className={inputClass} placeholder="Ex.: manutenção elétrica, hidráulica, limpeza" />
						</FormField>
					</FormSection>

					<FormSection title="Configuração">
						<FormField label="Status" helper="Fornecedores inativos permanecem no histórico, mas não ficam disponíveis para novos vínculos.">
							<select value={supplierForm.status} onChange={(event) => updateSupplier("status", event.target.value)} className={inputClass}><option>Ativo</option><option>Em homologação</option><option>Suspenso</option><option>Inativo</option><option>Bloqueado</option></select>
						</FormField>
					</FormSection>
				</div>
			</AppModal>

			<AppModal
				title="Novo contrato"
				description="Informe fornecedor, imóvel, valores, vigência e regras de gestão do contrato."
				open={modal === "contract"}
				onClose={closeContractModal}
				maxWidth="max-w-5xl"
				footer={<ModalFooterActions onCancel={closeContractModal} onConfirm={submitContract} confirmLabel="Criar contrato" saving={saving} />}
			>
				<div className="space-y-8">
					<FormSection title="Fornecedor" description="Selecione a base cadastral do fornecedor antes de preencher os dados do contrato.">
						<div className="md:col-span-2">
							<SupplierLookup value={contractForm.fornecedorId} onChange={(value, item) => {
								updateContract("fornecedorId", value);
								if (item) {
									updateContract("contratadoTipoPessoa", item.tipoPessoa || "juridica");
									updateContract("contratadoDocumento", item.cnpjCpf || item.cpfCnpj || "");
									updateContract("contratadoNome", item.nome || "");
									if (item.categoria && !contractForm.servico) updateContract("servico", item.categoria);
								}
							}} />
							{formErrors.fornecedorId ? <p className="mt-2 text-xs font-black text-red-600">⚠ {formErrors.fornecedorId}</p> : null}
						</div>
						<SupplierSummaryCard supplier={selectedContractSupplier} />
					</FormSection>

					<FormSection title="Objeto do contrato">
						<FormField label="Tipo de pessoa">
							<select value={contractForm.contratadoTipoPessoa} disabled={Boolean(selectedContractSupplier)} onChange={(event) => updateContract("contratadoTipoPessoa", event.target.value)} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`}>{PERSON_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
						</FormField>
						<FormField label={contractDocumentLabel}>
							<input value={contractForm.contratadoDocumento} disabled={Boolean(selectedContractSupplier?.cnpjCpf)} onChange={(event) => updateContract("contratadoDocumento", event.target.value)} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder={contractDocumentLabel} />
						</FormField>
						<FormField label="Categoria do serviço">
							<select value={contractForm.tipo} onChange={(event) => updateContract("tipo", event.target.value)} className={inputClass}><option>Limpeza</option><option>Vigilância</option><option>Manutenção</option><option>Climatização</option><option>Elevadores</option><option>Geradores</option><option>Dedetização</option><option>Jardinagem</option><option>Obras</option><option>Segurança contra incêndio</option><option>Outros</option></select>
						</FormField>
						<FormField label="Descrição do serviço" required error={formErrors.servico}>
							<input value={contractForm.servico} onChange={(event) => updateContract("servico", event.target.value)} className={inputClass} placeholder="Descreva resumidamente o serviço contratado" />
						</FormField>
					</FormSection>

					<FormSection title="Imóvel relacionado" description="Vincule um imóvel quando o contrato estiver associado a uma unidade.">
						<div className="md:col-span-2"><ContractPropertyLookup value={contractForm.imovelId} onChange={(value) => updateContract("imovelId", value)} /></div>
					</FormSection>

					<FormSection title="Contratado / prestador">
						<FormField label="Responsável pelo fornecedor" className="md:col-span-2" helper="Pessoa de referência do fornecedor ou prestador que consta no contrato.">
							<input value={contractForm.contratadoNome} onChange={(event) => updateContract("contratadoNome", event.target.value)} className={inputClass} placeholder="Nome do responsável contratado" />
						</FormField>
					</FormSection>

					<FormSection title="Valor e cobrança">
						<FormField label="Valor contratual" required error={formErrors.valorMensal}>
							<input value={contractForm.valorMensal} onChange={(event) => updateContract("valorMensal", event.target.value)} className={inputClass} placeholder="R$ 0,00" />
						</FormField>
						<FormField label="Periodicidade" required>
							<select value={contractForm.periodicidadeCobranca} onChange={(event) => updateContract("periodicidadeCobranca", event.target.value)} className={inputClass}><option>Diária</option><option>Mensal</option><option>Bimestral</option><option>Trimestral</option><option>Semestral</option><option>Anual</option><option>Pontual</option><option>Outro</option></select>
						</FormField>
						{isDailyContract ? <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 md:col-span-2">
							<div>
								<p className="text-sm font-black text-blue-900">Dias de atuação</p>
								<p className="text-xs font-bold text-blue-700">O valor mensal estimado considera apenas os dias selecionados no mês atual.</p>
							</div>
							<div className="flex flex-wrap gap-2">
								{WEEK_DAYS.map((day) => <button key={day} type="button" onClick={() => toggleContractDay(day)} className={`rounded-xl border px-3 py-2 text-xs font-black ${Array.isArray(contractForm.diasAtuacao) && contractForm.diasAtuacao.includes(day) ? "border-blue-600 bg-blue-600 text-white" : "border-blue-200 bg-white text-blue-700"}`}>{day}</button>)}
							</div>
							{formErrors.diasAtuacao ? <p className="text-xs font-black text-red-600">⚠ {formErrors.diasAtuacao}</p> : null}
							<p className="rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-800">
								{countWeekDaysInMonth(contractForm.diasAtuacao)} diária(s) neste mês · Total estimado: {formatCurrency(contractMonthlyValue(contractForm))}
							</p>
						</div> : null}
					</FormSection>

					<FormSection title="Vigência">
						<FormField label="Data de início">
							<input type="date" value={contractForm.inicioVigencia} onChange={(event) => updateContract("inicioVigencia", event.target.value)} className={inputClass} />
						</FormField>
						<FormField label="Data de término" error={formErrors.fimVigencia}>
							<input type="date" value={contractForm.fimVigencia} onChange={(event) => updateContract("fimVigencia", event.target.value)} className={inputClass} />
						</FormField>
					</FormSection>

					<FormSection title="Reajuste">
						<FormField label="Índice de reajuste">
							<input value={contractForm.indiceReajuste} onChange={(event) => updateContract("indiceReajuste", event.target.value)} className={inputClass} placeholder="Ex.: IPCA, IGP-M, INPC" />
						</FormField>
						<FormField label="Próximo reajuste">
							<input type="date" value={contractForm.proximoReajuste} onChange={(event) => updateContract("proximoReajuste", event.target.value)} className={inputClass} />
						</FormField>
					</FormSection>

					<FormSection title="Gestão do contrato">
						<FormField label="SLA">
							<input value={contractForm.sla} onChange={(event) => updateContract("sla", event.target.value)} className={inputClass} placeholder="Ex.: atendimento em até 4 horas" />
						</FormField>
						<FormField label="Responsável interno" helper="Responsável interno pelo acompanhamento deste contrato.">
							<input value={contractForm.responsavelInterno} onChange={(event) => updateContract("responsavelInterno", event.target.value)} className={inputClass} placeholder="Informe ou busque o responsável" />
						</FormField>
						{isCleaningContract ? <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 md:col-span-2">
							<div>
								<p className="text-sm font-black text-blue-900">Detalhes operacionais</p>
								<p className="text-xs font-bold text-blue-700">Informe horário, frequência e escopo quando o contrato exigir rotina operacional.</p>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								<input value={contractForm.horarioAtuacao} onChange={(event) => updateContract("horarioAtuacao", event.target.value)} className={inputClass} placeholder="Horário de atuação. Ex: 08:00 às 12:00" />
								<input value={contractForm.frequenciaAtuacao} onChange={(event) => updateContract("frequenciaAtuacao", event.target.value)} className={inputClass} placeholder="Frequência. Ex: 3x por semana" />
								<textarea value={contractForm.escopoLimpeza} onChange={(event) => updateContract("escopoLimpeza", event.target.value)} className={`${textAreaClass} md:col-span-2`} placeholder="Escopo: áreas atendidas, rotinas, materiais inclusos e observações" />
							</div>
						</div> : null}
					</FormSection>

					<FormSection title="Resumo">
						<div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600 md:col-span-2 md:grid-cols-4">
							<div><p className="text-[10px] font-black uppercase text-slate-400">Fornecedor</p><p className="mt-1 font-black text-slate-900">{selectedContractSupplier?.nome || "Não selecionado"}</p></div>
							<div><p className="text-[10px] font-black uppercase text-slate-400">Valor mensal</p><p className="mt-1 font-black text-slate-900">{formatCurrency(contractMonthlyValue(contractForm))}</p></div>
							<div><p className="text-[10px] font-black uppercase text-slate-400">Periodicidade</p><p className="mt-1 font-black text-slate-900">{contractForm.periodicidadeCobranca}</p></div>
							<div><p className="text-[10px] font-black uppercase text-slate-400">Vigência</p><p className="mt-1 font-black text-slate-900">{contractForm.inicioVigencia || "-"} → {contractForm.fimVigencia || "-"}</p></div>
						</div>
					</FormSection>
				</div>
			</AppModal>
			<AppModal title="Novo documento" open={modal === "document"} onClose={() => setModal("")}>
				<div className="grid gap-3 md:grid-cols-2">
					<select value={documentForm.contratoId} onChange={(event) => updateDocument("contratoId", event.target.value)} className={inputClass}><option value="">Contrato</option>{contracts.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.servico}</option>)}</select>
					<select value={documentForm.fornecedorId} onChange={(event) => updateDocument("fornecedorId", event.target.value)} className={inputClass}><option value="">Fornecedor</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>
					<select value={documentForm.tipo} onChange={(event) => updateDocument("tipo", event.target.value)} className={inputClass}><option>Contrato assinado</option><option>Aditivo</option><option>Proposta</option><option>Certidão</option><option>Seguro</option><option>Licença</option><option>Comprovante</option><option>Relatório</option><option>Nota técnica</option><option>Outro</option></select>
					<input value={documentForm.numero} onChange={(event) => updateDocument("numero", event.target.value)} className={inputClass} placeholder="Número" />
					<input type="date" value={documentForm.dataEmissao} onChange={(event) => updateDocument("dataEmissao", event.target.value)} className={inputClass} />
					<input type="date" value={documentForm.validade} onChange={(event) => updateDocument("validade", event.target.value)} className={inputClass} />
					<input value={documentForm.arquivoUrl} onChange={(event) => updateDocument("arquivoUrl", event.target.value)} className={`${inputClass} md:col-span-2`} placeholder="Link do documento" />
					<button type="button" disabled={saving} onClick={save.document} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50 md:col-span-2">Salvar documento</button>
				</div>
			</AppModal>
			<AppModal title="Novo reajuste" open={modal === "adjustment"} onClose={() => setModal("")}>
				<div className="grid gap-3 md:grid-cols-2">
					<select value={adjustmentForm.contratoId} onChange={(event) => updateAdjustment("contratoId", event.target.value)} className={`${inputClass} md:col-span-2`}><option value="">Contrato</option>{contracts.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.servico}</option>)}</select>
					<input value={adjustmentForm.indice} onChange={(event) => updateAdjustment("indice", event.target.value)} className={inputClass} placeholder="Índice" />
					<input value={adjustmentForm.percentual} onChange={(event) => updateAdjustment("percentual", event.target.value)} className={inputClass} placeholder="Percentual" />
					<input value={adjustmentForm.valorAnterior} onChange={(event) => updateAdjustment("valorAnterior", event.target.value)} className={inputClass} placeholder="Valor anterior" />
					<input value={adjustmentForm.novoValor} onChange={(event) => updateAdjustment("novoValor", event.target.value)} className={inputClass} placeholder="Novo valor" />
					<input type="date" value={adjustmentForm.dataBase} onChange={(event) => updateAdjustment("dataBase", event.target.value)} className={inputClass} />
					<input value={adjustmentForm.responsavel} onChange={(event) => updateAdjustment("responsavel", event.target.value)} className={inputClass} placeholder="Responsável" />
					<button type="button" disabled={saving || !adjustmentForm.contratoId} onClick={save.adjustment} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50 md:col-span-2">Registrar reajuste</button>
				</div>
			</AppModal>
			<AppModal title="Enviar link de avaliação" description="A avaliação deve ser respondida pelo link externo enviado ao responsável." open={modal === "evaluation"} onClose={() => setModal("")}>
				<div className="grid gap-3 md:grid-cols-2">
					<select value={evaluationForm.fornecedorId} onChange={(event) => {
						const supplier = suppliers.find((item) => item.id === event.target.value);
						updateEvaluation("fornecedorId", event.target.value);
						updateEvaluation("responsavelNome", supplier?.avaliacaoResponsavelNome || supplier?.responsavelNome || supplier?.nome || "");
						updateEvaluation("responsavelEmail", supplier?.avaliacaoResponsavelEmail || supplier?.responsavelEmail || supplier?.email || "");
						updateEvaluation("avaliacaoCampos", supplierEvaluationFields(supplier || {}));
						updateEvaluation("avaliacaoToken", supplier?.avaliacaoToken || "");
					}} className={`${inputClass} md:col-span-2`}><option value="">Fornecedor</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select>
					<input value={evaluationForm.responsavelNome || ""} onChange={(event) => updateEvaluation("responsavelNome", event.target.value)} className={inputClass} placeholder="Responsável" />
					<input value={evaluationForm.responsavelEmail || ""} onChange={(event) => updateEvaluation("responsavelEmail", event.target.value)} className={inputClass} placeholder="E-mail do responsável" />
					<input type="month" value={evaluationForm.competencia || currentCompetencia()} onChange={(event) => updateEvaluation("competencia", event.target.value)} className={inputClass} />
					<textarea value={(evaluationForm.avaliacaoCampos || DEFAULT_SUPPLIER_EVALUATION_FIELDS).join("\n")} onChange={(event) => updateEvaluation("avaliacaoCampos", event.target.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean))} className="min-h-24 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400 md:col-span-2" placeholder="Campos avaliados, um por linha" />
					<button type="button" disabled={saving || !evaluationForm.fornecedorId || !evaluationForm.responsavelEmail} onClick={save.evaluation} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50 md:col-span-2">Enviar link</button>
				</div>
			</AppModal>
		</>
	);
}

const CONSUMPTION_TABS = [
	{ key: "visao", label: "Visão Geral", icon: BarChart3 },
	{ key: "consumos", label: "Consumos", icon: Zap },
	{ key: "encargos", label: "Custos & Encargos", icon: FileText },
	{ key: "anomalias", label: "Anomalias", icon: AlertTriangle },
	{ key: "comparativos", label: "Comparativos", icon: Table2 },
	{ key: "historico", label: "Histórico", icon: History },
	{ key: "configuracoes", label: "Configurações", icon: Settings },
];

const UTILITY_TYPES = ["Energia", "Água", "Gás", "Internet", "Outros consumos"];
const PROPERTY_COST_TYPES = ["Condomínio", "IPTU", "Taxas municipais", "Taxas extraordinárias", "Seguro do imóvel", "Outros encargos"];
const CONSUMPTION_THRESHOLDS = { Energia: 25, Água: 25, Gás: 25, Internet: 20, "Outros consumos": 25, Condomínio: 20, IPTU: 20, "Taxas municipais": 20, "Taxas extraordinárias": 20, "Seguro do imóvel": 20, "Outros encargos": 20 };

const UTILITY_TYPE_CONFIG = {
	Energia: {
		label: "Energia elétrica",
		unit: "kWh",
		hasMeterReading: true,
		identifierLabel: "Número da instalação / unidade consumidora",
		identifierPlaceholder: "Ex.: 3012345678",
	},
	Água: {
		label: "Água",
		unit: "m³",
		hasMeterReading: true,
		identifierLabel: "Matrícula",
		identifierPlaceholder: "Ex.: 000123456",
	},
	Gás: {
		label: "Gás",
		unit: "m³",
		hasMeterReading: true,
		identifierLabel: "Código da instalação",
		identifierPlaceholder: "Ex.: unidade consumidora ou matrícula",
	},
	Internet: {
		label: "Internet",
		unit: "N/A",
		hasMeterReading: false,
		identifierLabel: "Código do cliente",
		identifierPlaceholder: "Ex.: contrato, login ou código do cliente",
	},
	"Outros consumos": {
		label: "Outros consumos",
		unit: "",
		hasMeterReading: false,
		identifierLabel: "Identificação da instalação",
		identifierPlaceholder: "Ex.: código do cliente, conta ou referência",
	},
};

function utilityTypeConfig(type = "") {
	return UTILITY_TYPE_CONFIG[type] || {
		label: type || "Consumo",
		unit: consumptionUnit(type),
		hasMeterReading: !["internet"].includes(normalizeText(type)),
		identifierLabel: "Identificação da instalação",
		identifierPlaceholder: "Instalação, matrícula ou código cliente",
	};
}

function monthLabel(value = "") {
	if (!value) return "-";
	const [year, month] = value.split("-");
	const date = new Date(Number(year), Number(month || 1) - 1, 1);
	return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function previousCompetence(value = currentCompetencia()) {
	const [year, month] = value.split("-").map(Number);
	const date = new Date(year, month - 2, 1);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function consumptionCategory(type = "") {
	const normalized = normalizeText(type);
	return PROPERTY_COST_TYPES.some((item) => normalizeText(item) === normalized) ? "encargo" : "consumo";
}

function consumptionUnit(type = "") {
	const normalized = normalizeText(type);
	if (normalized.includes("energia")) return "kWh";
	if (normalized.includes("agua") || normalized.includes("gás") || normalized.includes("gas")) return "m³";
	if (normalized.includes("internet")) return "N/A";
	return "";
}

function summarizeConsumption(items = [], competence = currentCompetencia()) {
	const current = items.filter((item) => item.competencia === competence);
	const previous = items.filter((item) => item.competencia === previousCompetence(competence));
	const sum = (rows, predicate = () => true) => rows.filter(predicate).reduce((total, item) => total + Number(item.valor || 0), 0);
	const physical = (rows, type) => rows.filter((item) => normalizeText(item.tipo) === normalizeText(type)).reduce((total, item) => total + Number(item.consumo || 0), 0);
	const currentTotal = sum(current);
	const previousTotal = sum(previous);
	const variation = previousTotal > 0 ? Number((((currentTotal - previousTotal) / previousTotal) * 100).toFixed(2)) : 0;
	const properties = new Set(current.map((item) => item.imovelId || item.imovel).filter(Boolean));
	const anomalies = current.filter((item) => Math.abs(Number(item.variacaoPercentual || 0)) >= Number(CONSUMPTION_THRESHOLDS[item.tipo] || 25) || ["anomalia", "variacao_relevante"].includes(normalizeText(item.status)));
	return {
		current,
		previous,
		total: currentTotal,
		energyCost: sum(current, (item) => normalizeText(item.tipo) === "energia"),
		waterCost: sum(current, (item) => normalizeText(item.tipo) === "agua"),
		energy: physical(current, "Energia"),
		water: physical(current, "Água"),
		variation,
		anomalies,
		average: properties.size ? currentTotal / properties.size : 0,
		propertiesCount: properties.size,
	};
}

function PropertyConsumptionLookup({ value, onChange }) {
	const [query, setQuery] = useState("");
	const [items, setItems] = useState([]);
	const [selected, setSelected] = useState(null);
	const debounced = useDebouncedValue(query, 300);
	useEffect(() => {
		let active = true;
		if (debounced.trim().length < 2) {
			setItems([]);
			return () => { active = false; };
		}
		buscarImoveisConsumosFacilities({ q: debounced, limit: 8 }).then((data) => {
			if (active) setItems(data || []);
		}).catch(() => {
			if (active) setItems([]);
		});
		return () => { active = false; };
	}, [debounced]);
	return (
		<label className="space-y-2">
			<span className="text-xs font-black uppercase text-slate-500">Imóvel</span>
			<div className="rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-blue-400">
				<input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-full rounded-xl px-3 text-sm font-semibold outline-none" placeholder={selected ? selected.nome : "Buscar imóvel por nome, cidade ou código..."} />
				{selected || value ? <div className="mt-2 flex justify-between gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"><span className="truncate">{selected?.nome || value}</span><button type="button" onClick={() => { setSelected(null); onChange("", null); }}><X size={14} /></button></div> : null}
				{query.trim().length >= 2 ? <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-100">
					{items.length ? items.map((item) => <button type="button" key={item.id} onClick={() => { setSelected(item); onChange(item.id, item); setQuery(""); }} className="block w-full px-3 py-2 text-left hover:bg-blue-50"><p className="text-xs font-black text-slate-700">{item.nome}</p><p className="text-xs font-semibold text-slate-500">{[item.cidade, item.estado].filter(Boolean).join("/") || item.codigo || "ADM"}</p></button>) : <p className="px-3 py-3 text-xs font-bold text-slate-400">Nenhum imóvel encontrado.</p>}
				</div> : <p className="mt-2 px-2 text-xs font-semibold text-slate-400">Digite pelo menos 2 caracteres.</p>}
			</div>
		</label>
	);
}

function ConsumptionPanel() {
	const [tab, setTab] = useState("visao");
	const [competence, setCompetence] = useState(currentCompetencia());
	const [metric, setMetric] = useState("valor");
	const [period, setPeriod] = useState(12);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [items, setItems] = useState([]);
	const [modal, setModal] = useState("");
	// preview nunca e lido (setPreview so reseta pra []) — renomeado com _
	// pra preservar o reset sem apagar logica.
	const [_preview, setPreview] = useState([]);
	const [form, setForm] = useState({
		categoria: "consumo",
		imovelId: "",
		imovel: "",
		tipo: "Energia",
		competencia: competence,
		fornecedor: "",
		codigoCliente: "",
		leituraAnterior: "",
		leituraAtual: "",
		consumo: "",
		unidade: "kWh",
		valor: "",
		vencimento: "",
		dataLeitura: "",
		documentoUrl: "",
		observacao: "",
	});

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const nextItems = await listarConsumosFacilities({ competencia: competence });
			setItems(nextItems || []);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os consumos.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, [competence]);

	const summary = useMemo(() => summarizeConsumption(items, competence), [items, competence]);
	const filtered = useMemo(() => items.filter((item) => item.competencia === competence), [items, competence]);
	const consumptions = filtered.filter((item) => (item.categoria || consumptionCategory(item.tipo)) === "consumo");
	const costs = filtered.filter((item) => (item.categoria || consumptionCategory(item.tipo)) === "encargo");
	const anomalies = summary.anomalies;
	const groupedByType = filtered.reduce((acc, item) => {
		const key = item.tipo || "Outros";
		acc[key] = (acc[key] || 0) + Number(item.valor || 0);
		return acc;
	}, {});
	const groupedByProperty = filtered.reduce((acc, item) => {
		const key = item.imovel || "Imóvel não informado";
		const current = acc[key] || { imovel: key, energia: 0, agua: 0, outros: 0, total: 0 };
		const value = Number(item.valor || 0);
		if (normalizeText(item.tipo) === "energia") current.energia += value;
		else if (normalizeText(item.tipo) === "agua") current.agua += value;
		else current.outros += value;
		current.total += value;
		acc[key] = current;
		return acc;
	}, {});
	const evolution = Array.from(new Set(items.map((item) => item.competencia).filter(Boolean))).sort().slice(-period).map((month) => {
		const rows = items.filter((item) => item.competencia === month);
		return {
			month,
			value: rows.reduce((total, item) => total + Number(metric === "valor" ? item.valor : item.consumo || 0), 0),
		};
	});
	const maxEvolution = Math.max(...evolution.map((item) => item.value), 1);
	const attention = anomalies.slice(0, 8).map((item) => ({
		id: item.id,
		title: `${item.tipo} ${Number(item.variacaoPercentual || 0) > 0 ? "+" : ""}${Number(item.variacaoPercentual || 0).toFixed(1)}%`,
		subtitle: item.imovel || "Imóvel",
		value: item.anomalyStatus === "resolvida" ? "Resolvida" : "Analisar",
		tone: Math.abs(Number(item.variacaoPercentual || 0)) >= 40 ? "red" : "orange",
	}));

	const update = (field, value) => setForm((current) => {
		const next = { ...current, [field]: value };
		if (field === "tipo") {
			next.categoria = consumptionCategory(value);
			next.unidade = consumptionUnit(value);
		}
		if ((field === "leituraAnterior" || field === "leituraAtual") && Number(next.leituraAtual) >= Number(next.leituraAnterior)) {
			next.consumo = String(Number(next.leituraAtual || 0) - Number(next.leituraAnterior || 0));
		}
		return next;
	});
	const resetForm = (category = "consumo") => setForm({
		categoria: category,
		imovelId: "",
		imovel: "",
		tipo: category === "encargo" ? "Condomínio" : "Energia",
		competencia: competence,
		fornecedor: "",
		codigoCliente: "",
		leituraAnterior: "",
		leituraAtual: "",
		consumo: "",
		unidade: category === "encargo" ? "" : "kWh",
		valor: "",
		vencimento: "",
		dataLeitura: "",
		documentoUrl: "",
		observacao: "",
	});
	const openNew = (category = tab === "encargos" ? "encargo" : "consumo") => {
		resetForm(category);
		setModal("launch");
	};
	const save = async () => {
		setSaving(true);
		setError("");
		try {
			await criarConsumoFacilities({ ...form, competencia: form.competencia || competence, threshold: CONSUMPTION_THRESHOLDS[form.tipo] || 25 });
			setModal("");
			await load();
		} catch (err) {
			setError(err?.message || "Falha ao registrar lançamento.");
		} finally {
			setSaving(false);
		}
	};
	const exportData = () => downloadCsv(`consumos-custos-${competence}.csv`, [
		["Categoria", "Competência", "Imóvel", "Tipo", "Consumo", "Unidade", "Valor", "Fornecedor", "Vencimento", "Status"],
		...filtered.map((item) => [item.categoria || consumptionCategory(item.tipo), item.competencia, item.imovel, item.tipo, item.consumo, item.unidade, item.valor, item.fornecedor, item.vencimento, item.status]),
	]);
	const previewImport = async () => {
		resetForm(tab === "encargos" ? "encargo" : "consumo");
		setPreview([]);
		setModal("import");
	};

	return (
		<section className="space-y-5">
			<header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Facilities &gt; Consumos & Custos Prediais</p>
						<h2 className="mt-2 text-3xl font-black text-slate-950">Consumos & Custos Prediais</h2>
						<p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">Acompanhe utilidades, encargos e variações dos imóveis ao longo do tempo.</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button type="button" onClick={() => openNew()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white"><Plus size={17} /> Novo lançamento</button>
						<button type="button" onClick={previewImport} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700"><Upload size={17} /> Importar</button>
						<button type="button" onClick={exportData} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700"><Download size={17} /> Exportar</button>
					</div>
				</div>
				<div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					<label className="flex max-w-xs items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
						<span className="text-xs font-black uppercase text-slate-500">Competência</span>
						<input type="month" value={competence} onChange={(event) => setCompetence(event.target.value)} className="bg-transparent text-sm font-black text-slate-950 outline-none" />
					</label>
					<p className="text-sm font-bold text-slate-500">Comparando com {monthLabel(previousCompetence(competence))}</p>
				</div>
				<div className="mt-5 flex gap-2 overflow-x-auto pb-1">
					{CONSUMPTION_TABS.map((item) => {
						const Icon = item.icon;
						return <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-4 text-xs font-black ${tab === item.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}><Icon size={16} /> {item.label}</button>;
					})}
				</div>
			</header>
			{error ? <div className="flex items-center justify-between rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700"><span>{error}</span><button type="button" onClick={load} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-red-700">Tentar novamente</button></div> : null}
			{loading ? <EmptyState title="Carregando consumos..." description="Consolidando utilidades e encargos da competência." /> : null}
			{!loading && tab === "visao" ? (
				<div className="space-y-5">
					<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-800">
						Energia e água cadastradas no imóvel entram automaticamente nesta visão. Lançamentos manuais da mesma competência substituem o valor automático para evitar duplicidade.
					</div>
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
						<KpiCard label="Custo do mês" value={formatCurrency(summary.total)} detail="Custos monitorados" tone="blue" icon={BarChart3} />
						<KpiCard label="Energia do mês" value={formatCurrency(summary.energyCost)} detail={`${numberFormatter.format(summary.energy)} kWh`} tone="orange" icon={Zap} />
						<KpiCard label="Água do mês" value={formatCurrency(summary.waterCost)} detail={`${numberFormatter.format(summary.water)} m³`} tone="emerald" icon={RefreshCw} />
						<KpiCard label="Vs. mês anterior" value={`${summary.variation > 0 ? "+" : ""}${summary.variation.toFixed(1)}%`} detail={`vs. ${monthLabel(previousCompetence(competence))}`} tone={summary.variation > 15 ? "red" : summary.variation > 0 ? "orange" : "emerald"} icon={History} />
						<KpiCard label="Unidades com anomalia" value={numberFormatter.format(new Set(anomalies.map((item) => item.imovelId || item.imovel)).size)} detail="Variações relevantes" tone={anomalies.length ? "red" : "emerald"} icon={AlertTriangle} />
						<KpiCard label="Custo médio/unidade" value={formatCurrency(summary.average)} detail={`${summary.propertiesCount} unidade(s)`} tone="violet" icon={Building2} />
					</div>
					{filtered.length ? (
						<div className="grid items-start gap-5 xl:grid-cols-[0.9fr_1.1fr]">
							<DataList title="Requer atenção" description="Variações relevantes por unidade." items={attention} action={<button type="button" onClick={() => setTab("anomalias")} className="text-xs font-black text-blue-600">Ver anomalias</button>} renderItem={(item) => <SimpleRow key={item.id} {...item} />} />
							<section className="self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div><h3 className="text-lg font-black text-slate-950">Evolução mensal</h3><p className="text-sm font-semibold text-slate-500">Acompanha valor ou consumo físico sem misturar unidades.</p></div>
									<div className="flex gap-2">
										<select value={metric} onChange={(event) => setMetric(event.target.value)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-black"><option value="valor">Valor R$</option><option value="consumo">Consumo físico</option></select>
										<select value={period} onChange={(event) => setPeriod(Number(event.target.value))} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-black"><option value={6}>6 meses</option><option value={12}>12 meses</option><option value={24}>24 meses</option></select>
									</div>
								</div>
								<div className="mt-5 flex h-56 items-end gap-2 overflow-x-auto rounded-2xl bg-slate-50 p-4">
									{evolution.map((item) => <div key={item.month} className="flex min-w-[44px] flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-xl bg-blue-600" style={{ height: `${Math.max(8, (item.value / maxEvolution) * 180)}px` }} /><span className="text-[10px] font-black text-slate-500">{item.month.slice(5)}</span></div>)}
								</div>
							</section>
						</div>
					) : <EmptyState title="Ainda não existem consumos registrados para esta competência." description="Cadastre o primeiro lançamento para acompanhar custos e variações." action={<button type="button" onClick={() => openNew()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white"><Plus size={16} /> Novo lançamento</button>} />}
					<div className="grid items-start gap-5 xl:grid-cols-2">
						<DataList title="Total por tipo" description="Resumo financeiro separado por utilidade ou encargo." items={Object.entries(groupedByType).sort((a, b) => b[1] - a[1]).map(([title, value]) => ({ title, value, subtitle: consumptionCategory(title) === "encargo" ? "Custo/encargo" : "Consumo/utilidade", tone: consumptionCategory(title) === "encargo" ? "violet" : "blue" }))} renderItem={(item) => <SimpleRow key={item.title} title={item.title} subtitle={item.subtitle} value={formatCurrency(item.value)} tone={item.tone} />} />
						<OperationTable columns={[
							{ key: "imovel", label: "Maiores custos no mês" },
							{ key: "energia", label: "Energia", render: (row) => formatCurrency(row.energia) },
							{ key: "agua", label: "Água", render: (row) => formatCurrency(row.agua) },
							{ key: "outros", label: "Outros", render: (row) => formatCurrency(row.outros) },
							{ key: "total", label: "Total", render: (row) => <span className="font-black text-blue-700">{formatCurrency(row.total)}</span> },
						]} rows={Object.values(groupedByProperty).sort((a, b) => b.total - a.total).slice(0, 8)} emptyTitle="Nenhum custo no mês." />
					</div>
				</div>
			) : null}
			{!loading && tab === "consumos" ? <ConsumptionTable rows={consumptions} title="Consumos / Utilidades" /> : null}
			{!loading && tab === "encargos" ? <ConsumptionTable rows={costs} title="Custos & Encargos" /> : null}
			{!loading && tab === "anomalias" ? <OperationTable columns={[
				{ key: "imovel", label: "Unidade" },
				{ key: "tipo", label: "Tipo" },
				{ key: "consumo", label: "Consumo", render: (row) => `${numberFormatter.format(Number(row.consumo || 0))} ${row.unidade || ""}` },
				{ key: "variacaoPercentual", label: "Variação", render: (row) => <span className="font-black text-orange-700">{Number(row.variacaoPercentual || 0).toFixed(1)}%</span> },
				{ key: "anomalyStatus", label: "Tratativa", render: (row) => <OperationBadge tone={operationTone(row.anomalyStatus || "Detectada")}>{row.anomalyStatus || "Detectada"}</OperationBadge> },
				{ key: "actions", label: "Ações", render: () => <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-blue-700">Analisar</button> },
			]} rows={anomalies} emptyTitle="Nenhuma variação relevante encontrada." /> : null}
			{!loading && tab === "comparativos" ? <div className="grid items-start gap-5 xl:grid-cols-2">
				<DataList title="Rankings" description="Sem linguagem punitiva, apenas pontos para análise." items={Object.values(groupedByProperty).sort((a, b) => b.total - a.total).slice(0, 8).map((item) => ({ title: item.imovel, subtitle: "Maior custo mensal", value: formatCurrency(item.total), tone: "blue" }))} renderItem={(item) => <SimpleRow key={item.title} {...item} />} />
				<DataList title="Eficiência por área" description="Será calculada quando a área do imóvel estiver disponível na base." items={[]} renderItem={(item) => <SimpleRow key={item.title} {...item} />} />
			</div> : null}
			{!loading && tab === "historico" ? <ConsumptionTable rows={items} title="Histórico de lançamentos" /> : null}
			{!loading && tab === "configuracoes" ? <DataList title="Thresholds de anomalia" description="Parâmetros iniciais por tipo. Próxima etapa pode persistir estes valores por perfil autorizado." items={Object.entries(CONSUMPTION_THRESHOLDS).map(([title, value]) => ({ title, subtitle: "Variação relevante", value: `${value}%`, tone: "blue" }))} renderItem={(item) => <SimpleRow key={item.title} {...item} />} /> : null}
			<ConsumptionLaunchModal modal={modal} setModal={setModal} form={form} update={update} saving={saving} save={save} items={items} />
			<AppModal title="Importar lançamento" description="Selecione o imóvel e valide os dados antes de gravar em Consumos & Custos." open={modal === "import"} onClose={() => setModal("")}>
				<div className="grid gap-3 md:grid-cols-2">
					<div className="md:col-span-2"><PropertyConsumptionLookup value={form.imovelId} onChange={(value, item) => { update("imovelId", value); update("imovel", item?.nome || item?.titulo || ""); }} /></div>
					<select value={form.categoria} onChange={(event) => { update("categoria", event.target.value); update("tipo", event.target.value === "encargo" ? "Condomínio" : "Energia"); }} className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"><option value="consumo">Consumo / utilidade</option><option value="encargo">Custo / encargo</option></select>
					<select value={form.tipo} onChange={(event) => update("tipo", event.target.value)} className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400">{(form.categoria === "encargo" ? PROPERTY_COST_TYPES : UTILITY_TYPES).map((item) => <option key={item}>{item}</option>)}</select>
					<input type="month" value={form.competencia} onChange={(event) => update("competencia", event.target.value)} className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400" />
					<input value={form.fornecedor} onChange={(event) => update("fornecedor", event.target.value)} className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400" placeholder="Fornecedor" />
					<input value={form.consumo} onChange={(event) => update("consumo", event.target.value)} className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400" placeholder="Consumo" />
					<input value={form.unidade} onChange={(event) => update("unidade", event.target.value)} className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400" placeholder="Unidade" />
					<input value={form.valor} onChange={(event) => update("valor", event.target.value)} className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400" placeholder="Valor" />
					<input type="date" value={form.vencimento} onChange={(event) => update("vencimento", event.target.value)} className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400" />
					<input value={form.codigoCliente} onChange={(event) => update("codigoCliente", event.target.value)} className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400" placeholder="Instalação, matrícula ou código cliente" />
					<input value={form.documentoUrl} onChange={(event) => update("documentoUrl", event.target.value)} className="h-12 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400" placeholder="Link da fatura/documento" />
					<textarea value={form.observacao} onChange={(event) => update("observacao", event.target.value)} className="min-h-24 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400 md:col-span-2" placeholder="Observações" />
					<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-bold text-blue-800 md:col-span-2">
						O lançamento importado passa pelas mesmas validações do cadastro manual e recalcula anomalias da competência.
					</div>
					<button type="button" disabled={saving || !form.imovelId || !form.tipo || !form.competencia || !form.valor} onClick={save} className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white disabled:opacity-50 md:col-span-2">Salvar importação</button>
				</div>
			</AppModal>
		</section>
	);
}

function ConsumptionTable({ rows = [], title }) {
	return (
		<OperationTable columns={[
			{ key: "competencia", label: "Competência" },
			{ key: "imovel", label: "Imóvel" },
			{ key: "tipo", label: "Tipo" },
			{ key: "consumo", label: "Consumo", render: (row) => row.unidade === "N/A" ? "Não se aplica" : `${numberFormatter.format(Number(row.consumo || 0))} ${row.unidade || ""}` },
			{ key: "valor", label: "Valor", render: (row) => formatCurrency(row.valor) },
			{ key: "origem", label: "Origem", render: (row) => row.automatico || row.origem === "imoveis" ? <OperationBadge tone="blue">Imóveis</OperationBadge> : <OperationBadge tone="emerald">Manual</OperationBadge> },
			{ key: "variacaoPercentual", label: "Variação", render: (row) => row.variacaoPercentual ? `${Number(row.variacaoPercentual).toFixed(1)}%` : "-" },
			{ key: "status", label: "Status", render: (row) => <OperationBadge tone={operationTone(row.status)}>{row.status || "Registrado"}</OperationBadge> },
			{ key: "documentoUrl", label: "Documento", render: (row) => row.documentoUrl ? <a className="font-black text-blue-700" href={row.documentoUrl} target="_blank" rel="noreferrer">Abrir</a> : "-" },
		]} rows={rows} emptyTitle={`Nenhum registro em ${title}.`} emptyDescription="Use Novo lançamento para registrar dados desta competência." />
	);
}

function ConsumptionLaunchModal({ modal, setModal, form, update, saving, save, items = [] }) {
	const inputClass = "h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400";
	const textareaClass = "min-h-24 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400";
	const types = form.categoria === "encargo" ? PROPERTY_COST_TYPES : UTILITY_TYPES;
	const [selectedProperty, setSelectedProperty] = useState(null);
	const [errors, setErrors] = useState({});
	const config = utilityTypeConfig(form.tipo);
	const isUtility = form.categoria === "consumo";
	const hasMeterReading = isUtility && config.hasMeterReading;
	const computedConsumption = hasMeterReading && Number(form.leituraAtual || 0) >= Number(form.leituraAnterior || 0)
		? Number(form.leituraAtual || 0) - Number(form.leituraAnterior || 0)
		: Number(form.consumo || 0);
	const unit = isUtility ? config.unit : form.unidade;
	const dueDays = daysUntil(form.vencimento);
	const duplicate = items.find((item) => {
		return String(item.imovelId || "") === String(form.imovelId || "")
			&& normalizeText(item.tipo) === normalizeText(form.tipo)
			&& String(item.competencia || "") === String(form.competencia || "");
	});
	const averageCost = computedConsumption > 0 && Number(form.valor || 0) > 0 ? Number(form.valor) / computedConsumption : null;
	const submit = async () => {
		const nextErrors = {};
		if (!form.imovelId) nextErrors.imovelId = "Selecione um imóvel.";
		if (!form.tipo) nextErrors.tipo = "Selecione o tipo de consumo.";
		if (!form.competencia) nextErrors.competencia = "Informe a competência.";
		if (form.valor === "" || Number(form.valor) < 0) nextErrors.valor = "Informe um valor válido.";
		if (hasMeterReading && form.leituraAtual !== "" && form.leituraAnterior !== "" && Number(form.leituraAtual) < Number(form.leituraAnterior)) {
			nextErrors.leituraAtual = "A leitura atual não pode ser menor que a leitura anterior.";
		}
		if (form.documentoUrl && !/^https?:\/\//i.test(form.documentoUrl)) nextErrors.documentoUrl = "Informe uma URL iniciando com http:// ou https://.";
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length) return;
		await save();
	};
	const closeModal = () => {
		setErrors({});
		setSelectedProperty(null);
		setModal("");
	};
	return (
		<AppModal
			title={form.categoria === "encargo" ? "Novo custo ou encargo" : "Novo consumo"}
			description={form.categoria === "encargo" ? "Registre custos recorrentes do imóvel, valor, vencimento e documento." : "Registre o consumo da unidade, leituras, valor e documento de cobrança."}
			open={modal === "launch"}
			onClose={closeModal}
			maxWidth="max-w-4xl"
			footer={<ModalFooterActions onCancel={closeModal} onConfirm={submit} confirmLabel={form.categoria === "encargo" ? "Cadastrar custo" : "Cadastrar consumo"} savingLabel="Cadastrando..." saving={saving} disabled={!form.imovelId || !form.tipo || !form.competencia || !form.valor} />}
		>
			<div className="space-y-6">
				<DetailSection title="Imóvel">
					<div>
						<PropertyConsumptionLookup value={form.imovelId} onChange={(value, item) => {
							update("imovelId", value);
							update("imovel", item?.nome || item?.titulo || "");
							setSelectedProperty(item || null);
							setErrors((current) => ({ ...current, imovelId: "" }));
						}} />
						{errors.imovelId ? <p className="mt-2 text-xs font-black text-red-600">⚠ {errors.imovelId}</p> : null}
					</div>
					{selectedProperty ? (
						<div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
							<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
								<div>
									<p className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-600">Imóvel selecionado</p>
									<h4 className="mt-1 text-base font-black text-slate-950">{selectedProperty.nome || selectedProperty.titulo}</h4>
									<p className="mt-1 text-sm font-semibold text-slate-600">{[selectedProperty.cidade, selectedProperty.estado].filter(Boolean).join("/") || selectedProperty.codigo || "ADM"}</p>
								</div>
								<button type="button" onClick={() => { update("imovelId", ""); update("imovel", ""); setSelectedProperty(null); }} className="h-9 rounded-xl border border-blue-200 bg-white px-3 text-xs font-black text-blue-700 hover:bg-blue-100">Trocar imóvel</button>
							</div>
						</div>
					) : null}
				</DetailSection>

				<DetailSection title="Consumo">
					<div className="grid gap-3 md:grid-cols-2">
						{form.categoria === "encargo" ? (
							<FormField label="Categoria">
								<select value={form.categoria} onChange={(event) => { update("categoria", event.target.value); update("tipo", event.target.value === "encargo" ? "Condomínio" : "Energia"); }} className={inputClass}><option value="consumo">Consumo / utilidade</option><option value="encargo">Custo / encargo</option></select>
							</FormField>
						) : null}
						<FormField label={form.categoria === "encargo" ? "Tipo de custo" : "Tipo de consumo"} required error={errors.tipo}>
							<select value={form.tipo} onChange={(event) => update("tipo", event.target.value)} className={inputClass}>{types.map((item) => <option key={item}>{item}</option>)}</select>
						</FormField>
						<FormField label="Competência da cobrança" required error={errors.competencia}>
							<input type="month" value={form.competencia} onChange={(event) => update("competencia", event.target.value)} className={inputClass} />
						</FormField>
					</div>
					{isUtility ? (
						<div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-bold text-blue-800">
							Aluguel não é lançado nesta tela. Os valores de aluguel são obtidos automaticamente do contrato de locação do imóvel.
						</div>
					) : null}
				</DetailSection>

				{hasMeterReading ? (
					<DetailSection title="Leituras">
						<div className="grid gap-3 md:grid-cols-2">
							<FormField label="Leitura anterior">
								<input value={form.leituraAnterior} onChange={(event) => update("leituraAnterior", event.target.value)} className={inputClass} placeholder="Ex.: 12450" />
							</FormField>
							<FormField label="Leitura atual" error={errors.leituraAtual}>
								<input value={form.leituraAtual} onChange={(event) => update("leituraAtual", event.target.value)} className={inputClass} placeholder="Ex.: 13012" />
							</FormField>
							<FormField label="Consumo" helper={form.leituraAnterior && form.leituraAtual && Number(form.leituraAtual) >= Number(form.leituraAnterior) ? "Calculado automaticamente a partir das leituras." : "Informe manualmente quando não houver leitura."}>
								<input value={form.consumo} onChange={(event) => update("consumo", event.target.value)} className={inputClass} placeholder="Consumo apurado" />
							</FormField>
							<FormField label="Unidade de consumo">
								<input value={unit} readOnly className={`${inputClass} bg-slate-50 text-slate-500`} />
							</FormField>
						</div>
						<div className="mt-4 rounded-2xl bg-slate-50 p-4">
							<p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Consumo calculado</p>
							<p className="mt-1 text-2xl font-black text-slate-950">{numberFormatter.format(Number(computedConsumption || 0))} {unit}</p>
						</div>
					</DetailSection>
				) : null}

				{normalizeText(form.tipo) === "internet" ? (
					<DetailSection title="Plano contratado">
						<div className="grid gap-3 md:grid-cols-2">
							<FormField label="Plano"><input value={form.plano || ""} onChange={(event) => update("plano", event.target.value)} className={inputClass} placeholder="Ex.: Link dedicado" /></FormField>
							<FormField label="Velocidade"><input value={form.velocidade || ""} onChange={(event) => update("velocidade", event.target.value)} className={inputClass} placeholder="Ex.: 500 Mbps" /></FormField>
						</div>
					</DetailSection>
				) : null}

				{normalizeText(form.tipo) === "iptu" ? (
					<DetailSection title="Dados do IPTU">
						<div className="grid gap-3 md:grid-cols-3">
							<FormField label="Exercício"><input value={form.exercicio || ""} onChange={(event) => update("exercicio", event.target.value)} className={inputClass} placeholder="2026" /></FormField>
							<FormField label="Número de parcelas"><input value={form.numeroParcelas || ""} onChange={(event) => update("numeroParcelas", event.target.value)} className={inputClass} placeholder="12" /></FormField>
							<FormField label="Parcela"><input value={form.parcela || ""} onChange={(event) => update("parcela", event.target.value)} className={inputClass} placeholder="1/12" /></FormField>
						</div>
					</DetailSection>
				) : null}

				<DetailSection title="Cobrança">
					<div className="grid gap-3 md:grid-cols-3">
						<FormField label="Valor da fatura" required error={errors.valor}>
							<input value={form.valor} onChange={(event) => update("valor", event.target.value)} className={inputClass} placeholder="R$ 0,00" />
						</FormField>
						<FormField label="Data de vencimento">
							<input type="date" value={form.vencimento} onChange={(event) => update("vencimento", event.target.value)} className={inputClass} />
						</FormField>
						<FormField label="Fornecedor">
							<input value={form.fornecedor} onChange={(event) => update("fornecedor", event.target.value)} className={inputClass} placeholder="Ex.: CEMIG, COPASA, Algar" />
						</FormField>
					</div>
					{form.vencimento ? <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-black ${dueDays < 0 ? "bg-red-50 text-red-700" : dueDays <= 7 ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>{dueDays < 0 ? "Fatura vencida" : `Vence em ${dueDays} dia(s)`}</p> : null}
				</DetailSection>

				<DetailSection title="Identificação da instalação">
					<FormField label={config.identifierLabel}>
						<input value={form.codigoCliente} onChange={(event) => update("codigoCliente", event.target.value)} className={inputClass} placeholder={config.identifierPlaceholder} />
					</FormField>
				</DetailSection>

				<DetailSection title="Fatura / documento">
					<FormField label="Link do documento" error={errors.documentoUrl} helper="Use o link da fatura ou documento quando já estiver salvo no Drive/sistema.">
						<input value={form.documentoUrl} onChange={(event) => update("documentoUrl", event.target.value)} className={inputClass} placeholder="https://..." />
					</FormField>
					{form.documentoUrl ? <a href={form.documentoUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-10 items-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-xs font-black text-blue-700">Abrir documento</a> : null}
				</DetailSection>

				{duplicate ? (
					<div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
						<p className="text-sm font-black text-orange-800">Já existe um lançamento de {form.tipo} para {monthLabel(form.competencia)} neste imóvel.</p>
						<p className="mt-1 text-xs font-semibold text-orange-700">Valor registrado: {formatCurrency(duplicate.valor)}. Verifique antes de continuar.</p>
					</div>
				) : null}

				<DetailSection title="Observações">
					<FormField label="Observações" helper="Opcional. Use para observações da cobrança, leitura, anomalia ou documento.">
						<textarea value={form.observacao} onChange={(event) => update("observacao", event.target.value)} className={textareaClass} placeholder="Adicione informações adicionais sobre esta cobrança..." />
					</FormField>
				</DetailSection>

				<div className="rounded-2xl border border-slate-200 bg-white p-4">
					<p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Resumo do lançamento</p>
					<div className="mt-3 grid gap-3 text-sm md:grid-cols-4">
						<div><p className="font-black text-slate-950">{config.label}</p><p className="text-xs font-semibold text-slate-500">{monthLabel(form.competencia)}</p></div>
						<div><p className="font-black text-slate-950">{hasMeterReading ? `${numberFormatter.format(Number(computedConsumption || 0))} ${unit}` : "Sem leitura"}</p><p className="text-xs font-semibold text-slate-500">Consumo</p></div>
						<div><p className="font-black text-slate-950">{formatCurrency(form.valor)}</p><p className="text-xs font-semibold text-slate-500">{averageCost ? `${formatCurrency(averageCost)} / ${unit}` : "Valor da fatura"}</p></div>
						<div><p className="font-black text-slate-950">{form.imovel || selectedProperty?.nome || "Imóvel pendente"}</p><p className="text-xs font-semibold text-slate-500">Vencimento: {formatDate(form.vencimento)}</p></div>
					</div>
				</div>
			</div>
		</AppModal>
	);
}

const SCORE_TABS = [
	{ key: "visao", label: "Visão Geral", icon: BarChart3 },
	{ key: "unidades", label: "Unidades", icon: Building2 },
	{ key: "fatores", label: "Fatores", icon: SlidersHorizontal },
	{ key: "pendencias", label: "Pendências", icon: AlertTriangle },
	{ key: "evolucao", label: "Evolução", icon: History },
	{ key: "configuracoes", label: "Configurações", icon: Settings },
];

function scoreToneClass(tone = "blue") {
	return {
		emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
		orange: "border-orange-100 bg-orange-50 text-orange-700",
		red: "border-red-100 bg-red-50 text-red-700",
		blue: "border-blue-100 bg-blue-50 text-blue-700",
		violet: "border-violet-100 bg-violet-50 text-violet-700",
	}[tone] || "border-slate-100 bg-slate-50 text-slate-700";
}

function buildScoreUnits(dashboard = {}) {
	const sources = [
		...(dashboard?.highlights?.segurancaPendencias || []).map((item) => ({ ...item, source: "Segurança", loss: 5 })),
		...(dashboard?.highlights?.inventariosPendentes || []).map((item) => ({ ...item, source: "Inventário", loss: 2 })),
		...(dashboard?.highlights?.contratosProximos || []).map((item) => ({ ...item, source: "Contratos", loss: 2 })),
		...(dashboard?.highlights?.consumosAnomalias || []).map((item) => ({ ...item, source: "Consumos", loss: 2 })),
	];
	const grouped = sources.reduce((acc, item) => {
		const key = item.imovel || item.unidade || item.propertyName || item.titulo || item.nome || "Unidade não identificada";
		const current = acc[key] || { id: key, unidade: key, empresa: item.empresa || "-", regional: item.regional || "-", loss: 0, pendencias: 0, risks: {} };
		current.loss += Number(item.loss || 0);
		current.pendencias += 1;
		current.risks[item.source] = (current.risks[item.source] || 0) + 1;
		acc[key] = current;
		return acc;
	}, {});
	return Object.values(grouped).map((item) => {
		const score = Math.max(0, 100 - item.loss);
		const classification = score >= 90 ? "Excelente" : score >= 75 ? "Bom" : score >= 60 ? "Atenção" : score >= 40 ? "Crítico" : "Muito crítico";
		return {
			...item,
			score,
			status: classification,
			principalRisco: Object.entries(item.risks).sort((a, b) => b[1] - a[1])[0]?.[0] || "Sem risco",
			evolucao: "-",
		};
	}).sort((a, b) => a.score - b.score);
}

function FacilityScorePanel({ dashboard }) {
	const [tab, setTab] = useState("visao");
	const [selectedUnit, setSelectedUnit] = useState(null);
	const score = dashboard?.kpis?.facilityScore || {};
	const fallbackFactors = [
		{ id: "seguranca", label: "Segurança", weight: 30, pointsPerIssue: 5, sourceType: "Segurança", score: 30, loss: 0, pending: 0 },
		{ id: "contratos", label: "Contratos e documentos", weight: 20, pointsPerIssue: 2, sourceType: "Contratos", score: 20, loss: 0, pending: 0 },
		{ id: "inventario", label: "Inventário patrimonial", weight: 20, pointsPerIssue: 2, sourceType: "Patrimônio", score: 20, loss: 0, pending: 0 },
		{ id: "consumos", label: "Consumos e anomalias", weight: 20, pointsPerIssue: 2, sourceType: "Consumos", score: 20, loss: 0, pending: 0 },
		{ id: "operacao", label: "Operação predial", weight: 10, pointsPerIssue: 1, sourceType: "Operação", score: 10, loss: 0, pending: 0 },
	];
	const factors = (score.factors || []).length ? score.factors : fallbackFactors;
	const issues = score.issues || [];
	const units = buildScoreUnits(dashboard);
	const excellentOrGood = units.filter((item) => item.score >= 75).length;
	const attention = units.filter((item) => item.score >= 60 && item.score < 75).length;
	const critical = units.filter((item) => item.score < 60).length;
	const criticalIssues = issues.filter((item) => ["Crítica", "Alta"].includes(item.criticality)).length;
	const evolution = [
		{ month: "Jul", value: score.rawValue ? Math.max(0, score.rawValue - 4) : 0 },
		{ month: "Ago", value: score.rawValue ? Math.max(0, score.rawValue - 2) : 0 },
		{ month: "Set", value: Number(score.rawValue || 0) },
	];
	const maxEvolution = Math.max(...evolution.map((item) => item.value), 1);
	const exportScore = () => downloadCsv(`saude-unidades-${todayDateKey()}.csv`, [
		["Fator", "Peso", "Pontuação", "Perda", "Pendências"],
		...factors.map((item) => [item.label, item.weight, item.score, item.loss, item.pending]),
	]);
	return (
		<section className="space-y-5">
			<header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Facilities &gt; Saúde das Unidades</p>
						<h2 className="mt-2 text-3xl font-black text-slate-950">Saúde das Unidades</h2>
						<p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">Visão consolidada de riscos, conformidade, pendências e situação operacional dos imóveis.</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button type="button" onClick={() => setTab("configuracoes")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700"><Settings size={17} /> Configurar Score</button>
						<button type="button" onClick={exportScore} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white"><Download size={17} /> Exportar</button>
					</div>
				</div>
				<div className="mt-5 flex gap-2 overflow-x-auto pb-1">
					{SCORE_TABS.map((item) => {
						const Icon = item.icon;
						return <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-4 text-xs font-black ${tab === item.key ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}><Icon size={16} /> {item.label}</button>;
					})}
				</div>
			</header>
			{tab === "visao" ? (
				<div className="space-y-5">
					<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
						<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
							<div>
								<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Facility Score · {score.modelVersion || "v1"}</p>
								<div className="mt-3 flex items-end gap-3">
									<p className="text-6xl font-black text-slate-950">{score.value === null || score.value === undefined ? "--" : numberFormatter.format(Number(score.value))}</p>
									<p className="pb-2 text-xl font-black text-slate-400">/ 100</p>
								</div>
								<p className={`mt-3 inline-flex rounded-2xl border px-4 py-2 text-sm font-black ${scoreToneClass(score.tone)}`}>{score.label || "Dados insuficientes"}</p>
							</div>
							<div className="max-w-xl rounded-2xl border border-slate-100 bg-slate-50 p-4">
								<p className="text-sm font-black text-slate-950">Cálculo transparente</p>
								<p className="mt-1 text-sm font-semibold text-slate-500">100 - {numberFormatter.format(Number(score.totalLoss || 0))} pontos perdidos = {numberFormatter.format(Number(score.rawValue || 0))}. Perdas são limitadas ao peso de cada fator.</p>
								<p className="mt-2 text-xs font-black uppercase text-slate-500">Cobertura de dados: {numberFormatter.format(Number(score.coverage || 0))}%</p>
							</div>
						</div>
					</section>
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
						<KpiCard label="Score médio" value={score.value === null || score.value === undefined ? "--" : numberFormatter.format(Number(score.value))} detail="Modelo explicável" tone={score.tone || "blue"} icon={BarChart3} />
						<KpiCard label="Excelente/Bom" value={numberFormatter.format(excellentOrGood)} detail="Unidades mapeadas" tone="emerald" icon={Check} />
						<KpiCard label="Em atenção" value={numberFormatter.format(attention)} detail="Score 60-74" tone="orange" icon={AlertTriangle} />
						<KpiCard label="Críticas" value={numberFormatter.format(critical)} detail="Score abaixo de 60" tone={critical ? "red" : "emerald"} icon={AlertTriangle} />
						<KpiCard label="Pendências críticas" value={numberFormatter.format(criticalIssues)} detail="Alta ou crítica" tone={criticalIssues ? "red" : "emerald"} icon={ShieldCheck} />
						<KpiCard label="Cobertura" value={`${numberFormatter.format(Number(score.coverage || 0))}%`} detail="Dados disponíveis" tone={Number(score.coverage || 0) < 30 ? "orange" : "blue"} icon={FileText} />
					</div>
					<div className="grid items-start gap-5 xl:grid-cols-2">
						<DataList title="Unidades que exigem atenção" description="Ordenadas por menor score derivado das pendências disponíveis." items={units.slice(0, 8).map((item) => ({ title: item.unidade, subtitle: `${item.principalRisco} · ${item.pendencias} pendência(s)`, value: item.score, tone: item.score < 60 ? "red" : item.score < 75 ? "orange" : "blue" }))} renderItem={(item) => <SimpleRow key={item.title} {...item} />} />
						<DataList title="Principais riscos" description="Pendências consolidadas por origem, sem duplicar dados canônicos." items={factors.filter((item) => item.pending > 0).map((item) => ({ title: item.label, subtitle: `${item.pending} pendência(s) · peso ${item.weight}`, value: `-${item.loss}`, tone: item.loss >= 8 ? "red" : "orange" }))} renderItem={(item) => <SimpleRow key={item.title} {...item} />} />
					</div>
				</div>
			) : null}
			{tab === "unidades" ? <OperationTable columns={[
				{ key: "unidade", label: "Unidade", render: (row) => <button type="button" onClick={() => setSelectedUnit(row)} className="text-left font-black text-blue-700">{row.unidade}</button> },
				{ key: "empresa", label: "Empresa" },
				{ key: "regional", label: "Regional" },
				{ key: "score", label: "Score", render: (row) => <span className="font-black text-slate-950">{row.score}/100</span> },
				{ key: "status", label: "Status", render: (row) => <OperationBadge tone={row.score < 60 ? "red" : row.score < 75 ? "orange" : "emerald"}>{row.status}</OperationBadge> },
				{ key: "principalRisco", label: "Principal risco" },
				{ key: "pendencias", label: "Pendências" },
				{ key: "evolucao", label: "Evolução" },
			]} rows={units} emptyTitle="Ainda não há dados suficientes por unidade." emptyDescription="Complete módulos de Facilities para obter o indicador por imóvel." /> : null}
			{tab === "fatores" ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<h3 className="text-lg font-black text-slate-950">Fatores do Score</h3>
				<div className="mt-4 space-y-3">
					{factors.map((factor) => <div key={factor.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div><p className="font-black text-slate-950">{factor.label}</p><p className="text-xs font-semibold text-slate-500">Peso {factor.weight} · Pendências {factor.pending}</p></div>
							<p className="text-sm font-black text-slate-700">{factor.score}/{factor.weight} · perda -{factor.loss}</p>
						</div>
						<div className="mt-3 h-3 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-blue-600" style={{ width: `${factor.weight ? (factor.score / factor.weight) * 100 : 0}%` }} /></div>
					</div>)}
				</div>
			</section> : null}
			{tab === "pendencias" ? <OperationTable columns={[
				{ key: "title", label: "Pendência" },
				{ key: "sourceType", label: "Origem" },
				{ key: "criticality", label: "Criticidade", render: (row) => <OperationBadge tone={row.criticality === "Crítica" ? "red" : row.criticality === "Alta" ? "orange" : "blue"}>{row.criticality}</OperationBadge> },
				{ key: "impact", label: "Impacto", render: (row) => `-${row.impact}` },
				{ key: "status", label: "Status" },
				{ key: "action", label: "Ações", render: (row) => <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-blue-700">{row.action || "Abrir origem"}</button> },
			]} rows={issues} emptyTitle="Nenhuma pendência impactando o score." emptyDescription="Pendências são consumidas dos módulos canônicos de Facilities." /> : null}
			{tab === "evolucao" ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-black text-slate-950">Evolução da Saúde das Unidades</h3><p className="text-sm font-semibold text-slate-500">Snapshots persistidos serão a fonte histórica. Esta visão mostra a tendência operacional atual.</p></div><OperationBadge tone="blue">Modelo {score.modelVersion || "v1"}</OperationBadge></div>
				<div className="mt-5 flex h-56 items-end gap-4 rounded-2xl bg-slate-50 p-4">
					{evolution.map((item) => <div key={item.month} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-xl bg-blue-600" style={{ height: `${Math.max(8, (item.value / maxEvolution) * 180)}px` }} /><span className="text-xs font-black text-slate-500">{item.month}</span><span className="text-xs font-black text-slate-950">{item.value}</span></div>)}
				</div>
			</section> : null}
			{tab === "configuracoes" ? <section className="space-y-4">
				<div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">Mudança de pesos exige justificativa, simulação e auditoria. A soma precisa permanecer 100/100.</div>
				{(score.factors || []).length ? null : (
					<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-800">
						Ainda não há fatores persistidos na base. A tela abaixo mostra o modelo padrão usado para orientar a configuração inicial do Score.
					</div>
				)}
				<OperationTable columns={[
					{ key: "label", label: "Fator" },
					{ key: "weight", label: "Peso" },
					{ key: "pointsPerIssue", label: "Perda por pendência" },
					{ key: "sourceType", label: "Origem canônica" },
				]} rows={factors} emptyTitle="Configuração indisponível." />
			</section> : null}
			<AppModal title={selectedUnit?.unidade || "Saúde da unidade"} description="Decomposição da nota pelos fatores disponíveis." open={Boolean(selectedUnit)} onClose={() => setSelectedUnit(null)}>
				<div className="grid gap-4 md:grid-cols-3">
					<KpiCard label="Facility Score" value={selectedUnit ? `${selectedUnit.score}/100` : "--"} detail={selectedUnit?.status || "Sem status"} tone={selectedUnit?.score < 60 ? "red" : selectedUnit?.score < 75 ? "orange" : "emerald"} icon={BarChart3} />
					<KpiCard label="Pendências" value={numberFormatter.format(Number(selectedUnit?.pendencias || 0))} detail="Total da unidade" tone="orange" icon={AlertTriangle} />
					<KpiCard label="Principal risco" value={selectedUnit?.principalRisco || "-"} detail="Maior origem de perda" tone="blue" icon={ShieldCheck} />
				</div>
				<div className="mt-4 space-y-2">
					{factors.map((factor) => <SimpleRow key={factor.id} title={factor.label} subtitle={`Peso ${factor.weight} · perda limitada ao fator`} value={`${factor.score}/${factor.weight}`} tone={factor.loss ? "orange" : "emerald"} />)}
				</div>
			</AppModal>
		</section>
	);
}

function ReportsPanel() {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [report, setReport] = useState(null);
	useEffect(() => {
		let active = true;
		obterRelatorioFacilities()
			.then((data) => {
				if (active) setReport(data);
			})
			.catch((err) => {
				if (active) setError(err?.message || "Não foi possível carregar relatório.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	const exportCsv = () => {
		const rows = [
			["Indicador", "Valor"],
			...Object.entries(report?.summary || {}).map(([key, value]) => [key, value]),
		];
		const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `relatorio-facilities-${new Date().toISOString().slice(0, 10)}.csv`;
		link.click();
		URL.revokeObjectURL(url);
	};

	if (loading) return <EmptyState title="Carregando relatório..." description="Consolidando bases de Facilities e imóveis." />;
	if (error) return <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700">{error}</div>;
	const summary = report?.summary || {};
	return (
		<section className="space-y-5">
			<div className="flex justify-end">
				<button type="button" onClick={exportCsv} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm hover:bg-blue-700"><Download size={16} /> Baixar CSV</button>
			</div>
			<div className="grid gap-4 md:grid-cols-4">
				<KpiCard label="Fornecedores" value={numberFormatter.format(summary.fornecedores || 0)} detail="Base Facilities" tone="blue" icon={Truck} />
				<KpiCard label="Contratos/mês" value={formatCurrency(summary.contratosTotalMensal || 0)} detail="Contratos próprios" tone="emerald" icon={FileText} />
				<KpiCard label="Consumos" value={formatCurrency(summary.consumoTotal || 0)} detail="Lançamentos próprios" tone="orange" icon={Zap} />
				<KpiCard label="Patrimônio" value={numberFormatter.format(summary.patrimonio || 0)} detail="Ativos cadastrados" tone="violet" icon={PackageSearch} />
			</div>
			<DataList title="Bases consolidadas" description="Relatório une dados próprios de Facilities com o módulo de imóveis do ADM." items={[
				{ title: "Fornecedores", subtitle: "facilities_suppliers", value: summary.fornecedores || 0, tone: "blue" },
				{ title: "Contratos Facilities", subtitle: "facilities_contracts", value: summary.contratos || 0, tone: "emerald" },
				{ title: "Consumos Facilities", subtitle: "facilities_consumptions", value: summary.consumos || 0, tone: "orange" },
				{ title: "Inventários", subtitle: "facilities_inventories", value: summary.inventarios || 0, tone: "violet" },
			]} renderItem={(item) => <SimpleRow key={item.title} {...item} />} />
		</section>
	);
}

export function FacilitiesAssetQrPage() {
	const { token = "" } = useParams();
	const [loading, setLoading] = useState(true);
	const [asset, setAsset] = useState(null);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		obterRegistroPublicoQrFacilities(token)
			.then((record) => {
				if (!active) return;
				setAsset(record || null);
				if (!record) setError("Registro não encontrado para este QR Code.");
			})
			.catch((err) => {
				if (active) setError(err?.message || "Não foi possível carregar o registro.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [token]);

	if (loading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
				<div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm font-black text-slate-600 shadow-sm">
					Carregando QR Code...
				</div>
			</div>
		);
	}
	const isKeyRecord = asset?.kind === "key" || token.startsWith("key-");

	return (
		<div className="min-h-screen bg-slate-100 p-4 md:p-8">
			<div className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
				<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
					ADM Facilities
				</p>
				<h1 className="mt-2 text-3xl font-black text-slate-950">
					{asset?.codigo || asset?.code || (isKeyRecord ? "QR Code de chave" : "QR Code de patrimônio")}
				</h1>
				{error ? (
					<div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-black text-red-700">
						{error}
					</div>
				) : (
					<div className="mt-6 grid gap-3 md:grid-cols-2">
						{[
							["Descrição", asset?.descricao || asset?.description || asset?.name],
							["Tipo/Categoria", asset?.categoria || asset?.type],
							["Local", asset?.imovel || asset?.locationDescription || asset?.address],
							["Ambiente", asset?.ambiente || asset?.environmentId],
							["Responsável/Portador", asset?.responsavel || asset?.currentHolderName || asset?.currentUser],
							["Status", asset?.statusLabel || asset?.status],
							["Marca", asset?.marca],
							["Modelo", asset?.modelo],
							["Número de série", asset?.numeroSerie],
							["Estado", asset?.estado],
						].map(([label, value]) => (
							<div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
								<p className="text-xs font-black uppercase text-slate-500">{label}</p>
								<p className="mt-1 text-sm font-black text-slate-950">{value || "-"}</p>
							</div>
						))}
					</div>
				)}
				<Link
					to={isKeyRecord ? ROUTES.FACILITIES_ACESSOS_CHAVES : ROUTES.FACILITIES_PATRIMONIO_INVENTARIO}
					className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-black text-white"
				>
					{isKeyRecord ? "Abrir Acessos & Chaves" : "Abrir Patrimônio"}
				</Link>
			</div>
		</div>
	);
}

function FacilitiesDetail({ section, dashboard, metrics }) {
	if (section.key === "visao-geral") {
		return <FacilitiesOverviewCockpit dashboard={dashboard} metrics={metrics} />;
	}

	if (section.key === "imoveis-espacos") {
		return <ImoveisSpacesPanel />;
	}

	if (section.key === "patrimonio-inventario") {
		return <PatrimonyInventoryPanel />;
	}

	if (section.key === "inventarios") {
		return <PatrimonyInventoryPanel standaloneInventory />;
	}

	if (section.key === "acessos-chaves") {
		return <AccessKeysPanel />;
	}

	if (section.key === "operacao-predial") {
		return <BuildingOperationPanel />;
	}

	if (section.key === "seguranca-conformidade") {
		return <SafetyCompliancePanel />;
	}

	if (section.key === "fornecedores-contratos") {
		return <SuppliersContractsPanel />;
	}

	if (section.key === "consumos") {
		return <ConsumptionPanel />;
	}

	if (section.key === "score") {
		return <FacilityScorePanel metrics={metrics} dashboard={dashboard} />;
	}

	return <ReportsPanel />;
}

function FacilitiesOverviewCockpit({ dashboard = {}, metrics = {} }) {
	const [unitFilter, setUnitFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const health = dashboard.health || {};
	const operations = dashboard.operations || {};
	const assets = dashboard.assetsSummary || {};
	const contracts = dashboard.contractsSummary || {};
	const costs = dashboard.costsSummary || {};
	const compliance = dashboard.complianceSummary || {};
	const recentActivity = dashboard.recentActivity || dashboard?.highlights?.ultimosItens || [];
	const attentionUnits = health.attentionUnits || [];
	const unitOptions = Array.from(new Set(attentionUnits.map((item) => item.unit).filter(Boolean))).slice(0, 40);
	const filteredAttentionUnits = attentionUnits.filter((item) => {
		if (unitFilter && item.unit !== unitFilter) return false;
		if (statusFilter && item.severity !== statusFilter) return false;
		return true;
	});
	const score = health.score || metrics.facilityScore || {};
	const scoreValue = Number(score.value ?? score.rawValue ?? 0);
	const criticalCount = Number(metrics.inventariosPendentes || 0) +
		Number(metrics.contratosVencendo || 0) +
		Number(metrics.documentosPendentes || 0) +
		Number(metrics.requisicoesPendentes || 0) +
		Number(dashboard?.kpis?.segurancaPendencias || 0) +
		Number(dashboard?.kpis?.consumosAnomalias || 0);
	const updatedAt = dashboard.generatedAt ? relativeDateTime(dashboard.generatedAt) : "Atualizado agora";
	const kpis = [
		{
			label: "Imóveis ativos",
			value: numberFormatter.format(metrics.imoveisAtivos),
			detail: "Unidades cadastradas",
			icon: Building2,
			tone: "blue",
			to: ROUTES.FACILITIES_IMOVEIS,
		},
		{
			label: "Contratos vencendo",
			value: numberFormatter.format(metrics.contratosVencendo),
			detail: "Próximos 45 dias",
			icon: FileText,
			tone: metrics.contratosVencendo > 0 ? "orange" : "emerald",
			to: ROUTES.FACILITIES_FORNECEDORES_CONTRATOS,
		},
		{
			label: "Ativos patrimoniais",
			value: numberFormatter.format(metrics.ativosPatrimoniais),
			detail: "Patrimônio controlado",
			icon: PackageSearch,
			tone: "violet",
			to: ROUTES.FACILITIES_PATRIMONIO_INVENTARIO,
		},
		{
			label: "Pendências críticas",
			value: numberFormatter.format(criticalCount),
			detail: "Itens que exigem atenção",
			icon: AlertTriangle,
			tone: criticalCount > 0 ? "red" : "emerald",
			to: ROUTES.FACILITIES_SCORE,
		},
		{
			label: "Saúde das unidades",
			value: scoreValue ? `${numberFormatter.format(scoreValue)}/100` : "--",
			detail: "Índice geral de Facilities",
			icon: Activity,
			tone: scoreValue >= 90 ? "emerald" : scoreValue >= 75 ? "blue" : scoreValue >= 60 ? "orange" : "red",
			to: ROUTES.FACILITIES_SCORE,
		},
	];
	const attentionItems = [
		{
			title: `${numberFormatter.format(metrics.inventariosPendentes)} inventário(s) pendente(s)`,
			description: metrics.inventariosPendentes ? "Unidades com inventário em aberto" : "Nenhuma ação necessária",
			count: metrics.inventariosPendentes,
			tone: "orange",
			to: ROUTES.FACILITIES_PATRIMONIO_INVENTARIO,
		},
		{
			title: `${numberFormatter.format(metrics.contratosVencendo)} contrato(s) próximos do vencimento`,
			description: metrics.contratosVencendo ? "Acompanhar renovação ou encerramento" : "Nenhuma ação necessária",
			count: metrics.contratosVencendo,
			tone: "orange",
			to: ROUTES.FACILITIES_FORNECEDORES_CONTRATOS,
		},
		{
			title: `${numberFormatter.format(metrics.documentosPendentes)} documento(s) pendente(s)`,
			description: metrics.documentosPendentes ? "Pendências documentais aguardando tratativa" : "Nenhuma ação necessária",
			count: metrics.documentosPendentes,
			tone: "blue",
			to: ROUTES.DOCUMENTOS_PENDENTES,
		},
		{
			title: `${numberFormatter.format(metrics.requisicoesPendentes)} requisição(ões) em andamento`,
			description: metrics.requisicoesPendentes ? "Pedidos ainda não finalizados" : "Nenhuma ação necessária",
			count: metrics.requisicoesPendentes,
			tone: "blue",
			to: ROUTES.INSUMOS_REQUISICOES,
		},
		{
			title: `${numberFormatter.format(dashboard?.kpis?.segurancaPendencias || 0)} item(ns) de conformidade`,
			description: dashboard?.kpis?.segurancaPendencias ? "Revisar segurança e documentação predial" : "Nenhuma ação necessária",
			count: Number(dashboard?.kpis?.segurancaPendencias || 0),
			tone: "red",
			to: ROUTES.FACILITIES_SEGURANCA_CONFORMIDADE,
		},
	];
	const quickLinks = [
		{ title: "Imóveis & Espaços", description: "Unidades, contratos e espaços administrativos.", icon: Building2, to: ROUTES.FACILITIES_IMOVEIS },
		{ title: "Patrimônio & Inventário", description: "Ativos, inventários e QR Codes.", icon: PackageSearch, to: ROUTES.FACILITIES_PATRIMONIO_INVENTARIO },
		{ title: "Acessos & Chaves", description: "Retirada, devolução e histórico de chaves.", icon: KeyRound, to: ROUTES.FACILITIES_ACESSOS_CHAVES },
		{ title: "Operação Predial", description: "Manutenção, checklists e ocorrências.", icon: Wrench, to: ROUTES.FACILITIES_OPERACAO_PREDIAL },
		{ title: "Segurança & Conformidade", description: "Laudos, inspeções e vencimentos.", icon: ShieldCheck, to: ROUTES.FACILITIES_SEGURANCA_CONFORMIDADE },
		{ title: "Fornecedores & Contratos", description: "Contratos, SLAs e fornecedores.", icon: FileText, to: ROUTES.FACILITIES_FORNECEDORES_CONTRATOS },
		{ title: "Consumos & Custos", description: "Utilidades, custos e variações.", icon: Zap, to: ROUTES.FACILITIES_CONSUMOS },
		{ title: "Saúde das Unidades", description: "Indicadores de risco e saúde operacional.", icon: Activity, to: ROUTES.FACILITIES_SCORE },
		{ title: "Relatórios", description: "Análises consolidadas de Facilities.", icon: BarChart3, to: ROUTES.FACILITIES_RELATORIOS },
	];

	return (
		<section className="space-y-5">
			<div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div>
						<h1 className="text-3xl font-black text-slate-950">Facilities</h1>
						<p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
							Gestão predial, patrimônio, contratos, acessos e conformidade das unidades administrativas.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Link to={ROUTES.INSUMOS_REQUISICOES} className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm hover:bg-blue-700">
							<Plus size={17} /> Nova requisição
						</Link>
						<Link to={ROUTES.FACILITIES_RELATORIOS} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
							<BarChart3 size={17} /> Relatórios
						</Link>
					</div>
				</div>
			</div>

			<div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:flex-row lg:items-center">
				<select className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 outline-none">
					<option>Todas as empresas</option>
				</select>
				<select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 outline-none">
					<option value="">Todas as unidades</option>
					{unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
				</select>
				<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 outline-none">
					<option value="">Todos os status</option>
					<option value="Crítica">Crítico</option>
					<option value="Alta">Alta</option>
					<option value="Média">Média</option>
					<option value="Baixa">Baixa</option>
				</select>
				<span className="inline-flex h-10 items-center rounded-xl bg-slate-50 px-3 text-xs font-black text-slate-500">{updatedAt}</span>
			</div>

			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
				{kpis.map((item) => <ExecutiveKpiCard key={item.label} {...item} />)}
			</div>

			<div className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
				<HealthOverviewCard health={health} score={score} />
				<AttentionUnitsCard items={filteredAttentionUnits.slice(0, 5)} total={filteredAttentionUnits.length} />
			</div>

			<AttentionCenter items={attentionItems} />

			<OperationsToday operations={operations} />

			<div className="grid gap-5 xl:grid-cols-2">
				<PatrimonySummary assets={assets} />
				<ContractsSummary contracts={contracts} />
			</div>

			<div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
				<CostsSummary costs={costs} />
				<ComplianceSummary compliance={compliance} />
			</div>

			<RecentActivityFeed items={recentActivity.slice(0, 8)} />

			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-black text-slate-950">Acesso rápido</h2>
				<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{quickLinks.map((item) => <QuickAccessCard key={item.title} {...item} />)}
				</div>
			</section>
		</section>
	);
}

function ExecutiveKpiCard({ label, value, detail, tone = "blue", icon: Icon, to }) {
	const toneClass = {
		blue: "border-blue-100 bg-blue-50 text-blue-700",
		emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
		orange: "border-orange-100 bg-orange-50 text-orange-700",
		red: "border-red-100 bg-red-50 text-red-700",
		violet: "border-violet-100 bg-violet-50 text-violet-700",
	}[tone] || "border-slate-100 bg-slate-50 text-slate-700";
	const content = (
		<>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-[11px] font-black uppercase text-slate-500">{label}</p>
					<p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
					<p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
				</div>
				<span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${toneClass}`}>
					<Icon size={19} />
				</span>
			</div>
		</>
	);
	if (!to) return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{content}</article>;
	return <Link to={to} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">{content}</Link>;
}

function HealthOverviewCard({ health = {}, score = {} }) {
	const scoreValue = Number(score.value ?? score.rawValue ?? 0);
	const label = score.label || (scoreValue >= 90 ? "Saudável" : scoreValue >= 75 ? "Estável" : scoreValue >= 60 ? "Atenção" : "Crítico");
	const percent = Math.max(0, Math.min(100, scoreValue));
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
				<div>
					<h2 className="text-lg font-black text-slate-950">Saúde das unidades</h2>
					<p className="mt-1 text-sm font-semibold text-slate-500">Índice de risco e acompanhamento operacional das unidades.</p>
					<div className="mt-5 flex items-end gap-2">
						<p className="text-5xl font-black text-slate-950">{scoreValue ? numberFormatter.format(scoreValue) : "--"}</p>
						<p className="pb-2 text-lg font-black text-slate-400">/ 100</p>
					</div>
					<span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black ${scoreValue >= 90 ? "bg-emerald-50 text-emerald-700" : scoreValue >= 60 ? "bg-orange-50 text-orange-700" : "bg-red-50 text-red-700"}`}>{label}</span>
				</div>
				<div className="min-w-0 flex-1 lg:max-w-md">
					<div className="h-3 overflow-hidden rounded-full bg-slate-100">
						<div className={`h-full rounded-full ${scoreValue >= 90 ? "bg-emerald-500" : scoreValue >= 60 ? "bg-orange-400" : "bg-red-500"}`} style={{ width: `${percent}%` }} />
					</div>
					<p className="mt-3 text-sm font-black text-slate-700">{numberFormatter.format(Number(health.unitsTotal || 0))} unidades monitoradas</p>
					<div className="mt-4 grid gap-2 sm:grid-cols-3">
						<StatusPill label="Saudáveis" value={health.unitsHealthy || 0} tone="emerald" />
						<StatusPill label="Atenção" value={health.unitsAttention || 0} tone="orange" />
						<StatusPill label="Críticas" value={health.unitsCritical || 0} tone="red" />
					</div>
				</div>
			</div>
		</section>
	);
}

function StatusPill({ label, value, tone }) {
	const className = {
		emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
		orange: "border-orange-100 bg-orange-50 text-orange-700",
		red: "border-red-100 bg-red-50 text-red-700",
	}[tone];
	return <div className={`rounded-2xl border px-3 py-2 ${className}`}><p className="text-lg font-black">{numberFormatter.format(Number(value || 0))}</p><p className="text-xs font-black">{label}</p></div>;
}

function AttentionUnitsCard({ items = [], total = 0 }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h2 className="text-lg font-black text-slate-950">Unidades que precisam de atenção</h2>
					<p className="mt-1 text-sm font-semibold text-slate-500">Prioridade por severidade.</p>
				</div>
				<Link to={ROUTES.FACILITIES_SCORE} className="text-xs font-black text-blue-700">Ver todas →</Link>
			</div>
			<div className="mt-4 space-y-2">
				{items.length ? items.map((item) => (
					<div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
						<div className="min-w-0">
							<p className="truncate text-sm font-black text-slate-950">{item.unit}</p>
							<p className="truncate text-xs font-semibold text-slate-500">{item.reason}</p>
						</div>
						<SeverityBadge severity={item.severity} />
					</div>
				)) : <PositiveEmptyState text="Nenhuma unidade com atenção no filtro atual." />}
			</div>
			{total > items.length ? <p className="mt-3 text-xs font-bold text-slate-500">+ {numberFormatter.format(total - items.length)} item(ns) no filtro atual.</p> : null}
		</section>
	);
}

function SeverityBadge({ severity = "Baixa" }) {
	const tone = severity === "Crítica" ? "bg-red-50 text-red-700" : severity === "Alta" ? "bg-orange-50 text-orange-700" : severity === "Média" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
	return <span className={`self-center rounded-full px-3 py-1 text-xs font-black ${tone}`}>{severity}</span>;
}

function PositiveEmptyState({ text }) {
	return <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700"><Check size={16} className="mr-2 inline" />{text}</div>;
}

function AttentionCenter({ items = [] }) {
	const sorted = [...items].sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<h2 className="text-lg font-black text-slate-950">Precisa da sua atenção</h2>
			<div className="mt-4 grid gap-3 xl:grid-cols-5">
				{sorted.map((item) => <AttentionAction key={item.title} item={item} />)}
			</div>
		</section>
	);
}

function AttentionAction({ item }) {
	const active = Number(item.count || 0) > 0;
	const toneClass = item.tone === "red" ? "border-red-100 bg-red-50" : item.tone === "orange" ? "border-orange-100 bg-orange-50" : "border-slate-100 bg-slate-50";
	return (
		<Link to={item.to} className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${active ? toneClass : "border-slate-100 bg-white"}`}>
			<div className="flex items-start gap-3">
				<span className={`mt-0.5 h-2.5 w-2.5 rounded-full ${active ? item.tone === "red" ? "bg-red-500" : "bg-orange-400" : "bg-emerald-500"}`} />
				<div className="min-w-0">
					<p className="text-sm font-black text-slate-950">{item.title}</p>
					<p className="mt-1 text-xs font-semibold text-slate-500">{item.description}</p>
				</div>
			</div>
		</Link>
	);
}

function OperationsToday({ operations = {} }) {
	const items = [
		{ label: "Ocorrências abertas", value: operations.openIncidents, icon: AlertTriangle, tone: operations.openIncidents ? "orange" : "slate" },
		{ label: "Manutenções programadas", value: operations.scheduledMaintenance, icon: Wrench, tone: "blue" },
		{ label: "Checklists atrasados", value: operations.overdueChecklists, icon: ClipboardCheck, tone: operations.overdueChecklists ? "red" : "slate" },
		{ label: "Requisições abertas", value: operations.openRequests, icon: FileText, tone: operations.openRequests ? "blue" : "slate" },
		{ label: "Chaves em uso", value: operations.keysInUse, icon: KeyRound, tone: operations.keysInUse ? "orange" : "slate" },
		{ label: "Inventários pendentes", value: operations.pendingInventories, icon: PackageSearch, tone: operations.pendingInventories ? "orange" : "slate" },
	];
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<h2 className="text-lg font-black text-slate-950">Operação hoje</h2>
			<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
				{items.map((item) => <MiniStat key={item.label} {...item} />)}
			</div>
		</section>
	);
}

function MiniStat({ label, value = 0, icon: Icon, tone = "slate" }) {
	const toneClass = {
		slate: "bg-slate-50 text-slate-600",
		blue: "bg-blue-50 text-blue-700",
		orange: "bg-orange-50 text-orange-700",
		red: "bg-red-50 text-red-700",
	}[tone];
	return <div className="rounded-2xl border border-slate-100 bg-white p-4"><div className="flex items-center justify-between gap-2"><p className="text-2xl font-black text-slate-950">{numberFormatter.format(Number(value || 0))}</p><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClass}`}><Icon size={17} /></span></div><p className="mt-2 text-xs font-black text-slate-500">{label}</p></div>;
}

function PatrimonySummary({ assets = {} }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div><h2 className="text-lg font-black text-slate-950">Patrimônio</h2><p className="text-sm font-semibold text-slate-500">Ativos, estoque e inventário.</p></div>
				<Link to={ROUTES.FACILITIES_PATRIMONIO_INVENTARIO} className="text-xs font-black text-blue-700">Abrir Patrimônio →</Link>
			</div>
			<div className="mt-4 grid gap-3 sm:grid-cols-3">
				<MetricLine label="Ativos cadastrados" value={assets.total} />
				<MetricLine label="Em uso" value={assets.inUse} />
				<MetricLine label="Em estoque" value={assets.stock} />
				<MetricLine label="Em manutenção" value={assets.maintenance} />
				<MetricLine label="Baixados" value={assets.decommissioned} />
				<MetricLine label="Sem inventário" value={assets.withoutInventory} tone={assets.withoutInventory ? "orange" : "slate"} />
			</div>
			{assets.categories?.length ? <BarList title="Ativos por categoria" items={assets.categories} /> : null}
		</section>
	);
}

function ContractsSummary({ contracts = {} }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div><h2 className="text-lg font-black text-slate-950">Contratos</h2><p className="text-sm font-semibold text-slate-500">Vigências e documentos contratuais.</p></div>
				<Link to={ROUTES.FACILITIES_FORNECEDORES_CONTRATOS} className="text-xs font-black text-blue-700">Ver contratos →</Link>
			</div>
			<div className="mt-4 grid gap-3 sm:grid-cols-3">
				<MetricLine label="Ativos" value={contracts.active} />
				<MetricLine label="Vencem em 30 dias" value={contracts.due30} tone={contracts.due30 ? "orange" : "slate"} />
				<MetricLine label="Vencem em 60 dias" value={contracts.due60} tone={contracts.due60 ? "orange" : "slate"} />
				<MetricLine label="Vencidos" value={contracts.expired} tone={contracts.expired ? "red" : "slate"} />
				<MetricLine label="Sem documento" value={contracts.withoutDocument} tone={contracts.withoutDocument ? "orange" : "slate"} />
				<MetricLine label="Aguardando renovação" value={contracts.awaitingRenewal} />
			</div>
		</section>
	);
}

function MetricLine({ label, value = 0, tone = "slate" }) {
	const toneClass = tone === "red" ? "text-red-700" : tone === "orange" ? "text-orange-700" : "text-slate-950";
	return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className={`text-xl font-black ${toneClass}`}>{numberFormatter.format(Number(value || 0))}</p><p className="mt-1 text-xs font-black text-slate-500">{label}</p></div>;
}

function BarList({ title, items = [] }) {
	const max = Math.max(...items.map((item) => Number(item.value || 0)), 1);
	return <div className="mt-5"><p className="text-sm font-black text-slate-950">{title}</p><div className="mt-3 space-y-2">{items.map((item) => <div key={item.label}><div className="mb-1 flex justify-between gap-3 text-xs font-black text-slate-600"><span className="truncate">{item.label}</span><span>{numberFormatter.format(Number(item.value || 0))}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(6, (Number(item.value || 0) / max) * 100)}%` }} /></div></div>)}</div></div>;
}

function CostsSummary({ costs = {} }) {
	const hasCosts = Number(costs.total || 0) > 0 || costs.evolution?.some((item) => Number(item.value || 0) > 0);
	const max = Math.max(...(costs.evolution || []).map((item) => Number(item.value || 0)), 1);
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div><h2 className="text-lg font-black text-slate-950">Custos de Facilities</h2><p className="text-sm font-semibold text-slate-500">Custo mensal e composição por tipo.</p></div>
				<Link to={ROUTES.FACILITIES_CONSUMOS} className="text-xs font-black text-blue-700">Ver consumos →</Link>
			</div>
			{hasCosts ? (
				<>
					<div className="mt-4 flex flex-wrap items-end gap-3">
						<p className="text-3xl font-black text-slate-950">{formatCurrency(costs.total)}</p>
						{costs.variationPercent !== null && costs.variationPercent !== undefined ? <span className={`mb-1 rounded-full px-3 py-1 text-xs font-black ${Number(costs.variationPercent) > 0 ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>{Number(costs.variationPercent) > 0 ? "+" : ""}{Number(costs.variationPercent).toFixed(1)}% vs. mês anterior</span> : null}
					</div>
					<div className="mt-5 flex h-36 items-end gap-2 rounded-2xl bg-slate-50 p-4">
						{(costs.evolution || []).map((item) => <div key={item.month} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-lg bg-blue-600" style={{ height: `${Math.max(6, (Number(item.value || 0) / max) * 112)}px` }} /><span className="text-[10px] font-black text-slate-500">{String(item.month || "").slice(5)}</span></div>)}
					</div>
					{costs.composition?.length ? <BarList title="Composição do mês" items={costs.composition} /> : null}
				</>
			) : <EmptyState title="Ainda não existem dados suficientes para análise de custos." description="Os custos aparecerão aqui após lançamentos de consumo ou encargos." />}
		</section>
	);
}

function ComplianceSummary({ compliance = {} }) {
	const regular = compliance.regularPercent;
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div><h2 className="text-lg font-black text-slate-950">Conformidade</h2><p className="text-sm font-semibold text-slate-500">Documentos, inspeções e vencimentos.</p></div>
				<Link to={ROUTES.FACILITIES_SEGURANCA_CONFORMIDADE} className="text-xs font-black text-blue-700">Ver conformidade →</Link>
			</div>
			<div className="mt-4">
				{regular !== null && regular !== undefined ? <p className="text-3xl font-black text-slate-950">{numberFormatter.format(Number(regular))}% regular</p> : <p className="text-sm font-black text-slate-500">Sem base suficiente para percentual geral.</p>}
			</div>
			<div className="mt-4 space-y-2">
				<CompactCheck label="AVCB vencidos" value={compliance.avcbExpired} />
				<CompactCheck label="Laudos vencidos" value={compliance.reportsExpired} />
				<CompactCheck label="Inspeções pendentes" value={compliance.inspectionsPending} />
				<CompactCheck label="Extintores vencendo" value={compliance.extinguishersDue} />
			</div>
		</section>
	);
}

function CompactCheck({ label, value = 0 }) {
	const active = Number(value || 0) > 0;
	return <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"><span className="text-sm font-black text-slate-700">{label}</span><span className={`rounded-full px-3 py-1 text-xs font-black ${active ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{numberFormatter.format(Number(value || 0))}</span></div>;
}

function RecentActivityFeed({ items = [] }) {
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div><h2 className="text-lg font-black text-slate-950">Atividade recente</h2><p className="text-sm font-semibold text-slate-500">Últimas movimentações operacionais de Facilities.</p></div>
				<Link to={ROUTES.FACILITIES_RELATORIOS} className="text-xs font-black text-blue-700">Ver histórico completo →</Link>
			</div>
			<div className="mt-4 space-y-2">
				{items.length ? items.map((item) => <ActivityRow key={`${item.tipo}-${item.id}`} item={item} />) : <EmptyState title="Nenhuma atividade recente." description="Eventos de patrimônio, chaves, contratos e operação aparecerão aqui." />}
			</div>
		</section>
	);
}

function ActivityRow({ item }) {
	const Icon = item.tipo === "Chave" ? KeyRound : item.tipo === "Contrato" ? FileText : item.tipo === "Consumo" ? Zap : item.tipo === "Manutenção" ? Wrench : item.tipo === "Ocorrência" ? AlertTriangle : PackageSearch;
	return <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={18} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-950">{item.titulo}</p><p className="truncate text-xs font-semibold text-slate-500">{item.subtitulo || item.tipo}</p></div><span className="shrink-0 text-xs font-black text-slate-400">{relativeDateTime(item.createdAt)}</span></div>;
}

function QuickAccessCard({ title, description, icon: Icon, to }) {
	return <Link to={to} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={18} /></span><div className="min-w-0"><p className="text-sm font-black text-slate-950 group-hover:text-blue-700">{title}</p><p className="mt-1 truncate text-xs font-semibold text-slate-500">{description}</p></div></div></Link>;
}

function FacilitiesOverviewSkeleton() {
	const block = "animate-pulse rounded-2xl bg-slate-100";
	return (
		<section className="space-y-5">
			<div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="space-y-3">
						<div className={`${block} h-8 w-44`} />
						<div className={`${block} h-4 w-full max-w-2xl`} />
					</div>
					<div className="flex gap-2">
						<div className={`${block} h-11 w-36`} />
						<div className={`${block} h-11 w-28`} />
					</div>
				</div>
			</div>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
				{Array.from({ length: 5 }).map((_, index) => <div key={index} className={`${block} h-32`} />)}
			</div>
			<div className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
				<div className={`${block} h-72`} />
				<div className={`${block} h-72`} />
			</div>
			<div className={`${block} h-36`} />
			<div className="grid gap-5 xl:grid-cols-2">
				<div className={`${block} h-72`} />
				<div className={`${block} h-72`} />
			</div>
		</section>
	);
}

function relativeDateTime(value) {
	if (!value) return "agora";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "agora";
	const diffMs = Date.now() - date.getTime();
	const minutes = Math.round(diffMs / 60000);
	if (minutes < 1) return "agora";
	if (minutes < 60) return `há ${minutes} min`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `há ${hours} h`;
	return date.toLocaleDateString("pt-BR");
}

export default function FacilitiesPage() {
	const location = useLocation();
	const activeSection = getSectionFromPath(location.pathname);
	const [loading, setLoading] = useState(true);
	const [dashboard, setDashboard] = useState({ kpis: {}, modules: [] });

	useEffect(() => {
		let active = true;
		obterDashboardFacilities()
			.then((dashboardData) => {
				if (!active) return;
				setDashboard(dashboardData || { kpis: {}, modules: [] });
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	const metrics = useMemo(() => {
		return {
			imoveisAtivos: Number(dashboard?.kpis?.imoveisAtivos || 0),
			ativosPatrimoniais: Number(dashboard?.kpis?.ativosPatrimoniais || 0),
			inventariosPendentes: Number(dashboard?.kpis?.inventariosPendentes || 0),
			contratosVencendo: Number(dashboard?.kpis?.contratosVencendo || 0),
			documentosPendentes: Number(dashboard?.kpis?.documentosPendentes || 0),
			requisicoesPendentes: Number(dashboard?.kpis?.requisicoesPendentes || 0),
			facilityScore: dashboard?.kpis?.facilityScore || null,
		};
	}, [dashboard]);
	const showGlobalOverview = activeSection.key === "visao-geral";

	return (
		<div className="space-y-6">
			{loading && showGlobalOverview ? <FacilitiesOverviewSkeleton /> : null}

			{loading && showGlobalOverview ? null : <FacilitiesDetail
				section={activeSection}
				dashboard={dashboard}
				metrics={metrics}
			/>}
		</div>
	);
}
