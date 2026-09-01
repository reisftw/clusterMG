import {
	Briefcase,
	Download,
	GraduationCap,
	Loader2,
	Maximize2,
	Move,
	Pencil,
	Plus,
	Trash2,
	UserRound,
	Users,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModalShell from "../../../../components/ui/ModalShell";
import {
	atualizarCargoEquipeFinanceiro,
	atualizarColaboradorEquipeFinanceiro,
	buscarEquipeFinanceiro,
	criarCargoEquipeFinanceiro,
	criarColaboradorEquipeFinanceiro,
	moverColaboradorEquipeFinanceiro,
	removerCargoEquipeFinanceiro,
	removerColaboradorEquipeFinanceiro,
} from "../../services/financeiroService";

const NODE_WIDTH = 252;
const NODE_HEIGHT = 132;
const COLUMN_GAP = 320;
const ROW_GAP = 178;
const ROOT_X = 60;
const ROOT_Y = 54;
const SETOR_COLORS = [
	"bg-blue-50 text-blue-700 border-blue-200",
	"bg-emerald-50 text-emerald-700 border-emerald-200",
	"bg-amber-50 text-amber-700 border-amber-200",
	"bg-violet-50 text-violet-700 border-violet-200",
	"bg-rose-50 text-rose-700 border-rose-200",
	"bg-cyan-50 text-cyan-700 border-cyan-200",
];

function buildInitials(name = "") {
	const parts = String(name)
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (!parts.length) return "EF";
	return `${parts[0]?.[0] || ""}${parts.at(-1)?.[0] || ""}`.toUpperCase();
}

function getSetorBadgeClass(setor = "") {
	let hash = 0;
	for (const char of String(setor || "")) hash += char.charCodeAt(0);
	return SETOR_COLORS[hash % SETOR_COLORS.length];
}

async function loadImageDataUrl(src) {
	const response = await fetch(src, { cache: "force-cache" });
	if (!response.ok) return null;
	const blob = await response.blob();
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = String(reader.result || "");
			const image = new Image();
			image.onload = () =>
				resolve({
					dataUrl,
					width: image.naturalWidth || image.width || 1,
					height: image.naturalHeight || image.height || 1,
				});
			image.onerror = () => resolve({ dataUrl, width: 1, height: 1 });
			image.src = dataUrl;
		};
		reader.onerror = () => resolve(null);
		reader.readAsDataURL(blob);
	});
}

function fitImageInsideBox(image, maxWidth, maxHeight) {
	const ratio = Math.min(maxWidth / image.width, maxHeight / image.height);
	return {
		width: image.width * ratio,
		height: image.height * ratio,
	};
}

function buildTreeLayout(colaboradores = []) {
	const children = new Map();
	const byId = new Map(colaboradores.map((item) => [item.id, item]));
	for (const item of colaboradores) {
		const parentId = item.gestorId && byId.has(item.gestorId) ? item.gestorId : null;
		const bucket = children.get(parentId) || [];
		bucket.push(item);
		children.set(parentId, bucket);
	}
	for (const bucket of children.values()) {
		bucket.sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
	}
	const positions = new Map();
	let row = 0;
	function visit(item, depth) {
		const nodeChildren = children.get(item.id) || [];
		if (!nodeChildren.length) {
			positions.set(item.id, { x: ROOT_X + depth * COLUMN_GAP, y: ROOT_Y + row * ROW_GAP });
			row += 1;
			return positions.get(item.id).y;
		}
		const startRow = row;
		for (const child of nodeChildren) visit(child, depth + 1);
		const endRow = row - 1;
		const y = ROOT_Y + ((startRow + endRow) / 2) * ROW_GAP;
		positions.set(item.id, { x: ROOT_X + depth * COLUMN_GAP, y });
		return y;
	}
	const roots = children.get(null) || [];
	for (const root of roots) visit(root, 0);
	return colaboradores.map((item) => ({
		...item,
		x: Number.isFinite(Number(item.posX)) ? Number(item.posX) : positions.get(item.id)?.x || ROOT_X,
		y: Number.isFinite(Number(item.posY)) ? Number(item.posY) : positions.get(item.id)?.y || ROOT_Y,
	}));
}

