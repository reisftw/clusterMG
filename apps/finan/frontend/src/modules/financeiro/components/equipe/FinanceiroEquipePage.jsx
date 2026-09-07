import {
	Briefcase,
	Download,
	GraduationCap,
	Loader2,
	Pencil,
	Plus,
	Trash2,
	UserRound,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ModalShell from "../../../../components/ModalShell";
import {
	atualizarCargoEquipeFinanceiro,
	atualizarColaboradorEquipeFinanceiro,
	atualizarConfigEquipeFinanceiro,
	atualizarSetorEquipeFinanceiro,
	buscarEquipeFinanceiro,
	criarCargoEquipeFinanceiro,
	criarColaboradorEquipeFinanceiro,
	criarSetorEquipeFinanceiro,
	moverColaboradorEquipeFinanceiro,
	removerCargoEquipeFinanceiro,
	removerColaboradorEquipeFinanceiro,
	removerSetorEquipeFinanceiro,
} from "../../services/financeiroService";

const DEFAULT_SETOR_COLOR = "#2563eb";

function buildInitials(name = "") {
	const parts = String(name)
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (!parts.length) return "EF";
	return `${parts[0]?.[0] || ""}${parts.at(-1)?.[0] || ""}`.toUpperCase();
}

function emptySetorForm() {
	return {
		nome: "",
		descricao: "",
		cor: DEFAULT_SETOR_COLOR,
		responsavelId: "",
		ordem: 0,
	};
}

function emptyCargoForm() {
	return { nome: "", descricao: "", ordem: 0 };
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

function buildSetorHierarchy(setores = [], colaboradores = [], responsavelGeralId = "") {
	const setorMap = new Map();
	for (const setor of setores) {
		const key = setor.nome || setor.id || "Sem setor";
		setorMap.set(key.toLowerCase(), {
			...setor,
			membros: [],
		});
	}
	for (const colaborador of colaboradores) {
		const setorNome = colaborador.setor || "Sem setor";
		const key = setorNome.toLowerCase();
		if (!setorMap.has(key)) {
			setorMap.set(key, {
				id: key,
				nome: setorNome,
				cor: DEFAULT_SETOR_COLOR,
				responsavelId: null,
				responsavelNome: "",
				membros: [],
			});
		}
		setorMap.get(key).membros.push(colaborador);
	}
	return [...setorMap.values()]
		.map((setor) => ({
			...setor,
			responsavel:
				colaboradores.find((colaborador) => colaborador.id === setor.responsavelId) ||
				null,
			membros: setor.membros
				.filter(
					(colaborador) =>
						colaborador.id !== setor.responsavelId &&
						colaborador.id !== responsavelGeralId,
				)
				.sort(
					(left, right) =>
						(left.ordem || 0) - (right.ordem || 0) ||
						left.nome.localeCompare(right.nome, "pt-BR"),
				),
		}))
		.sort(
			(left, right) =>
				(left.ordem || 0) - (right.ordem || 0) ||
				left.nome.localeCompare(right.nome, "pt-BR"),
		);
}

function countSetorMembers(setor) {
	return (setor.membros?.length || 0) + (setor.responsavel ? 1 : 0);
}

function getSetorCargoCount(setor) {
	return new Set(
		[setor.responsavel, ...(setor.membros || [])]
			.filter(Boolean)
			.map((colaborador) => colaborador.cargoId || colaborador.cargoNome)
			.filter(Boolean),
	).size;
}

function buildEquipeTree(config = {}, setores = [], colaboradores = []) {
	const responsavelGeral =
		colaboradores.find(
			(colaborador) => colaborador.id === config.responsavelGeralId,
		) || null;
	return {
		responsavelGeral,
		setores: buildSetorHierarchy(
			setores,
			colaboradores,
			config.responsavelGeralId,
		),
	};
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

function hexToRgb(hex, fallback = [37, 99, 235]) {
	const normalized = String(hex || "").replace("#", "").trim();
	if (!/^[0-9a-f]{6}$/i.test(normalized)) return fallback;
	return [
		Number.parseInt(normalized.slice(0, 2), 16),
		Number.parseInt(normalized.slice(2, 4), 16),
		Number.parseInt(normalized.slice(4, 6), 16),
	];
}

function drawPdfText(pdf, text, x, y, options = {}) {
	const {
		align = "left",
		bold = false,
		color = [15, 23, 42],
		maxWidth = 120,
		size = 8,
	} = options;
	pdf.setFont("helvetica", bold ? "bold" : "normal");
	pdf.setFontSize(size);
	pdf.setTextColor(...color);
	const lines = pdf.splitTextToSize(String(text || ""), maxWidth).slice(0, 2);
	pdf.text(lines, x, y, { align });
	return lines.length;
}

function drawPersonPdfCard(pdf, colaborador, x, y, width, height, options = {}) {
	const { accent = [37, 99, 235], label = "" } = options;
	pdf.setFillColor(255, 255, 255);
	pdf.setDrawColor(203, 213, 225);
	pdf.setLineWidth(0.8);
	pdf.roundedRect(x, y, width, height, 7, 7, "FD");
	pdf.setFillColor(...accent);
	pdf.circle(x + 18, y + height / 2, 11, "F");
	drawPdfText(pdf, buildInitials(colaborador?.nome), x + 18, y + height / 2 + 3, {
		align: "center",
		bold: true,
		color: [255, 255, 255],
		maxWidth: 22,
		size: 7,
	});
	if (label) {
		drawPdfText(pdf, label, x + 34, y + 11, {
			bold: true,
			color: [100, 116, 139],
			maxWidth: width - 42,
			size: 5.5,
		});
	}
	drawPdfText(pdf, colaborador?.nome || "Sem responsável", x + 34, y + (label ? 22 : 18), {
		bold: true,
		maxWidth: width - 42,
		size: 7.5,
	});
	drawPdfText(pdf, colaborador?.cargoNome || "Cargo não vinculado", x + 34, y + (label ? 34 : 30), {
		color: [71, 85, 105],
		maxWidth: width - 42,
		size: 6.5,
	});
}

function Avatar({ className = "h-10 w-10", colaborador }) {
	return (
		<div className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-blue-600 text-xs font-black text-white ${className}`}>
			{colaborador?.avatarUrl ? (
				<img
					src={colaborador.avatarUrl}
					alt=""
					className="h-full w-full object-cover"
					onError={(event) => {
						event.currentTarget.style.display = "none";
					}}
				/>
			) : (
				buildInitials(colaborador?.nome)
			)}
		</div>
	);
}

function AdminDropdown({ children, count, title }) {
	return (
		<details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
			<summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
				<div className="text-sm font-black uppercase tracking-wide text-slate-700">
					{title}
				</div>
				<div className="flex items-center gap-2">
					<span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-500">
						{count}
					</span>
					<span className="text-xs font-black text-slate-400 group-open:rotate-180">
						▼
					</span>
				</div>
			</summary>
			<div className="border-t border-slate-100 p-4">{children}</div>
		</details>
	);
}

function SetorModal({ colaboradorOptions, onClose, onSave, setor }) {
	const [form, setForm] = useState(setor || emptySetorForm());
	return (
		<ModalShell title={setor?.id ? "Editar setor" : "Novo setor"} onClose={onClose} size="lg">
			<form
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault();
					onSave(form);
				}}
			>
				<div className="grid gap-4 md:grid-cols-2">
					<label className="space-y-1 text-sm font-bold text-slate-700">
						Nome do setor
						<input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} />
					</label>
					<label className="space-y-1 text-sm font-bold text-slate-700">
						Cor do setor
						<input type="color" className="h-10 w-full rounded-xl border border-slate-200 px-2 py-1" value={form.cor || DEFAULT_SETOR_COLOR} onChange={(event) => setForm((current) => ({ ...current, cor: event.target.value }))} />
					</label>
					<label className="space-y-1 text-sm font-bold text-slate-700 md:col-span-2">
						Responsável pelo setor
						<select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={form.responsavelId || ""} onChange={(event) => setForm((current) => ({ ...current, responsavelId: event.target.value }))}>
							<option value="">Sem responsável definido</option>
							{colaboradorOptions.map((colaborador) => (
								<option key={colaborador.id} value={colaborador.id}>{colaborador.nome}</option>
							))}
						</select>
					</label>
				</div>
				<label className="space-y-1 text-sm font-bold text-slate-700">
					Descrição
					<textarea className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2" value={form.descricao || ""} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} />
				</label>
				<div className="flex justify-end gap-2">
					<button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Cancelar</button>
					<button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Salvar</button>
				</div>
			</form>
		</ModalShell>
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

function ColaboradorModal({ cargos, colaborador, colaboradores, onClose, onDelete, onSave, setores }) {
	const [form, setForm] = useState(colaborador || emptyColaboradorForm());
	const gestores = colaboradores.filter((item) => item.id !== colaborador?.id);
	function handleCargoChange(cargoId) {
		const cargoSelecionado = cargos.find((cargo) => cargo.id === cargoId);
		setForm((current) => ({
			...current,
			cargoId,
			atividades:
				current.atividades || cargoSelecionado?.descricao || current.atividades,
		}));
	}
	return (
		<ModalShell title={colaborador?.id ? "Editar usuário" : "Novo usuário"} onClose={onClose} size="xl">
			<form
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault();
					onSave(form);
				}}
			>
				<div className="grid gap-4 md:grid-cols-2">
					<label className="space-y-1 text-sm font-bold text-slate-700">
						Usuário
						<input className="w-full rounded-xl border border-slate-200 px-3 py-2" value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} />
					</label>
					<label className="space-y-1 text-sm font-bold text-slate-700">
						Setor
						<select
							className="w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400"
							disabled={!setores.length}
							value={form.setor || ""}
							onChange={(event) => setForm((current) => ({ ...current, setor: event.target.value }))}
						>
							<option value="">{setores.length ? "Selecione o setor" : "Cadastre um setor primeiro"}</option>
							{setores.map((setor) => (
								<option key={setor.id} value={setor.nome}>{setor.nome}</option>
							))}
						</select>
					</label>
					<label className="space-y-1 text-sm font-bold text-slate-700">
						Cargo
						<select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={form.cargoId} onChange={(event) => handleCargoChange(event.target.value)}>
							<option value="">Selecione</option>
							{cargos.map((cargo) => (
								<option key={cargo.id} value={cargo.id}>{cargo.nome}</option>
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
					<Avatar className="h-14 w-14" colaborador={colaborador} />
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

function UserPill({ canDrag = false, colaborador, onClick, onDragEnd, onDragStart }) {
	return (
		<button
			type="button"
			draggable={canDrag}
			onClick={onClick}
			onDragEnd={onDragEnd}
			onDragStart={(event) => onDragStart?.(event, colaborador)}
			className={`flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50 ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
			title={canDrag ? "Arrastar para outro setor" : undefined}
		>
			<Avatar className="h-8 w-8" colaborador={colaborador} />
			<div className="min-w-0">
				<div className="truncate text-sm font-black text-slate-900">{colaborador.nome}</div>
				<div className="truncate text-xs font-semibold text-slate-500">{colaborador.cargoNome || "Cargo não vinculado"}</div>
			</div>
		</button>
	);
}

function normalizeEquipeResponse(response) {
	if (!response || typeof response !== "object") {
		throw new Error("Resposta inválida ao carregar a equipe financeira.");
	}
	if (
		!Array.isArray(response.setores) ||
		!Array.isArray(response.cargos) ||
		!Array.isArray(response.colaboradores)
	) {
		throw new Error("Resposta incompleta ao carregar a equipe financeira.");
	}
	return {
		config:
			response.config && typeof response.config === "object"
				? response.config
				: {},
		setores: response.setores,
		cargos: response.cargos,
		colaboradores: response.colaboradores,
	};
}

export default function FinanceiroEquipePage({ canManage = false }) {
	const [config, setConfig] = useState({});
	const [setores, setSetores] = useState([]);
	const [cargos, setCargos] = useState([]);
	const [colaboradores, setColaboradores] = useState([]);
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState("");
	const [selectedColaborador, setSelectedColaborador] = useState(null);
	const [setorModal, setSetorModal] = useState(null);
	const [cargoModal, setCargoModal] = useState(null);
	const [colaboradorModal, setColaboradorModal] = useState(null);
	const [draggingColaboradorId, setDraggingColaboradorId] = useState("");

	const loadEquipe = useCallback(async () => {
		setLoading(true);
		setMessage("");
		try {
			const response = await buscarEquipeFinanceiro();
			const equipe = normalizeEquipeResponse(response);
			setConfig(equipe.config);
			setSetores(equipe.setores);
			setCargos(equipe.cargos);
			setColaboradores(equipe.colaboradores);
		} catch (error) {
			setMessage(error?.message || "Não foi possível carregar a equipe financeira.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadEquipe();
	}, [loadEquipe]);

	const equipeTree = useMemo(
		() => buildEquipeTree(config, setores, colaboradores),
		[config, setores, colaboradores],
	);

	async function saveEquipeConfig(nextConfig) {
		setMessage("");
		try {
			const response = await atualizarConfigEquipeFinanceiro(nextConfig);
			setConfig(response.config || nextConfig || {});
			await loadEquipe();
		} catch (error) {
			setMessage(error?.message || "Não foi possível atualizar a configuração da equipe.");
		}
	}

	async function saveSetor(form) {
		setMessage("");
		const response = setorModal?.id
			? await atualizarSetorEquipeFinanceiro(setorModal.id, form)
			: await criarSetorEquipeFinanceiro(form);
		setSetorModal(null);
		await loadEquipe();
		return response;
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

	async function moveColaboradorToSetor(colaboradorId, setorNome) {
		if (!canManage || !colaboradorId || !setorNome) return;
		const colaborador = colaboradores.find((item) => item.id === colaboradorId);
		if (!colaborador || colaborador.setor === setorNome) return;
		setMessage("");
		try {
			await moverColaboradorEquipeFinanceiro(colaboradorId, { setor: setorNome });
			await loadEquipe();
		} catch (error) {
			setMessage(error?.message || "Não foi possível mover o usuário para outro setor.");
		} finally {
			setDraggingColaboradorId("");
		}
	}

	async function deleteSetor(id) {
		if (!window.confirm("Excluir este setor?")) return;
		try {
			await removerSetorEquipeFinanceiro(id);
			await loadEquipe();
		} catch (error) {
			setMessage(error?.message || "Não foi possível excluir o setor.");
		}
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

	async function deleteColaborador(id) {
		if (!window.confirm("Remover este usuário do organograma?")) return;
		await removerColaboradorEquipeFinanceiro(id);
		setColaboradorModal(null);
		await loadEquipe();
	}

	async function exportPdf() {
		const { default: jsPDF } = await import("jspdf");
		const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
		const pageWidth = pdf.internal.pageSize.getWidth();
		const pageHeight = pdf.internal.pageSize.getHeight();
		const margin = 38;
		const tree = buildEquipeTree(config, setores, colaboradores);
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
		const chartTop = 92;
		const chartBottom = pageHeight - margin;
		const chartWidth = pageWidth - margin * 2;
		const setoresToDraw = tree.setores.length ? tree.setores : [{ id: "empty", nome: "Sem setores", membros: [] }];
		const columnGap = setoresToDraw.length > 8 ? 6 : 10;
		const columnWidth =
			(chartWidth - columnGap * (setoresToDraw.length - 1)) / setoresToDraw.length;
		const maxColumnsWidth = columnWidth * setoresToDraw.length + columnGap * (setoresToDraw.length - 1);
		const startX = margin + Math.max((chartWidth - maxColumnsWidth) / 2, 0);
		const generalCardWidth = Math.min(220, chartWidth * 0.42);
		const generalCardHeight = 54;
		const generalX = margin + chartWidth / 2 - generalCardWidth / 2;
		const generalY = chartTop;
		drawPersonPdfCard(
			pdf,
			tree.responsavelGeral,
			generalX,
			generalY,
			generalCardWidth,
			generalCardHeight,
			{ accent: [37, 99, 235], label: "RESPONSÁVEL GERAL" },
		);
		const spineTop = generalY + generalCardHeight;
		const spineBottom = spineTop + 38;
		pdf.setDrawColor(71, 85, 105);
		pdf.setLineWidth(1.3);
		pdf.line(pageWidth / 2, spineTop, pageWidth / 2, spineBottom);
		if (setoresToDraw.length > 1) {
			pdf.line(startX + columnWidth / 2, spineBottom, startX + maxColumnsWidth - columnWidth / 2, spineBottom);
		}
		const setorHeaderY = spineBottom + 18;
		const availableMemberHeight = Math.max(chartBottom - setorHeaderY - 90, 90);
		const maxMembers = Math.max(...setoresToDraw.map((setor) => setor.membros?.length || 0), 1);
		const memberGap = 8;
		const memberCardHeight = Math.max(
			28,
			Math.min(44, (availableMemberHeight - memberGap * Math.max(maxMembers - 1, 0)) / maxMembers),
		);
		setoresToDraw.forEach((setor, index) => {
			const x = startX + index * (columnWidth + columnGap);
			const centerX = x + columnWidth / 2;
			const accent = hexToRgb(setor.cor, [37, 99, 235]);
			pdf.setDrawColor(71, 85, 105);
			pdf.setLineWidth(1.2);
			pdf.line(centerX, spineBottom, centerX, setorHeaderY - 8);
			pdf.setFillColor(248, 250, 252);
			pdf.setDrawColor(...accent);
			pdf.roundedRect(x, setorHeaderY, columnWidth, 30, 6, 6, "FD");
			drawPdfText(pdf, setor.nome || "Setor", centerX, setorHeaderY + 13, {
				align: "center",
				bold: true,
				color: [15, 23, 42],
				maxWidth: columnWidth - 10,
				size: 7.5,
			});
			drawPdfText(pdf, `${countSetorMembers(setor)} usuários`, centerX, setorHeaderY + 24, {
				align: "center",
				color: [71, 85, 105],
				maxWidth: columnWidth - 10,
				size: 6,
			});
			const responsavelY = setorHeaderY + 48;
			if (setor.responsavel) {
				pdf.line(centerX, setorHeaderY + 30, centerX, responsavelY);
				drawPersonPdfCard(pdf, setor.responsavel, x, responsavelY, columnWidth, 42, {
					accent,
					label: "RESPONSÁVEL DO SETOR",
				});
			} else {
				pdf.setFillColor(255, 255, 255);
				pdf.setDrawColor(203, 213, 225);
				pdf.roundedRect(x, responsavelY, columnWidth, 30, 6, 6, "FD");
				drawPdfText(pdf, "Sem responsável do setor", centerX, responsavelY + 18, {
					align: "center",
					color: [100, 116, 139],
					maxWidth: columnWidth - 10,
					size: 6.5,
				});
			}
			const memberTop = responsavelY + 58;
			pdf.setDrawColor(71, 85, 105);
			pdf.line(centerX, responsavelY + (setor.responsavel ? 42 : 30), centerX, memberTop - 8);
			(setor.membros || []).forEach((membro, memberIndex) => {
				const cardY = memberTop + memberIndex * (memberCardHeight + memberGap);
				if (memberIndex === 0) {
					pdf.line(centerX, memberTop - 8, centerX, cardY);
				}
				drawPersonPdfCard(pdf, membro, x, cardY, columnWidth, memberCardHeight, {
					accent,
				});
			});
			if (!setor.membros?.length) {
				pdf.setFillColor(255, 255, 255);
				pdf.setDrawColor(226, 232, 240);
				pdf.roundedRect(x, memberTop, columnWidth, 28, 6, 6, "FD");
				drawPdfText(pdf, "Nenhum usuário neste setor", centerX, memberTop + 17, {
					align: "center",
					color: [100, 116, 139],
					maxWidth: columnWidth - 8,
					size: 6.2,
				});
			}
		});
		pdf.save(`organograma-financeiro-${new Date().toISOString().slice(0, 10)}.pdf`);
	}

	return (
		<section className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div>
					<h2 className="text-lg font-black text-slate-950">Organograma Financeiro</h2>
					<p className="text-sm font-semibold text-slate-500">Setores na hierarquia, responsáveis no topo e usuários com seus cargos dentro de cada setor.</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<button type="button" onClick={exportPdf} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
						<Download size={16} /> Baixar organograma
					</button>
					{canManage ? (
						<>
							<label className="flex min-w-64 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-500">
								Responsável geral
								<select
									className="min-w-0 flex-1 bg-transparent text-sm font-bold normal-case text-slate-800 outline-none"
									value={config.responsavelGeralId || ""}
									onChange={(event) =>
										saveEquipeConfig({ responsavelGeralId: event.target.value })
									}
								>
									<option value="">Selecione</option>
									{colaboradores.map((colaborador) => (
										<option key={colaborador.id} value={colaborador.id}>{colaborador.nome}</option>
									))}
								</select>
							</label>
							<button type="button" onClick={() => setSetorModal(emptySetorForm())} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50">
								<Users size={16} /> Novo setor
							</button>
							<button type="button" onClick={() => setCargoModal(emptyCargoForm())} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50">
								<Briefcase size={16} /> Novo cargo
							</button>
							<button type="button" onClick={() => setColaboradorModal(emptyColaboradorForm())} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
								<Plus size={16} /> Novo usuário
							</button>
						</>
					) : null}
				</div>
			</div>
			{message ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">{message}</div> : null}
			<div className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
				<aside className="space-y-3">
					<AdminDropdown count={setores.length} title="Setores">
						<div className="space-y-2">
							{setores.map((setor) => (
								<div key={setor.id} className="rounded-xl border border-slate-200 p-3">
									<div className="flex items-start gap-2">
										<span className="mt-1 h-3 w-3 rounded-full" style={{ backgroundColor: setor.cor || DEFAULT_SETOR_COLOR }} />
										<div className="min-w-0 flex-1">
											<div className="font-black text-slate-950">{setor.nome}</div>
											<div className="text-xs font-bold text-slate-500">{setor.responsavelNome || "Sem responsável"}</div>
										</div>
									</div>
									{canManage ? (
										<div className="mt-3 flex gap-2">
											<button type="button" onClick={() => setSetorModal(setor)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Editar setor"><Pencil size={14} /></button>
											<button type="button" onClick={() => deleteSetor(setor.id)} className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50" title="Excluir setor"><Trash2 size={14} /></button>
										</div>
									) : null}
								</div>
							))}
							{!setores.length && !loading ? <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">Nenhum setor cadastrado.</p> : null}
						</div>
					</AdminDropdown>
					<AdminDropdown count={cargos.length} title="Cargos">
						<div className="space-y-2">
							{cargos.map((cargo) => (
								<div key={cargo.id} className="rounded-xl border border-slate-200 p-3">
									<div className="font-black text-slate-950">{cargo.nome}</div>
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
					</AdminDropdown>
					<AdminDropdown count={colaboradores.length} title="Usuários">
						<div className="space-y-2">
							{colaboradores.map((colaborador) => (
								<div key={colaborador.id} className="rounded-xl border border-slate-200 p-3">
									<div className="flex items-center gap-3">
										<Avatar colaborador={colaborador} />
										<div className="min-w-0">
											<div className="truncate font-black text-slate-950">{colaborador.nome}</div>
											<div className="truncate text-xs font-bold text-slate-500">{colaborador.cargoNome || "Cargo não vinculado"}</div>
											<div className="truncate text-xs font-semibold text-slate-400">{colaborador.setor || "Sem setor"}</div>
										</div>
									</div>
									{canManage ? (
										<div className="mt-3 flex gap-2">
											<button type="button" onClick={() => setColaboradorModal(colaborador)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Editar usuário"><Pencil size={14} /></button>
											<button type="button" onClick={() => deleteColaborador(colaborador.id)} className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50" title="Excluir usuário"><Trash2 size={14} /></button>
										</div>
									) : null}
								</div>
							))}
							{!colaboradores.length && !loading ? <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">Nenhum usuário cadastrado.</p> : null}
						</div>
					</AdminDropdown>
				</aside>
				<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-700"><Users size={16} /> Organograma</div>
					{loading ? (
						<div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
							<Loader2 size={16} className="animate-spin" /> Carregando equipe...
						</div>
					) : null}
					{!loading && !equipeTree.setores.length ? (
						<div className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-500">
							<div className="mb-2 flex items-center gap-2 font-black text-slate-800"><UserRound size={16} /> Nenhum setor cadastrado</div>
							{canManage ? "Cadastre setores, cargos e usuários para montar o organograma." : "A equipe ainda não foi cadastrada."}
						</div>
					) : null}
					<div className="space-y-6">
						{equipeTree.setores.length ? (
							<div className="rounded-2xl border border-slate-300 bg-slate-50 p-5">
								<div className="flex justify-center">
									{equipeTree.responsavelGeral ? (
										<button
											type="button"
											draggable={canManage}
											onClick={() => setSelectedColaborador(equipeTree.responsavelGeral)}
											onDragStart={(event) => {
												setDraggingColaboradorId(equipeTree.responsavelGeral.id);
												event.dataTransfer.effectAllowed = "move";
												event.dataTransfer.setData("text/plain", equipeTree.responsavelGeral.id);
											}}
											onDragEnd={() => setDraggingColaboradorId("")}
											className={`flex min-w-64 items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-left shadow-md ${canManage ? "cursor-grab active:cursor-grabbing" : ""}`}
										>
											<Avatar className="h-12 w-12" colaborador={equipeTree.responsavelGeral} />
											<div className="min-w-0">
												<div className="text-xs font-black uppercase text-slate-400">Responsável geral</div>
												<div className="truncate text-base font-black text-slate-900">{equipeTree.responsavelGeral.nome}</div>
												<div className="truncate text-xs font-bold text-slate-500">{equipeTree.responsavelGeral.cargoNome || "Cargo não vinculado"}</div>
											</div>
										</button>
									) : (
										<div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-center text-sm font-black text-slate-500">
											Responsável geral não definido
										</div>
									)}
								</div>
								<div className="mx-auto h-14 w-0.5 bg-slate-400" />
								<div className="relative">
									{equipeTree.setores.length > 1 ? (
										<div className="absolute left-[8%] right-[8%] top-0 hidden h-0.5 bg-slate-400 lg:block" />
									) : null}
									<div className="grid gap-4 pt-4 lg:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
									{equipeTree.setores.map((setor) => (
										<div
											key={setor.id}
											className={`relative rounded-2xl border-2 border-dashed bg-white/80 p-4 transition ${draggingColaboradorId ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"}`}
											onDragOver={(event) => {
												if (canManage) event.preventDefault();
											}}
											onDrop={(event) => {
												event.preventDefault();
												moveColaboradorToSetor(
													event.dataTransfer.getData("text/plain") || draggingColaboradorId,
													setor.nome,
												);
											}}
										>
											<div className="absolute left-1/2 top-[-18px] h-4 w-0.5 bg-slate-400" />
											<div className="mb-4 flex items-center gap-3 border-b border-slate-200 pb-3">
												<span className="h-4 w-4 rounded-full" style={{ backgroundColor: setor.cor || DEFAULT_SETOR_COLOR }} />
												<div className="min-w-0 flex-1">
													<h3 className="truncate text-base font-black text-slate-950">{setor.nome}</h3>
													<p className="text-xs font-bold text-slate-500">{getSetorCargoCount(setor)} cargos · {countSetorMembers(setor)} usuários</p>
												</div>
											</div>
											{setor.responsavel ? (
												<div className="flex justify-center">
													<button type="button" onClick={() => setSelectedColaborador(setor.responsavel)} className="flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left shadow-sm">
														<Avatar className="h-10 w-10" colaborador={setor.responsavel} />
														<div className="min-w-0">
															<div className="truncate text-sm font-black text-slate-900">{setor.responsavel.nome}</div>
															<div className="truncate text-xs font-bold text-slate-500">{setor.responsavel.cargoNome || "Responsável do setor"}</div>
														</div>
													</button>
												</div>
											) : (
												<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs font-bold text-slate-400">
													Sem responsável do setor
												</div>
											)}
											<div className="mx-auto h-6 w-0.5 bg-slate-400" />
											<div className="relative">
												{setor.membros.length > 1 ? (
													<div className="absolute left-[10%] right-[10%] top-0 h-0.5 bg-slate-400" />
												) : null}
												<div className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-3">
													{setor.membros.map((colaborador) => (
														<div key={colaborador.id} className="relative">
															<div className="absolute left-1/2 top-[-16px] h-4 w-0.5 bg-slate-400" />
															<UserPill
																canDrag={canManage}
																colaborador={colaborador}
																onClick={() => setSelectedColaborador(colaborador)}
																onDragStart={(event, dragged) => {
																	setDraggingColaboradorId(dragged.id);
																	event.dataTransfer.effectAllowed = "move";
																	event.dataTransfer.setData("text/plain", dragged.id);
																}}
																onDragEnd={() => setDraggingColaboradorId("")}
															/>
														</div>
													))}
													{!setor.membros.length ? <div className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">Nenhum usuário neste setor.</div> : null}
												</div>
											</div>
										</div>
									))}
								</div>
								</div>
							</div>
						) : null}
					</div>
				</div>
			</div>
			{setorModal ? <SetorModal colaboradorOptions={colaboradores} setor={setorModal.id ? setorModal : null} onClose={() => setSetorModal(null)} onSave={saveSetor} /> : null}
			{cargoModal ? <CargoModal cargo={cargoModal.id ? cargoModal : null} onClose={() => setCargoModal(null)} onSave={saveCargo} /> : null}
			{colaboradorModal ? <ColaboradorModal cargos={cargos} colaborador={colaboradorModal.id ? colaboradorModal : null} colaboradores={colaboradores} setores={setores} onClose={() => setColaboradorModal(null)} onDelete={deleteColaborador} onSave={saveColaborador} /> : null}
			{selectedColaborador && !colaboradorModal ? <DetailModal colaborador={selectedColaborador} onClose={() => setSelectedColaborador(null)} /> : null}
		</section>
	);
}
