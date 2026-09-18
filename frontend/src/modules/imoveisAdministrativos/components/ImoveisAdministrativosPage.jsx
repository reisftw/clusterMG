import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
	ArrowLeft,
	AlertTriangle,
	BarChart3,
	Building2,
	CalendarClock,
	Car,
	ChevronDown,
	Download,
	FileText,
	FolderPlus,
	History,
	Home,
	Loader2,
	MapPin,
	MessageCircle,
	PieChart,
	Plus,
	RefreshCw,
	Save,
	Search,
	Settings,
	Trash2,
	Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import ModalShell from "../../../components/ui/ModalShell";
import { hasPermission } from "../../../constants/roles";
import { useAuthContext } from "../../../context/AuthContext";
import { addClusterLogo, addPdfImageContained } from "../../../utils/pdfBranding";
import {
	editarContratoImovel,
	enviarAditivoImovel,
	enviarAnexoImovel,
	enviarContratoImovel,
	excluirContratoImovel,
	excluirImoveisMassa,
	excluirImovel,
	garantirPastaImovel,
	importarImoveis,
	listarImoveis,
	obterDashboardImoveis,
	obterConfigImoveis,
	obterRegistrosImovel,
	obterRelatoriosImoveis,
	registrarAluguelImovel,
	registrarIptuImovel,
	registrarReajusteImovel,
	salvarConfigImoveis,
	salvarImovel,
} from "../services/imoveisAdministrativosService";
import {
	calculateLocalReport,
	formatCurrency,
	formatDate,
	getMapsLinks,
} from "../utils/imoveisReports";

const EMPTY_FORM = {
	seniorId: "",
	nome: "",
	base: "sempre",
	cnpjCpf: "",
	classificacao: "",
	diretoria: "",
	nomeSite: "",
	siteDso: "",
	pessoaReferencia: "",
	contatoPessoaReferencia: "",
	energiaValorMedio: "",
	energiaCodigoCliente: "",
	aguaValorMedio: "",
	aguaCodigoCliente: "",
	posicoesTrabalho: "",
	quantidadeColaboradores: "",
	situacao: "",
	ativo: true,
	dataInativacao: "",
	motivoInativacao: "",
	tipoContrato: "proprio",
	valorOriginal: "",
	valorAluguel: "",
	valorM2: "",
	vencimentoAluguelDia: "10",
	mesReajuste: "",
	indiceReajuste: "",
	proprietarioNome: "",
	proprietarioTelefone: "",
	proprietarioEmail: "",
	proprietarioContatos: "",
	contratoInicio: "",
	contratoFim: "",
	cep: "",
	estado: "",
	cidade: "",
	bairro: "",
	rua: "",
	numero: "",
	endereco: "",
	mapsUrl: "",
	streetViewUrl: "",
	estacionamento: false,
	temEstacionamento: false,
	vagas: "",
	placas: "",
	metrosQuadrados: "",
	seguroTipo: "",
	seguroValorMensal: "",
	seguroVencimento: "",
	linkApolice: "",
	vigilanciaContratoLink: "",
	vigilanciaValorMensal: "",
	limpezaContrato: "",
	limpezaValorMedio: "",
	ppciLink: "",
	ppciVencimento: "",
	avcbLink: "",
	avcbVencimento: "",
	linkContratoOriginal: "",
	observacao: "",
	dataUltimoReajuste: "",
};

const DEFAULT_CONFIG = {
	empresas: ["SEMPRE", "ONNET"],
	classificacoes: [
		"ADMINISTRATIVO",
		"SITE/POP",
		"TORRE",
		"LOJA",
		"ESTACIONAMENTO",
	],
	diretorias: ["DSO", "ADMINISTRATIVO", "COMERCIAL", "FINANCEIRO", "OPERAÇÕES"],
	imoveisRootFolderId: "",
};

const CURRENT_YEAR = String(new Date().getFullYear());
const CURRENT_MONTH = String(new Date().getMonth() + 1).padStart(2, "0");

const formatPercent = (value) =>
	`${Number(value || 0).toLocaleString("pt-BR", {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	})}%`;

function toFormData(imovel = {}) {
	const hasParking = Boolean(imovel.estacionamento || imovel.temEstacionamento);
	return {
		...EMPTY_FORM,
		...imovel,
		ativo: imovel.ativo !== false,
		estacionamento: hasParking,
		temEstacionamento: hasParking,
		valorAluguel: imovel.valorAluguel || "",
		vencimentoAluguelDia: imovel.vencimentoAluguelDia || "10",
		placas: Array.isArray(imovel.placas)
			? imovel.placas.join(", ")
			: imovel.placas || "",
	};
}

function composeEndereco(form = {}) {
	const ruaNumero = [form.rua, form.numero].filter(Boolean).join(", ");
	return [
		ruaNumero,
		form.bairro,
		form.cidade,
		form.estado,
		form.cep ? `CEP: ${form.cep}` : "",
	]
		.filter(Boolean)
		.join(" - ");
}

function onlyDigits(value) {
	return String(value || "").replace(/\D/g, "");
}