function isDescendant(nodes = [], possibleParentId, possibleChildId) {
	const children = new Map();
	nodes.forEach((node) => {
		if (!node.gestorId) return;
		const bucket = children.get(node.gestorId) || [];
		bucket.push(node.id);
		children.set(node.gestorId, bucket);
	});
	const stack = [...(children.get(possibleChildId) || [])];
	while (stack.length) {
		const current = stack.pop();
		if (current === possibleParentId) return true;
		stack.push(...(children.get(current) || []));
	}
	return false;
}

function emptyCargoForm() {
	return { nome: "", setor: "", descricao: "", ordem: 0 };
}

function emptyColaboradorForm() {
	return {
		nome: "",
		setor: "",
		cargoId: "",
		formacao: "",
		atividades: "",
		gestorId: "",
		avatarUrl: "",
		ordem: 0,
	};
}

function ColaboradorNode({ canManage, node, onClick, onEdit, onPointerDown, selected }) {
	return (
		<button
			type="button"
			onClick={onClick}
			onPointerDown={onPointerDown}
			className={`absolute select-none rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
				selected ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200"
			}`}
			style={{ width: NODE_WIDTH, height: NODE_HEIGHT, left: node.x, top: node.y }}
		>
			<div className="flex items-start gap-3">
				<div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-600 text-sm font-black text-white">
					{node.avatarUrl ? (
						<img
							src={node.avatarUrl}
							alt=""
							className="h-full w-full object-cover"
							onError={(event) => {
								event.currentTarget.style.display = "none";
							}}
						/>
					) : (
						buildInitials(node.nome)
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-black text-slate-950">{node.nome}</div>
					<div className="mt-0.5 truncate text-xs font-bold text-slate-600">{node.cargoNome || "Cargo não vinculado"}</div>
					<span className={`mt-2 inline-flex max-w-full rounded-full border px-2 py-1 text-[11px] font-black ${getSetorBadgeClass(node.setor)}`}>
						<span className="truncate">{node.setor}</span>
					</span>
				</div>
				{canManage ? (
					<span
						role="button"
						tabIndex={0}
						onClick={(event) => {
							event.stopPropagation();
							onEdit();
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") onEdit();
						}}
						className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
						title="Editar colaborador"
					>
						<Pencil size={14} />
					</span>
				) : null}
			</div>
			{canManage ? (
				<div className="mt-3 flex items-center gap-1 text-[11px] font-bold text-slate-400">
					<Move size={12} /> Arraste para reposicionar
				</div>
			) : null}
		</button>
	);
}

function CargoModal({ cargo, onClose, onSave }) {
	const [form, setForm] = useState(cargo || emptyCargoForm());
	return (
		<ModalShell title={cargo?.id ? "Editar cargo" : "Novo cargo"} onClose={onClose} size="lg">
			<form
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault();
					onSave(form);
				}}
			>
				<div className="grid gap-4 md:grid-cols-2">
					<label className="space-y-1 text-sm font-bold text-slate-700">
						Nome do cargo
						<input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} />
					</label>
					<label className="space-y-1 text-sm font-bold text-slate-700">
						Setor
						<input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={form.setor} onChange={(event) => setForm((current) => ({ ...current, setor: event.target.value }))} />
					</label>
				</div>
				<label className="space-y-1 text-sm font-bold text-slate-700">
					Descrição padrão das atividades
					<textarea className="min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2" value={form.descricao || ""} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} />
				</label>
				<div className="flex justify-end gap-2">
					<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Cancelar</button>
					<button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Salvar</button>
				</div>
			</form>
		</ModalShell>
	);
}

