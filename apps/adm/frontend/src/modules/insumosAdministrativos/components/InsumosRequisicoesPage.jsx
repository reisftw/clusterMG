import {
	CheckCircle2,
	Clock3,
	Download,
	FileText,
	History,
	PackageCheck,
	RefreshCw,
	Send,
	ShieldCheck,
	X,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Spinner from "../../../components/ui/Spinner";
import { useAuthContext } from "../../../context/AuthContext";
import {
	getAllowedInsumosCategories,
	getUserBaseId,
	isGlobalInsumosAdmin,
	text,
} from "../../../utils/insumosAccessControl";
import { addClusterLogo } from "../../../utils/pdfBranding";
import {
	aprovarInsumosRequisicao,
	criarInsumosRequisicao,
	entregarInsumosRequisicao,
	listarInsumosAdministrativos,
	listarInsumosRequisicoes,
	rejeitarInsumosRequisicao,
} from "../services/insumosAdministrativosService";

const PAGE_SIZE_OPTIONS = [20, 30, 50, 100];

const STATUS_META = {
	pendente: {
		label: "Pendente",
		tone: "border-orange-200 bg-orange-50 text-orange-700",
		icon: Clock3,
	},
	aprovada_aguardando_retirada: {
		label: "Aguardando retirada",
		tone: "border-blue-200 bg-blue-50 text-blue-700",
		icon: PackageCheck,
	},
	retirada: {
		label: "Retirada",
		tone: "border-green-200 bg-green-50 text-green-700",
		icon: CheckCircle2,
	},
	expirada: {
		label: "Expirada",
		tone: "border-slate-200 bg-slate-50 text-slate-600",
		icon: XCircle,
	},
	rejeitada: {
		label: "Rejeitada",
		tone: "border-red-200 bg-red-50 text-red-700",
		icon: XCircle,
	},
};

const toNumber = (value) => Math.max(0, Number(value || 0));

const formatDateTime = (value) => {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return date.toLocaleString("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
		timeZone: "America/Sao_Paulo",
	});
};

const formatAuditText = (value = "") =>
	String(value || "-").replace(
		/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z/g,
		(match) => formatDateTime(match),
	);

const getRequestItems = (requisicao = {}) => {
	if (Array.isArray(requisicao.itens) && requisicao.itens.length) {
		return requisicao.itens
			.map((item) => ({
				produto_nome: item.produto_nome || item.produtoNome || "Insumo",
				quantidade: toNumber(item.quantidade),
				unidade: item.unidade || "",
				categoria: item.categoria || "",
			}))
			.filter((item) => item.quantidade > 0);
	}
	return [
		{
			produto_nome:
				requisicao.produto_nome || requisicao.produtoNome || "Insumo",
			quantidade: toNumber(requisicao.quantidade),
			unidade: requisicao.unidade || "",
			categoria: requisicao.categoria || "",
		},
	].filter((item) => item.quantidade > 0);
};

const getRequestItemsSummary = (requisicao = {}) => {
	const itens = getRequestItems(requisicao);
	if (!itens.length) return "Sem itens";
	if (itens.length === 1) return itens[0].produto_nome;
	return `${itens.length} itens solicitados`;
};

const getRequestQuantitySummary = (requisicao = {}) => {
	const itens = getRequestItems(requisicao);
	if (!itens.length) return "-";
	if (itens.length === 1) {
		return `${itens[0].quantidade} ${itens[0].unidade || ""}`.trim();
	}
	return itens
		.map((item) => `${item.quantidade} ${item.unidade || ""}`.trim())
		.join(" + ");
};