function formatPhone(value) {
	const digits = onlyDigits(value).slice(0, 11);
	if (digits.length <= 2) return digits;
	if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
	if (digits.length <= 10)
		return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
	return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function parseMoneyValue(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const normalized = String(value || "")
		.replace(/[^\d,.-]/g, "")
		.replace(/\.(?=\d{3}(?:\D|$))/g, "")
		.replace(",", ".");
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : 0;
}

function calculateCostPerParkingSpot(imovel = {}) {
	if (!imovel.estacionamento && !imovel.temEstacionamento) return null;
	const rentValue = parseMoneyValue(imovel.valorAluguel);
	const spots = Number(imovel.vagas || 0);
	if (!rentValue || !spots) return null;
	return rentValue / spots;
}

function splitLines(value) {
	return String(value || "")
		.split(/\r?\n|;/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function rowsFromWorkbook(workbook) {
	const normalize = (value) =>
		String(value || "")
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^\w]+/g, " ")
			.trim()
			.toLowerCase();
	const mapping = {
		"codigo empresa": "base",
		"cnpj cfp": "cnpjCpf",
		ocupacao: "classificacao",
		"nome do site": "nomeSite",
		"pessoa referencia no endereco": "pessoaReferencia",
		"contato da pessoa referencia": "contatoPessoaReferencia",
		"posicoes de trabalho": "posicoesTrabalho",
		"quantidade de colaboradores por cidade": "quantidadeColaboradores",
		situacao: "situacao",
		encerramento: "encerramento",
		cidade: "cidade",
		estado: "estado",
		endereco: "endereco",
		proprietario: "proprietarioNome",
		"contato do locador e mail e telefone": "proprietarioContatos",
		"link do contrato": "linkContratoOriginal",
		vigencia: "contratoInicio",
		"final da vigencia": "contratoFim",
		m2: "metrosQuadrados",
		"valor por m2": "valorM2",
		"valor original": "valorOriginal",
		"valor aluguel": "valorAluguel",
		"mes do reajuste": "mesReajuste",
		"mes em que foi feito ultimo reajuste": "dataUltimoReajuste",
		"indice de reajuste": "indiceReajuste",
		"forma de pagamento": "formaPagamento",
		"dia de pagamento": "vencimentoAluguelDia",
		seguro: "seguroTipo",
		"link da apolice": "linkApolice",
		"link do contrato de vigilancia": "vigilanciaContratoLink",
		"vigilancia valor mensal": "vigilanciaValorMensal",
		"limpeza contrato": "limpezaContrato",
		"limpeza valor medio": "limpezaValorMedio",
		"link do ppci": "ppciLink",
		"ppci vencimento": "ppciVencimento",
		"avcb vencimento": "avcbVencimento",
		"link do alvara funcionamento": "alvaraFuncionamentoLink",
		"vencimento do alvara funcionamento": "alvaraFuncionamentoVencimento",
		"responsaveis pelo iptu": "iptuResponsavel",
		"link do iptu": "iptuLink",
		"iptu valor pago 2025": "iptuValorPago2025",
		"iptu valor pago 2026": "iptuValorPago2026",
		"conta de energia valor medio": "energiaValorMedio",
		"codigo de cliente de energia": "energiaCodigoCliente",
		"conta de agua valor medio": "aguaValorMedio",
		"codigo do cliente conta de agua": "aguaCodigoCliente",
		"conferido patrocinio": "conferidoPatrocinio",
	};
	const moneyFields = new Set([
		"valorM2",
		"valorOriginal",
		"valorAluguel",
		"vigilanciaValorMensal",
		"limpezaValorMedio",
		"iptuValorPago2025",
		"iptuValorPago2026",
		"energiaValorMedio",
		"aguaValorMedio",
	]);
	const numericFields = new Set([
		"posicoesTrabalho",
		"quantidadeColaboradores",
		"metrosQuadrados",
	]);
	const dateFields = new Set([
		"encerramento",
		"contratoInicio",
		"contratoFim",
		"dataUltimoReajuste",
		"ppciVencimento",
		"avcbVencimento",
		"alvaraFuncionamentoVencimento",
	]);
	const normalizeMoney = (value) => {
		if (value === null || value === undefined || value === "") return "";
		if (typeof value === "number") return Number.isFinite(value) ? value : "";
		let raw = String(value).trim();
		if (!raw || /^nao possui$/i.test(raw) || /^não possui$/i.test(raw)) return "";
		raw = raw.replace(/[R$\s]/g, "");
		const hasComma = raw.includes(",");
		const hasDot = raw.includes(".");
		if (hasComma) raw = raw.replace(/\./g, "").replace(",", ".");
		else if (hasDot) {
			const dotParts = raw.split(".");
			const last = dotParts.at(-1) || "";
			raw = last.length === 3 && dotParts.length > 1 ? raw.replace(/\./g, "") : raw;
		}
		const parsed = Number(raw.replace(/[^\d.-]/g, ""));
		return Number.isFinite(parsed) ? parsed : "";
	};
	const normalizeCellValue = (field, value) => {
		if (moneyFields.has(field)) return normalizeMoney(value);
		if (numericFields.has(field)) return normalizeMoney(value);
		if (dateFields.has(field)) {
			if (value instanceof Date && !Number.isNaN(value.getTime())) {
				return value.toISOString().slice(0, 10);
			}
		}
		return value;
	};
	const cellAddress = (rowNumber, columnNumber) =>
		XLSX.utils.encode_cell({ r: rowNumber - 1, c: columnNumber - 1 });
	const getCellValue = (sheet, rowNumber, columnNumber) => {
		const cell = sheet[cellAddress(rowNumber, columnNumber)];
		const target = cell?.l?.Target || cell?.l?.target || "";
		return target || cell?.v || "";
	};
	const targetSheetName = workbook.SheetNames.find((sheetName) =>
		normalize(sheetName).includes("relacao de imoveis clusters"),
	);
	const sheetNames = targetSheetName
		? [targetSheetName]
		: workbook.SheetNames.filter((sheetName) => !normalize(sheetName).includes("mapa"));
	const items = [];
	sheetNames.forEach((sheetName) => {
		const sheet = workbook.Sheets[sheetName];
		const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
		const headers = [];
		for (let column = range.s.c; column <= range.e.c; column += 1) {
			const header = getCellValue(sheet, range.s.r + 1, column + 1);
			headers[column] = mapping[normalize(header)] || null;
		}
		for (let row = range.s.r + 2; row <= range.e.r + 1; row += 1) {
			const item = { origemPlanilha: sheetName };
			headers.forEach((field, columnIndex) => {
				if (!field) return;
				const value = normalizeCellValue(field, getCellValue(sheet, row, columnIndex + 1));
				if (value !== "" && value !== null && value !== undefined) item[field] = value;
			});
			if (!item.endereco && !item.nomeSite && !item.proprietarioNome) continue;
			const key = [item.base, item.cidade, item.endereco || item.nomeSite || row]
				.filter(Boolean)
				.join("-");
			item.seniorId = String(item.seniorId || key).slice(0, 120);
			item.nome = item.nomeSite || item.endereco || `Imóvel ${item.seniorId}`;
			item.tipoContrato = Number(item.valorAluguel || 0) > 0 ? "alugado" : "proprio";
			item.ativo = !["inativo", "cancelado", "encerrado"].includes(
				String(item.situacao || "").trim().toLowerCase(),
			);
			items.push(item);
		}
	});
	return items;
}
function getWhatsappUrl(value) {
	const digits = onlyDigits(value);
	if (digits.length < 10) return "";
	const phone = digits.startsWith("55") ? digits : `55${digits}`;
	return `https://wa.me/${phone}`;
}

function formatPhoneInput(value) {
	return formatPhone(value);
}

function driveFileUrl(fileId) {
	return fileId ? `https://drive.google.com/file/d/${fileId}/view` : "";
}

function Field({ label, children }) {
	return (
		<label className="space-y-1">
			<span className="text-xs font-black uppercase tracking-wide text-slate-500">
				{label}
			</span>
			{children}
		</label>
	);
}

function inputClass(extra = "") {
	return `w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 ${extra}`;
}

function ActionButton({
	children,
	className = "",
	icon: Icon,
	tone = "blue",
	loading = false,
	...props
}) {
	const tones = {
		blue: "bg-blue-600 text-white hover:bg-blue-700",
		green: "bg-emerald-600 text-white hover:bg-emerald-700",
		slate: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
		orange: "bg-orange-500 text-white hover:bg-orange-600",
	};
	return (
		<button
			type="button"
			className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${tones[tone] || tones.blue} ${className}`}
			disabled={loading || props.disabled}
			{...props}
		>
			{loading ? (
				<Loader2 size={16} className="animate-spin" />
			) : Icon ? (
				<Icon size={16} />
			) : null}
			{children}
		</button>
	);
}

function StatCard({ icon: Icon, label, value, hint, tone = "blue" }) {
	const tones = {
		blue: "bg-blue-50 text-blue-700",
		green: "bg-emerald-50 text-emerald-700",
		orange: "bg-orange-50 text-orange-700",
		slate: "bg-slate-100 text-slate-700",
	};
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
				<div className="min-w-0">
					<p className="text-xs font-black uppercase tracking-wide text-slate-500">
						{label}
					</p>
					<p className="mt-2 whitespace-nowrap text-[clamp(0.95rem,1.05vw,1.5rem)] font-black leading-tight text-slate-950">{value}</p>
					{hint ? (
						<p className="mt-1 text-xs font-semibold text-slate-500">{hint}</p>
					) : null}
				</div>
				<span className={`shrink-0 rounded-xl p-3 ${tones[tone] || tones.blue}`}>
					<Icon size={20} />
				</span>
			</div>
		</div>
	);
}

async function generatePdf(relatorio, filtro) {
	const pdf = new jsPDF({ unit: "pt", format: "a4" });
	const margin = 36;
	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(18);
	pdf.text("Relatório de Imóveis", margin, 40);
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(10);
	pdf.text(
		`Período: ${filtro.mes || "Todos os meses"}/${filtro.ano || "Todos os anos"}`,
		margin,
		58,
	);
	await addClusterLogo(pdf, { width: 76, height: 38, y: 22, marginRight: 36 });

	autoTable(pdf, {
		startY: 78,
		head: [["Indicador", "Valor"]],
		body: [
			["Imóveis cadastrados", relatorio?.resumo?.totalImoveis || 0],
			["Imóveis ativos", relatorio?.resumo?.ativos || 0],
			["Imóveis alugados", relatorio?.resumo?.alugados || 0],
			["Gasto com IPTU", formatCurrency(relatorio?.resumo?.gastosIptu || 0)],
			[
				"Gasto com aluguel",
				formatCurrency(relatorio?.resumo?.gastosAluguel || 0),
			],
		],
		styles: { font: "helvetica", fontSize: 9 },
		headStyles: { fillColor: [37, 99, 235] },
	});

	const tables = [
		[
			"Contratos próximos do vencimento",
			relatorio?.contratosProximos || [],
			["seniorId", "proprietarioNome", "contratoFim"],
		],
		[
			"Contratos finalizados no mês",
			relatorio?.contratosFinalizados || [],
			["seniorId", "proprietarioNome", "contratoFim"],
		],
		[
			"IPTU próximo do vencimento",
			relatorio?.iptuProximo || [],
			["imovelId", "valor", "vencimento"],
		],
		[
			"Aluguel próximo do vencimento",
			relatorio?.aluguelProximo || [],
			["seniorId", "valorAluguel", "vencimentoAluguel"],
		],
	];

	tables.forEach(([title, rows, keys]) => {
		const startY = (pdf.lastAutoTable?.finalY || 90) + 28;
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(12);
		pdf.text(title, margin, startY);
		autoTable(pdf, {
			startY: startY + 8,
			head: [keys],
			body: rows.map((row) => keys.map((key) => row[key] || "-")),
			styles: { font: "helvetica", fontSize: 8 },
			headStyles: { fillColor: [15, 23, 42] },
			margin: { left: margin, right: margin },
		});
	});

	pdf.save(
		`relatorio-imoveis-${filtro.ano || "todos"}-${filtro.mes || "todos"}.pdf`,
	);
}

// Extraido do componente (achado javascript:S3776, docs/SONARQUBE-MAP.md)
// pra reduzir a complexidade cognitiva da funcao de render — mesmo
// estado, mesmos efeitos e mesmos handlers, sem mudanca de comportamento.
function useImoveisAdministrativosController(page) {
	const navigate = useNavigate();
	const { id: routeImovelId } = useParams();
	const { currentUser } = useAuthContext();
	const [tab, setTab] = useState(page);
	const [imoveis, setImoveis] = useState([]);
	const [selectedId, setSelectedId] = useState("");
	const [form, setForm] = useState(EMPTY_FORM);
	const [registros, setRegistros] = useState(null);
	const [relatorio, setRelatorio] = useState(null);
	const [dashboardRelatorio, setDashboardRelatorio] = useState(null);
	const [dashboardDados, setDashboardDados] = useState(null);
	const [filtroRelatorio, setFiltroRelatorio] = useState({
		mes: CURRENT_MONTH,
		ano: CURRENT_YEAR,
	});
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [config, setConfig] = useState(DEFAULT_CONFIG);
	const [configOpen, setConfigOpen] = useState(false);
	const [configDraft, setConfigDraft] = useState(DEFAULT_CONFIG);
	const [importFile, setImportFile] = useState(null);
	const [importResult, setImportResult] = useState(null);
	const [aluguelModalOpen, setAluguelModalOpen] = useState(false);
	const [aguaEnergiaModalOpen, setAguaEnergiaModalOpen] = useState(false);
	const [quickModalSave, setQuickModalSave] = useState(false);
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [deleteSelection, setDeleteSelection] = useState([]);
	const [relatoriosModalOpen, setRelatoriosModalOpen] = useState(false);
	const [reajuste, setReajuste] = useState({
		valorNovo: "",
		data: "",
		observacao: "",
		file: null,
	});
	const [iptu, setIptu] = useState({
		valor: "",
		vencimento: "",
		mes: CURRENT_MONTH,
		ano: CURRENT_YEAR,
		pago: false,
		observacao: "",
		file: null,
	});
	const [aluguel, setAluguel] = useState({
		valor: "",
		vencimento: "",
		mes: CURRENT_MONTH,
		ano: CURRENT_YEAR,
		pago: false,
		observacao: "",
	});
	const [anexo, setAnexo] = useState({
		categoria: "foto",
		tipo: "foto",
		observacao: "",
		file: null,
	});
	const [aditivo, setAditivo] = useState({
		nome: "",
		data: "",
		observacao: "",
		file: null,
	});
	const [contratoFile, setContratoFile] = useState(null);
	const [placasModalOpen, setPlacasModalOpen] = useState(false);
	const [placasDraft, setPlacasDraft] = useState("");

	const selected = useMemo(
		() => imoveis.find((item) => item.id === selectedId) || null,
		[imoveis, selectedId],
	);
	const podeGerenciar = hasPermission(
		currentUser?.role,
		"manage_imoveis_administrativos",
	);

	const localReport = useMemo(
		() =>
			calculateLocalReport({
				imoveis,
				iptus: registros?.iptus || [],
				alugueis: registros?.alugueis || [],
				reajustes: registros?.reajustes || [],
			}),
		[imoveis, registros],
	);

	async function carregar() {
		setLoading(true);
		setMessage("");
		try {
			const [items, monthReport, propertyDashboard] = await Promise.all([
				listarImoveis(),
				obterRelatoriosImoveis({ mes: CURRENT_MONTH, ano: CURRENT_YEAR }).catch(
					() => null,
				),
				obterDashboardImoveis().catch(() => null),
			]);
			setImoveis(items);
			setDashboardRelatorio(monthReport);
			setDashboardDados(propertyDashboard);
			const preferredId = page === "detalhe" ? routeImovelId : selectedId;
			if (preferredId) {
				setSelectedId(preferredId);
			} else if (page !== "cadastro" && items[0]?.id) {
				setSelectedId(items[0].id);
			} else {
				setSelectedId("");
			}
		} catch (error) {
			setMessage(error?.message || "Não foi possível carregar os imóveis.");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		carregar();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		setTab(page === "relatorios" ? "dashboard" : page);
		if (page === "relatorios") setRelatoriosModalOpen(true);
		if (page === "detalhe" && routeImovelId) {
			setSelectedId(routeImovelId);
		}
	}, [page, routeImovelId]);

	useEffect(() => {
		if (!selected) return;
		setForm(toFormData(selected));
		obterRegistrosImovel(selected.id)
			.then(setRegistros)
			.catch(() => setRegistros(null));
	}, [selected]);

	useEffect(() => {
		obterConfigImoveis()
			.then((data) => {
				const next = { ...DEFAULT_CONFIG, ...data };
				setConfig(next);
				setConfigDraft(next);
			})
			.catch(() => {});
	}, []);

	async function carregarRelatorio() {
		setLoading(true);
		setMessage("");
		try {
			setRelatorio(await obterRelatoriosImoveis(filtroRelatorio));
		} catch (error) {
			setMessage(error?.message || "Não foi possível carregar o relatório.");
		} finally {
			setLoading(false);
		}
	}

	async function handleSave() {
		setSaving(true);
		setMessage("");
		try {
			const endereco = composeEndereco(form) || form.endereco;
			const maps = getMapsLinks(endereco);
			const imovel = await salvarImovel({
				...form,
				...(form.tipoContrato === "alugado"
					? {}
					: {
							valorAluguel: "",
							vencimentoAluguelDia: "",
							proprietarioNome: "",
							proprietarioTelefone: "",
							proprietarioEmail: "",
							proprietarioContatos: "",
							contratoInicio: "",
							contratoFim: "",
							dataUltimoReajuste: "",
						}),
				...(form.estacionamento ? {} : { vagas: "", placas: "" }),
				endereco,
				mapsUrl: form.mapsUrl || maps.mapsUrl,
				streetViewUrl: form.streetViewUrl || maps.streetViewUrl,
			});
			await carregar();
			setSelectedId(imovel?.id || imovel?.seniorId || form.seniorId);
			setMessage("Imóvel salvo com sucesso.");
		} catch (error) {
			setMessage(error?.message || "Falha ao salvar imóvel.");
		} finally {
			setSaving(false);
		}
	}

	async function refreshSelectedRecords() {
		if (!selectedId) return;
		setRegistros(await obterRegistrosImovel(selectedId));
	}

	async function submitRelated(action, payload, successMessage) {
		if (!selectedId) return;
		setSaving(true);
		setMessage("");
		try {
			await action(selectedId, payload);
			await refreshSelectedRecords();
			await carregar();
			setMessage(successMessage);
		} catch (error) {
			setMessage(error?.message || "Não foi possível salvar o registro.");
		} finally {
			setSaving(false);
		}
	}

	async function handleSalvarConfig() {
		setSaving(true);
		setMessage("");
		try {
			const next = await salvarConfigImoveis({
				empresas: splitLines(
					configDraft.empresasText || configDraft.empresas?.join("\n"),
				),
				classificacoes: splitLines(
					configDraft.classificacoesText ||
						configDraft.classificacoes?.join("\n"),
				),
				diretorias: splitLines(
					configDraft.diretoriasText || configDraft.diretorias?.join("\n"),
				),
				imoveisRootFolderId: configDraft.imoveisRootFolderId || "",
			});
			setConfig({ ...DEFAULT_CONFIG, ...next });
			setConfigDraft({ ...DEFAULT_CONFIG, ...next });
			setMessage("Configurações de imóveis salvas.");
		} catch (error) {
			setMessage(error?.message || "Não foi possível salvar as configurações.");
		} finally {
			setSaving(false);
		}
	}

	async function handleImportarPlanilha({ limparAntes = false } = {}) {
		if (!importFile) {
			setMessage("Selecione uma planilha XLSX.");
			return;
		}
		if (
			limparAntes &&
			!window.confirm(
				"Isso vai apagar todos os imóveis atuais e importar somente a aba RELAÇÃO DE IMÓVEIS - CLUSTERS do arquivo selecionado. Deseja continuar?",
			)
		) {
			return;
		}
		setSaving(true);
		setMessage("");
		setImportResult(null);
		try {
			const buffer = await importFile.arrayBuffer();
			const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
			const items = rowsFromWorkbook(workbook);
			if (!items.length) throw new Error("A planilha não possui imóveis válidos na aba CLUSTERS.");
			const result = await importarImoveis(items, { limparAntes });
			setImportResult(result);
			await carregar();
			setMessage(
				`${limparAntes ? "Base substituída" : "Importação concluída"}: ${result.criados || 0} criado(s), ${result.atualizados || 0} atualizado(s).`,
			);
		} catch (error) {
			setMessage(error?.message || "Não foi possível importar a planilha.");
		} finally {
			setSaving(false);
		}
	}

	async function handleEditarContrato(contrato) {
		if (!selectedId || !contrato?.id) return;
		const nome = window.prompt(
			"Informe o novo nome do contrato:",
			contrato.nome || "Contrato",
		);
		if (!nome || nome.trim() === contrato.nome) return;
		setSaving(true);
		setMessage("");
		try {
			await editarContratoImovel(selectedId, contrato.id, { nome });
			await refreshSelectedRecords();
			setMessage("Contrato atualizado com sucesso.");
		} catch (error) {
			setMessage(error?.message || "Não foi possível editar o contrato.");
		} finally {
			setSaving(false);
		}
	}

	async function handleExcluirContrato(contrato) {
		if (!selectedId || !contrato?.id) return;
		const confirmar = window.confirm(
			`Excluir o contrato "${contrato.nome || contrato.id}"?`,
		);
		if (!confirmar) return;
		setSaving(true);
		setMessage("");
		try {
			await excluirContratoImovel(selectedId, contrato.id);
			await refreshSelectedRecords();
			setMessage("Contrato excluído com sucesso.");
		} catch (error) {
			setMessage(error?.message || "Não foi possível excluir o contrato.");
		} finally {
			setSaving(false);
		}
	}

	async function handleExcluirImovel(id) {
		if (!id) return;
		const imovel = imoveis.find(
			(item) => item.id === id || item.seniorId === id,
		);
		const label = imovel?.nome || imovel?.seniorId || id;
		const confirmar = window.confirm(
			`Excluir o imóvel "${label}" e todos os registros vinculados?`,
		);
		if (!confirmar) return;
		setSaving(true);
		setMessage("");
		try {
			await excluirImovel(id);
			setSelectedId("");
			setRegistros(null);
			await carregar();
			setTab("dashboard");
			setMessage("Imóvel excluído com sucesso.");
		} catch (error) {
			setMessage(error?.message || "Não foi possível excluir o imóvel.");
		} finally {
			setSaving(false);
		}
	}

	async function handleExcluirSelecionados() {
		if (!deleteSelection.length) {
			setMessage("Selecione ao menos um imóvel.");
			return;
		}
		const confirmar = window.confirm(
			`Excluir ${deleteSelection.length} imóvel(is) selecionado(s) e seus registros vinculados?`,
		);
		if (!confirmar) return;
		setSaving(true);
		setMessage("");
		try {
			const result = await excluirImoveisMassa(deleteSelection);
			setDeleteSelection([]);
			setDeleteModalOpen(false);
			setSelectedId("");
			setRegistros(null);
			await carregar();
			setTab("dashboard");
			setMessage(
				`Exclusão concluída: ${result.deleted?.length || 0} imóvel(is) excluído(s).`,
			);
		} catch (error) {
			setMessage(
				error?.message || "Não foi possível excluir os imóveis selecionados.",
			);
		} finally {
			setSaving(false);
		}
	}

	const imoveisHistorico = imoveis.filter((item) => item.ativo === false);
	const placasList = String(form.placas || "")
		.split(/[,;\n]/)
		.map((placa) => placa.trim().toUpperCase())
		.filter(Boolean);
	const isDetalhePage = tab === "detalhe";
	return {
	navigate,
	tab,
	setTab,
	imoveis,
	setImoveis,
	selectedId,
	setSelectedId,
	form,
	setForm,
	registros,
	setRegistros,
	relatorio,
	setRelatorio,
	dashboardRelatorio,
	setDashboardRelatorio,
	filtroRelatorio,
	setFiltroRelatorio,
	loading,
	setLoading,
	saving,
	setSaving,
	message,
	setMessage,
	config,
	setConfig,
	configOpen,
	setConfigOpen,
	configDraft,
	setConfigDraft,
	importFile,
	setImportFile,
	importResult,
	setImportResult,
	aluguelModalOpen,
	setAluguelModalOpen,
	aguaEnergiaModalOpen,
	setAguaEnergiaModalOpen,
	quickModalSave,
	setQuickModalSave,
	deleteModalOpen,
	setDeleteModalOpen,
	deleteSelection,
	setDeleteSelection,
	relatoriosModalOpen,
	setRelatoriosModalOpen,
	reajuste,
	setReajuste,
	iptu,
	setIptu,
	aluguel,
	setAluguel,
	anexo,
	setAnexo,
	aditivo,
	setAditivo,
	contratoFile,
	setContratoFile,
	placasModalOpen,
	setPlacasModalOpen,
	placasDraft,
	setPlacasDraft,
	selected,
	podeGerenciar,
	localReport,
	carregar,
	carregarRelatorio,
	handleSave,
	refreshSelectedRecords,
	submitRelated,
	handleSalvarConfig,
	handleImportarPlanilha,
	handleEditarContrato,
	handleExcluirContrato,
	handleExcluirImovel,
	handleExcluirSelecionados,
	imoveisHistorico,
	placasList,
	isDetalhePage,
	};
}

// Extraido de ImoveisAdministrativosPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — aba de cadastro/edicao de imovel, mesma JSX de
// antes, sem mudanca de comportamento.
// Extraidos de ImovelCadastroTab (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — 3 blocos condicionais pequenos do formulario,
// mesma JSX/logica de antes.
function ImovelInativacaoFields({ form, setForm }) {
	if (form.ativo !== false) return null;
	return (
		<div className="grid gap-4 rounded-2xl border border-red-100 bg-red-50/40 p-4 md:grid-cols-2">
			<Field label="Data de inativação">
				<input
					type="date"
					className={inputClass()}
					value={form.dataInativacao}
					onChange={(e) =>
						setForm((cur) => ({ ...cur, dataInativacao: e.target.value }))
					}
				/>
			</Field>
			<Field label="Motivo da inativação">
				<input
					className={inputClass()}
					value={form.motivoInativacao}
					onChange={(e) =>
						setForm((cur) => ({ ...cur, motivoInativacao: e.target.value }))
					}
				/>
			</Field>
		</div>
	);
}

function ImovelAluguelTeaser({ form, setAluguelModalOpen }) {
	if (form.tipoContrato !== "alugado") return null;
	return (
		<div className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-orange-50/40 p-4 md:flex-row md:items-center md:justify-between">
			<div>
				<p className="text-sm font-black uppercase tracking-wide text-orange-700">
					Dados do aluguel e proprietário
				</p>
				<p className="mt-1 text-sm font-semibold text-slate-600">
					{form.valorAluguel
						? `Aluguel ${formatCurrency(form.valorAluguel)} · `
						: ""}
					{form.proprietarioNome || "Proprietário não informado"}
				</p>
			</div>
			<ActionButton
				icon={Home}
				tone="orange"
				onClick={() => setAluguelModalOpen(true)}
			>
				Preencher aluguel
			</ActionButton>
		</div>
	);
}

function ImovelMapsLinks({ form }) {
	if (!form.mapsUrl && !form.streetViewUrl) return null;
	return (
		<div className="flex flex-wrap gap-2 text-sm font-bold">
			{form.mapsUrl ? (
				<a
					className="text-blue-700 underline"
					href={form.mapsUrl}
					target="_blank"
					rel="noreferrer"
				>
					Abrir localização
				</a>
			) : null}
			{form.streetViewUrl ? (
				<a
					className="text-blue-700 underline"
					href={form.streetViewUrl}
					target="_blank"
					rel="noreferrer"
				>
					Abrir Google Street View
				</a>
			) : null}
		</div>
	);
}

function ImovelCadastroTab(props) {
	const {
	selectedId,
	form,
	setForm,
	saving,
	setSaving,
	setMessage,
	config,
	setAluguelModalOpen,
	setAguaEnergiaModalOpen,
	reajuste,
	setReajuste,
	iptu,
	setIptu,
	aluguel,
	setAluguel,
	anexo,
	setAnexo,
	aditivo,
	setAditivo,
	setPlacasModalOpen,
	setPlacasDraft,
	selected,
	carregar,
	handleSave,
	submitRelated,
	placasList,
	} = props;
	return (
							<div className="space-y-5">
								<div className="sticky top-3 z-20 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-lg shadow-blue-950/5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
									<div>
										<p className="text-xs font-black uppercase tracking-wide text-blue-700">
											{selected ? "Editando imóvel" : "Novo imóvel"}
										</p>
										<p className="mt-1 text-sm font-bold text-slate-600">
											{selected
												? "Após alterar qualquer dado, salve para aplicar no cadastro."
												: "Preencha os dados principais e salve o novo imóvel."}
										</p>
									</div>
									<ActionButton icon={Save} loading={saving} onClick={handleSave}>
										{selected ? "Salvar alterações" : "Salvar imóvel"}
									</ActionButton>
								</div>
								<div className="grid gap-4 md:grid-cols-3">
									<Field label="ID Sênior obrigatório">
										<input
											className={inputClass()}
											value={form.seniorId}
											onChange={(e) =>
												setForm((cur) => ({ ...cur, seniorId: e.target.value }))
											}
											disabled={Boolean(selectedId)}
										/>
									</Field>
									<Field label="Nome ou título do imóvel">
										<input
											className={inputClass()}
											value={form.nome}
											onChange={(e) =>
												setForm((cur) => ({ ...cur, nome: e.target.value }))
											}
											placeholder="Ex: Sede administrativa"
										/>
									</Field>
									<Field label="Base">
										<select
											className={inputClass()}
											value={form.base}
											onChange={(e) =>
												setForm((cur) => ({ ...cur, base: e.target.value }))
											}
										>
											{(config.empresas || DEFAULT_CONFIG.empresas).map(
												(empresa) => (
													<option key={empresa} value={empresa}>
														{empresa}
													</option>
												),
											)}
										</select>
									</Field>
								</div>
								<div className="grid gap-4 md:grid-cols-3">
									<Field label="CNPJ / CPF">
										<input
											className={inputClass()}
											value={form.cnpjCpf}
											onChange={(e) =>
												setForm((cur) => ({ ...cur, cnpjCpf: e.target.value }))
											}
										/>
									</Field>
									<Field label="Classificação">
										<select
											className={inputClass()}
											value={form.classificacao}
											onChange={(e) =>
												setForm((cur) => ({
													...cur,
													classificacao: e.target.value,
												}))
											}
										>
											<option value="">Selecione</option>
											{(
												config.classificacoes || DEFAULT_CONFIG.classificacoes
											).map((item) => (
												<option key={item} value={item}>
													{item}
												</option>
											))}
										</select>
									</Field>
									<Field label="Diretoria responsável">
										<select
											className={inputClass()}
											value={form.diretoria}
											onChange={(e) =>
												setForm((cur) => ({
													...cur,
													diretoria: e.target.value,
												}))
											}
										>
											<option value="">Selecione</option>
											{(config.diretorias || DEFAULT_CONFIG.diretorias).map(
												(item) => (
													<option key={item} value={item}>
														{item}
													</option>
												),
											)}
										</select>
									</Field>
									<Field label="Nome do site">
										<input
											className={inputClass()}
											value={form.nomeSite}
											onChange={(e) =>
												setForm((cur) => ({ ...cur, nomeSite: e.target.value }))
											}
										/>
									</Field>
									{String(form.diretoria || "").toUpperCase() === "DSO" ? (
										<Field label="Site DSO">
											<input
												className={inputClass()}
												value={form.siteDso}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														siteDso: e.target.value,
													}))
												}
											/>
										</Field>
									) : null}
									<Field label="m²">
										<input
											className={inputClass()}
											value={form.metrosQuadrados}
											onChange={(e) =>
												setForm((cur) => ({
													...cur,
													metrosQuadrados: e.target.value,
												}))
											}
										/>
									</Field>
								</div>
								<div className="grid gap-4 md:grid-cols-2">
									<Field label="Status">
										<select
											className={inputClass()}
											value={String(form.ativo)}
											onChange={(e) =>
												setForm((cur) => ({
													...cur,
													ativo: e.target.value === "true",
												}))
											}
										>
											<option value="true">Ativo</option>
											<option value="false">Inativo</option>
										</select>
									</Field>
									<Field label="Tipo">
										<select
											className={inputClass()}
											value={form.tipoContrato}
											onChange={(e) =>
												setForm((cur) => ({
													...cur,
													tipoContrato: e.target.value,
												}))
											}
										>
											<option value="proprio">Próprio</option>
											<option value="alugado">Alugado</option>
										</select>
									</Field>
								</div>
								<ImovelInativacaoFields form={form} setForm={setForm} />

								<ImovelAluguelTeaser
									form={form}
									setAluguelModalOpen={setAluguelModalOpen}
								/>

								<div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
									<h3 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-600">
										Endereço
									</h3>
									<div className="grid gap-4 md:grid-cols-3">
										<Field label="CEP">
											<input
												className={inputClass()}
												value={form.cep}
												onChange={(e) =>
													setForm((cur) => ({ ...cur, cep: e.target.value }))
												}
												placeholder="00000-000"
											/>
										</Field>
										<Field label="Estado">
											<input
												className={inputClass()}
												value={form.estado}
												onChange={(e) =>
													setForm((cur) => ({ ...cur, estado: e.target.value }))
												}
												placeholder="MG"
											/>
										</Field>
										<Field label="Cidade">
											<input
												className={inputClass()}
												value={form.cidade}
												onChange={(e) =>
													setForm((cur) => ({ ...cur, cidade: e.target.value }))
												}
											/>
										</Field>
										<Field label="Bairro">
											<input
												className={inputClass()}
												value={form.bairro}
												onChange={(e) =>
													setForm((cur) => ({ ...cur, bairro: e.target.value }))
												}
											/>
										</Field>
										<Field label="Rua">
											<input
												className={inputClass()}
												value={form.rua}
												onChange={(e) =>
													setForm((cur) => ({ ...cur, rua: e.target.value }))
												}
											/>
										</Field>
										<Field label="Número">
											<input
												className={inputClass()}
												value={form.numero}
												onChange={(e) =>
													setForm((cur) => ({ ...cur, numero: e.target.value }))
												}
											/>
										</Field>
									</div>
									<div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
										<div className="min-h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600">
											{composeEndereco(form) ||
												"Preencha os campos acima para montar o endereço."}
										</div>
										<ActionButton
											icon={MapPin}
											tone="slate"
											onClick={() =>
												setForm((cur) => {
													const endereco = composeEndereco(cur) || cur.endereco;
													return {
														...cur,
														endereco,
														...getMapsLinks(endereco),
													};
												})
											}
										>
											Gerar mapa
										</ActionButton>
									</div>
								</div>
								<ImovelMapsLinks form={form} />

								<div className="grid gap-4 md:grid-cols-3">
									<Field label="Tem estacionamento?">
										<select
											className={inputClass()}
											value={String(form.estacionamento)}
											onChange={(e) =>
												setForm((cur) => ({
													...cur,
													estacionamento: e.target.value === "true",
												}))
											}
										>
											<option value="false">Não</option>
											<option value="true">Sim</option>
										</select>
									</Field>
									{form.estacionamento ? (
										<>
											<Field label="Quantidade de vagas">
												<input
													type="number"
													className={inputClass()}
													value={form.vagas}
													onChange={(e) =>
														setForm((cur) => ({
															...cur,
															vagas: e.target.value,
														}))
													}
												/>
											</Field>
											<Field label="Placas dos veículos">
												<button
													type="button"
													className="flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
													onClick={() => {
														setPlacasDraft(placasList.join("\n"));
														setPlacasModalOpen(true);
													}}
												>
													<span className="truncate">
														{placasList.length
															? `${placasList.length} placa(s) cadastrada(s)`
															: "Cadastrar placas"}
													</span>
													<Car size={16} className="shrink-0 text-blue-700" />
												</button>
											</Field>
										</>
									) : null}
								</div>

								<div className="rounded-2xl border border-slate-200 bg-white p-4">
									<h3 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-600">
										Referência, seguro e contratos auxiliares
									</h3>
									<div className="mb-4 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 md:flex-row md:items-center md:justify-between">
										<div>
											<p className="text-sm font-black uppercase tracking-wide text-blue-700">
												Contas de água e energia
											</p>
											<p className="mt-1 text-sm font-semibold text-slate-600">
												Energia{" "}
												{form.energiaValorMedio
													? formatCurrency(form.energiaValorMedio)
													: "-"}{" "}
												· Água{" "}
												{form.aguaValorMedio
													? formatCurrency(form.aguaValorMedio)
													: "-"}
											</p>
										</div>
										<ActionButton
											icon={FileText}
											tone="slate"
											onClick={() => setAguaEnergiaModalOpen(true)}
										>
											Preencher água/energia
										</ActionButton>
									</div>
									<div className="grid gap-4 md:grid-cols-3">
										<Field label="Pessoa referência no endereço">
											<input
												className={inputClass()}
												value={form.pessoaReferencia}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														pessoaReferencia: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Contato da pessoa referência">
											<input
												className={inputClass()}
												value={form.contatoPessoaReferencia}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														contatoPessoaReferencia: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Posições de trabalho">
											<input
												className={inputClass()}
												value={form.posicoesTrabalho}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														posicoesTrabalho: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Colaboradores por cidade">
											<input
												className={inputClass()}
												value={form.quantidadeColaboradores}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														quantidadeColaboradores: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Tipo de seguro">
											<input
												className={inputClass()}
												value={form.seguroTipo}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														seguroTipo: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Vencimento do seguro">
											<input
												type="date"
												className={inputClass()}
												value={form.seguroVencimento}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														seguroVencimento: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Valor seguro mês">
											<input
												className={inputClass()}
												value={form.seguroValorMensal}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														seguroValorMensal: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Link da apólice">
											<input
												className={inputClass()}
												value={form.linkApolice}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														linkApolice: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="PPCI vencimento">
											<input
												type="date"
												className={inputClass()}
												value={form.ppciVencimento}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														ppciVencimento: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Link do PPCI">
											<input
												className={inputClass()}
												value={form.ppciLink}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														ppciLink: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="AVCB vencimento">
											<input
												type="date"
												className={inputClass()}
												value={form.avcbVencimento}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														avcbVencimento: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Link do AVCB">
											<input
												className={inputClass()}
												value={form.avcbLink}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														avcbLink: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Contrato de vigilância">
											<input
												className={inputClass()}
												value={form.vigilanciaContratoLink}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														vigilanciaContratoLink: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Vigilância valor mensal">
											<input
												className={inputClass()}
												value={form.vigilanciaValorMensal}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														vigilanciaValorMensal: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Contrato de limpeza">
											<input
												className={inputClass()}
												value={form.limpezaContrato}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														limpezaContrato: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Limpeza valor médio">
											<input
												className={inputClass()}
												value={form.limpezaValorMedio}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														limpezaValorMedio: e.target.value,
													}))
												}
											/>
										</Field>
									</div>
								</div>

								<Field label="Observação">
									<textarea
										className={inputClass("min-h-24")}
										value={form.observacao}
										onChange={(e) =>
											setForm((cur) => ({ ...cur, observacao: e.target.value }))
										}
									/>
								</Field>

								<div className="flex flex-wrap gap-2">
									<ActionButton
										icon={Save}
										loading={saving}
										onClick={handleSave}
									>
										{selected ? "Salvar alterações" : "Salvar imóvel"}
									</ActionButton>
									{selected ? (
										<ActionButton
											icon={FolderPlus}
											tone="slate"
											loading={saving}
											onClick={async () => {
												setSaving(true);
												try {
													await garantirPastaImovel(selected.id);
													setMessage(
														"Pasta do imóvel garantida no Google Drive.",
													);
													await carregar();
												} catch (error) {
													setMessage(
														error?.message || "Não foi possível criar a pasta.",
													);
												} finally {
													setSaving(false);
												}
											}}
										>
											Garantir pasta
										</ActionButton>
									) : null}
								</div>

								{selected ? (
									<div className="grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-3">
										<div className="rounded-xl border border-slate-200 p-4">
											<h3 className="font-black text-slate-950">Reajuste</h3>
											<input
												className={inputClass("mt-3")}
												placeholder="Novo valor"
												value={reajuste.valorNovo}
												onChange={(e) =>
													setReajuste((cur) => ({
														...cur,
														valorNovo: e.target.value,
													}))
												}
											/>
											<input
												type="date"
												className={inputClass("mt-2")}
												value={reajuste.data}
												onChange={(e) =>
													setReajuste((cur) => ({
														...cur,
														data: e.target.value,
													}))
												}
											/>
											<input
												type="file"
												accept=".xlsx,.xls"
												className={inputClass("mt-2")}
												onChange={(e) =>
													setReajuste((cur) => ({
														...cur,
														file: e.target.files?.[0] || null,
													}))
												}
											/>
											<textarea
												className={inputClass("mt-2 min-h-20")}
												placeholder="Observação"
												value={reajuste.observacao}
												onChange={(e) =>
													setReajuste((cur) => ({
														...cur,
														observacao: e.target.value,
													}))
												}
											/>
											<ActionButton
												icon={Save}
												tone="orange"
												loading={saving}
												onClick={() =>
													submitRelated(
														registrarReajusteImovel,
														reajuste,
														"Reajuste registrado.",
													)
												}
												className="mt-3"
											>
												Registrar
											</ActionButton>
										</div>
										<div className="rounded-xl border border-slate-200 p-4">
											<h3 className="font-black text-slate-950">IPTU</h3>
											<input
												className={inputClass("mt-3")}
												placeholder="Valor"
												value={iptu.valor}
												onChange={(e) =>
													setIptu((cur) => ({ ...cur, valor: e.target.value }))
												}
											/>
											<input
												type="date"
												className={inputClass("mt-2")}
												value={iptu.vencimento}
												onChange={(e) =>
													setIptu((cur) => ({
														...cur,
														vencimento: e.target.value,
													}))
												}
											/>
											<input
												type="file"
												accept=".pdf,.png,.jpg,.jpeg"
												className={inputClass("mt-2")}
												onChange={(e) =>
													setIptu((cur) => ({
														...cur,
														file: e.target.files?.[0] || null,
													}))
												}
											/>
											<label className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-600">
												<input
													type="checkbox"
													checked={iptu.pago}
													onChange={(e) =>
														setIptu((cur) => ({
															...cur,
															pago: e.target.checked,
														}))
													}
												/>{" "}
												Pago
											</label>
											<ActionButton
												icon={Save}
												tone="green"
												loading={saving}
												onClick={() =>
													submitRelated(
														registrarIptuImovel,
														iptu,
														"IPTU registrado.",
													)
												}
												className="mt-3"
											>
												Registrar
											</ActionButton>
										</div>
										<div className="rounded-xl border border-slate-200 p-4">
											<h3 className="font-black text-slate-950">
												Aluguel mensal
											</h3>
											<input
												className={inputClass("mt-3")}
												placeholder="Valor"
												value={aluguel.valor}
												onChange={(e) =>
													setAluguel((cur) => ({
														...cur,
														valor: e.target.value,
													}))
												}
											/>
											<input
												type="date"
												className={inputClass("mt-2")}
												value={aluguel.vencimento}
												onChange={(e) =>
													setAluguel((cur) => ({
														...cur,
														vencimento: e.target.value,
													}))
												}
											/>
											<label className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-600">
												<input
													type="checkbox"
													checked={aluguel.pago}
													onChange={(e) =>
														setAluguel((cur) => ({
															...cur,
															pago: e.target.checked,
														}))
													}
												/>{" "}
												Pago
											</label>
											<ActionButton
												icon={Save}
												tone="green"
												loading={saving}
												onClick={() =>
													submitRelated(
														registrarAluguelImovel,
														aluguel,
														"Aluguel registrado.",
													)
												}
												className="mt-3"
											>
												Registrar
											</ActionButton>
										</div>
										<div className="rounded-xl border border-slate-200 p-4">
											<h3 className="font-black text-slate-950">
												Fotos, vídeos e anexos
											</h3>
											<select
												className={inputClass("mt-3")}
												value={anexo.categoria}
												onChange={(e) =>
													setAnexo((cur) => ({
														...cur,
														categoria: e.target.value,
														tipo: e.target.value,
													}))
												}
											>
												<option value="foto">Foto</option>
												<option value="video">Vídeo</option>
												<option value="seguro">Seguro</option>
												<option value="outro">Outro anexo</option>
											</select>
											<input
												type="file"
												accept=".pdf,.png,.jpg,.jpeg,.mp4,.mov,.webm"
												className={inputClass("mt-2")}
												onChange={(e) =>
													setAnexo((cur) => ({
														...cur,
														file: e.target.files?.[0] || null,
													}))
												}
											/>
											<textarea
												className={inputClass("mt-2 min-h-20")}
												placeholder="Observação"
												value={anexo.observacao}
												onChange={(e) =>
													setAnexo((cur) => ({
														...cur,
														observacao: e.target.value,
													}))
												}
											/>
											<ActionButton
												icon={Upload}
												tone="slate"
												loading={saving}
												onClick={() =>
													submitRelated(
														enviarAnexoImovel,
														anexo,
														"Anexo enviado.",
													)
												}
												className="mt-3"
											>
												Enviar anexo
											</ActionButton>
										</div>
										<div className="rounded-xl border border-slate-200 p-4">
											<h3 className="font-black text-slate-950">Aditivo</h3>
											<input
												className={inputClass("mt-3")}
												placeholder="Nome do aditivo"
												value={aditivo.nome}
												onChange={(e) =>
													setAditivo((cur) => ({
														...cur,
														nome: e.target.value,
													}))
												}
											/>
											<input
												type="date"
												className={inputClass("mt-2")}
												value={aditivo.data}
												onChange={(e) =>
													setAditivo((cur) => ({
														...cur,
														data: e.target.value,
													}))
												}
											/>
											<input
												type="file"
												accept=".pdf,.png,.jpg,.jpeg"
												className={inputClass("mt-2")}
												onChange={(e) =>
													setAditivo((cur) => ({
														...cur,
														file: e.target.files?.[0] || null,
													}))
												}
											/>
											<textarea
												className={inputClass("mt-2 min-h-20")}
												placeholder="Observação"
												value={aditivo.observacao}
												onChange={(e) =>
													setAditivo((cur) => ({
														...cur,
														observacao: e.target.value,
													}))
												}
											/>
											<ActionButton
												icon={Upload}
												tone="orange"
												loading={saving}
												onClick={() =>
													submitRelated(
														enviarAditivoImovel,
														aditivo,
														"Aditivo registrado.",
													)
												}
												className="mt-3"
											>
												Registrar aditivo
											</ActionButton>
										</div>
									</div>
								) : null}
							</div>
	);
}

// Extraido de ImoveisAdministrativosPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — mesma JSX de antes, sem mudanca de
// comportamento.
function ImovelContratosTab(props) {
	const {
	registros,
	saving,
	setMessage,
	contratoFile,
	setContratoFile,
	selected,
	submitRelated,
	handleEditarContrato,
	handleExcluirContrato,
	} = props;
	return (
							<div className="space-y-5">
								{!selected ? (
									<p className="font-bold text-slate-500">
										Selecione um imóvel para gerenciar contratos.
									</p>
								) : (
									<>
										<div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
											<p className="text-xs font-black uppercase tracking-wide text-blue-700">
												Imóvel selecionado
											</p>
											<h2 className="mt-1 text-xl font-black text-slate-950">
												{selected.nome ||
													`Imóvel ${selected.seniorId || selected.id}`}
											</h2>
											<p className="mt-1 text-sm font-bold text-slate-600">
												ID Sênior: {selected.seniorId || selected.id}
											</p>
											{selected.endereco ? (
												<p className="mt-1 text-sm font-semibold text-slate-500">
													{selected.endereco}
												</p>
											) : null}
										</div>
										<div className="grid gap-4 md:grid-cols-1">
											<div className="rounded-xl border border-slate-200 p-4">
												<h3 className="font-black text-slate-950">
													Enviar contrato para o Drive
												</h3>
												<p className="mt-1 text-sm font-semibold text-slate-500">
													O arquivo será enviado para a pasta do imóvel no
													Google Drive configurado no sistema.
												</p>
												<input
													type="file"
													accept=".pdf,.png,.jpg,.jpeg"
													className={inputClass("mt-3")}
													onChange={(e) =>
														setContratoFile(e.target.files?.[0] || null)
													}
												/>
												<ActionButton
													icon={Upload}
													loading={saving}
													className="mt-3"
													onClick={async () => {
														if (!contratoFile)
															return setMessage("Selecione um arquivo.");
														await submitRelated(
															enviarContratoImovel,
															{ file: contratoFile, nome: contratoFile.name },
															"Contrato enviado.",
														);
														setContratoFile(null);
													}}
												>
													Enviar arquivo
												</ActionButton>
											</div>
										</div>
										<DataTable
											title="Contratos vinculados"
											rows={registros?.contratos || []}
											columns={[
												["nome", "Nome"],
												["tipo", "Origem"],
												["createdByName", "Criado por"],
												["createdAt", "Data"],
												["acoes", "Ações"],
											]}
											renderCell={(row, key) => {
												if (key === "createdAt") return formatDate(row[key]);
												if (key === "nome" && row.url) {
													return (
														<a
															href={row.url}
															target="_blank"
															rel="noreferrer"
															className="text-blue-700 underline"
														>
															{row.nome}
														</a>
													);
												}
												if (key === "acoes") {
													return (
														<div className="flex flex-wrap gap-2">
															<button
																type="button"
																className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 transition hover:bg-blue-100"
																onClick={() => handleEditarContrato(row)}
															>
																Editar
															</button>
															<button
																type="button"
																className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-black text-red-700 transition hover:bg-red-100"
																onClick={() => handleExcluirContrato(row)}
															>
																Excluir
															</button>
														</div>
													);
												}
												return row[key] || "-";
											}}
										/>
									</>
								)}
							</div>
	);
}

// Extraido de ImoveisAdministrativosPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — mesma JSX de antes, sem mudanca de
// comportamento.
function ImovelHistoricoTab(props) {
	const {
	registros,
	imoveisHistorico,
	} = props;
	return (
							<div className="space-y-5">
								<DataTable
									title="Imóveis cancelados ou inativos"
									rows={imoveisHistorico}
									columns={[
										["seniorId", "ID Sênior"],
										["base", "Base"],
										["tipoContrato", "Tipo"],
										["contratoFim", "Fim do contrato"],
									]}
									renderCell={(row, key) =>
										key === "contratoFim"
											? formatDate(row[key])
											: row[key] || "-"
									}
								/>
								<DataTable
									title="Histórico de reajustes do imóvel selecionado"
									rows={registros?.reajustes || []}
									columns={[
										["data", "Data"],
										["valorAnterior", "Valor anterior"],
										["valorNovo", "Valor novo"],
										["createdByName", "Registrado por"],
									]}
									renderCell={(row, key) =>
										key.includes("valor")
											? formatCurrency(row[key])
											: key === "data"
												? formatDate(row[key])
												: row[key] || "-"
									}
								/>
							</div>
	);
}


const SEMPRE_LOGO_URL = "/sempre-logo-documento.png";
let cachedSempreLogoDataUrl = "";

async function imageAssetToDataUrl(url) {
	const response = await fetch(url, { cache: "force-cache" });
	if (!response.ok) throw new Error(`Nao foi possivel carregar ${url}`);
	const blob = await response.blob();
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(String(reader.result || ""));
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

async function getSempreLogoDataUrl() {
	if (cachedSempreLogoDataUrl) return cachedSempreLogoDataUrl;
	cachedSempreLogoDataUrl = await imageAssetToDataUrl(SEMPRE_LOGO_URL);
	return cachedSempreLogoDataUrl;
}

function dataUrlFormat(dataUrl = "") {
	if (dataUrl.startsWith("data:image/jpeg")) return "JPEG";
	if (dataUrl.startsWith("data:image/webp")) return "WEBP";
	return "PNG";
}

async function addImoveisReportBranding(pdf) {
	try {
		const logo = await getSempreLogoDataUrl();
		await addPdfImageContained(pdf, logo, { x: 36, y: 18, width: 120, height: 38, valign: "middle" });
	} catch (error) {
		console.warn("[imoveisReports] Logo Sempre nao adicionada:", error);
	}
	await addClusterLogo(pdf, { width: 96, height: 38, y: 18, marginRight: 36 });
}

const IMOVEIS_REPORT_FIELDS = [
	["seniorId", "ID Senior"],
	["nome", "Nome"],
	["base", "Empresa"],
	["cnpjCpf", "CNPJ/CPF"],
	["classificacao", "Classificacao"],
	["tipoContrato", "Tipo"],
	["situacao", "Situacao"],
	["cidade", "Cidade"],
	["estado", "Estado"],
	["endereco", "Endereco"],
	["proprietarioNome", "Proprietario"],
	["proprietarioContatos", "Contato locador"],
	["valorAluguel", "Valor aluguel"],
	["valorOriginal", "Valor original"],
	["valorM2", "Valor m2"],
	["metrosQuadrados", "M2"],
	["vencimentoAluguelDia", "Dia pagamento"],
	["contratoInicio", "Inicio contrato"],
	["contratoFim", "Fim contrato"],
	["mesReajuste", "Mes reajuste"],
	["indiceReajuste", "Indice reajuste"],
	["formaPagamento", "Forma pagamento"],
	["seguroTipo", "Seguro"],
	["linkApolice", "Link apolice"],
	["vigilanciaContratoLink", "Contrato vigilancia"],
	["vigilanciaValorMensal", "Valor vigilancia"],
	["limpezaContrato", "Contrato limpeza"],
	["limpezaValorMedio", "Valor limpeza"],
	["ppciLink", "Link PPCI"],
	["ppciVencimento", "Vencimento PPCI"],
	["avcbVencimento", "Vencimento AVCB"],
	["alvaraFuncionamentoLink", "Link alvara"],
	["alvaraFuncionamentoVencimento", "Vencimento alvara"],
	["iptuResponsavel", "Responsavel IPTU"],
	["iptuLink", "Link IPTU"],
	["iptuValorPago2025", "IPTU 2025"],
	["iptuValorPago2026", "IPTU 2026"],
	["energiaValorMedio", "Energia valor medio"],
	["energiaCodigoCliente", "Energia codigo cliente"],
	["aguaValorMedio", "Agua valor medio"],
	["aguaCodigoCliente", "Agua codigo cliente"],
];

const moneyReportKeys = new Set([
	"valorAluguel",
	"valorOriginal",
	"valorM2",
	"vigilanciaValorMensal",
	"limpezaValorMedio",
	"iptuValorPago2025",
	"iptuValorPago2026",
	"energiaValorMedio",
	"aguaValorMedio",
]);

function reportValue(item = {}, key) {
	const value = item[key];
	if (moneyReportKeys.has(key)) return value ? formatCurrency(value) : "";
	if (["contratoInicio", "contratoFim", "ppciVencimento", "avcbVencimento", "alvaraFuncionamentoVencimento"].includes(key)) return formatDate(value);
	if (key === "tipoContrato") return String(value || "proprio").toLowerCase() === "alugado" ? "Alugado" : "Proprio";
	if (key === "situacao") return getImovelStatusLabel(item);
	return value || "";
}

function reportRawValue(item = {}, key) {
	const value = item[key];
	if (["contratoInicio", "contratoFim", "ppciVencimento", "avcbVencimento", "alvaraFuncionamentoVencimento"].includes(key)) return formatDate(value);
	if (key === "tipoContrato") return String(value || "proprio").toLowerCase() === "alugado" ? "Alugado" : "Proprio";
	if (key === "situacao") return getImovelStatusLabel(item);
	return value ?? "";
}

function applyImoveisReportFilters(items = [], filters = {}) {
	return items.filter((item) => {
		if (filters.cidade && String(item.cidade || "") !== filters.cidade) return false;
		if (filters.estado && String(item.estado || "") !== filters.estado) return false;
		if (filters.empresa && String(item.base || "").toUpperCase() !== filters.empresa) return false;
		if (filters.tipo) {
			const tipo = String(item.tipoContrato || "proprio").toLowerCase() === "alugado" ? "alugado" : "proprio";
			if (tipo !== filters.tipo) return false;
		}
		return true;
	});
}

function exportImoveisReportXlsx(items = [], filters = {}) {
	const rows = items.map((item) =>
		Object.fromEntries(IMOVEIS_REPORT_FIELDS.map(([key, label]) => [label, reportRawValue(item, key)])),
	);
	const worksheet = XLSX.utils.json_to_sheet(rows);
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, worksheet, "Imoveis");
	workbook.Props = { Title: "Relatorio de Imoveis", Company: "Sempre Internet" };
	XLSX.writeFile(workbook, `relatorio-imoveis-${filters.empresa || "todos"}.xlsx`);
}

async function generateImoveisCadastroPdf(items = [], filters = {}) {
	const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
	await addImoveisReportBranding(pdf);
	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(18);
	pdf.text("Relatório cadastral de imóveis", 36, 72);
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(9);
	const filterText = [
		filters.empresa ? `Empresa: ${filters.empresa}` : "Todas as empresas",
		filters.estado ? `Estado: ${filters.estado}` : "Todos os estados",
		filters.cidade ? `Cidade: ${filters.cidade}` : "Todas as cidades",
		filters.tipo ? `Tipo: ${filters.tipo === "alugado" ? "Alugados" : "Próprios"}` : "Alugados e próprios",
	].join(" · ");
	pdf.text(`${filterText} · Total: ${items.length}`, 36, 90);
	autoTable(pdf, {
		startY: 106,
		head: [["ID", "Empresa", "Tipo", "Cidade/UF", "Classificação", "Status", "Aluguel", "Vencimento", "Endereço"]],
		body: items.map((item) => [
			item.seniorId || item.id || "-",
			String(item.base || "-").toUpperCase(),
			reportValue(item, "tipoContrato") || "-",
			[item.cidade, item.estado].filter(Boolean).join("/") || "-",
			item.classificacao || "-",
			getImovelStatusLabel(item),
			item.valorAluguel ? formatCurrency(item.valorAluguel) : "-",
			formatDate(item.contratoFim) || "-",
			item.endereco || "-",
		]),
		styles: { font: "helvetica", fontSize: 7, cellPadding: 3, overflow: "linebreak" },
		headStyles: { fillColor: [37, 99, 235], textColor: 255 },
		columnStyles: { 0: { cellWidth: 72 }, 8: { cellWidth: 230 } },
		margin: { left: 36, right: 36 },
	});
	pdf.save("relatorio-imoveis.pdf");
}

async function generateImovelFichaPdf(imovel = {}, registros = {}) {
	const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
	await addImoveisReportBranding(pdf);
	pdf.setFont("helvetica", "bold");
	pdf.setFontSize(18);
	pdf.text("Ficha cadastral do imóvel", 36, 74);
	pdf.setFont("helvetica", "normal");
	pdf.setFontSize(10);
	pdf.text(getImovelFriendlyTitle(imovel).title.slice(0, 135), 36, 92);
	const reportFieldMap = new Map(IMOVEIS_REPORT_FIELDS);
	const makeRows = (keys = []) => keys.map((key) => [reportFieldMap.get(key) || key, reportValue(imovel, key) || "-"]);
	const identificationRows = makeRows(["nome", "base", "cnpjCpf", "classificacao", "tipoContrato", "situacao", "cidade", "estado", "endereco"]);
	const contractRows = makeRows(["proprietarioNome", "proprietarioContatos", "valorAluguel", "valorOriginal", "valorM2", "metrosQuadrados", "vencimentoAluguelDia", "contratoInicio", "contratoFim", "mesReajuste", "indiceReajuste", "formaPagamento"]);
	const controlRows = makeRows(["seguroTipo", "vigilanciaValorMensal", "limpezaValorMedio", "ppciVencimento", "avcbVencimento", "alvaraFuncionamentoVencimento", "iptuResponsavel", "iptuValorPago2025", "iptuValorPago2026", "energiaValorMedio", "energiaCodigoCliente", "aguaValorMedio", "aguaCodigoCliente"]);
	controlRows.push(["Documentos vinculados", String((registros?.contratos || []).length + (registros?.anexos || []).length + (registros?.aditivos || []).length)]);
	controlRows.push(["Registros de aluguel", String((registros?.alugueis || []).length)]);
	controlRows.push(["Registros de IPTU", String((registros?.iptus || []).length)]);
	const sections = [
		["Identificação e localização", identificationRows, 36],
		["Contrato e valores", contractRows, 304],
		["Controles e documentos", controlRows, 572],
	];
	const tableBase = {
		startY: 122,
		theme: "grid",
		styles: { font: "helvetica", fontSize: 7.8, cellPadding: 3.2, overflow: "linebreak", valign: "top" },
		headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
		columnStyles: {
			0: { cellWidth: 82, fontStyle: "bold", textColor: [71, 85, 105] },
			1: { cellWidth: 168 },
		},
		margin: { left: 36, right: 36 },
		pageBreak: "auto",
	};
	sections.forEach(([title, rows, left]) => {
		autoTable(pdf, {
			...tableBase,
			head: [[title, "Informação"]],
			body: rows,
			margin: { left, right: 36 },
			tableWidth: 250,
		});
	});
	pdf.save(`imovel-${imovel.id || "relatorio"}.pdf`);
}

// Extraido de ImoveisAdministrativosPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — mesma JSX de antes, sem mudanca de
// comportamento.
function ImovelRelatoriosModal(props) {
	const {
	imoveis,
	relatorio,
	filtroRelatorio,
	setFiltroRelatorio,
	loading,
	carregarRelatorio,
	setRelatoriosModalOpen,
	} = props;
	const [cadastroFilters, setCadastroFilters] = useState({
		cidade: "",
		estado: "",
		empresa: "",
		tipo: "",
	});
	const cidades = useMemo(
		() => [...new Set((imoveis || []).map((item) => item.cidade).filter(Boolean))].sort(),
		[imoveis],
	);
	const estados = useMemo(
		() => [...new Set((imoveis || []).map((item) => item.estado).filter(Boolean))].sort(),
		[imoveis],
	);
	const empresas = useMemo(
		() => [...new Set((imoveis || []).map((item) => String(item.base || "").toUpperCase()).filter(Boolean))].sort(),
		[imoveis],
	);
	const filteredImoveis = useMemo(
		() => applyImoveisReportFilters(imoveis || [], cadastroFilters),
		[imoveis, cadastroFilters],
	);
	return (
		<ModalShell
			title="Relatórios de imóveis"
			description="Gere arquivos cadastrais ou financeiros sem sair da listagem de imóveis."
			icon={<span className="rounded-2xl bg-blue-50 p-3 text-blue-700"><FileText size={22} /></span>}
			onClose={() => setRelatoriosModalOpen(false)}
			size="5xl"
		>
			<div className="space-y-5">
				<section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
					<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
						<div>
							<h2 className="text-base font-black text-slate-950">Relatório cadastral</h2>
							<p className="text-sm font-semibold text-slate-600">Filtre e baixe os imóveis em XLSX ou PDF. Nenhuma prévia é listada aqui para manter o fluxo limpo.</p>
						</div>
						<span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">{filteredImoveis.length} imóvel(is)</span>
					</div>
					<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
						<Field label="Empresa">
							<select className={inputClass()} value={cadastroFilters.empresa} onChange={(e) => setCadastroFilters((cur) => ({ ...cur, empresa: e.target.value }))}>
								<option value="">Todas</option>
								{empresas.map((empresa) => <option key={empresa} value={empresa}>{empresa}</option>)}
							</select>
						</Field>
						<Field label="Estado">
							<select className={inputClass()} value={cadastroFilters.estado} onChange={(e) => setCadastroFilters((cur) => ({ ...cur, estado: e.target.value, cidade: "" }))}>
								<option value="">Todos</option>
								{estados.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
							</select>
						</Field>
						<Field label="Cidade">
							<select className={inputClass()} value={cadastroFilters.cidade} onChange={(e) => setCadastroFilters((cur) => ({ ...cur, cidade: e.target.value }))}>
								<option value="">Todas</option>
								{cidades.filter((cidade) => !cadastroFilters.estado || (imoveis || []).some((item) => item.cidade === cidade && item.estado === cadastroFilters.estado)).map((cidade) => <option key={cidade} value={cidade}>{cidade}</option>)}
							</select>
						</Field>
						<Field label="Tipo">
							<select className={inputClass()} value={cadastroFilters.tipo} onChange={(e) => setCadastroFilters((cur) => ({ ...cur, tipo: e.target.value }))}>
								<option value="">Alugados e próprios</option>
								<option value="alugado">Alugados</option>
								<option value="proprio">Próprios</option>
							</select>
						</Field>
					</div>
					<div className="mt-4 flex flex-wrap justify-end gap-2">
						<ActionButton icon={Download} tone="green" disabled={!filteredImoveis.length} onClick={() => exportImoveisReportXlsx(filteredImoveis, cadastroFilters)}>Baixar XLSX</ActionButton>
						<ActionButton icon={FileText} tone="blue" disabled={!filteredImoveis.length} onClick={() => generateImoveisCadastroPdf(filteredImoveis, cadastroFilters)}>Baixar PDF</ActionButton>
					</div>
				</section>

				<section className="rounded-2xl border border-slate-200 bg-white p-4">
					<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
						<div>
							<h2 className="text-base font-black text-slate-950">Relatório financeiro e vencimentos</h2>
							<p className="text-sm font-semibold text-slate-500">Atualize por período para exportar vencimentos, IPTU e aluguéis.</p>
						</div>
						<ActionButton icon={Download} tone="green" disabled={!relatorio} onClick={() => generatePdf(relatorio, filtroRelatorio)}>Exportar PDF</ActionButton>
					</div>
					<div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
						<Field label="Mês">
							<select className={inputClass("min-w-36")} value={filtroRelatorio.mes} onChange={(e) => setFiltroRelatorio((cur) => ({ ...cur, mes: e.target.value }))}>
								<option value="">Todos</option>
								{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((mes) => <option key={mes} value={mes}>{mes}</option>)}
							</select>
						</Field>
						<Field label="Ano">
							<input className={inputClass("min-w-28")} value={filtroRelatorio.ano} onChange={(e) => setFiltroRelatorio((cur) => ({ ...cur, ano: e.target.value }))} />
						</Field>
						<ActionButton icon={RefreshCw} loading={loading} onClick={carregarRelatorio}>Atualizar dados</ActionButton>
					</div>
					{relatorio ? (
						<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
							<StatCard icon={Home} label="Gasto IPTU" value={formatCurrency(relatorio.resumo?.gastosIptu)} />
							<StatCard icon={CalendarClock} label="Gasto aluguel" value={formatCurrency(relatorio.resumo?.gastosAluguel)} tone="orange" />
							<StatCard icon={FileText} label="Contratos vencendo" value={relatorio.contratosProximos?.length || 0} tone="green" />
							<StatCard icon={Car} label="Aluguéis vencendo" value={relatorio.aluguelProximo?.length || 0} tone="slate" />
						</div>
					) : (
						<p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">Clique em atualizar dados para preparar o PDF financeiro do período.</p>
					)}
				</section>
			</div>
		</ModalShell>
	);
}
// Extraido de ImoveisAdministrativosPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — mesma JSX de antes, sem mudanca de
// comportamento.
function ImoveisDeleteModal(props) {
	const {
	imoveis,
	saving,
	setDeleteModalOpen,
	deleteSelection,
	setDeleteSelection,
	handleExcluirSelecionados,
	} = props;
	return (
				<ModalShell
					title="Excluir imóveis"
					description="Selecione um ou mais imóveis para excluir junto com registros e anexos vinculados."
					icon={
						<span className="rounded-2xl bg-red-50 p-3 text-red-700">
							<Trash2 size={22} />
						</span>
					}
					onClose={() => setDeleteModalOpen(false)}
					size="3xl"
					bodyClassName="p-0"
				>
					<div className="space-y-3 p-5">
						<div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
							<span className="text-sm font-black text-slate-700">
								{deleteSelection.length} de {imoveis.length} imóvel(is)
								selecionado(s)
							</span>
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
									onClick={() =>
										setDeleteSelection(
											imoveis.map((item) => item.id).filter(Boolean),
										)
									}
								>
									Selecionar todos
								</button>
								<button
									type="button"
									className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
									onClick={() => setDeleteSelection([])}
								>
									Limpar seleção
								</button>
							</div>
						</div>

						{imoveis.map((item) => {
							const checked = deleteSelection.includes(item.id);
							// S-C (docs/SONARQUBE-MAP.md, achado javascript:S6853): o
							// checkbox e filho direto do label (associacao implicita
							// valida por wrapping) — nao usar id/htmlFor estatico aqui,
							// pois isso e uma lista (.map) e geraria ids duplicados no
							// DOM entre os itens.
							return (
								<label
									key={item.id}
									className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
										checked
											? "border-red-200 bg-red-50"
											: "border-slate-200 bg-white hover:bg-slate-50"
									}`}
								>
									<input
										type="checkbox"
										checked={checked}
										onChange={(event) => {
											setDeleteSelection((current) =>
												event.target.checked
													? [...new Set([...current, item.id])]
													: current.filter((id) => id !== item.id),
											);
										}}
										className="mt-1"
									/>
									<span className="min-w-0">
										<span className="block truncate font-black text-slate-950">
											{item.nome || `Imóvel ${item.seniorId || item.id}`}
										</span>
										<span className="mt-1 block text-sm font-semibold text-slate-500">
											ID Sênior: {item.seniorId || item.id} ·{" "}
											{item.cidade || "Cidade não informada"}
										</span>
									</span>
								</label>
							);
						})}
					</div>

					<div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 p-5 sm:flex-row sm:justify-end">
						<ActionButton
							tone="slate"
							onClick={() => setDeleteModalOpen(false)}
						>
							Cancelar
						</ActionButton>
						<ActionButton
							icon={Trash2}
							tone="orange"
							loading={saving}
							disabled={!deleteSelection.length}
							onClick={handleExcluirSelecionados}
						>
							Excluir selecionados
						</ActionButton>
					</div>
				</ModalShell>
	);
}