function ColaboradorModal({ cargos, colaborador, colaboradores, onClose, onDelete, onSave }) {
	const [form, setForm] = useState(colaborador || emptyColaboradorForm());
	const gestores = colaboradores.filter((item) => item.id !== colaborador?.id);
	function handleCargoChange(cargoId) {
		const cargoSelecionado = cargos.find((cargo) => cargo.id === cargoId);
		setForm((current) => ({
			...current,
			cargoId,
			atividades:
				current.atividades || cargoSelecionado?.descricao || current.atividades,
			setor: current.setor || cargoSelecionado?.setor || current.setor,
		}));
	}
	return (
		<ModalShell title={colaborador?.id ? "Editar colaborador" : "Novo colaborador"} onClose={onClose} size="xl">
			<form
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault();
					onSave(form);
				}}
			>
				<div className="grid gap-4 md:grid-cols-2">
					<label className="space-y-1 text-sm font-bold text-slate-700">
						Colaborador
						<input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} />
					</label>
					<label className="space-y-1 text-sm font-bold text-slate-700">
						Setor
						<input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={form.setor} onChange={(event) => setForm((current) => ({ ...current, setor: event.target.value }))} />
					</label>
					<label className="space-y-1 text-sm font-bold text-slate-700">
						Cargo
						<select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={form.cargoId} onChange={(event) => handleCargoChange(event.target.value)}>
							<option value="">Selecione</option>
							{cargos.map((cargo) => (
								<option key={cargo.id} value={cargo.id}>{cargo.nome} · {cargo.setor}</option>
							))}
						</select>
					</label>
					<label className="space-y-1 text-sm font-bold text-slate-700">
						Gestor/Superior direto
						<select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={form.gestorId || ""} onChange={(event) => setForm((current) => ({ ...current, gestorId: event.target.value }))}>
							<option value="">Sem gestor direto</option>
							{gestores.map((gestor) => (
								<option key={gestor.id} value={gestor.id}>{gestor.nome}</option>
							))}
						</select>
					</label>
					<label className="space-y-1 text-sm font-bold text-slate-700">
						Formação acadêmica
						<input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={form.formacao || ""} onChange={(event) => setForm((current) => ({ ...current, formacao: event.target.value }))} />
					</label>
					<label className="space-y-1 text-sm font-bold text-slate-700">
						Foto/avatar
						<input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={form.avatarUrl || ""} onChange={(event) => setForm((current) => ({ ...current, avatarUrl: event.target.value }))} placeholder="URL da imagem, opcional" />
					</label>
				</div>
				<label className="space-y-1 text-sm font-bold text-slate-700">
					Principais atividades / atribuições
					<textarea className="min-h-32 w-full rounded-xl border border-slate-200 px-3 py-2" value={form.atividades || ""} onChange={(event) => setForm((current) => ({ ...current, atividades: event.target.value }))} />
				</label>
				<div className="flex flex-wrap justify-between gap-2">
					{colaborador?.id ? (
						<button type="button" onClick={() => onDelete(colaborador.id)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">
							<Trash2 size={16} /> Remover
						</button>
					) : <span />}
					<div className="flex gap-2">
						<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Cancelar</button>
						<button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Salvar</button>
					</div>
				</div>
			</form>
		</ModalShell>
	);
}