const drawPdfCard = (
	doc,
	{ x, y, w, h, label, value, accent = [37, 99, 235] },
) => {
	doc.setFillColor(248, 250, 252);
	doc.setDrawColor(226, 232, 240);
	doc.roundedRect(x, y, w, h, 12, 12, "FD");
	doc.setFillColor(...accent);
	doc.roundedRect(x, y, 5, h, 4, 4, "F");
	doc.setFont("helvetica", "bold");
	doc.setFontSize(8);
	doc.setTextColor(100, 116, 139);
	doc.text(String(label || "").toUpperCase(), x + 16, y + 18);
	doc.setFontSize(13);
	doc.setTextColor(15, 23, 42);
	doc.text(String(value || "-"), x + 16, y + 40, { maxWidth: w - 26 });
};

async function imageToDataUrl(url) {
	const response = await fetch(url);
	const blob = await response.blob();
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

async function exportarRequisicaoPdf(requisicao) {
	const { jsPDF } = await import("jspdf");
	const doc = new jsPDF({ unit: "pt", format: "a4" });
	const logo = await imageToDataUrl("/logo-adm.png").catch(() => "");
	const requestItems = getRequestItems(requisicao);
	const width = doc.internal.pageSize.getWidth();
	const height = doc.internal.pageSize.getHeight();
	const margin = 42;
	let y = 42;

	doc.setFillColor(6, 27, 65);
	doc.roundedRect(margin, y, width - margin * 2, 132, 18, 18, "F");
	doc.setFillColor(255, 116, 0);
	doc.roundedRect(width - margin - 86, y + 24, 48, 84, 14, 14, "F");
	if (logo) doc.addImage(logo, "PNG", margin + 18, y + 20, 120, 78);
	await addClusterLogo(doc, {
		width: 82,
		height: 41,
		y: y + 22,
		marginRight: 60,
	});
	doc.setTextColor(255, 255, 255);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(22);
	doc.text("Requisição de Insumo", margin + 156, y + 42);
	doc.setFontSize(10);
	doc.setTextColor(191, 219, 254);
	doc.text("Sistema Administrativo | Cluster MG", margin + 156, y + 64);
	doc.setFontSize(12);
	doc.setFont("helvetica", "normal");
	doc.setTextColor(255, 255, 255);
	doc.text(`Protocolo ${requisicao.protocolo || "-"}`, margin + 156, y + 90);
	doc.text(
		`Gerado em ${formatDateTime(new Date().toISOString())}`,
		margin + 156,
		y + 109,
	);
	y += 158;

	const cardGap = 12;
	const cardW = (width - margin * 2 - cardGap * 2) / 3;
	drawPdfCard(doc, {
		x: margin,
		y,
		w: cardW,
		h: 66,
		label: "Status",
		value: STATUS_META[requisicao.status]?.label || requisicao.status,
		accent: [34, 197, 94],
	});
	drawPdfCard(doc, {
		x: margin + cardW + cardGap,
		y,
		w: cardW,
		h: 66,
		label: requestItems.length > 1 ? "Itens" : "Quantidade",
		value:
			requestItems.length > 1
				? `${requestItems.length} materiais`
				: getRequestQuantitySummary(requisicao),
		accent: [37, 99, 235],
	});
	drawPdfCard(doc, {
		x: margin + (cardW + cardGap) * 2,
		y,
		w: cardW,
		h: 66,
		label: "Prazo de retirada",
		value: formatDateTime(requisicao.expira_em),
		accent: [249, 115, 22],
	});
	y += 88;

	const rows = [
		["Solicitante", requisicao.solicitante_nome],
		["E-mail", requisicao.solicitante_email],
		["Status", STATUS_META[requisicao.status]?.label || requisicao.status],
		["Pedido", getRequestItemsSummary(requisicao)],
		["Quantidade", getRequestQuantitySummary(requisicao)],
		["Criado em", formatDateTime(requisicao.criado_em)],
		["Aprovado por", requisicao.aprovado_por_nome || "-"],
		["Prazo de retirada", formatDateTime(requisicao.expira_em)],
		["Entregue por", requisicao.retirado_por_nome || "-"],
		["Entregue em", formatDateTime(requisicao.retirado_em)],
	];

	doc.setTextColor(15, 23, 42);
	doc.setFontSize(13);
	doc.setFont("helvetica", "bold");
	doc.text("Dados da solicitação", margin, y);
	y += 16;
	rows.forEach(([label, value], index) => {
		const rowY = y + index * 28;
		doc.setFillColor(index % 2 ? 248 : 241, 245, 249);
		doc.roundedRect(margin, rowY, width - margin * 2, 24, 6, 6, "F");
		doc.setFont("helvetica", "bold");
		doc.text(label, margin + 12, rowY + 17);
		doc.setFont("helvetica", "normal");
		doc.text(String(value || "-"), margin + 180, rowY + 17, {
			maxWidth: width - margin * 2 - 195,
		});
	});
	y += rows.length * 28 + 24;

	doc.setFont("helvetica", "bold");
	doc.text("Materiais solicitados", margin, y);
	y += 16;
	requestItems.forEach((item, index) => {
		const rowY = y + index * 26;
		doc.setFillColor(index % 2 ? 248 : 241, 245, 249);
		doc.roundedRect(margin, rowY, width - margin * 2, 22, 6, 6, "F");
		doc.setFont("helvetica", "bold");
		doc.text(item.produto_nome || "Insumo", margin + 12, rowY + 15, {
			maxWidth: width - margin * 2 - 160,
		});
		doc.setFont("helvetica", "normal");
		doc.text(
			`${item.quantidade || 0} ${item.unidade || ""}`.trim(),
			width - margin - 120,
			rowY + 15,
			{ maxWidth: 110 },
		);
	});
	y += requestItems.length * 26 + 24;

	doc.setFont("helvetica", "bold");
	doc.text("Auditoria", margin, y);
	y += 22;
	doc.setFont("helvetica", "normal");
	(requisicao.auditoria || []).forEach((item) => {
		const line = `${formatDateTime(item.data)} - ${item.usuario_nome || "Sistema"} - ${item.acao || "-"} - ${formatAuditText(item.observacao)}`;
		const split = doc.splitTextToSize(line, width - margin * 2);
		doc.text(split, margin, y);
		y += split.length * 14 + 8;
		if (y > height - 70) {
			doc.setFontSize(9);
			doc.setTextColor(148, 163, 184);
			doc.text(
				"Documento gerado automaticamente pelo Sistema Administrativo.",
				margin,
				height - 34,
			);
			doc.addPage();
			y = 42;
			doc.setFontSize(13);
			doc.setTextColor(15, 23, 42);
		}
	});
	doc.setFontSize(9);
	doc.setTextColor(148, 163, 184);
	doc.text(
		"Documento gerado automaticamente pelo Sistema Administrativo.",
		margin,
		height - 34,
	);

	doc.save(`${requisicao.protocolo || "requisicao-insumo"}.pdf`);
}

function StatusBadge({ status }) {
	const meta = STATUS_META[status] || STATUS_META.pendente;
	const Icon = meta.icon;
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-extrabold ${meta.tone}`}
		>
			<Icon size={13} />
			{meta.label}
		</span>
	);
}

function AuditModal({ requisicao, onClose }) {
	if (!requisicao) return null;
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
			<div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
				<div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
					<div>
						<p className="text-xs font-black uppercase tracking-wider text-blue-600">
							Auditoria
						</p>
						<h3 className="text-lg font-black text-slate-950">
							{requisicao.protocolo}
						</h3>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
					>
						<X size={18} />
					</button>
				</div>
				<div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
					{(requisicao.auditoria || []).map((item, index) => (
						<div
							key={`${item.acao}-${item.data}-${index}`}
							className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<p className="font-extrabold text-slate-950">
									{item.acao || "Registro"}
								</p>
								<span className="text-xs font-bold text-slate-500">
									{formatDateTime(item.data)}
								</span>
							</div>
							<p className="mt-1 text-sm font-semibold text-slate-700">
								{item.usuario_nome || "Sistema"}
							</p>
							<p className="mt-2 text-sm text-slate-600">
								{formatAuditText(item.observacao)}
							</p>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function RequestModal({
	form,
	produtos,
	saving,
	selectedProduct,
	onClose,
	onSubmit,
	onChange,
}) {
	const produtoInputId = useId();
	const quantidadeInputId = useId();
	const observacaoInputId = useId();
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
			<form
				onSubmit={onSubmit}
				className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"
			>
				<div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
					<div className="flex items-center gap-3">
						<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
							<Send size={20} />
						</div>
						<div>
							<p className="text-xs font-black uppercase tracking-wider text-blue-600">
								Nova requisição
							</p>
							<h3 className="text-xl font-black text-slate-950">
								Solicitar insumo
							</h3>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-2xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
					>
						<X size={18} />
					</button>
				</div>
				<div className="space-y-4 p-6">
					<div>
						<label htmlFor={produtoInputId} className="form-label">
							Item
						</label>
						<select
							id={produtoInputId}
							value={form.produto_id}
							onChange={(event) =>
								onChange((current) => ({
									...current,
									produto_id: event.target.value,
								}))
							}
							className="input-field"
							required
						>
							<option value="">Selecione um item</option>
							{produtos.map((produto) => (
								<option key={produto.id} value={produto.id}>
									{produto.nome} - {produto.estoque_atual || 0}{" "}
									{produto.unidade || ""}
								</option>
							))}
						</select>
						{selectedProduct ? (
							<p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
								Disponível: {selectedProduct.estoque_atual || 0}{" "}
								{selectedProduct.unidade || "un."}
							</p>
						) : null}
					</div>

					<div>
						<label htmlFor={quantidadeInputId} className="form-label">
							Quantidade
						</label>
						<input
							id={quantidadeInputId}
							type="number"
							min="1"
							max={
								selectedProduct
									? toNumber(selectedProduct.estoque_atual)
									: undefined
							}
							value={form.quantidade}
							onChange={(event) =>
								onChange((current) => ({
									...current,
									quantidade: event.target.value,
								}))
							}
							className="input-field"
							required
						/>
					</div>

					<div>
						<label htmlFor={observacaoInputId} className="form-label">
							Observação
						</label>
						<textarea
							id={observacaoInputId}
							value={form.observacao}
							onChange={(event) =>
								onChange((current) => ({
									...current,
									observacao: event.target.value,
								}))
							}
							className="input-field min-h-[120px]"
							placeholder="Informe detalhes da necessidade, se houver."
						/>
					</div>
				</div>
				<div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
					<button
						type="button"
						onClick={onClose}
						className="btn-secondary"
						disabled={saving}
					>
						Cancelar
					</button>
					<button
						type="submit"
						disabled={saving || !form.produto_id}
						className="btn-primary flex items-center gap-2 disabled:opacity-50"
					>
						<Send size={16} />
						Solicitar insumo
					</button>
				</div>
			</form>
		</div>
	);
}

export default function InsumosRequisicoesPage() {
	const { currentUser } = useAuthContext();
	const [canManage, setCanManage] = useState(false);
	const [produtos, setProdutos] = useState([]);
	const [items, setItems] = useState([]);
	const [total, setTotal] = useState(0);
	const [summary, setSummary] = useState({});
	const [status, setStatus] = useState("todos");
	const [limit, setLimit] = useState(20);
	const [offset, setOffset] = useState(0);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [auditItem, setAuditItem] = useState(null);
	const [showRequestModal, setShowRequestModal] = useState(false);
	const [form, setForm] = useState({
		produto_id: "",
		quantidade: 1,
		observacao: "",
	});

	const carregar = useCallback(async () => {
		setLoading(true);
		setMessage("");
		try {
			const [base, requisicoes] = await Promise.all([
				listarInsumosAdministrativos(),
				listarInsumosRequisicoes({ status, limit, offset }),
			]);
			const adminGlobal = isGlobalInsumosAdmin(currentUser);
			const userBaseId = getUserBaseId(currentUser);
			const allowedCategories = getAllowedInsumosCategories(
				base.config,
				currentUser,
				"solicitar",
			);
			setProdutos(
				(base.produtos || []).filter((produto) => {
					const baseId = text(produto.base_id || produto.baseId);
					const categoria = text(produto.categoria) || "Outros";
					return (
						produto.status === "ativo" &&
						(adminGlobal || !userBaseId || !baseId || baseId === userBaseId) &&
						(!allowedCategories.length || allowedCategories.includes(categoria))
					);
				}),
			);
			setItems(requisicoes.items || []);
			setTotal(requisicoes.total || 0);
			setSummary(requisicoes.summary || {});
			setCanManage(Boolean(requisicoes.canManage));
		} catch (error) {
			setMessage(error?.message || "Erro ao carregar requisições.");
		} finally {
			setLoading(false);
		}
	}, [currentUser, limit, offset, status]);

	useEffect(() => {
		carregar();
	}, [carregar]);

	const selectedProduct = useMemo(
		() => produtos.find((produto) => produto.id === form.produto_id),
		[form.produto_id, produtos],
	);

	const resumo = useMemo(() => {
		const counts = {
			pendente: 0,
			aprovada_aguardando_retirada: 0,
			retirada: 0,
			expirada: 0,
			rejeitada: 0,
		};
		items.forEach((item) => {
			counts[item.status] = (counts[item.status] || 0) + 1;
		});
		return { ...counts, ...summary };
	}, [items, summary]);

	const submitRequest = async (event) => {
		event.preventDefault();
		setSaving(true);
		setMessage("");
		try {
			await criarInsumosRequisicao(form);
			setForm({ produto_id: "", quantidade: 1, observacao: "" });
			setShowRequestModal(false);
			setMessage("Requisição criada com sucesso.");
			setOffset(0);
			await carregar();
		} catch (error) {
			setMessage(error?.message || "Erro ao criar requisição.");
		} finally {
			setSaving(false);
		}
	};

	const runAction = async (action, successMessage) => {
		setSaving(true);
		setMessage("");
		try {
			await action();
			setMessage(successMessage);
			await carregar();
		} catch (error) {
			setMessage(error?.message || "Erro ao executar ação.");
		} finally {
			setSaving(false);
		}
	};

	const destaquePendentes = toNumber(resumo.pendente);
	const destaqueRetirada = toNumber(resumo.aprovada_aguardando_retirada);
	const page = Math.floor(offset / limit) + 1;
	const pages = Math.max(1, Math.ceil(total / limit));

	return (
		<div className="space-y-5">
			<section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="flex items-center gap-3">
					<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
						<FileText size={22} />
					</div>
					<div>
						<p className="text-xs font-black uppercase tracking-wider text-blue-600">
							Insumos administrativos
						</p>
						<h1 className="text-2xl font-black text-slate-950">Requisições</h1>
						<p className="text-sm text-slate-500">
							Solicite materiais, acompanhe aprovações e mantenha a retirada
							auditada.
						</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={carregar}
						className="btn-secondary flex items-center gap-2"
					>
						<RefreshCw size={16} />
						Atualizar
					</button>
					<button
						type="button"
						onClick={() => setShowRequestModal(true)}
						className="btn-primary flex items-center gap-2"
					>
						<Send size={16} />
						Nova requisição
					</button>
				</div>
			</section>

			{message ? (
				<div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
					{message}
				</div>
			) : null}

			{canManage && (destaquePendentes || destaqueRetirada) ? (
				<section className="grid items-start gap-3 md:grid-cols-2">
					<button
						type="button"
						onClick={() => {
							setStatus("pendente");
							setOffset(0);
						}}
						className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
					>
						<p className="text-xs font-black uppercase tracking-wider text-orange-700">
							Precisa de aprovação
						</p>
						<p className="mt-2 text-3xl font-black text-orange-700">
							{destaquePendentes}
						</p>
						<p className="text-sm font-bold text-orange-800">
							requisição(ões) pendente(s) aguardando decisão.
						</p>
					</button>
					<button
						type="button"
						onClick={() => {
							setStatus("aprovada_aguardando_retirada");
							setOffset(0);
						}}
						className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
					>
						<p className="text-xs font-black uppercase tracking-wider text-blue-700">
							Aguardando retirada
						</p>
						<p className="mt-2 text-3xl font-black text-blue-700">
							{destaqueRetirada}
						</p>
						<p className="text-sm font-bold text-blue-800">
							material(is) aprovado(s) esperando baixa de entrega.
						</p>
					</button>
				</section>
			) : null}

			<section className="grid gap-4 md:grid-cols-5">
				{Object.entries(STATUS_META).map(([key, meta]) => {
					const Icon = meta.icon;
					return (
						<button
							key={key}
							type="button"
							onClick={() => {
								setStatus(key);
								setOffset(0);
							}}
							className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${status === key ? meta.tone : "border-slate-200 text-slate-700"}`}
						>
							<Icon size={19} />
							<p className="mt-3 text-2xl font-black">{resumo[key] || 0}</p>
							<p className="text-xs font-black uppercase tracking-wider">
								{meta.label}
							</p>
						</button>
					);
				})}
			</section>

			<section>
				<div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
						<div>
							<h2 className="text-lg font-black text-slate-950">
								{canManage ? "Painel de requisições" : "Minhas requisições"}
							</h2>
							<p className="text-sm text-slate-500">{total} registro(s)</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<select
								value={status}
								onChange={(event) => {
									setStatus(event.target.value);
									setOffset(0);
								}}
								className="input-field w-56"
							>
								<option value="todos">Todos os status</option>
								{Object.entries(STATUS_META).map(([key, meta]) => (
									<option key={key} value={key}>
										{meta.label}
									</option>
								))}
							</select>
							<select
								value={limit}
								onChange={(event) => {
									setLimit(Number(event.target.value));
									setOffset(0);
								}}
								className="input-field w-32"
							>
								{PAGE_SIZE_OPTIONS.map((value) => (
									<option key={value} value={value}>
										{value}/página
									</option>
								))}
							</select>
						</div>
					</div>

					{loading ? (
						<div className="p-10">
							<Spinner />
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="min-w-full divide-y divide-slate-100 text-sm">
								<thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wider text-slate-500">
									<tr>
										<th className="px-4 py-3">Protocolo</th>
										<th className="px-4 py-3">Solicitante</th>
										<th className="px-4 py-3">Item</th>
										<th className="px-4 py-3">Status</th>
										<th className="px-4 py-3">Prazo</th>
										<th className="px-4 py-3 text-right">Ações</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{items.map((item) => {
										const requestItems = getRequestItems(item);
										return (
										<tr key={item.id} className="align-top">
											<td className="px-4 py-3">
												<p className="font-black text-slate-950">
													{item.protocolo}
												</p>
												<p className="text-xs text-slate-500">
													{formatDateTime(item.criado_em)}
												</p>
											</td>
											<td className="px-4 py-3">
												<p className="font-bold text-slate-800">
													{item.solicitante_nome}
												</p>
												<p className="text-xs text-slate-500">
													{item.solicitante_email || "-"}
												</p>
											</td>
											<td className="px-4 py-3">
												<p className="font-bold text-slate-800">
													{getRequestItemsSummary(item)}
												</p>
												<div className="mt-1 space-y-1 text-xs text-slate-500">
													{requestItems.slice(0, 4).map((material, index) => (
														<p key={`${item.id}-material-${index}`}>
															{material.produto_nome} · {material.quantidade}{" "}
															{material.unidade}
														</p>
													))}
													{requestItems.length > 4 ? (
														<p className="font-black text-slate-400">
															+{requestItems.length - 4} material(is)
														</p>
													) : null}
												</div>
											</td>
											<td className="px-4 py-3">
												<StatusBadge status={item.status} />
											</td>
											<td className="px-4 py-3 text-slate-600">
												{formatDateTime(item.expira_em)}
											</td>
											<td className="px-4 py-3">
												<div className="flex flex-wrap justify-end gap-2 rounded-2xl bg-slate-50 p-2">
													<button
														type="button"
														onClick={() => exportarRequisicaoPdf(item)}
														className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
														title="Exportar PDF"
													>
														<Download size={15} />
													</button>
													<button
														type="button"
														onClick={() => setAuditItem(item)}
														className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
														title="Auditoria"
													>
														<History size={15} />
													</button>
													{canManage && item.status === "pendente" ? (
														<>
															<button
																type="button"
																onClick={() =>
																	runAction(
																		() => aprovarInsumosRequisicao(item.id),
																		"Requisição aprovada e estoque reservado.",
																	)
																}
																disabled={saving}
																className="inline-flex items-center gap-1 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-black text-green-700 transition hover:bg-green-100 disabled:opacity-50"
															>
																<CheckCircle2 size={14} />
																Aprovar
															</button>
															<button
																type="button"
																onClick={() =>
																	runAction(
																		() =>
																			rejeitarInsumosRequisicao(
																				item.id,
																				"Rejeitada pelo administrativo.",
																			),
																		"Requisição rejeitada.",
																	)
																}
																disabled={saving}
																className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:opacity-50"
															>
																<XCircle size={14} />
																Rejeitar
															</button>
														</>
													) : null}
													{canManage &&
													item.status === "aprovada_aguardando_retirada" ? (
														<button
															type="button"
															onClick={() =>
																runAction(
																	() => entregarInsumosRequisicao(item.id),
																	"Retirada confirmada e contabilizada.",
																)
															}
															disabled={saving}
															className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
														>
															<PackageCheck size={14} />
															Confirmar retirada
														</button>
													) : null}
												</div>
											</td>
										</tr>
									);
									})}
									{!items.length ? (
										<tr>
											<td
												colSpan="6"
												className="px-4 py-10 text-center text-sm font-bold text-slate-400"
											>
												Nenhuma requisição encontrada.
											</td>
										</tr>
									) : null}
								</tbody>
							</table>
						</div>
					)}

					<div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 text-sm text-slate-600">
						<span>
							Página {page} de {pages}
						</span>
						<div className="flex gap-2">
							<button
								type="button"
								disabled={offset <= 0}
								onClick={() => setOffset(Math.max(0, offset - limit))}
								className="btn-secondary disabled:opacity-50"
							>
								Anterior
							</button>
							<button
								type="button"
								disabled={page >= pages}
								onClick={() => setOffset(offset + limit)}
								className="btn-secondary disabled:opacity-50"
							>
								Próxima
							</button>
						</div>
					</div>
				</div>
			</section>

			<section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
				<div className="flex items-start gap-3">
					<ShieldCheck size={20} className="mt-0.5 shrink-0" />
					<p>
						Quando uma requisição é aprovada, o estoque é reservado
						imediatamente por 24 horas. Se a retirada não for confirmada dentro
						do prazo, a requisição expira e o material volta automaticamente ao
						estoque.
					</p>
				</div>
			</section>

			<AuditModal requisicao={auditItem} onClose={() => setAuditItem(null)} />
			{showRequestModal ? (
				<RequestModal
					form={form}
					produtos={produtos}
					saving={saving}
					selectedProduct={selectedProduct}
					onClose={() => setShowRequestModal(false)}
					onSubmit={submitRequest}
					onChange={setForm}
				/>
			) : null}
		</div>
	);
}
