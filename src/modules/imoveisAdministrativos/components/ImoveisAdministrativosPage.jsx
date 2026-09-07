import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
	ArrowLeft,
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
	Plus,
	RefreshCw,
	Save,
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
import { addClusterLogo } from "../../../utils/pdfBranding";
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
		"conta de energia valor medio": "energiaValorMedio",
		"codigo de cliente de energia": "energiaCodigoCliente",
		"conta de agua valor medio": "aguaValorMedio",
		"codigo do cliente conta de agua": "aguaCodigoCliente",
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
		seguro: "seguroTipo",
		"valor seguro mes": "seguroValorMensal",
		"link da apolice": "linkApolice",
		"link do contrato de vigilancia": "vigilanciaContratoLink",
		"vigilancia valor mensal": "vigilanciaValorMensal",
		"limpeza contrato": "limpezaContrato",
		"limpeza valor medio": "limpezaValorMedio",
		"link do ppci": "ppciLink",
		"ppci vencimento": "ppciVencimento",
		"link do avcb": "avcbLink",
		"avcb vencimento": "avcbVencimento",
	};
	const items = [];
	workbook.SheetNames.filter(
		(sheetName) => !normalize(sheetName).includes("mapa"),
	).forEach((sheetName) => {
		const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
			header: 1,
			defval: "",
		});
		const headers = (rows[0] || []).map(
			(header) => mapping[normalize(header)] || null,
		);
		rows.slice(1).forEach((row, index) => {
			const item = {};
			headers.forEach((field, columnIndex) => {
				if (field) item[field] = row[columnIndex];
			});
			if (!item.endereco && !item.nomeSite && !item.proprietarioNome) return;
			const key = [
				item.base,
				item.cidade,
				item.endereco || item.nomeSite || index,
			]
				.filter(Boolean)
				.join("-");
			item.seniorId = String(item.seniorId || key).slice(0, 80);
			item.nome = item.nomeSite || item.endereco || `Imóvel ${item.seniorId}`;
			item.tipoContrato = item.valorAluguel ? "alugado" : "proprio";
			item.ativo = !["inativo", "cancelado", "encerrado"].includes(
				String(item.situacao || "")
					.trim()
					.toLowerCase(),
			);
			items.push(item);
		});
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
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-xs font-black uppercase tracking-wide text-slate-500">
						{label}
					</p>
					<p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
					{hint ? (
						<p className="mt-1 text-xs font-semibold text-slate-500">{hint}</p>
					) : null}
				</div>
				<span className={`rounded-xl p-3 ${tones[tone] || tones.blue}`}>
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