function DetailModal({ colaborador, onClose }) {
	return (
		<ModalShell title={colaborador.nome} onClose={onClose} size="lg">
			<div className="space-y-4 text-sm text-slate-700">
				<div className="flex items-center gap-3">
					<div className="grid h-14 w-14 place-items-center rounded-full bg-blue-600 font-black text-white">{buildInitials(colaborador.nome)}</div>
					<div>
						<div className="text-lg font-black text-slate-950">{colaborador.cargoNome || "Cargo não vinculado"}</div>
						<div className="font-bold text-slate-500">{colaborador.setor}</div>
					</div>
				</div>
				<div className="rounded-2xl bg-slate-50 p-4">
					<div className="mb-1 flex items-center gap-2 font-black text-slate-900"><Briefcase size={16} /> Atividades</div>
					<p className="whitespace-pre-line leading-relaxed">{colaborador.atividades || colaborador.cargoDescricao || "Sem atividades cadastradas."}</p>
				</div>
				<div className="rounded-2xl bg-slate-50 p-4">
					<div className="mb-1 flex items-center gap-2 font-black text-slate-900"><GraduationCap size={16} /> Formação acadêmica</div>
					<p>{colaborador.formacao || "Não informada."}</p>
				</div>
			</div>
		</ModalShell>
	);
}