// Extraido de ImoveisAdministrativosPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — mesma JSX de antes, sem mudanca de
// comportamento.
function ImoveisConfigModal(props) {
	const {
	saving,
	setConfigOpen,
	configDraft,
	setConfigDraft,
	setImportFile,
	importResult,
	handleSalvarConfig,
	handleImportarPlanilha,
	} = props;
	return (
				<ModalShell
					title="Configurações de imóveis"
					description="Cadastre opções do formulário e importe a planilha oficial de imóveis."
					icon={
						<span className="rounded-2xl bg-blue-50 p-3 text-blue-700">
							<Settings size={22} />
						</span>
					}
					onClose={() => setConfigOpen(false)}
					size="4xl"
					bodyClassName="p-0"
				>
					<div className="space-y-5 p-5">
						<div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
							<Field label="Pasta raiz dos imóveis no Google Drive">
								<input
									className={inputClass()}
									value={configDraft.imoveisRootFolderId || ""}
									onChange={(e) =>
										setConfigDraft((cur) => ({
											...cur,
											imoveisRootFolderId: e.target.value,
										}))
									}
									placeholder="Cole o link ou ID da pasta do supervisor"
								/>
							</Field>
							<p className="mt-2 text-xs font-bold text-blue-700">
								Se preenchido, todos os contratos, IPTU, reajustes, fotos,
								vídeos e aditivos dos imóveis serão salvos dentro desta pasta. O
								sistema criará automaticamente a subpasta imoveis e uma pasta
								para cada ID Sênior.
							</p>
						</div>

						<div className="grid gap-4 md:grid-cols-3">
							<Field label="Empresas">
								<textarea
									className={inputClass("min-h-36 resize-y")}
									value={
										configDraft.empresasText ??
										(configDraft.empresas || []).join("\n")
									}
									onChange={(e) =>
										setConfigDraft((cur) => ({
											...cur,
											empresasText: e.target.value,
										}))
									}
									placeholder={"SEMPRE\nONNET"}
								/>
							</Field>
							<Field label="Classificações">
								<textarea
									className={inputClass("min-h-36 resize-y")}
									value={
										configDraft.classificacoesText ??
										(configDraft.classificacoes || []).join("\n")
									}
									onChange={(e) =>
										setConfigDraft((cur) => ({
											...cur,
											classificacoesText: e.target.value,
										}))
									}
									placeholder={"ADMINISTRATIVO\nSITE/POP\nLOJA"}
								/>
							</Field>
							<Field label="Diretorias">
								<textarea
									className={inputClass("min-h-36 resize-y")}
									value={
										configDraft.diretoriasText ??
										(configDraft.diretorias || []).join("\n")
									}
									onChange={(e) =>
										setConfigDraft((cur) => ({
											...cur,
											diretoriasText: e.target.value,
										}))
									}
									placeholder={"DSO\nADMINISTRATIVO"}
								/>
							</Field>
						</div>

						<div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
							<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
								<div>
									<h3 className="font-black text-slate-950">
										Importar imóveis por XLSX
									</h3>
									<p className="mt-1 text-sm font-semibold text-slate-600">
										Use a planilha oficial para criar ou atualizar imóveis em
										lote. A leitura usa a aba RELAÇÃO DE IMÓVEIS - CLUSTERS e trata CNPJ/CPF como documento do proprietário.
									</p>
								</div>
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
									<input
										type="file"
										accept=".xlsx,.xls"
										className={inputClass("sm:w-72")}
										onChange={(e) => setImportFile(e.target.files?.[0] || null)}
									/>
									<ActionButton
										icon={Upload}
										tone="green"
										loading={saving}
										onClick={() => handleImportarPlanilha()}
									>
										Importar planilha
									</ActionButton>
									<ActionButton
										icon={Trash2}
										tone="orange"
										loading={saving}
										onClick={() => handleImportarPlanilha({ limparAntes: true })}
									>
										Limpar base e importar
									</ActionButton>
								</div>
							</div>
							{importResult ? (
								<div className="mt-4 grid gap-3 text-sm font-black sm:grid-cols-4">
									<span className="rounded-xl bg-white px-3 py-2 text-slate-700">
										Total: {importResult.total || 0}
									</span>
									<span className="rounded-xl bg-white px-3 py-2 text-emerald-700">
										Criados: {importResult.criados || 0}
									</span>
									<span className="rounded-xl bg-white px-3 py-2 text-blue-700">
										Atualizados: {importResult.atualizados || 0}
									</span>
									<span className="rounded-xl bg-white px-3 py-2 text-red-700">
										Erros: {importResult.erros?.length || 0}
									</span>
								</div>
							) : null}
						</div>
					</div>

					<div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 p-5 sm:flex-row sm:justify-end">
						<ActionButton tone="slate" onClick={() => setConfigOpen(false)}>
							Cancelar
						</ActionButton>
						<ActionButton
							icon={Save}
							loading={saving}
							onClick={handleSalvarConfig}
						>
							Salvar configurações
						</ActionButton>
					</div>
				</ModalShell>
	);
}