export default function ImoveisAdministrativosPage({ page = "dashboard" }) {
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
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [deleteSelection, setDeleteSelection] = useState([]);
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
			const [items, monthReport] = await Promise.all([
				listarImoveis(),
				obterRelatoriosImoveis({ mes: CURRENT_MONTH, ano: CURRENT_YEAR }).catch(
					() => null,
				),
			]);
			setImoveis(items);
			setDashboardRelatorio(monthReport);
			const preferredId = page === "detalhe" ? routeImovelId : selectedId;
			if (preferredId) {
				setSelectedId(preferredId);
			} else if (items[0]?.id) {
				setSelectedId(items[0].id);
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
		setTab(page);
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
			setTab("relatorios");
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

	async function handleImportarPlanilha() {
		if (!importFile) {
			setMessage("Selecione uma planilha XLSX.");
			return;
		}
		setSaving(true);
		setMessage("");
		setImportResult(null);
		try {
			const buffer = await importFile.arrayBuffer();
			const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
			const items = rowsFromWorkbook(workbook);
			const result = await importarImoveis(items);
			setImportResult(result);
			await carregar();
			setMessage(
				`Importação concluída: ${result.criados || 0} criado(s), ${result.atualizados || 0} atualizado(s).`,
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

	return (
		<div className="space-y-6 p-6">
			{!isDetalhePage ? (
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

					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						<StatCard
							icon={Home}
							label="Imóveis ativos"
							value={localReport.ativos}
							hint="Em operação"
						/>
						<StatCard
							icon={Building2}
							label="Imóveis próprios"
							value={localReport.proprios}
							hint="Sem aluguel mensal"
							tone="green"
						/>
						<StatCard
							icon={CalendarClock}
							label="Alugados"
							value={localReport.alugados}
							hint="Com aluguel mensal"
							tone="orange"
						/>
						<StatCard
							icon={History}
							label="Contratos cancelados"
							value={localReport.finalizados}
							hint="Histórico/cancelados"
							tone="slate"
						/>
					</div>
				</>
			) : null}

			{tab === "dashboard" ? (
				<ImoveisDashboard
					imoveis={imoveis}
					relatorio={dashboardRelatorio}
					canManage={podeGerenciar}
					onEdit={(item) => {
						setSelectedId(item.id);
						setTab("cadastro");
					}}
					onDelete={(item) => handleExcluirImovel(item.id)}
					onOpenImovel={(id) => {
						navigate(`/administrativo/imoveis/${encodeURIComponent(id)}`);
					}}
				/>
			) : null}

			{tab === "detalhe" ? (
				<ImovelDetailPage
					imovel={selected}
					registros={registros}
					loading={loading}
					onBack={() => navigate("/administrativo/imoveis")}
					onEdit={() => {
						setSelectedId(selected?.id || "");
						setTab("cadastro");
					}}
					canManage={podeGerenciar}
					onDelete={() => (selected ? handleExcluirImovel(selected.id) : null)}
				/>
			) : null}

			{tab !== "dashboard" && tab !== "detalhe" ? (
				<div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
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

					<main className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						{tab === "cadastro" ? (
							<div className="space-y-5">
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
								{form.ativo === false ? (
									<div className="grid gap-4 rounded-2xl border border-red-100 bg-red-50/40 p-4 md:grid-cols-2">
										<Field label="Data de inativação">
											<input
												type="date"
												className={inputClass()}
												value={form.dataInativacao}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														dataInativacao: e.target.value,
													}))
												}
											/>
										</Field>
										<Field label="Motivo da inativação">
											<input
												className={inputClass()}
												value={form.motivoInativacao}
												onChange={(e) =>
													setForm((cur) => ({
														...cur,
														motivoInativacao: e.target.value,
													}))
												}
											/>
										</Field>
									</div>
								) : null}

								{form.tipoContrato === "alugado" ? (
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
								) : null}

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
								{form.mapsUrl || form.streetViewUrl ? (
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
								) : null}

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
										Salvar imóvel
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
						) : null}

						{tab === "contratos" ? (
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
						) : null}

						{tab === "historico" ? (
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
						) : null}

						{tab === "relatorios" ? (
							<div className="space-y-5">
								<div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
									<Field label="Mês">
										<select
											className={inputClass("min-w-36")}
											value={filtroRelatorio.mes}
											onChange={(e) =>
												setFiltroRelatorio((cur) => ({
													...cur,
													mes: e.target.value,
												}))
											}
										>
											<option value="">Todos</option>
											{Array.from({ length: 12 }, (_, index) =>
												String(index + 1).padStart(2, "0"),
											).map((mes) => (
												<option key={mes} value={mes}>
													{mes}
												</option>
											))}
										</select>
									</Field>
									<Field label="Ano">
										<input
											className={inputClass("min-w-28")}
											value={filtroRelatorio.ano}
											onChange={(e) =>
												setFiltroRelatorio((cur) => ({
													...cur,
													ano: e.target.value,
												}))
											}
										/>
									</Field>
									<ActionButton
										icon={RefreshCw}
										loading={loading}
										onClick={carregarRelatorio}
									>
										Atualizar relatório
									</ActionButton>
									<ActionButton
										icon={Download}
										tone="green"
										disabled={!relatorio}
										onClick={() => generatePdf(relatorio, filtroRelatorio)}
									>
										Exportar PDF
									</ActionButton>
								</div>

								{relatorio ? (
									<>
										<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
											<StatCard
												icon={Home}
												label="Gasto IPTU"
												value={formatCurrency(relatorio.resumo?.gastosIptu)}
											/>
											<StatCard
												icon={CalendarClock}
												label="Gasto aluguel"
												value={formatCurrency(relatorio.resumo?.gastosAluguel)}
												tone="orange"
											/>
											<StatCard
												icon={FileText}
												label="Contratos vencendo"
												value={relatorio.contratosProximos?.length || 0}
												tone="green"
											/>
											<StatCard
												icon={Car}
												label="Aluguéis vencendo"
												value={relatorio.aluguelProximo?.length || 0}
												tone="slate"
											/>
										</div>
										<DataTable
											title="Contratos próximos de vencimento"
											rows={relatorio.contratosProximos || []}
											columns={[
												["seniorId", "ID"],
												["proprietarioNome", "Proprietário"],
												["contratoFim", "Fim"],
											]}
											renderCell={(row, key) =>
												key === "contratoFim"
													? formatDate(row[key])
													: row[key] || "-"
											}
										/>
										<DataTable
											title="Avisos de IPTU próximo do vencimento"
											rows={relatorio.iptuProximo || []}
											columns={[
												["imovelId", "Imóvel"],
												["valor", "Valor"],
												["vencimento", "Vencimento"],
											]}
											renderCell={(row, key) =>
												key === "valor"
													? formatCurrency(row[key])
													: key === "vencimento"
														? formatDate(row[key])
														: row[key] || "-"
											}
										/>
										<DataTable
											title="Aluguel próximo do vencimento"
											rows={relatorio.aluguelProximo || []}
											columns={[
												["seniorId", "ID"],
												["valorAluguel", "Valor"],
												["vencimentoAluguel", "Vencimento"],
											]}
											renderCell={(row, key) =>
												key === "valorAluguel"
													? formatCurrency(row[key])
													: key === "vencimentoAluguel"
														? formatDate(row[key])
														: row[key] || "-"
											}
										/>
									</>
								) : (
									<p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
										Clique em atualizar relatório para carregar os dados do
										período.
									</p>
								)}
							</div>
						) : null}
					</main>
				</div>
			) : null}

			{deleteModalOpen ? (
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
			) : null}

			{configOpen ? (
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
										lote. O sistema identifica pelo ID Sênior quando existir.
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
										onClick={handleImportarPlanilha}
									>
										Importar planilha
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
			) : null}

			{aluguelModalOpen ? (
				<ModalShell
					onClose={() => setAluguelModalOpen(false)}
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
							onClick={() => setAluguelModalOpen(false)}
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
							onClick={() => setAluguelModalOpen(false)}
						>
							Cancelar
						</ActionButton>
						<ActionButton
							icon={Save}
							onClick={() => setAluguelModalOpen(false)}
						>
							Aplicar dados
						</ActionButton>
					</div>
				</ModalShell>
			) : null}

			{aguaEnergiaModalOpen ? (
				<ModalShell
					onClose={() => setAguaEnergiaModalOpen(false)}
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
							onClick={() => setAguaEnergiaModalOpen(false)}
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
							onClick={() => setAguaEnergiaModalOpen(false)}
						>
							Cancelar
						</ActionButton>
						<ActionButton
							icon={Save}
							onClick={() => setAguaEnergiaModalOpen(false)}
						>
							Aplicar dados
						</ActionButton>
					</div>
				</ModalShell>
			) : null}

			{placasModalOpen ? (
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
			) : null}
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
	const url = driveFileUrl(row.driveFileId);
	return url ? (
		<a
			href={url}
			target="_blank"
			rel="noreferrer"
			className="text-blue-700 underline"
		>
			Abrir no Drive
		</a>
	) : (
		"-"
	);
}

function ImovelDetailPage({
	imovel,
	registros,
	loading,
	onBack,
	onEdit,
	onDelete,
	canManage = false,
}) {
	if (loading && !imovel) {
		return (
			<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
				<Loader2 className="mx-auto animate-spin text-blue-700" size={30} />
				<p className="mt-3 text-sm font-black text-slate-500">
					Carregando imóvel...
				</p>
			</div>
		);
	}

	if (!imovel) {
		return (
			<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
				<Home className="mx-auto text-slate-400" size={34} />
				<h2 className="mt-3 text-xl font-black text-slate-950">
					Imóvel não encontrado
				</h2>
				<p className="mt-1 text-sm font-semibold text-slate-500">
					Verifique o ID Sênior informado ou volte para a lista de imóveis.
				</p>
				<ActionButton
					icon={ArrowLeft}
					tone="slate"
					className="mt-4"
					onClick={onBack}
				>
					Voltar para imóveis
				</ActionButton>
			</div>
		);
	}

	const maps = getMapsLinks(imovel.endereco);
	const embedUrl = imovel.embedUrl || maps.embedUrl;
	const streetViewUrl = imovel.streetViewUrl || maps.streetViewUrl;
	const whatsappUrl = getWhatsappUrl(imovel.proprietarioTelefone);
	const placas = normalizePlacas(imovel.placas);
	const costPerSpot = calculateCostPerParkingSpot(imovel);

	return (
		<div className="space-y-5">
			<div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-start gap-3">
					<button
						type="button"
						onClick={onBack}
						className="mt-1 rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
						title="Voltar"
					>
						<ArrowLeft size={18} />
					</button>
					<div>
						<p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
							Página do imóvel
						</p>
						<h2 className="mt-1 text-2xl font-black text-slate-950">
							{imovel.nome || `Imóvel ${imovel.seniorId || imovel.id}`}
						</h2>
						<p className="mt-1 text-sm font-bold text-slate-500">
							ID Sênior: {imovel.seniorId || imovel.id} ·{" "}
							{String(imovel.base || "-").toUpperCase()} ·{" "}
							{imovel.tipoContrato === "alugado" ? "Alugado" : "Próprio"}
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<ActionButton icon={Save} tone="slate" onClick={onEdit}>
						Editar cadastro
					</ActionButton>
					{canManage ? (
						<ActionButton icon={Trash2} tone="slate" onClick={onDelete}>
							Excluir imóvel
						</ActionButton>
					) : null}
					{streetViewUrl ? (
						<a
							href={streetViewUrl}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50"
						>
							<MapPin size={16} />
							Street View
						</a>
					) : null}
				</div>
			</div>

			<div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
				<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
					<div className="h-80 bg-slate-100">
						{embedUrl ? (
							<iframe
								title={`Localização do imóvel ${imovel.seniorId || imovel.id}`}
								src={embedUrl}
								className="h-full w-full border-0"
								loading="lazy"
								referrerPolicy="no-referrer-when-downgrade"
							/>
						) : (
							<div className="flex h-full items-center justify-center bg-gradient-to-br from-blue-950 via-slate-900 to-orange-600 text-white">
								<MapPin size={44} />
							</div>
						)}
					</div>
					<div className="p-5">
						<p className="text-xs font-black uppercase tracking-wide text-slate-500">
							Endereço
						</p>
						<p className="mt-1 text-base font-bold text-slate-800">
							{imovel.endereco || "Endereço não informado"}
						</p>
						{imovel.observacao ? (
							<p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">
								{imovel.observacao}
							</p>
						) : null}
					</div>
				</section>

				<section className="space-y-4">
					<div className="grid gap-3 sm:grid-cols-2">
						<InfoPill
							label="Status"
							value={imovel.ativo === false ? "Inativo" : "Ativo"}
						/>
						<InfoPill
							label="Contrato"
							value={imovel.tipoContrato === "alugado" ? "Alugado" : "Próprio"}
						/>
						<InfoPill
							label="Empresa"
							value={String(imovel.base || "-").toUpperCase()}
						/>
						<InfoPill
							label="Classificação"
							value={imovel.classificacao || "-"}
						/>
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
						<InfoPill
							label="Cliente água"
							value={imovel.aguaCodigoCliente || "-"}
						/>
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
								<InfoPill
									label="Mês do reajuste"
									value={imovel.mesReajuste || "-"}
								/>
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

					{imovel.tipoContrato === "alugado" ? (
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
									<span>
										{imovel.proprietarioTelefone || "Sem telefone cadastrado"}
									</span>
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
					) : null}
				</section>
			</div>

			<div className="grid gap-5 xl:grid-cols-2">
				<DataTable
					title="Alterações de aluguel"
					rows={registros?.reajustes || []}
					columns={[
						["data", "Data"],
						["valorAnterior", "Valor anterior"],
						["valorNovo", "Valor novo"],
						["createdByName", "Registrado por"],
					]}
					renderCell={renderCurrencyDateCell}
				/>
				<DataTable
					title="IPTU"
					rows={registros?.iptus || []}
					columns={[
						["vencimento", "Vencimento"],
						["valor", "Valor"],
						["pago", "Pago"],
						["createdByName", "Registrado por"],
					]}
					renderCell={renderPaymentCell}
				/>
				<DataTable
					title="Aluguéis lançados"
					rows={registros?.alugueis || []}
					columns={[
						["vencimento", "Vencimento"],
						["valor", "Valor"],
						["pago", "Pago"],
						["createdByName", "Registrado por"],
					]}
					renderCell={renderPaymentCell}
				/>
				<DataTable
					title="Contratos vinculados"
					rows={registros?.contratos || []}
					columns={[
						["nome", "Nome"],
						["tipo", "Origem"],
						["createdByName", "Criado por"],
						["createdAt", "Data"],
					]}
					renderCell={renderContractCell}
				/>
				<DataTable
					title="Aditivos"
					rows={registros?.aditivos || []}
					columns={[
						["nome", "Nome"],
						["data", "Data"],
						["observacao", "Observação"],
						["driveFileId", "Anexo"],
					]}
					renderCell={renderDriveFileCell}
				/>
				<DataTable
					title="Fotos, vídeos e anexos"
					rows={registros?.anexos || []}
					columns={[
						["nome", "Arquivo"],
						["categoria", "Categoria"],
						["data", "Data"],
						["observacao", "Observação"],
						["driveFileId", "Drive"],
					]}
					renderCell={renderDriveFileCell}
				/>
			</div>
		</div>
	);
}

function ImoveisDashboard({
	imoveis = [],
	relatorio,
	onEdit,
	onOpenImovel,
	onDelete,
	canManage = false,
}) {
	const hasMonthlyReport = Boolean(relatorio);
	const contratosProximos = relatorio?.contratosProximos || [];
	const iptuProximo = relatorio?.iptuProximo || [];
	const aluguelProximo = relatorio?.aluguelProximo || [];

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
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{imoveis.map((item) => {
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