export default function FinanceiroEquipePage({ canManage = false }) {
	const [cargos, setCargos] = useState([]);
	const [colaboradores, setColaboradores] = useState([]);
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState("");
	const [selectedId, setSelectedId] = useState(null);
	const [cargoModal, setCargoModal] = useState(null);
	const [colaboradorModal, setColaboradorModal] = useState(null);
	const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 0.85 });
	const [drag, setDrag] = useState(null);
	const chartRef = useRef(null);

	const loadEquipe = useCallback(async () => {
		setLoading(true);
		setMessage("");
		try {
			const response = await buscarEquipeFinanceiro();
			setCargos(response.cargos || []);
			setColaboradores(response.colaboradores || []);
		} catch (error) {
			setMessage(error?.message || "Não foi possível carregar a equipe financeira.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadEquipe();
	}, [loadEquipe]);

	const nodes = useMemo(() => buildTreeLayout(colaboradores), [colaboradores]);
	const selectedNode = nodes.find((item) => item.id === selectedId);
	const canvasSize = useMemo(() => {
		const maxX = Math.max(1000, ...nodes.map((node) => node.x + NODE_WIDTH + 120));
		const maxY = Math.max(620, ...nodes.map((node) => node.y + NODE_HEIGHT + 120));
		return { width: maxX, height: maxY };
	}, [nodes]);

	function updateNodePosition(id, next) {
		setColaboradores((current) =>
			current.map((item) => (item.id === id ? { ...item, posX: next.x, posY: next.y, gestorId: next.gestorId ?? item.gestorId, setor: next.setor || item.setor } : item)),
		);
	}

	async function saveCargo(form) {
		setMessage("");
		const response = cargoModal?.id
			? await atualizarCargoEquipeFinanceiro(cargoModal.id, form)
			: await criarCargoEquipeFinanceiro(form);
		setCargoModal(null);
		await loadEquipe();
		return response;
	}

	async function saveColaborador(form) {
		setMessage("");
		const response = colaboradorModal?.id
			? await atualizarColaboradorEquipeFinanceiro(colaboradorModal.id, form)
			: await criarColaboradorEquipeFinanceiro(form);
		setColaboradorModal(null);
		await loadEquipe();
		return response;
	}

	async function deleteColaborador(id) {
		if (!window.confirm("Remover este colaborador do organograma?")) return;
		await removerColaboradorEquipeFinanceiro(id);
		setColaboradorModal(null);
		await loadEquipe();
	}

	async function deleteCargo(id) {
		if (!window.confirm("Excluir este cargo?")) return;
		try {
			await removerCargoEquipeFinanceiro(id);
			await loadEquipe();
		} catch (error) {
			setMessage(error?.message || "Não foi possível excluir o cargo.");
		}
	}

	async function exportPdf() {
		const { default: jsPDF } = await import("jspdf");
		const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
		const pageWidth = pdf.internal.pageSize.getWidth();
		const pageHeight = pdf.internal.pageSize.getHeight();
		const margin = 38;
		const logo = await loadImageDataUrl("/sempre-logo-documento.png");
		if (logo) {
			const logoSize = fitImageInsideBox(logo, 118, 42);
			pdf.addImage(
				logo.dataUrl,
				"PNG",
				pageWidth - margin - logoSize.width,
				22,
				logoSize.width,
				logoSize.height,
			);
		}
		pdf.setFont("helvetica", "bold");
		pdf.setFontSize(18);
		pdf.setTextColor(15, 23, 42);
		pdf.text("Organograma - Financeiro", margin, 42);
		pdf.setFont("helvetica", "normal");
		pdf.setFontSize(9);
		pdf.setTextColor(71, 85, 105);
		pdf.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, margin, 60);
		if (!nodes.length) {
			pdf.text("Nenhum colaborador cadastrado.", margin, 110);
			pdf.save(`organograma-financeiro-${new Date().toISOString().slice(0, 10)}.pdf`);
			return;
		}
		const minX = Math.min(...nodes.map((node) => Number(node.x || 0)));
		const minY = Math.min(...nodes.map((node) => Number(node.y || 0)));
		const maxX = Math.max(...nodes.map((node) => Number(node.x || 0) + NODE_WIDTH));
		const maxY = Math.max(...nodes.map((node) => Number(node.y || 0) + NODE_HEIGHT));
		const contentWidth = Math.max(1, maxX - minX);
		const contentHeight = Math.max(1, maxY - minY);
		const availableWidth = pageWidth - margin * 2;
		const availableHeight = pageHeight - 106;
		const scale = Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
		const offsetX = margin + (availableWidth - contentWidth * scale) / 2 - minX * scale;
		const offsetY = 84 + (availableHeight - contentHeight * scale) / 2 - minY * scale;
		const px = (value) => offsetX + Number(value || 0) * scale;
		const py = (value) => offsetY + Number(value || 0) * scale;
		pdf.setLineWidth(Math.max(1.2, 3 * scale));
		pdf.setDrawColor(147, 197, 253);
		nodes
			.filter((node) => node.gestorId)
			.forEach((node) => {
				const parent = nodes.find((item) => item.id === node.gestorId);
				if (!parent) return;
				const x1 = px(parent.x + NODE_WIDTH);
				const y1 = py(parent.y + NODE_HEIGHT / 2);
				const x2 = px(node.x);
				const y2 = py(node.y + NODE_HEIGHT / 2);
				const mid = (x1 + x2) / 2;
				pdf.lines(
					[
						[(mid - x1) / 2, 0, (mid - x1) / 2, y2 - y1, x2 - x1, y2 - y1],
					],
					x1,
					y1,
				);
			});
		nodes.forEach((node) => {
			const x = px(node.x);
			const y = py(node.y);
			const width = NODE_WIDTH * scale;
			const height = NODE_HEIGHT * scale;
			pdf.setFillColor(255, 255, 255);
			pdf.setDrawColor(226, 232, 240);
			pdf.roundedRect(x, y, width, height, 10 * scale, 10 * scale, "FD");
			pdf.setFillColor(37, 99, 235);
			pdf.circle(x + 30 * scale, y + 34 * scale, 22 * scale, "F");
			pdf.setFont("helvetica", "bold");
			pdf.setTextColor(255, 255, 255);
			pdf.setFontSize(Math.max(6, 10 * scale));
			pdf.text(buildInitials(node.nome), x + 30 * scale, y + 37 * scale, {
				align: "center",
			});
			pdf.setTextColor(15, 23, 42);
			pdf.setFontSize(Math.max(7, 10 * scale));
			pdf.text(String(node.nome || "").slice(0, 34), x + 62 * scale, y + 28 * scale);
			pdf.setFont("helvetica", "normal");
			pdf.setTextColor(71, 85, 105);
			pdf.setFontSize(Math.max(6, 8 * scale));
			pdf.text(
				String(node.cargoNome || "Cargo não vinculado").slice(0, 38),
				x + 62 * scale,
				y + 44 * scale,
			);
			pdf.setFillColor(239, 246, 255);
			pdf.setDrawColor(191, 219, 254);
			pdf.roundedRect(x + 62 * scale, y + 58 * scale, 112 * scale, 22 * scale, 9 * scale, 9 * scale, "FD");
			pdf.setFont("helvetica", "bold");
			pdf.setTextColor(29, 78, 216);
			pdf.setFontSize(Math.max(5.5, 7.4 * scale));
			pdf.text(String(node.setor || "Setor").slice(0, 24), x + 68 * scale, y + 72 * scale);
		});
		pdf.save(`organograma-financeiro-${new Date().toISOString().slice(0, 10)}.pdf`);
	}

	return (
		<section className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div>
					<h2 className="text-lg font-black text-slate-950">Organograma Financeiro</h2>
					<p className="text-sm font-semibold text-slate-500">Hierarquia, cargos e atribuições do time financeiro.</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<button type="button" onClick={exportPdf} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
						<Download size={16} /> Baixar organograma
					</button>
					{canManage ? (
						<>
							<button type="button" onClick={() => setCargoModal(emptyCargoForm())} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50">
								<Briefcase size={16} /> Novo cargo
							</button>
							<button type="button" onClick={() => setColaboradorModal(emptyColaboradorForm())} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
								<Plus size={16} /> Novo colaborador
							</button>
						</>
					) : null}
				</div>
			</div>
			{message ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">{message}</div> : null}
			<div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
				<aside className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-black uppercase tracking-wide text-slate-700">Cargos</h3>
						<span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-500">{cargos.length}</span>
					</div>
					<div className="max-h-[580px] space-y-2 overflow-auto pr-1">
						{cargos.map((cargo) => (
							<div key={cargo.id} className="rounded-xl border border-slate-200 p-3">
								<div className="font-black text-slate-950">{cargo.nome}</div>
								<div className="text-xs font-bold text-slate-500">{cargo.setor}</div>
								{cargo.descricao ? <p className="mt-2 line-clamp-3 text-xs text-slate-500">{cargo.descricao}</p> : null}
								{canManage ? (
									<div className="mt-3 flex gap-2">
										<button type="button" onClick={() => setCargoModal(cargo)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Editar cargo"><Pencil size={14} /></button>
										<button type="button" onClick={() => deleteCargo(cargo.id)} className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50" title="Excluir cargo"><Trash2 size={14} /></button>
									</div>
								) : null}
							</div>
						))}
						{!cargos.length && !loading ? <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">Nenhum cargo cadastrado.</p> : null}
					</div>
				</aside>
				<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2 text-sm font-black text-slate-700"><Users size={16} /> Organograma</div>
						<div className="flex gap-2">
							<button type="button" onClick={() => setViewport((current) => ({ ...current, zoom: Math.max(0.45, current.zoom - 0.1) }))} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Diminuir zoom"><ZoomOut size={16} /></button>
							<button type="button" onClick={() => setViewport((current) => ({ ...current, zoom: Math.min(1.4, current.zoom + 0.1) }))} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Aumentar zoom"><ZoomIn size={16} /></button>
							<button type="button" onClick={() => setViewport({ x: 0, y: 0, zoom: 0.85 })} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Centralizar"><Maximize2 size={16} /></button>
						</div>
					</div>
					<div
						ref={chartRef}
						className="relative h-[660px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
						onWheel={(event) => {
							event.preventDefault();
							const delta = event.deltaY > 0 ? -0.05 : 0.05;
							setViewport((current) => ({ ...current, zoom: Math.min(1.4, Math.max(0.45, current.zoom + delta)) }));
						}}
						onPointerDown={(event) => {
							if (event.target !== event.currentTarget) return;
							setDrag({ type: "pan", startX: event.clientX, startY: event.clientY, viewport });
						}}
						onPointerMove={(event) => {
							if (!drag) return;
							if (drag.type === "pan") {
								setViewport({ ...viewport, x: drag.viewport.x + event.clientX - drag.startX, y: drag.viewport.y + event.clientY - drag.startY });
							}
							if (drag.type === "node") {
								const nextX = drag.nodeStart.x + (event.clientX - drag.startX) / viewport.zoom;
								const nextY = drag.nodeStart.y + (event.clientY - drag.startY) / viewport.zoom;
								updateNodePosition(drag.id, { x: nextX, y: nextY });
							}
						}}
						onPointerUp={async () => {
							if (drag?.type === "node") {
								const node = nodes.find((item) => item.id === drag.id);
								if (node) {
									const target = nodes
										.filter((item) => item.id !== node.id && !isDescendant(nodes, item.id, node.id))
										.map((item) => ({
											...item,
											distance: Math.hypot(item.x - node.x, item.y - node.y),
										}))
										.sort((a, b) => a.distance - b.distance)[0];
									const payload = {
										posX: node.x,
										posY: node.y,
										gestorId: target?.distance < 180 ? target.id : node.gestorId,
										setor: target?.distance < 180 ? target.setor : node.setor,
									};
									await moverColaboradorEquipeFinanceiro(node.id, payload).catch((error) => setMessage(error?.message || "Não foi possível mover o colaborador."));
									await loadEquipe();
								}
							}
							setDrag(null);
						}}
					>
						<div
							className="absolute origin-top-left"
							style={{ width: canvasSize.width, height: canvasSize.height, transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
						>
							<svg className="absolute inset-0 h-full w-full" width={canvasSize.width} height={canvasSize.height}>
								{nodes
									.filter((node) => node.gestorId)
									.map((node) => {
										const parent = nodes.find((item) => item.id === node.gestorId);
										if (!parent) return null;
										const x1 = parent.x + NODE_WIDTH;
										const y1 = parent.y + NODE_HEIGHT / 2;
										const x2 = node.x;
										const y2 = node.y + NODE_HEIGHT / 2;
										const mid = (x1 + x2) / 2;
										return <path key={`${parent.id}-${node.id}`} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} fill="none" stroke="#93c5fd" strokeWidth="3" />;
									})}
							</svg>
							{nodes.map((node) => (
								<ColaboradorNode
									key={node.id}
									canManage={canManage}
									node={node}
									selected={node.id === selectedId}
									onClick={() => setSelectedId(node.id)}
									onEdit={() => setColaboradorModal(node)}
									onPointerDown={(event) => {
										if (!canManage) return;
										event.stopPropagation();
										setDrag({ type: "node", id: node.id, startX: event.clientX, startY: event.clientY, nodeStart: { x: node.x, y: node.y } });
									}}
								/>
							))}
							{loading ? (
								<div className="absolute left-8 top-8 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm">
									<Loader2 size={16} className="animate-spin" /> Carregando equipe...
								</div>
							) : null}
							{!loading && !nodes.length ? (
								<div className="absolute left-8 top-8 rounded-2xl bg-white p-5 text-sm font-semibold text-slate-500 shadow-sm">
									<div className="mb-2 flex items-center gap-2 font-black text-slate-800"><UserRound size={16} /> Nenhum colaborador cadastrado</div>
									{canManage ? "Cadastre cargos e colaboradores para montar o organograma." : "A equipe ainda não foi cadastrada."}
								</div>
							) : null}
						</div>
					</div>
				</div>
			</div>
			{cargoModal ? <CargoModal cargo={cargoModal.id ? cargoModal : null} onClose={() => setCargoModal(null)} onSave={saveCargo} /> : null}
			{colaboradorModal ? <ColaboradorModal cargos={cargos} colaborador={colaboradorModal.id ? colaboradorModal : null} colaboradores={colaboradores} onClose={() => setColaboradorModal(null)} onDelete={deleteColaborador} onSave={saveColaborador} /> : null}
			{selectedNode && !colaboradorModal ? <DetailModal colaborador={selectedNode} onClose={() => setSelectedId(null)} /> : null}
		</section>
	);
}