// Extraido de ImoveisAdministrativosPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — mesma JSX de antes, sem mudanca de
// comportamento.
function ImoveisAluguelModal(props) {
	const {
	form,
	setForm,
	setAluguelModalOpen,
	quickModalSave,
	setQuickModalSave,
	handleSave,
	saving,
	} = props;
	const closeModal = () => {
		setAluguelModalOpen(false);
		setQuickModalSave?.(false);
	};
	async function applyModalData() {
		if (quickModalSave) {
			await handleSave?.();
		}
		closeModal();
	}
	return (
				<ModalShell
					onClose={closeModal}
					showClose={false}
					size="4xl"
					bodyClassName="p-0"
				>
					<div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
						<div className="flex items-center gap-3">
							<span className="rounded-2xl bg-orange-50 p-3 text-orange-700">
								<Home size={22} />
							</span>
							<div>
								<h2 className="text-xl font-black text-slate-950">
									Aluguel e proprietário
								</h2>
								<p className="text-sm font-semibold text-slate-500">
									Preencha os dados do contrato alugado e acompanhe reajustes ao
									longo do tempo.
								</p>
							</div>
						</div>
						<button
							type="button"
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-50"
							onClick={closeModal}
						>
							Fechar
						</button>
					</div>

					<div className="max-h-[68vh] space-y-5 overflow-y-auto p-5">
						<div className="grid gap-4 md:grid-cols-3">
							<Field label="Valor original do contrato">
								<input
									className={inputClass()}
									value={form.valorOriginal}
									onChange={(e) =>
										setForm((cur) => ({
											...cur,
											valorOriginal: e.target.value,
										}))
									}
								/>
							</Field>
							<Field label="Valor atual do aluguel">
								<input
									className={inputClass()}
									value={form.valorAluguel}
									onChange={(e) =>
										setForm((cur) => ({ ...cur, valorAluguel: e.target.value }))
									}
								/>
							</Field>
							<Field label="Valor por m²">
								<input
									className={inputClass()}
									value={form.valorM2}
									onChange={(e) =>
										setForm((cur) => ({ ...cur, valorM2: e.target.value }))
									}
								/>
							</Field>
							<Field label="Vencimento mensal">
								<input
									type="number"
									min="1"
									max="31"
									className={inputClass()}
									value={form.vencimentoAluguelDia}
									onChange={(e) =>
										setForm((cur) => ({
											...cur,
											vencimentoAluguelDia: e.target.value,
										}))
									}
								/>
							</Field>
							<Field label="Início do contrato">
								<input
									type="date"
									className={inputClass()}
									value={form.contratoInicio}
									onChange={(e) =>
										setForm((cur) => ({
											...cur,
											contratoInicio: e.target.value,
										}))
									}
								/>
							</Field>
							<Field label="Fim do contrato">
								<input
									type="date"
									className={inputClass()}
									value={form.contratoFim}
									onChange={(e) =>
										setForm((cur) => ({ ...cur, contratoFim: e.target.value }))
									}
								/>
							</Field>
							<Field label="Mês do reajuste">
								<input
									className={inputClass()}
									value={form.mesReajuste}
									onChange={(e) =>
										setForm((cur) => ({ ...cur, mesReajuste: e.target.value }))
									}
								/>
							</Field>
							<Field label="Último reajuste">
								<input
									type="date"
									className={inputClass()}
									value={form.dataUltimoReajuste}
									onChange={(e) =>
										setForm((cur) => ({
											...cur,
											dataUltimoReajuste: e.target.value,
										}))
									}
								/>
							</Field>
							<Field label="Índice de reajuste">
								<input
									className={inputClass()}
									value={form.indiceReajuste}
									onChange={(e) =>
										setForm((cur) => ({
											...cur,
											indiceReajuste: e.target.value,
										}))
									}
								/>
							</Field>
							<Field label="Proprietário">
								<input
									className={inputClass()}
									value={form.proprietarioNome}
									onChange={(e) =>
										setForm((cur) => ({
											...cur,
											proprietarioNome: e.target.value,
										}))
									}
								/>
							</Field>
							<Field label="Telefone do proprietário">
								<div className="flex gap-2">
									<input
										className={inputClass("flex-1")}
										value={form.proprietarioTelefone}
										onChange={(e) =>
											setForm((cur) => ({
												...cur,
												proprietarioTelefone: formatPhoneInput(e.target.value),
											}))
										}
									/>
									{getWhatsappUrl(form.proprietarioTelefone) ? (
										<a
											href={getWhatsappUrl(form.proprietarioTelefone)}
											target="_blank"
											rel="noreferrer"
											className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-100 px-3 text-emerald-700 transition hover:bg-emerald-200"
											title="Abrir WhatsApp"
										>
											<MessageCircle size={18} />
										</a>
									) : null}
								</div>
							</Field>
							<Field label="E-mail do proprietário">
								<input
									type="email"
									className={inputClass()}
									value={form.proprietarioEmail}
									onChange={(e) =>
										setForm((cur) => ({
											...cur,
											proprietarioEmail: e.target.value,
										}))
									}
								/>
							</Field>
							<Field label="Contatos do locador">
								<textarea
									className={inputClass("min-h-24 md:col-span-2")}
									value={form.proprietarioContatos}
									onChange={(e) =>
										setForm((cur) => ({
											...cur,
											proprietarioContatos: e.target.value,
										}))
									}
								/>
							</Field>
							<Field label="Link do contrato original">
								<input
									className={inputClass()}
									value={form.linkContratoOriginal}
									onChange={(e) =>
										setForm((cur) => ({
											...cur,
											linkContratoOriginal: e.target.value,
										}))
									}
								/>
							</Field>
						</div>
					</div>

					<div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 p-5 sm:flex-row sm:justify-end">
						<ActionButton
							tone="slate"
							onClick={closeModal}
						>
							Cancelar
						</ActionButton>
						<ActionButton
							icon={Save}
							onClick={applyModalData}
							disabled={saving}
						>
							{quickModalSave ? "Salvar cadastro" : "Aplicar dados"}
						</ActionButton>
					</div>
				</ModalShell>
	);
}

// Extraido de ImoveisAdministrativosPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — mesma JSX de antes, sem mudanca de
// comportamento.
function ImoveisAguaEnergiaModal(props) {
	const {
	form,
	setForm,
	setAguaEnergiaModalOpen,
	quickModalSave,
	setQuickModalSave,
	handleSave,
	saving,
	} = props;
	const closeModal = () => {
		setAguaEnergiaModalOpen(false);
		setQuickModalSave?.(false);
	};
	async function applyModalData() {
		if (quickModalSave) {
			await handleSave?.();
		}
		closeModal();
	}
	return (
				<ModalShell
					onClose={closeModal}
					showClose={false}
					size="3xl"
					bodyClassName="p-0"
				>
					<div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
						<div className="flex items-center gap-3">
							<span className="rounded-2xl bg-blue-50 p-3 text-blue-700">
								<FileText size={22} />
							</span>
							<div>
								<h2 className="text-xl font-black text-slate-950">
									Contas de água e energia
								</h2>
								<p className="text-sm font-semibold text-slate-500">
									Informe os códigos de cliente e os valores médios para
									controle mensal do imóvel.
								</p>
							</div>
						</div>
						<button
							type="button"
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-50"
							onClick={closeModal}
						>
							Fechar
						</button>
					</div>

					<div className="grid gap-4 p-5 md:grid-cols-2">
						<Field label="Conta de energia valor médio">
							<input
								className={inputClass()}
								value={form.energiaValorMedio}
								onChange={(e) =>
									setForm((cur) => ({
										...cur,
										energiaValorMedio: e.target.value,
									}))
								}
							/>
						</Field>
						<Field label="Código de cliente de energia">
							<input
								className={inputClass()}
								value={form.energiaCodigoCliente}
								onChange={(e) =>
									setForm((cur) => ({
										...cur,
										energiaCodigoCliente: e.target.value,
									}))
								}
							/>
						</Field>
						<Field label="Conta de água valor médio">
							<input
								className={inputClass()}
								value={form.aguaValorMedio}
								onChange={(e) =>
									setForm((cur) => ({ ...cur, aguaValorMedio: e.target.value }))
								}
							/>
						</Field>
						<Field label="Código do cliente conta de água">
							<input
								className={inputClass()}
								value={form.aguaCodigoCliente}
								onChange={(e) =>
									setForm((cur) => ({
										...cur,
										aguaCodigoCliente: e.target.value,
									}))
								}
							/>
						</Field>
					</div>

					<div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 p-5 sm:flex-row sm:justify-end">
						<ActionButton
							tone="slate"
							onClick={closeModal}
						>
							Cancelar
						</ActionButton>
						<ActionButton
							icon={Save}
							onClick={applyModalData}
							disabled={saving}
						>
							{quickModalSave ? "Salvar cadastro" : "Aplicar dados"}
						</ActionButton>
					</div>
				</ModalShell>
	);
}

// Extraido de ImoveisAdministrativosPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — mesma JSX de antes, sem mudanca de
// comportamento.
function ImoveisPlacasModal(props) {
	const {
	setForm,
	setPlacasModalOpen,
	placasDraft,
	setPlacasDraft,
	} = props;
	return (
				<ModalShell
					onClose={() => setPlacasModalOpen(false)}
					showClose={false}
					size="xl"
					bodyClassName="p-0"
				>
					<div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
						<div className="flex items-center gap-3">
							<span className="rounded-2xl bg-blue-50 p-3 text-blue-700">
								<Car size={22} />
							</span>
							<div>
								<h2 className="text-xl font-black text-slate-950">
									Placas do estacionamento
								</h2>
								<p className="text-sm font-semibold text-slate-500">
									Informe uma placa por linha ou separe por vírgula.
								</p>
							</div>
						</div>
						<button
							type="button"
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-50"
							onClick={() => setPlacasModalOpen(false)}
						>
							Fechar
						</button>
					</div>

					<div className="space-y-4 p-5">
						<textarea
							className={inputClass("min-h-44 resize-y")}
							value={placasDraft}
							onChange={(e) => setPlacasDraft(e.target.value.toUpperCase())}
							placeholder={"ABC1D23\nXYZ9A87"}
							autoFocus
						/>
						<div className="flex flex-wrap gap-2">
							{placasDraft
								.split(/[,;\n]/)
								.map((placa) => placa.trim().toUpperCase())
								.filter(Boolean)
								.map((placa) => (
									<span
										key={placa}
										className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700"
									>
										{placa}
									</span>
								))}
						</div>
					</div>

					<div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 p-5 sm:flex-row sm:justify-end">
						<ActionButton
							tone="slate"
							onClick={() => setPlacasModalOpen(false)}
						>
							Cancelar
						</ActionButton>
						<ActionButton
							icon={Save}
							onClick={() => {
								const placas = placasDraft
									.split(/[,;\n]/)
									.map((placa) => placa.trim().toUpperCase())
									.filter(Boolean);
								setForm((cur) => ({ ...cur, placas: placas.join(", ") }));
								setPlacasModalOpen(false);
							}}
						>
							Salvar placas
						</ActionButton>
					</div>
				</ModalShell>
	);
}

// Extraidos de ImoveisAdministrativosPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — cabecalho (contador + acoes) e lista lateral
// de imoveis, mesma JSX/logica de antes.
function ImoveisPageHeader({
	podeGerenciar,
	config,
	setConfigDraft,
	setConfigOpen,
	setDeleteSelection,
	setDeleteModalOpen,
	loading,
	carregar,
	setSelectedId,
	setForm,
	setRegistros,
	setTab,
	setRelatoriosModalOpen,
	message,
	localReport,
}) {
	return (
		<>
			<div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="rounded-2xl bg-blue-50 p-3 text-blue-700">
						<Building2 size={26} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Imóveis</h1>
						<p className="text-sm font-semibold text-slate-500">
							Cadastro, contratos, reajustes, IPTU e relatórios dos imóveis
							administrativos.
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					{podeGerenciar ? (
						<>
							<ActionButton
								icon={Settings}
								tone="slate"
								onClick={() => {
									setConfigDraft({
										...config,
										empresasText: (config.empresas || []).join("\n"),
										classificacoesText: (config.classificacoes || []).join(
											"\n",
										),
										diretoriasText: (config.diretorias || []).join("\n"),
									});
									setConfigOpen(true);
								}}
							>
								Configurações
							</ActionButton>
							<ActionButton
								icon={FileText}
								tone="slate"
								onClick={() => setRelatoriosModalOpen(true)}
							>
								Relatórios
							</ActionButton>
							<ActionButton
								icon={Trash2}
								tone="slate"
								onClick={() => {
									setDeleteSelection([]);
									setDeleteModalOpen(true);
								}}
							>
								Excluir imóveis
							</ActionButton>
						</>
					) : null}
					<ActionButton
						icon={RefreshCw}
						tone="slate"
						loading={loading}
						onClick={carregar}
					>
						Atualizar
					</ActionButton>
					<ActionButton
						icon={Plus}
						onClick={() => {
							setSelectedId("");
							setForm(EMPTY_FORM);
							setRegistros(null);
							setTab("cadastro");
						}}
					>
						Novo imóvel
					</ActionButton>
				</div>
			</div>

			{message ? (
				<div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
					{message}
				</div>
			) : null}

		</>
	);
}

function ImoveisSidebarList({ imoveis, selectedId, setSelectedId }) {
	return (
		<aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<h2 className="font-black text-slate-950">Imóveis cadastrados</h2>
			<div className="mt-3 max-h-[620px] space-y-2 overflow-auto pr-1">
				{imoveis.map((item) => (
					<button
						key={item.id}
						type="button"
						onClick={() => setSelectedId(item.id)}
						className={`w-full rounded-xl border p-3 text-left transition ${selectedId === item.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
					>
						<div className="flex items-center justify-between gap-2">
							<p className="font-black text-slate-950">{item.seniorId}</p>
							<span
								className={`rounded-full px-2 py-0.5 text-[11px] font-black ${item.ativo === false ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
							>
								{item.ativo === false ? "Inativo" : "Ativo"}
							</span>
						</div>
						<p className="mt-1 truncate text-xs font-black text-slate-700">
							{item.nome || "Sem título"}
						</p>
						<p className="mt-1 truncate text-xs font-semibold text-slate-500">
							{item.endereco || "Sem endereço"}
						</p>
						<p className="mt-1 text-xs font-black uppercase text-blue-700">
							{item.base || "-"} · {item.tipoContrato || "-"}
						</p>
					</button>
				))}
			</div>
		</aside>
	);
}

// Extraidos de ImoveisAdministrativosPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — conteudo das abas de cadastro (aside + main
// com sub-abas) e a pilha de modais, mesma JSX/logica de antes.
function ImoveisTabContent({
	tab,
	imoveis,
	selectedId,
	setSelectedId,
	controller,
}) {
	if (tab === "dashboard" || tab === "detalhe") return null;
	return (
		<div className="relative z-[220] grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
			<ImoveisSidebarList
				imoveis={imoveis}
				selectedId={selectedId}
				setSelectedId={setSelectedId}
			/>

			<main className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				{tab === "cadastro" ? <ImovelCadastroTab {...controller} /> : null}

				{tab === "contratos" ? <ImovelContratosTab {...controller} /> : null}

				{tab === "historico" ? <ImovelHistoricoTab {...controller} /> : null}
			</main>
		</div>
	);
}

function ImoveisModals({
	deleteModalOpen,
	configOpen,
	aluguelModalOpen,
	aguaEnergiaModalOpen,
	placasModalOpen,
	relatoriosModalOpen,
	controller,
}) {
	return (
		<>
			{deleteModalOpen ? <ImoveisDeleteModal {...controller} /> : null}
			{configOpen ? <ImoveisConfigModal {...controller} /> : null}
			{aluguelModalOpen ? <ImoveisAluguelModal {...controller} /> : null}
			{aguaEnergiaModalOpen ? <ImoveisAguaEnergiaModal {...controller} /> : null}
			{placasModalOpen ? <ImoveisPlacasModal {...controller} /> : null}
			{relatoriosModalOpen ? <ImovelRelatoriosModal {...controller} /> : null}
		</>
	);
}

export default function ImoveisAdministrativosPage({ page = "dashboard" }) {
	const controller = useImoveisAdministrativosController(page);
	const {
	navigate,
	tab,
	setTab,
	imoveis,
	selectedId,
	setSelectedId,
	setForm,
	registros,
	setRegistros,
	dashboardRelatorio,
	dashboardDados,
	loading,
	saving,
	message,
	setMessage,
	config,
	configOpen,
	setConfigOpen,
	setConfigDraft,
	aluguelModalOpen,
	setAluguelModalOpen,
	aguaEnergiaModalOpen,
	setAguaEnergiaModalOpen,
	setQuickModalSave,
	deleteModalOpen,
	setDeleteModalOpen,
	setDeleteSelection,
	relatoriosModalOpen,
	setRelatoriosModalOpen,
	placasModalOpen,
	selected,
	podeGerenciar,
	localReport,
	carregar,
	submitRelated,
	handleExcluirImovel,
	isDetalhePage,
	} = controller;

	return (
		<div className="space-y-6 p-6">
			{!isDetalhePage ? (
				<ImoveisPageHeader
					podeGerenciar={podeGerenciar}
					config={config}
					setConfigDraft={setConfigDraft}
					setConfigOpen={setConfigOpen}
					setDeleteSelection={setDeleteSelection}
					setDeleteModalOpen={setDeleteModalOpen}
					loading={loading}
					carregar={carregar}
					setSelectedId={setSelectedId}
					setForm={setForm}
					setRegistros={setRegistros}
					setTab={setTab}
					setRelatoriosModalOpen={setRelatoriosModalOpen}
					message={message}
					localReport={localReport}
				/>
			) : null}

			{tab === "dashboard" ? (
				<ImoveisDashboard
					imoveis={imoveis}
					relatorio={dashboardRelatorio}
					dashboard={dashboardDados}
					canManage={podeGerenciar}
					onEdit={(item) => {
						setSelectedId(item.id);
						setTab("cadastro");
					}}
					onDelete={(item) => handleExcluirImovel(item.id)}
					onOpenImovel={(id) => {
						navigate(`/imoveis/${encodeURIComponent(id)}`);
					}}
				/>
			) : null}

			{tab === "detalhe" ? (
				<ImovelDetailPage
					imovel={selected}
					registros={registros}
					loading={loading}
					onBack={() => navigate("/imoveis")}
					onEdit={() => {
						setSelectedId(selected?.id || "");
						setTab("cadastro");
					}}
					onOpenContractModal={() => {
						setQuickModalSave(true);
						setAluguelModalOpen(true);
					}}
					onOpenUtilitiesModal={() => {
						setQuickModalSave(true);
						setAguaEnergiaModalOpen(true);
					}}
					canManage={podeGerenciar}
					onDelete={() => (selected ? handleExcluirImovel(selected.id) : null)}
					saving={saving}
					onUploadDocument={async (file) => {
						if (!file) return setMessage("Selecione um PDF.");
						await submitRelated(
							enviarContratoImovel,
							{ file, nome: file.name },
							"Documento PDF anexado.",
						);
					}}
				/>
			) : null}

			<ImoveisTabContent
				tab={tab}
				imoveis={imoveis}
				selectedId={selectedId}
				setSelectedId={setSelectedId}
				controller={controller}
			/>

			<ImoveisModals
				deleteModalOpen={deleteModalOpen}
				configOpen={configOpen}
				aluguelModalOpen={aluguelModalOpen}
				aguaEnergiaModalOpen={aguaEnergiaModalOpen}
				placasModalOpen={placasModalOpen}
				relatoriosModalOpen={relatoriosModalOpen}
				controller={controller}
			/>
		</div>
	);
}

function normalizePlacas(value) {
	if (Array.isArray(value)) return value;
	return String(value || "")
		.split(/[,;\n]/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function renderCurrencyDateCell(row, key) {
	if (key.includes("valor")) return formatCurrency(row[key]);
	if (key === "data") return formatDate(row[key]);
	return row[key] || "-";
}

function renderPaymentCell(row, key) {
	if (key === "valor") return formatCurrency(row[key]);
	if (key === "vencimento") return formatDate(row[key]);
	if (key === "pago") return row[key] ? "Sim" : "Não";
	return row[key] || "-";
}

function renderContractCell(row, key) {
	if (key === "createdAt") return formatDate(row[key]);
	if (key === "nome" && row.url) {
		return (
			<a
				href={row.url}
				target="_blank"
				rel="noreferrer"
				className="text-blue-700 underline"
			>
				{row.nome}
			</a>
		);
	}
	return row[key] || "-";
}

function renderDriveFileCell(row, key) {
	if (key === "data") return formatDate(row[key]);
	if (key !== "driveFileId") return row[key] || "-";
	const url = documentViewUrl(row);
	return url ? (
		<a
			href={url}
			target="_blank"
			rel="noreferrer"
			className="text-blue-700 underline"
		>
			Abrir arquivo
		</a>
	) : (
		"-"
	);
}

// Extraidos de ImovelDetailPage (achado javascript:S3776,
// docs/SONARQUBE-MAP.md) — grade de InfoPills e card do proprietario,
// mesma JSX/logica de antes.
function ImovelInfoPillsGrid({ imovel, placas, costPerSpot }) {
	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-3">
			<InfoPill
				label="Status"
				value={imovel.ativo === false ? "Inativo" : "Ativo"}
			/>
			<InfoPill
				label="Contrato"
				value={imovel.tipoContrato === "alugado" ? "Alugado" : "Próprio"}
			/>
			<InfoPill label="Empresa" value={String(imovel.base || "-").toUpperCase()} />
			<InfoPill label="Classificação" value={imovel.classificacao || "-"} />
			<InfoPill label="Diretoria" value={imovel.diretoria || "-"} />
			<InfoPill
				label="Nome do site"
				value={imovel.nomeSite || imovel.siteDso || "-"}
			/>
			<InfoPill label="CNPJ/CPF" value={imovel.cnpjCpf || "-"} />
			<InfoPill label="m²" value={imovel.metrosQuadrados || "-"} />
			<InfoPill
				label="Energia média"
				value={formatCurrency(imovel.energiaValorMedio || 0)}
			/>
			<InfoPill
				label="Cliente energia"
				value={imovel.energiaCodigoCliente || "-"}
			/>
			<InfoPill
				label="Água média"
				value={formatCurrency(imovel.aguaValorMedio || 0)}
			/>
			<InfoPill label="Cliente água" value={imovel.aguaCodigoCliente || "-"} />
			{imovel.tipoContrato === "alugado" ? (
				<>
					<InfoPill
						label="Valor original"
						value={formatCurrency(imovel.valorOriginal || 0)}
					/>
					<InfoPill
						label="Valor do aluguel"
						value={formatCurrency(imovel.valorAluguel || 0)}
					/>
					<InfoPill
						label="Valor por m²"
						value={formatCurrency(imovel.valorM2 || 0)}
					/>
					<InfoPill
						label="Vencimento"
						value={
							imovel.vencimentoAluguelDia
								? `Dia ${imovel.vencimentoAluguelDia}`
								: "-"
						}
					/>
					<InfoPill
						label="Início do contrato"
						value={formatDate(imovel.contratoInicio)}
					/>
					<InfoPill
						label="Fim do contrato"
						value={formatDate(imovel.contratoFim)}
					/>
					<InfoPill label="Mês do reajuste" value={imovel.mesReajuste || "-"} />
					<InfoPill
						label="Último reajuste"
						value={formatDate(imovel.dataUltimoReajuste)}
					/>
					<InfoPill
						label="Índice de reajuste"
						value={imovel.indiceReajuste || "-"}
					/>
				</>
			) : null}
			{imovel.estacionamento || imovel.temEstacionamento ? (
				<>
					<InfoPill label="Vagas" value={imovel.vagas || 0} />
					<InfoPill
						label="Custo por vaga"
						value={costPerSpot ? formatCurrency(costPerSpot) : "-"}
					/>
					<InfoPill label="Placas" value={placas.join(", ") || "-"} />
				</>
			) : null}
			<InfoPill label="Seguro" value={imovel.seguroTipo || "-"} />
			<InfoPill
				label="Vencimento seguro"
				value={formatDate(imovel.seguroVencimento)}
			/>
			{imovel.ativo === false ? (
				<>
					<InfoPill
						label="Data de inativação"
						value={formatDate(imovel.dataInativacao)}
					/>
					<InfoPill
						label="Motivo da inativação"
						value={imovel.motivoInativacao || "-"}
					/>
				</>
			) : null}
		</div>
	);
}

function ImovelProprietarioCard({ imovel, whatsappUrl }) {
	if (imovel.tipoContrato !== "alugado") return null;
	return (
		<div className="rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
			<p className="text-xs font-black uppercase tracking-wide text-orange-700">
				Proprietário
			</p>
			<h3 className="mt-1 text-lg font-black text-slate-950">
				{imovel.proprietarioNome || "-"}
			</h3>
			<div className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
				<p>{imovel.proprietarioEmail || "Sem e-mail cadastrado"}</p>
				<div className="flex flex-wrap items-center gap-2">
					<span>{imovel.proprietarioTelefone || "Sem telefone cadastrado"}</span>
					{whatsappUrl ? (
						<a
							href={whatsappUrl}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700"
						>
							<MessageCircle size={14} />
							WhatsApp
						</a>
					) : null}
				</div>
				{imovel.proprietarioContatos ? (
					<p>{imovel.proprietarioContatos}</p>
				) : null}
			</div>
		</div>
	);
}


function pickFirstValue(...values) {
	return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function getImovelFriendlyTitle(imovel = {}) {
	const classificacao = pickFirstValue(imovel.classificacao, imovel.tipoImovel, "Imovel");
	const cidade = pickFirstValue(imovel.cidade, imovel.municipio, "Cidade nao informada");
	const uf = pickFirstValue(imovel.estado, imovel.uf, "MG");
	const endereco = pickFirstValue(imovel.endereco, imovel.rua, imovel.nome, imovel.seniorId, "Endereco nao informado");
	return {
		title: `${String(classificacao).replace(/_/g, " ")} - ${cidade}/${uf}`,
		subtitle: endereco,
	};
}

function getImovelMonthlyCosts(imovel = {}) {
	const items = [
		["Aluguel", imovel.valorAluguel],
		["Energia media", imovel.energiaValorMedio],
		["Agua media", imovel.aguaValorMedio],
		["Seguro", imovel.seguroValorMensal],
	].map(([label, value]) => ({ label, value: parseMoneyValue(value) })).filter((item) => item.value > 0);
	return { items, total: items.reduce((sum, item) => sum + item.value, 0) };
}

function getImovelStatusLabel(imovel = {}) {
	const explicit = pickFirstValue(imovel.status, imovel.situacao);
	if (explicit) return explicit;
	if (imovel.ativo === false) return "Inativo";
	if (imovel.ativo === true) return "Ativo";
	return "Status nao informado";
}

function getImovelStatusTone(imovel = {}) {
	const status = String(getImovelStatusLabel(imovel)).toLowerCase();
	if (["ativo", "em operação", "em operacao"].some((item) => status.includes(item))) return "green";
	if (["inativo", "cancelado", "encerrado"].some((item) => status.includes(item))) return "red";
	return "slate";
}

function getImovelRentDueLabel(imovel = {}) {
	const due = pickFirstValue(imovel.vencimentoAluguelDia, imovel.vencimentoAluguel);
	return due ? `Dia ${due}` : "-";
}

function documentViewUrl(doc = {}) {
	if (doc.url) return doc.url;
	return doc.driveFileId ? driveFileUrl(doc.driveFileId) : "";
}

function getImovelIssues(imovel = {}, registros = {}) {
	const issues = [];
	if (!imovel.proprietarioNome) issues.push({ id: "owner", severity: "warning", title: "Proprietario nao cadastrado", description: "Vincule o responsavel para manter o contrato rastreavel." });
	if (String(imovel.tipoContrato || "").toLowerCase() === "alugado" && !imovel.valorAluguel) issues.push({ id: "rent", severity: "critical", title: "Aluguel sem valor informado", description: "Preencha o valor mensal para os indicadores financeiros." });
	if (String(imovel.tipoContrato || "").toLowerCase() === "alugado" && !pickFirstValue(imovel.vencimentoAluguelDia, imovel.vencimentoAluguel)) issues.push({ id: "due", severity: "warning", title: "Vencimento do aluguel nao informado", description: "Informe o dia de vencimento para alertas de agenda." });
	if (!imovel.endereco) issues.push({ id: "address", severity: "warning", title: "Endereco incompleto", description: "Complete o endereco para mapa, rotas e inventario." });
	if ((registros?.contratos || []).length === 0 && String(imovel.tipoContrato || "").toLowerCase() === "alugado") issues.push({ id: "contract", severity: "info", title: "Contrato nao anexado", description: "Adicione o contrato para consulta e auditoria." });
	return issues;
}

function DetailBadge({ children, tone = "slate" }) {
	const tones = {
		blue: "border-blue-200 bg-blue-50 text-blue-700",
		green: "border-emerald-200 bg-emerald-50 text-emerald-700",
		orange: "border-orange-200 bg-orange-50 text-orange-700",
		red: "border-red-200 bg-red-50 text-red-700",
		slate: "border-slate-200 bg-slate-50 text-slate-700",
	};
	return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black ${tones[tone] || tones.slate}`}>{children}</span>;
}

function DetailKpi({ label, value, icon: Icon, tone = "blue" }) {
	const tones = {
		blue: "bg-blue-50 text-blue-700 ring-blue-100",
		green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
		orange: "bg-orange-50 text-orange-700 ring-orange-100",
		red: "bg-red-50 text-red-700 ring-red-100",
		slate: "bg-slate-50 text-slate-700 ring-slate-100",
	};
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
					<p className="mt-2 break-words text-2xl font-black leading-tight text-slate-950">{value || "-"}</p>
				</div>
				{Icon ? <span className={`shrink-0 rounded-2xl p-3 ring-1 ${tones[tone] || tones.blue}`}><Icon size={18} /></span> : null}
			</div>
		</div>
	);
}

function DetailSection({ title, icon: Icon, action, children, className = "" }) {
	return (
		<section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					{Icon ? <span className="rounded-xl bg-blue-50 p-2 text-blue-700"><Icon size={18} /></span> : null}
					<h3 className="text-base font-black text-slate-950">{title}</h3>
				</div>
				{action}
			</div>
			{children}
		</section>
	);
}

function DetailRow({ label, value }) {
	return (
		<div className="grid min-w-0 gap-1 border-b border-slate-100 py-2 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)]">
			<span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
			<span className="min-w-0 overflow-hidden break-words text-sm font-bold leading-relaxed text-slate-800 [overflow-wrap:anywhere]">{value || "-"}</span>
		</div>
	);
}

function SmartEmpty({ title, description, action }) {
	return (
		<div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm">
			<p className="font-black text-slate-800">{title}</p>
			<p className="mt-1 font-semibold text-slate-500">{description}</p>
			{action ? <div className="mt-3">{action}</div> : null}
		</div>
	);
}

function ImovelDetailPage({
	imovel,
	registros,
	loading,
	onBack,
	onEdit,
	onOpenContractModal,
	onOpenUtilitiesModal,
	onDelete,
	onUploadDocument,
	saving = false,
	canManage = false,
}) {
	const [activeTab, setActiveTab] = useState("overview");
	const [actionsOpen, setActionsOpen] = useState(false);
	const [documentFile, setDocumentFile] = useState(null);

	if (loading && !imovel) {
		return (
			<div className="space-y-4">
				<div className="h-36 animate-pulse rounded-3xl bg-slate-200" />
				<div className="grid gap-3 md:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-200" />)}</div>
				<div className="grid gap-4 lg:grid-cols-2"><div className="h-72 animate-pulse rounded-2xl bg-slate-200" /><div className="h-72 animate-pulse rounded-2xl bg-slate-200" /></div>
			</div>
		);
	}

	if (!imovel) {
		return (
			<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
				<Home className="mx-auto text-slate-400" size={34} />
				<h2 className="mt-3 text-xl font-black text-slate-950">Imovel nao encontrado</h2>
				<p className="mt-1 text-sm font-semibold text-slate-500">Verifique o ID Senior informado ou volte para a lista de imoveis.</p>
				<ActionButton icon={ArrowLeft} tone="slate" className="mt-4" onClick={onBack}>Voltar para imoveis</ActionButton>
			</div>
		);
	}

	const maps = getMapsLinks(imovel.endereco);
	const embedUrl = imovel.embedUrl || maps.embedUrl;
	const streetViewUrl = imovel.streetViewUrl || maps.streetViewUrl;
	const friendly = getImovelFriendlyTitle(imovel);
	const monthlyCosts = getImovelMonthlyCosts(imovel);
	const docs = [...(registros?.contratos || []), ...(registros?.aditivos || []), ...(registros?.anexos || []), ...(registros?.iptus || [])];
	const assets = registros?.ativos || registros?.patrimonios || registros?.patrimonio || [];
	const issues = getImovelIssues(imovel, registros);
	const tabs = [
		["overview", "Visao geral"],
		["financial", "Financeiro"],
		["contracts", "Contratos"],
		["assets", "Patrimonio"],
		["documents", "Documentos"],
		["history", "Historico"],
	];
	const rentDue = getImovelRentDueLabel(imovel);

	return (
		<div className="space-y-5">
			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="min-w-0">
						<button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-2 text-sm font-black text-blue-700 hover:text-blue-900"><ArrowLeft size={17} /> Imoveis</button>
						<h2 className="text-2xl font-black leading-tight text-slate-950 md:text-3xl">{friendly.title}</h2>
						<p className="mt-2 max-w-4xl text-sm font-bold text-slate-500">{friendly.subtitle}</p>
						<div className="mt-4 flex flex-wrap gap-2">
							<DetailBadge tone={getImovelStatusTone(imovel)}>{getImovelStatusLabel(imovel)}</DetailBadge>
							<DetailBadge tone="blue">{imovel.classificacao || "Sem classificacao"}</DetailBadge>
							<DetailBadge tone={String(imovel.tipoContrato || "").toLowerCase() === "alugado" ? "orange" : "green"}>{String(imovel.tipoContrato || "proprio").toUpperCase()}</DetailBadge>
							<DetailBadge>{String(imovel.base || "-").toUpperCase()}</DetailBadge>
						</div>
					</div>
					<div className="flex shrink-0 flex-wrap items-center gap-2">
						<ActionButton icon={Save} tone="blue" onClick={onEdit}>Editar imovel</ActionButton>
						<div className="relative">
							<button type="button" onClick={() => setActionsOpen((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50">Mais acoes <ChevronDown size={16} /></button>
							{actionsOpen ? (
								<div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
									{maps.googleMapsUrl ? <a href={maps.googleMapsUrl} target="_blank" rel="noreferrer" className="block rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Abrir Google Maps</a> : null}
									{streetViewUrl ? <a href={streetViewUrl} target="_blank" rel="noreferrer" className="block rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Abrir Street View</a> : null}
									<button type="button" onClick={() => generateImovelFichaPdf(imovel, registros)} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50">Baixar relatório PDF</button>
									<button type="button" onClick={() => navigator.clipboard?.writeText(imovel.endereco || "")} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50">Copiar endereco</button>
									{canManage ? <button type="button" onClick={onDelete} className="block w-full rounded-xl px-3 py-2 text-left text-sm font-black text-red-600 hover:bg-red-50">Excluir imovel</button> : null}
								</div>
							) : null}
						</div>
					</div>
				</div>
			</section>

			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
				<DetailKpi label="Custo mensal" value={monthlyCosts.total ? formatCurrency(monthlyCosts.total) : "-"} icon={BarChart3} tone="green" />
				<DetailKpi label="Vencimento" value={rentDue} icon={CalendarClock} tone="orange" />
				<DetailKpi label="Ativos" value={assets.length} icon={Building2} tone="blue" />
				<DetailKpi label="Documentos" value={docs.length} icon={FileText} tone="slate" />
				<DetailKpi label="Pendencias" value={issues.length} icon={AlertTriangle} tone={issues.length ? "red" : "green"} />
			</div>

			<div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
				<div className="flex min-w-max gap-2">
					{tabs.map(([key, label]) => (
						<button key={key} type="button" onClick={() => setActiveTab(key)} className={`rounded-xl px-4 py-2 text-sm font-black transition ${activeTab === key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>
					))}
				</div>
			</div>

			{activeTab === "overview" ? (
				<div className="space-y-5">
					<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
						<DetailSection title="Localizacao" icon={MapPin} action={<div className="flex gap-2">{maps.googleMapsUrl ? <a href={maps.googleMapsUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">Maps</a> : null}{streetViewUrl ? <a href={streetViewUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-black text-orange-700">Street View</a> : null}</div>}>
							<div className="overflow-hidden rounded-2xl bg-slate-100">
								{embedUrl ? <iframe title={`Localizacao do imovel ${imovel.seniorId || imovel.id}`} src={embedUrl} className="h-64 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : <div className="flex h-64 items-center justify-center bg-gradient-to-br from-blue-950 via-blue-700 to-orange-500 text-white"><MapPin size={42} /></div>}
							</div>
							<p className="mt-3 text-sm font-bold text-slate-600">{imovel.endereco || "Endereco nao informado"}</p>
						</DetailSection>
						<DetailSection title="Informacoes do imovel" icon={Home}>
							<DetailRow label="Empresa" value={imovel.base ? String(imovel.base).toUpperCase() : "-"} />
							<DetailRow label="CNPJ/CPF" value={imovel.cnpjCpf} />
							<DetailRow label="Classificacao" value={imovel.classificacao} />
							<DetailRow label="Diretoria" value={imovel.diretoria} />
							<DetailRow label="Nome do site" value={imovel.nomeSite} />
							<DetailRow label="Status" value={getImovelStatusLabel(imovel)} />
							<DetailRow label="ID Senior" value={imovel.seniorId || imovel.id} />
						</DetailSection>
					</div>
					<div className="grid gap-5 xl:grid-cols-2">
						<ContractSummaryCard imovel={imovel} onEdit={onOpenContractModal || onEdit} />
						<PropertyIssuesCard issues={issues} onResolveIssue={(issue) => {
							if (["owner", "rent", "due", "contract"].includes(issue.id)) {
								onOpenContractModal?.();
							} else {
								onEdit?.();
							}
						}} />
						<PropertyOwner360Card imovel={imovel} onEdit={onOpenContractModal || onEdit} />
						<MonthlyCostsCard costs={monthlyCosts} onEdit={onOpenUtilitiesModal} />
						<AssetsPreviewCard assets={assets} />
						<DocumentsPreviewCard docs={docs} />
					</div>
				</div>
			) : null}

			{activeTab === "financial" ? <FinancialTab imovel={imovel} registros={registros} costs={monthlyCosts} /> : null}
			{activeTab === "contracts" ? <ContractsTab registros={registros} imovel={imovel} /> : null}
			{activeTab === "assets" ? <AssetsTab assets={assets} /> : null}
			{activeTab === "documents" ? <DocumentsTab docs={docs} registros={registros} documentFile={documentFile} setDocumentFile={setDocumentFile} onUploadDocument={async (file) => {
				if (!file) return;
				await onUploadDocument?.(file);
				setDocumentFile(null);
			}} saving={saving} /> : null}
			{activeTab === "history" ? <HistoryTab imovel={imovel} registros={registros} /> : null}
		</div>
	);
}

function ContractSummaryCard({ imovel, onEdit }) {
	return (
		<DetailSection title="Contrato atual" icon={FileText} action={onEdit ? <button type="button" onClick={onEdit} className="text-xs font-black text-blue-700">Ver detalhes</button> : null}>
			<DetailRow label="Tipo" value={imovel.tipoContrato === "alugado" ? "Alugado" : "Proprio"} />
			<DetailRow label="Valor mensal" value={imovel.valorAluguel ? formatCurrency(imovel.valorAluguel) : "-"} />
			<DetailRow label="Vencimento" value={getImovelRentDueLabel(imovel)} />
			<DetailRow label="Seguro" value={imovel.seguroTipo || "-"} />
			<DetailRow label="Seguro mensal" value={imovel.seguroValorMensal ? formatCurrency(imovel.seguroValorMensal) : "-"} />
			<DetailRow label="Vencimento seguro" value={formatDate(imovel.seguroVencimento)} />
		</DetailSection>
	);
}

function PropertyIssuesCard({ issues, onResolveIssue }) {
	return (
		<DetailSection title="Pendencias do imovel" icon={AlertTriangle}>
			{issues.length ? <div className="space-y-3">{issues.map((issue) => <div key={issue.id} className={`rounded-2xl border p-4 ${issue.severity === "critical" ? "border-red-200 bg-red-50" : issue.severity === "warning" ? "border-orange-200 bg-orange-50" : "border-blue-200 bg-blue-50"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{issue.title}</p><p className="mt-1 text-sm font-semibold text-slate-600">{issue.description}</p></div><button type="button" onClick={() => onResolveIssue?.(issue)} className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-700 shadow-sm">Resolver</button></div></div>)}</div> : <SmartEmpty title="Nenhuma pendencia critica" description="Os dados principais do imovel estao completos para a leitura executiva." />}
		</DetailSection>
	);
}

function PropertyOwner360Card({ imovel, onEdit }) {
	const whatsappUrl = getWhatsappUrl(imovel.proprietarioTelefone);
	return (
		<DetailSection title="Proprietario" icon={Building2} action={<button type="button" onClick={onEdit} className="text-xs font-black text-blue-700">{imovel.proprietarioNome ? "Ver cadastro" : "Cadastrar proprietario"}</button>}>
			{imovel.proprietarioNome ? <><DetailRow label="Nome" value={imovel.proprietarioNome} /><DetailRow label="CPF/CNPJ" value={imovel.proprietarioDocumento} /><DetailRow label="Telefone" value={imovel.proprietarioTelefone} /><DetailRow label="E-mail" value={imovel.proprietarioEmail} />{whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700"><MessageCircle size={16} /> WhatsApp</a> : null}</> : <SmartEmpty title="Proprietario nao cadastrado" description="Este imovel ainda nao possui proprietario vinculado." action={<button type="button" onClick={onEdit} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white">Cadastrar proprietario</button>} />}
		</DetailSection>
	);
}

function MonthlyCostsCard({ costs, onEdit }) {
	return (
		<DetailSection title="Resumo de custos" icon={PieChart} action={onEdit ? <button type="button" onClick={onEdit} className="text-xs font-black text-blue-700">Cadastrar custos</button> : null}>
			{costs.items.length ? <div className="space-y-2">{costs.items.map((item) => <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm"><span className="font-bold text-slate-600">{item.label}</span><span className="font-black text-slate-950">{formatCurrency(item.value)}</span></div>)}<div className="mt-3 flex items-center justify-between rounded-2xl bg-blue-600 px-4 py-3 text-white"><span className="text-sm font-black">Total mensal estimado</span><span className="text-lg font-black">{formatCurrency(costs.total)}</span></div></div> : <SmartEmpty title="Sem custos mensais cadastrados" description="Preencha aluguel, energia, agua ou seguro para compor o custo mensal estimado." />}
		</DetailSection>
	);
}

function AssetsPreviewCard({ assets }) {
	return (
		<DetailSection title="Patrimonio" icon={Building2}>
			{assets.length ? <div className="space-y-2">{assets.slice(0, 4).map((asset) => <div key={asset.id || asset.codigo || asset.patrimonio} className="rounded-xl bg-slate-50 p-3"><p className="font-black text-slate-900">{asset.codigo || asset.patrimonio || asset.nome || "Ativo"}</p><p className="text-sm font-semibold text-slate-500">{asset.categoria || asset.tipo || asset.status || "Sem categoria"}</p></div>)}</div> : <SmartEmpty title="Nenhum ativo vinculado" description="Este imovel ainda nao possui ativos patrimoniais associados." action={<span className="text-sm font-black text-blue-700">Abra a aba Patrimonio para vincular ativos.</span>} />}
		</DetailSection>
	);
}

function DocumentsPreviewCard({ docs }) {
	return (
		<DetailSection title="Documentacao" icon={FolderPlus}>
			{docs.length ? <div className="space-y-2">{docs.slice(0, 4).map((doc, index) => <div key={doc.id || doc.driveFileId || index} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><p className="font-black text-slate-900">{doc.nome || doc.categoria || "Documento"}</p><p className="text-sm font-semibold text-slate-500">{formatDate(doc.data || doc.createdAt) || "Data nao informada"}</p></div>{documentViewUrl(doc) ? <a href={documentViewUrl(doc)} target="_blank" rel="noreferrer" className="text-xs font-black text-blue-700">Visualizar</a> : null}</div>)}</div> : <SmartEmpty title="Nenhum documento vinculado" description="Contratos, aditivos, IPTU e anexos deste imovel aparecerao aqui." />}
		</DetailSection>
	);
}

function FinancialTab({ registros, costs }) {
	return <div className="grid items-start gap-5 xl:grid-cols-2"><MonthlyCostsCard costs={costs} /><DataTable title="Historico de reajustes" rows={registros?.reajustes || []} columns={[["data", "Data"], ["valorAnterior", "Valor anterior"], ["valorNovo", "Valor novo"], ["createdByName", "Registrado por"]]} renderCell={renderCurrencyDateCell} /><DataTable title="Alugueis lancados" rows={registros?.alugueis || []} columns={[["vencimento", "Vencimento"], ["valor", "Valor"], ["pago", "Pago"], ["createdByName", "Registrado por"]]} renderCell={renderPaymentCell} /><DataTable title="IPTU" rows={registros?.iptus || []} columns={[["vencimento", "Vencimento"], ["valor", "Valor"], ["pago", "Pago"], ["createdByName", "Registrado por"]]} renderCell={renderPaymentCell} /></div>;
}

function ContractsTab({ registros, imovel }) {
	return <div className="grid items-start gap-5 xl:grid-cols-2"><ContractSummaryCard imovel={imovel} /><DataTable title="Contratos vinculados" rows={registros?.contratos || []} columns={[["nome", "Nome"], ["tipo", "Origem"], ["createdByName", "Criado por"], ["createdAt", "Data"]]} renderCell={renderContractCell} /><DataTable title="Aditivos" rows={registros?.aditivos || []} columns={[["nome", "Nome"], ["data", "Data"], ["observacao", "Observacao"], ["driveFileId", "Anexo"]]} renderCell={renderDriveFileCell} /></div>;
}

function AssetsTab({ assets }) {
	return <DetailSection title="Ativos vinculados ao imovel" icon={Building2}>{assets.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Patrimonio</th><th className="px-3 py-2">Categoria</th><th className="px-3 py-2">Localizacao</th><th className="px-3 py-2">Responsavel</th><th className="px-3 py-2">Status</th></tr></thead><tbody>{assets.map((asset) => <tr key={asset.id || asset.codigo || asset.patrimonio} className="border-t border-slate-100"><td className="px-3 py-3 font-black text-slate-900">{asset.codigo || asset.patrimonio || asset.nome || "-"}</td><td className="px-3 py-3 font-semibold text-slate-600">{asset.categoria || asset.tipo || "-"}</td><td className="px-3 py-3 font-semibold text-slate-600">{asset.localizacao || asset.ambiente || "-"}</td><td className="px-3 py-3 font-semibold text-slate-600">{asset.responsavel || asset.custodia || "-"}</td><td className="px-3 py-3"><DetailBadge tone="green">{asset.status || "Ativo"}</DetailBadge></td></tr>)}</tbody></table></div> : <SmartEmpty title="Nenhum ativo vinculado" description="Este imovel ainda nao possui ativos patrimoniais associados." action={<a href="/facilities/patrimonio-inventario" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white">Abrir inventario</a>} />}</DetailSection>;
}

function DocumentsTab({ docs, registros, documentFile, setDocumentFile, onUploadDocument, saving }) {
	return <div className="grid items-start gap-5 xl:grid-cols-2"><DetailSection title="Anexar documento PDF" icon={Upload}><p className="text-sm font-semibold text-slate-500">Envie contratos e documentos do imóvel em PDF. O arquivo será salvo na VPS, dentro do armazenamento local de contratos.</p><input type="file" accept="application/pdf,.pdf" className={inputClass("mt-4")} onChange={(event) => setDocumentFile?.(event.target.files?.[0] || null)} /><ActionButton icon={Upload} loading={saving} className="mt-3" onClick={() => onUploadDocument?.(documentFile)}>Anexar PDF</ActionButton></DetailSection><DocumentsPreviewCard docs={docs} /><DataTable title="Fotos, videos e anexos" rows={registros?.anexos || []} columns={[["nome", "Arquivo"], ["categoria", "Categoria"], ["data", "Data"], ["observacao", "Observacao"], ["driveFileId", "Arquivo"]]} renderCell={renderDriveFileCell} /></div>;
}

function HistoryTab({ registros }) {
	const events = [
		...(registros?.reajustes || []).map((item) => ({ id: `reajuste-${item.id || item.createdAt}`, title: "Aluguel alterado", date: item.data || item.createdAt, description: `${formatCurrency(item.valorAnterior)} -> ${formatCurrency(item.valorNovo)}` })),
		...(registros?.anexos || []).map((item) => ({ id: `anexo-${item.id || item.driveFileId}`, title: "Documento anexado", date: item.data || item.createdAt, description: item.nome || item.categoria })),
		...(registros?.contratos || []).map((item) => ({ id: `contrato-${item.id || item.driveFileId}`, title: "Contrato criado", date: item.createdAt || item.data, description: item.nome })),
	].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
	return <DetailSection title="Historico consolidado" icon={History}>{events.length ? <div className="space-y-4">{events.map((event) => <div key={event.id} className="border-l-4 border-blue-200 pl-4"><p className="text-xs font-black uppercase text-blue-700">{formatDate(event.date) || "Sem data"}</p><p className="font-black text-slate-950">{event.title}</p><p className="text-sm font-semibold text-slate-500">{event.description || "Sem detalhes"}</p></div>)}</div> : <SmartEmpty title="Nenhum historico consolidado" description="Alteracoes, documentos e contratos registrados para este imovel aparecerao nesta linha do tempo." />}</DetailSection>;
}

function DashboardBarList({ title, icon: Icon, items = [], emptyText = "Sem dados", valueFormatter = (value) => value }) {
	const maxValue = Math.max(...items.map((item) => Number(item.valor || 0)), 1);
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="mb-4 flex items-center gap-2">
				<span className="rounded-xl bg-blue-50 p-2 text-blue-700">
					<Icon size={18} />
				</span>
				<h3 className="font-black text-slate-950">{title}</h3>
			</div>
			<div className="space-y-3">
				{items.length ? (
					items.slice(0, 5).map((item) => (
						<div key={item.id || item.label}>
							<div className="mb-1 flex items-center justify-between gap-3 text-sm">
								<span className="truncate font-black text-slate-700">
									{item.label}
								</span>
								<span className="shrink-0 font-black text-slate-950">
									{valueFormatter(item.valor)}
								</span>
							</div>
							<div className="h-2 rounded-full bg-slate-100">
								<div
									className="h-2 rounded-full bg-blue-600"
									style={{
										width: `${Math.max(4, Math.min(100, (Number(item.valor || 0) / maxValue) * 100))}%`,
									}}
								/>
							</div>
							<p className="mt-1 text-xs font-semibold text-slate-500">
								{item.count || 0} imóvel(is)
							</p>
						</div>
					))
				) : (
					<p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
						{emptyText}
					</p>
				)}
			</div>
		</section>
	);
}

function isRentedProperty(imovel = {}) {
	const type = String(imovel.tipoContrato || imovel.tipo_contrato || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	return (
		type.includes("alug") ||
		type.includes("loca") ||
		parseMoneyValue(imovel.valorAluguel || imovel.valorOriginal) > 0
	);
}

function getPropertyMonthlyCost(imovel = {}) {
	return parseMoneyValue(imovel.valorAluguel || imovel.valorOriginal || 0);
}

function getPropertyDisplayName(imovel = {}) {
	return imovel.nome || imovel.titulo || imovel.seniorId || imovel.id || "Imóvel";
}

function groupPropertyCost(items = [], keyGetter) {
	const grouped = new Map();
	items.forEach((item) => {
		const key = keyGetter(item) || "Não informado";
		const current = grouped.get(key) || { id: key, label: key, valor: 0, count: 0 };
		current.valor += getPropertyMonthlyCost(item);
		current.count += 1;
		grouped.set(key, current);
	});
	return Array.from(grouped.values()).sort((a, b) => b.valor - a.valor || b.count - a.count);
}

function buildLocalPropertyDashboard(imoveis = []) {
	const ativos = imoveis.filter((item) => item.ativo !== false);
	const alugados = ativos.filter(isRentedProperty);
	const proprios = ativos.filter((item) => !isRentedProperty(item));
	const custoMensalAtual = alugados.reduce(
		(total, item) => total + getPropertyMonthlyCost(item),
		0,
	);
	const maioresCustos = [...alugados]
		.sort((a, b) => getPropertyMonthlyCost(b) - getPropertyMonthlyCost(a))
		.slice(0, 10)
		.map((item) => ({
			imovelId: item.id,
			imovelNome: getPropertyDisplayName(item),
			cidade: item.cidade || "",
			base: item.base || "",
			valor: getPropertyMonthlyCost(item),
		}));
	const today = new Date();
	const proximosEventos = alugados
		.map((item) => {
			const dueDay = Number(item.vencimentoAluguelDia || 10);
			const dueDate = new Date(today.getFullYear(), today.getMonth(), Math.min(Math.max(dueDay, 1), 28));
			if (dueDate < today) dueDate.setMonth(dueDate.getMonth() + 1);
			return {
				tipo: "Aluguel a vencer",
				imovelId: item.id,
				imovelNome: getPropertyDisplayName(item),
				data: dueDate.toISOString().slice(0, 10),
				valor: getPropertyMonthlyCost(item),
			};
		})
		.sort((a, b) => String(a.data).localeCompare(String(b.data)))
		.slice(0, 12);
	return {
		kpis: {
			totalImoveis: imoveis.length,
			ativos: ativos.length,
			alugados: alugados.length,
			proprios: proprios.length,
			percentualAlugados: ativos.length ? (alugados.length / ativos.length) * 100 : 0,
			percentualProprios: ativos.length ? (proprios.length / ativos.length) * 100 : 0,
			custoMensalAtual,
			custoAnualProjetado: custoMensalAtual * 12,
		},
		custosPorRegional: groupPropertyCost(alugados, (item) => item.cidade || item.diretoria),
		custosPorEmpresa: groupPropertyCost(alugados, (item) => item.base),
		maioresCustos,
		proximosEventos,
	};
}

function PropertyExecutiveDashboard({ dashboard, imoveis = [], onOpenImovel }) {
	const localDashboard = useMemo(() => buildLocalPropertyDashboard(imoveis), [imoveis]);
	const rawKpis = dashboard?.kpis || {};
	const kpis = {
		...rawKpis,
		totalImoveis: Number(rawKpis.totalImoveis || 0) || localDashboard.kpis.totalImoveis,
		ativos: Number(rawKpis.ativos || 0) || localDashboard.kpis.ativos,
		alugados: Number(rawKpis.alugados || 0) || localDashboard.kpis.alugados,
		proprios: Number(rawKpis.proprios || 0) || localDashboard.kpis.proprios,
		percentualAlugados: Number(rawKpis.percentualAlugados || 0) || localDashboard.kpis.percentualAlugados,
		percentualProprios: Number(rawKpis.percentualProprios || 0) || localDashboard.kpis.percentualProprios,
		custoMensalAtual: Number(rawKpis.custoMensalAtual || 0) || localDashboard.kpis.custoMensalAtual,
		custoAnualProjetado: Number(rawKpis.custoAnualProjetado || 0) || localDashboard.kpis.custoAnualProjetado,
	};
	const maioresCustos = dashboard?.maioresCustos?.length ? dashboard.maioresCustos : localDashboard.maioresCustos;
	const requerAtencao = dashboard?.requerAtencao || [];
	const proximosEventos = dashboard?.proximosEventos?.length ? dashboard.proximosEventos : localDashboard.proximosEventos;
	const custosPorRegional = dashboard?.custosPorRegional?.length ? dashboard.custosPorRegional : localDashboard.custosPorRegional;
	const custosPorEmpresa = dashboard?.custosPorEmpresa?.length ? dashboard.custosPorEmpresa : localDashboard.custosPorEmpresa;
	const totalFallback = imoveis.length;
	const alugadosFallback = localDashboard.kpis.alugados;
	const propriosFallback = localDashboard.kpis.proprios;
	const totalImoveis = kpis.totalImoveis ?? totalFallback;
	const alugados = kpis.alugados ?? alugadosFallback;
	const proprios = kpis.proprios ?? propriosFallback;
	const hasCostHistory = dashboard?.metadados?.historicoCustosDisponivel;
	const dashboardListPageSize = 5;
	const [maioresCustosPage, setMaioresCustosPage] = useState(1);
	const [proximosEventosPage, setProximosEventosPage] = useState(1);
	const maioresCustosTotalPages = Math.max(1, Math.ceil(maioresCustos.length / dashboardListPageSize));
	const proximosEventosTotalPages = Math.max(1, Math.ceil(proximosEventos.length / dashboardListPageSize));
	const maioresCustosCurrentPage = Math.min(maioresCustosPage, maioresCustosTotalPages);
	const proximosEventosCurrentPage = Math.min(proximosEventosPage, proximosEventosTotalPages);
	const maioresCustosPaginados = maioresCustos.slice(
		(maioresCustosCurrentPage - 1) * dashboardListPageSize,
		maioresCustosCurrentPage * dashboardListPageSize,
	);
	const proximosEventosPaginados = proximosEventos.slice(
		(proximosEventosCurrentPage - 1) * dashboardListPageSize,
		proximosEventosCurrentPage * dashboardListPageSize,
	);
	return (
		<div className="space-y-5">
			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<StatCard icon={Home} label="Total de imóveis" value={totalImoveis} hint="Imóveis cadastrados" />
				<StatCard icon={CalendarClock} label="Custo mensal" value={formatCurrency(kpis.custoMensalAtual || 0)} hint="Aluguéis ativos" tone="orange" />
				<StatCard icon={BarChart3} label="Custo anual" value={formatCurrency(kpis.custoAnualProjetado || 0)} hint="Projetado pelos contratos atuais" tone="slate" />
				<StatCard icon={AlertTriangle} label="Atenção" value={kpis.contratosAtencao || 0} hint="Contratos até 90 dias" tone="orange" />
			</section>

			<section className="grid items-start gap-4 xl:grid-cols-[1.1fr_0.9fr]">
				<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="mb-4 flex items-center gap-2">
						<span className="rounded-xl bg-red-50 p-2 text-red-700">
							<AlertTriangle size={18} />
						</span>
						<div>
							<h3 className="font-black text-slate-950">Requer atenção</h3>
							<p className="text-xs font-semibold text-slate-500">
								Ordenado por criticidade e vencimento.
							</p>
						</div>
					</div>
					<div className="space-y-2">
						{requerAtencao.length ? (
							requerAtencao.slice(0, 6).map((item, index) => (
								<button
									type="button"
									key={`${item.tipo}-${item.imovelId}-${index}`}
									onClick={() => item.imovelId && onOpenImovel?.(item.imovelId)}
									className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
								>
									<div>
										<p className={`text-xs font-black uppercase ${item.severidade === "critico" ? "text-red-700" : item.severidade === "alto" ? "text-orange-700" : "text-amber-700"}`}>
											{item.tipo}
										</p>
										<p className="mt-1 font-black text-slate-950">
											{item.imovelNome}
										</p>
										<p className="text-sm font-semibold text-slate-600">
											{item.descricao}
										</p>
									</div>
									<span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
										{formatDate(item.data)}
									</span>
								</button>
							))
						) : (
							<p className="rounded-xl bg-emerald-50 p-4 text-sm font-black text-emerald-700">
								Nenhuma pendência crítica encontrada nos dados atuais.
							</p>
						)}
					</div>
				</div>

				<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="mb-4 flex items-center gap-2">
						<span className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
							<PieChart size={18} />
						</span>
						<h3 className="font-black text-slate-950">Próprios x alugados</h3>
					</div>
					<div className="space-y-4">
						{[
							{ label: "Alugados", value: alugados, color: "bg-orange-500" },
							{ label: "Próprios", value: proprios, color: "bg-emerald-500" },
						].map((item) => {
							const pct = totalImoveis ? (item.value / totalImoveis) * 100 : 0;
							return (
								<div key={item.label}>
									<div className="mb-1 flex justify-between text-sm font-black text-slate-700">
										<span>{item.label}</span>
										<span>{item.value} · {formatPercent(pct)}</span>
									</div>
									<div className="h-3 rounded-full bg-slate-100">
										<div
											className={`h-3 rounded-full ${item.color}`}
											style={{ width: `${Math.max(3, pct)}%` }}
										/>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</section>

			<section className="grid items-stretch gap-4 xl:grid-cols-2">
				<DashboardBarList
					title="Custo mensal por cidade"
					icon={BarChart3}
					items={custosPorRegional}
					valueFormatter={formatCurrency}
				/>
				<DashboardBarList
					title="Custo por empresa"
					icon={Building2}
					items={custosPorEmpresa}
					valueFormatter={formatCurrency}
				/>
			</section>

			<section className="grid items-stretch gap-4 xl:grid-cols-2">
				<div className="flex h-full flex-col overflow-hidden rounded-3xl border border-orange-100 bg-gradient-to-br from-white via-orange-50/40 to-amber-50 p-0 shadow-sm">
					<div className="flex items-center justify-between gap-3 border-b border-orange-100/80 bg-white/70 px-5 py-4">
						<div className="flex items-center gap-3">
							<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
								<CalendarClock size={20} />
							</span>
							<div>
								<h3 className="font-black text-slate-950">Maiores custos mensais</h3>
								<p className="text-xs font-bold text-orange-700">Top 5 aluguéis ativos</p>
							</div>
						</div>
						<span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-700">{maioresCustos.length} total</span>
					</div>
					<div className="flex flex-1 flex-col gap-3 p-4">
						{maioresCustos.length ? maioresCustosPaginados.map((item, index) => (
							<button
								type="button"
								key={item.imovelId}
								onClick={() => onOpenImovel?.(item.imovelId)}
								className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/80 bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md"
							>
								<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-600 text-sm font-black text-white shadow-sm shadow-orange-200">
									{(maioresCustosCurrentPage - 1) * dashboardListPageSize + index + 1}
								</span>
								<span className="min-w-0">
									<span className="block truncate text-sm font-black text-slate-800 group-hover:text-orange-700">{item.imovelNome}</span>
									<span className="mt-0.5 block text-xs font-semibold text-slate-500">Custo mensal recorrente</span>
								</span>
								<span className="shrink-0 rounded-2xl bg-slate-950 px-3 py-2 text-sm font-black text-white">
									{formatCurrency(item.valor)}
								</span>
							</button>
						)) : (
							<p className="rounded-2xl border border-dashed border-orange-200 bg-white/70 p-4 text-sm font-bold text-slate-500">
								Sem custos mensais cadastrados.
							</p>
						)}
						{maioresCustos.length ? (
							<DashboardMiniPagination
								page={maioresCustosCurrentPage}
								totalPages={maioresCustosTotalPages}
								onPrevious={() => setMaioresCustosPage((page) => Math.max(1, page - 1))}
								onNext={() => setMaioresCustosPage((page) => Math.min(maioresCustosTotalPages, page + 1))}
							/>
						) : null}
					</div>
				</div>
				<div className="flex h-full flex-col overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/40 to-cyan-50 p-0 shadow-sm">
					<div className="flex items-center justify-between gap-3 border-b border-blue-100/80 bg-white/70 px-5 py-4">
						<div className="flex items-center gap-3">
							<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
								<AlertTriangle size={20} />
							</span>
							<div>
								<h3 className="font-black text-slate-950">Próximos eventos</h3>
								<p className="text-xs font-bold text-blue-700">Top 5 vencimentos mais próximos</p>
							</div>
						</div>
						<span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">{proximosEventos.length} total</span>
					</div>
					<div className="flex flex-1 flex-col gap-3 p-4">
						{proximosEventos.length ? proximosEventosPaginados.map((item, index) => (
							<button
								type="button"
								key={`${item.tipo}-${item.imovelId}-${index}`}
								onClick={() => item.imovelId && onOpenImovel?.(item.imovelId)}
								className="group grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-white/80 bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
							>
								<span className="flex min-h-12 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-blue-600 px-2 text-white shadow-sm shadow-blue-200">
									<span className="text-[11px] font-black leading-none">{formatDate(item.data).slice(0, 5)}</span>
									<span className="mt-1 text-[10px] font-bold leading-none opacity-90">{formatDate(item.data).slice(6)}</span>
								</span>
								<span className="min-w-0">
									<span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700">{item.tipo}</span>
									<span className="mt-1 block truncate text-sm font-bold text-slate-700 group-hover:text-blue-700">{item.imovelNome}</span>
								</span>
							</button>
						)) : (
							<p className="rounded-2xl border border-dashed border-blue-200 bg-white/70 p-4 text-sm font-bold text-slate-500">
								Sem eventos próximos cadastrados.
							</p>
						)}
						{proximosEventos.length ? (
							<DashboardMiniPagination
								page={proximosEventosCurrentPage}
								totalPages={proximosEventosTotalPages}
								onPrevious={() => setProximosEventosPage((page) => Math.max(1, page - 1))}
								onNext={() => setProximosEventosPage((page) => Math.min(proximosEventosTotalPages, page + 1))}
							/>
						) : null}
					</div>
				</div>
			</section>

			{hasCostHistory ? null : (
				<div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
					Evolução histórica de custos será exibida a partir dos eventos
					financeiros registrados no ADM. Não foram criados dados fictícios.
				</div>
			)}
		</div>
	);
}

function DashboardMiniPagination({ page, totalPages, onPrevious, onNext }) {
	return (
		<div className="mt-auto flex items-center justify-between gap-3 border-t border-white/80 pt-3">
			<span className="text-xs font-black text-slate-500">
				Página {page} de {totalPages}
			</span>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={onPrevious}
					disabled={page <= 1}
					className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Anterior
				</button>
				<button
					type="button"
					onClick={onNext}
					disabled={page >= totalPages}
					className="rounded-xl bg-slate-950 px-3 py-1.5 text-xs font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Próxima
				</button>
			</div>
		</div>
	);
}

const IMOVEIS_DASHBOARD_PAGE_SIZE = 10;

function ImoveisDashboard({
	imoveis = [],
	relatorio,
	dashboard,
	onEdit,
	onOpenImovel,
	onDelete,
	canManage = false,
}) {
	const [buscaImoveis, setBuscaImoveis] = useState("");
	const [paginaImoveis, setPaginaImoveis] = useState(1);
	const hasMonthlyReport = Boolean(relatorio);
	const contratosProximos = relatorio?.contratosProximos || [];
	const iptuProximo = relatorio?.iptuProximo || [];
	const aluguelProximo = relatorio?.aluguelProximo || [];

	useEffect(() => {
		setPaginaImoveis(1);
	}, [buscaImoveis]);

	const imoveisFiltrados = useMemo(() => {
		const query = buscaImoveis.trim().toLowerCase();
		if (!query) return imoveis;
		return imoveis.filter((item) =>
			[item.nome, item.seniorId, item.endereco].some((value) =>
				String(value || "")
					.toLowerCase()
					.includes(query),
			),
		);
	}, [imoveis, buscaImoveis]);

	const totalPaginasImoveis = Math.max(
		1,
		Math.ceil(imoveisFiltrados.length / IMOVEIS_DASHBOARD_PAGE_SIZE),
	);
	const paginaAtualImoveis = Math.min(paginaImoveis, totalPaginasImoveis);
	const imoveisPaginados = imoveisFiltrados.slice(
		(paginaAtualImoveis - 1) * IMOVEIS_DASHBOARD_PAGE_SIZE,
		paginaAtualImoveis * IMOVEIS_DASHBOARD_PAGE_SIZE,
	);

	if (!imoveis.length) {
		return (
			<div className="space-y-4">
				<MonthlyDashboardReport
					relatorio={relatorio}
					onOpenImovel={onOpenImovel}
				/>
				<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
					<Building2 className="mx-auto text-blue-600" size={34} />
					<h2 className="mt-3 text-xl font-black text-slate-950">
						Nenhum imóvel cadastrado
					</h2>
					<p className="mt-1 text-sm font-semibold text-slate-500">
						Clique em Novo imóvel para iniciar o cadastro dos imóveis
						administrativos.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-5">
			<PropertyExecutiveDashboard
				dashboard={dashboard}
				imoveis={imoveis}
				onOpenImovel={onOpenImovel}
			/>
			<MonthlyDashboardReport
				relatorio={relatorio}
				contratosProximos={contratosProximos}
				iptuProximo={iptuProximo}
				aluguelProximo={aluguelProximo}
				onOpenImovel={onOpenImovel}
			/>
			{!hasMonthlyReport ? (
				<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
					Não foi possível carregar o resumo mensal agora. Os cards dos imóveis
					continuam disponíveis.
				</div>
			) : null}

			<div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
				<label className="relative flex-1 sm:max-w-sm">
					<Search
						className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
						size={18}
					/>
					<input
						value={buscaImoveis}
						onChange={(event) => setBuscaImoveis(event.target.value)}
						placeholder="Buscar imóvel por nome"
						className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
					/>
				</label>
				<p className="text-sm font-semibold text-slate-500">
					Mostrando {imoveisPaginados.length} de {imoveisFiltrados.length}{" "}
					imóvel(is){buscaImoveis ? ` · filtrado de ${imoveis.length}` : ""}
				</p>
			</div>

			{!imoveisFiltrados.length ? (
				<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
					<Search className="mx-auto text-blue-600" size={28} />
					<h2 className="mt-3 text-lg font-black text-slate-950">
						Nenhum imóvel encontrado
					</h2>
					<p className="mt-1 text-sm font-semibold text-slate-500">
						Ajuste o termo buscado para ampliar o resultado.
					</p>
				</div>
			) : (
			<div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
				{imoveisPaginados.map((item) => {
					const maps = getMapsLinks(item.endereco);
					const embedUrl = item.embedUrl || maps.embedUrl;
					const costPerSpot = calculateCostPerParkingSpot(item);
					return (
						<article
							key={item.id}
							className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
						>
							<div className="relative h-44 bg-slate-100">
								{embedUrl ? (
									<iframe
										title={`Localização do imóvel ${item.seniorId}`}
										src={embedUrl}
										className="h-full w-full border-0"
										loading="lazy"
										referrerPolicy="no-referrer-when-downgrade"
									/>
								) : (
									<div className="flex h-full items-center justify-center bg-gradient-to-br from-blue-950 via-slate-900 to-orange-600 text-white">
										<MapPin size={40} />
									</div>
								)}
								<span
									className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-black shadow-sm ${item.ativo === false ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
								>
									{item.ativo === false ? "Inativo" : "Ativo"}
								</span>
								{item.estacionamento ? (
									<span className="absolute right-3 top-3 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 shadow-sm">
										Estacionamento
									</span>
								) : null}
							</div>

							<div className="space-y-4 p-4">
								<div>
									<p className="text-xs font-black uppercase tracking-wide text-slate-500">
										Imóvel
									</p>
									<h3 className="text-xl font-black text-slate-950">
										{item.nome || `Imóvel ${item.seniorId || item.id}`}
									</h3>
									<p className="mt-1 text-xs font-black uppercase tracking-wide text-blue-700">
										ID Sênior: {item.seniorId || item.id}
									</p>
									<p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-500">
										{item.endereco || "Endereço não informado"}
									</p>
								</div>

								<div className="grid grid-cols-2 gap-2 text-sm">
									<InfoPill
										label="Base"
										value={String(item.base || "-").toUpperCase()}
									/>
									<InfoPill
										label="Tipo"
										value={
											item.tipoContrato === "alugado" ? "Alugado" : "Próprio"
										}
									/>
									{item.tipoContrato === "alugado" ? (
										<>
											<InfoPill
												label="Aluguel"
												value={formatCurrency(item.valorAluguel || 0)}
											/>
											<InfoPill
												label="Vencimento"
												value={
													item.vencimentoAluguelDia
														? `Dia ${item.vencimentoAluguelDia}`
														: "-"
												}
											/>
											<InfoPill
												label="Proprietário"
												value={item.proprietarioNome || "-"}
												className="col-span-2"
											/>
										</>
									) : null}
									{item.estacionamento ? (
										<>
											<InfoPill label="Vagas" value={item.vagas || 0} />
											<InfoPill
												label="Custo por vaga"
												value={costPerSpot ? formatCurrency(costPerSpot) : "-"}
											/>
											<InfoPill
												label="Placas"
												value={
													Array.isArray(item.placas)
														? item.placas.join(", ") || "-"
														: item.placas || "-"
												}
											/>
										</>
									) : null}
								</div>

								<div className="flex flex-wrap gap-2">
									<ActionButton
										icon={Home}
										className="flex-1"
										onClick={() => onOpenImovel?.(item.id || item.seniorId)}
									>
										Ver imóvel
									</ActionButton>
									<ActionButton
										icon={Save}
										tone="slate"
										className="flex-1"
										onClick={() => onEdit?.(item)}
									>
										Editar
									</ActionButton>
									{canManage ? (
										<ActionButton
											icon={Trash2}
											tone="slate"
											onClick={() => onDelete?.(item)}
										>
											Excluir
										</ActionButton>
									) : null}
									{item.streetViewUrl || maps.streetViewUrl ? (
										<a
											href={item.streetViewUrl || maps.streetViewUrl}
											target="_blank"
											rel="noreferrer"
											className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50"
										>
											<MapPin size={16} />
											Street View
										</a>
									) : null}
								</div>
							</div>
						</article>
					);
				})}
			</div>
			)}

			{imoveisFiltrados.length ? (
				<div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
					<p className="text-sm font-semibold text-slate-500">
						Página {paginaAtualImoveis} de {totalPaginasImoveis}
					</p>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setPaginaImoveis(1)}
							disabled={paginaAtualImoveis <= 1}
							className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
						>
							«
						</button>
						<button
							type="button"
							onClick={() =>
								setPaginaImoveis((current) => Math.max(1, current - 1))
							}
							disabled={paginaAtualImoveis <= 1}
							className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
						>
							Anterior
						</button>
						<button
							type="button"
							onClick={() =>
								setPaginaImoveis((current) =>
									Math.min(totalPaginasImoveis, current + 1),
								)
							}
							disabled={paginaAtualImoveis >= totalPaginasImoveis}
							className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
						>
							Próxima
						</button>
						<button
							type="button"
							onClick={() => setPaginaImoveis(totalPaginasImoveis)}
							disabled={paginaAtualImoveis >= totalPaginasImoveis}
							className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
						>
							»
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}

function MonthlyDashboardReport({
	relatorio,
	contratosProximos = [],
	iptuProximo = [],
	aluguelProximo = [],
	onOpenImovel,
}) {
	const [open, setOpen] = useState(false);
	const resumo = relatorio?.resumo || {};
	return (
		<div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 className="text-lg font-black text-slate-950">Resumo do mês</h2>
					<p className="text-sm font-semibold text-slate-500">
						Indicadores financeiros e vencimentos do mês atual.
					</p>
				</div>
				<button
					type="button"
					onClick={() => setOpen((current) => !current)}
					className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50"
					aria-expanded={open}
				>
					{open ? "Fechar resumo" : "Abrir resumo"}
					<ChevronDown
						size={16}
						className={`transition-transform ${open ? "rotate-180" : ""}`}
					/>
				</button>
			</div>
			{open ? (
				<>
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						<StatCard
							icon={Home}
							label="Gasto IPTU"
							value={formatCurrency(resumo.gastosIptu || 0)}
						/>
						<StatCard
							icon={CalendarClock}
							label="Gasto aluguel"
							value={formatCurrency(resumo.gastosAluguel || 0)}
							tone="orange"
						/>
						<StatCard
							icon={FileText}
							label="Contratos vencendo"
							value={contratosProximos.length}
							tone="green"
						/>
						<StatCard
							icon={Car}
							label="Aluguéis vencendo"
							value={aluguelProximo.length}
							tone="slate"
						/>
					</div>
					<DataTable
						title="Contratos próximos de vencimento"
						rows={contratosProximos}
						columns={[
							["seniorId", "Imóvel"],
							["proprietarioNome", "Proprietário"],
							["contratoFim", "Fim"],
						]}
						renderCell={(row, key) => {
							if (key === "contratoFim") return formatDate(row[key]);
							if (key === "seniorId")
								return (
									<ImovelTableLink row={row} onOpenImovel={onOpenImovel} />
								);
							return row[key] || "-";
						}}
					/>
					<DataTable
						title="Avisos de IPTU próximo do vencimento"
						rows={iptuProximo}
						columns={[
							["imovelId", "Imóvel"],
							["valor", "Valor"],
							["vencimento", "Vencimento"],
						]}
						renderCell={(row, key) => {
							if (key === "valor") return formatCurrency(row[key]);
							if (key === "vencimento") return formatDate(row[key]);
							if (key === "imovelId")
								return (
									<ImovelTableLink
										row={{ ...row, seniorId: row.imovelId }}
										onOpenImovel={onOpenImovel}
									/>
								);
							return row[key] || "-";
						}}
					/>
					<DataTable
						title="Aluguel próximo do vencimento"
						rows={aluguelProximo}
						columns={[
							["seniorId", "Imóvel"],
							["valorAluguel", "Valor"],
							["vencimentoAluguel", "Vencimento"],
						]}
						renderCell={(row, key) => {
							if (key === "valorAluguel") return formatCurrency(row[key]);
							if (key === "vencimentoAluguel") return formatDate(row[key]);
							if (key === "seniorId")
								return (
									<ImovelTableLink row={row} onOpenImovel={onOpenImovel} />
								);
							return row[key] || "-";
						}}
					/>
				</>
			) : null}
		</div>
	);
}

function ImovelTableLink({ row = {}, onOpenImovel }) {
	const id = row.id || row.seniorId || row.imovelId;
	const label = row.nome || row.titulo || row.seniorId || row.imovelId || "-";
	if (!id || !onOpenImovel) return label;
	return (
		<button
			type="button"
			onClick={() => onOpenImovel(id)}
			className="text-left font-black text-blue-700 underline decoration-blue-200 underline-offset-2 hover:text-blue-900"
		>
			{label}
			{row.nome && row.seniorId ? (
				<span className="ml-1 font-semibold text-slate-500">
					({row.seniorId})
				</span>
			) : null}
		</button>
	);
}

function InfoPill({ label, value, className = "" }) {
	return (
		<div
			className={`rounded-xl border border-slate-200 bg-slate-50 p-3 ${className}`}
		>
			<p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
				{label}
			</p>
			<p className="mt-1 truncate font-black text-slate-900">{value}</p>
		</div>
	);
}

function DataTable({ title, rows = [], columns = [], renderCell }) {
	return (
		<div className="overflow-hidden rounded-xl border border-slate-200">
			<div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
				<h3 className="font-black text-slate-950">{title}</h3>
				<p className="text-xs font-semibold text-slate-500">
					{rows.length} registro(s)
				</p>
			</div>
			<div className="overflow-x-auto">
				<table className="min-w-[760px] w-full divide-y divide-slate-100 text-sm">
					<thead className="bg-white">
						<tr>
							{columns.map(([, label]) => (
								<th
									key={label}
									className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500"
								>
									{label}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100 bg-white">
						{rows.length ? (
							rows.map((row, index) => (
								<tr key={row.id || index}>
									{columns.map(([key]) => (
										<td
											key={key}
											className="px-4 py-3 font-semibold text-slate-700"
										>
											{renderCell ? renderCell(row, key) : row[key] || "-"}
										</td>
									))}
								</tr>
							))
						) : (
							<tr>
								<td
									colSpan={columns.length || 1}
									className="px-4 py-8 text-center font-bold text-slate-400"
								>
									Nenhum registro encontrado.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

