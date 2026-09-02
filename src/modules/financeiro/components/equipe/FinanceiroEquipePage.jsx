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
import ModalShell from "../../../../components/ui/ModalShell";
import {
	atualizarCargoEquipeFinanceiro,
	atualizarColaboradorEquipeFinanceiro,
	atualizarSetorEquipeFinanceiro,
	buscarEquipeFinanceiro,
	criarCargoEquipeFinanceiro,
	criarColaboradorEquipeFinanceiro,
	criarSetorEquipeFinanceiro,
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
	return { nome: "", setorId: "", descricao: "", ordem: 0 };
}

function emptyColaboradorForm() {
	return {
		nome: "",
		cargoId: "",
		formacao: "",
		atividades: "",
		gestorId: "",
		avatarUrl: "",
		ordem: 0,
	};
}

function getCargoSetor(cargo, setores = []) {
	return (
		setores.find((setor) => setor.id === cargo?.setorId)?.nome ||
		cargo?.setor ||
		"Sem setor"
	);
}

function getCargoSetorColor(cargo, setores = []) {
	return (
		setores.find((setor) => setor.id === cargo?.setorId)?.cor ||
		DEFAULT_SETOR_COLOR
	);
}

function buildSetorHierarchy(setores = [], cargos = [], colaboradores = []) {
	const setorMap = new Map();
	for (const setor of setores) {
		setorMap.set(setor.id || `nome:${setor.nome}`, {
			...setor,
			cargos: [],
		});
	}
	for (const cargo of cargos) {
		const key = cargo.setorId || `nome:${cargo.setor}`;
		if (!setorMap.has(key)) {
			setorMap.set(key, {
				id: key,
				nome: cargo.setor || "Sem setor",
				cor: DEFAULT_SETOR_COLOR,
				responsavelId: null,
				cargos: [],
			});
		}
		const membros = colaboradores
			.filter((colaborador) => colaborador.cargoId === cargo.id)
			.sort(
				(left, right) =>
					(left.ordem || 0) - (right.ordem || 0) ||
					left.nome.localeCompare(right.nome, "pt-BR"),
			);
		setorMap.get(key).cargos.push({ ...cargo, membros });
	}
	return [...setorMap.values()]
		.map((setor) => ({
			...setor,
			responsavel:
				colaboradores.find((colaborador) => colaborador.id === setor.responsavelId) ||
				null,
			cargos: setor.cargos.sort(
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

function buildResponsibleHierarchy(setores = [], cargos = [], colaboradores = []) {
	const setorHierarchy = buildSetorHierarchy(setores, cargos, colaboradores);
	const groups = new Map();
	for (const setor of setorHierarchy) {
		const responsavelKey = setor.responsavel?.id || `setor:${setor.id}`;
		if (!groups.has(responsavelKey)) {
			groups.set(responsavelKey, {
				id: responsavelKey,
				responsavel: setor.responsavel,
				setores: [],
			});
		}
		groups.get(responsavelKey).setores.push(setor);
	}
	return [...groups.values()].sort((left, right) => {
		const leftName = left.responsavel?.nome || left.setores[0]?.nome || "";
		const rightName = right.responsavel?.nome || right.setores[0]?.nome || "";
		return leftName.localeCompare(rightName, "pt-BR");
	});
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
						Responsável pela hierarquia
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

function CargoModal({ cargo, onClose, onSave, setores }) {
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
						<select
							className="w-full rounded-xl border border-slate-200 px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400"
							disabled={!setores.length}
							value={form.setorId || ""}
							onChange={(event) => setForm((current) => ({ ...current, setorId: event.target.value }))}
						>
							<option value="">{setores.length ? "Selecione o setor" : "Cadastre um setor primeiro"}</option>
							{setores.map((setor) => (
								<option key={setor.id} value={setor.id}>{setor.nome}</option>
							))}
						</select>
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
	const selectedCargo = cargos.find((cargo) => cargo.id === form.cargoId);
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
						Cargo
						<select className="w-full rounded-xl border border-slate-200 px-3 py-2" value={form.cargoId} onChange={(event) => handleCargoChange(event.target.value)}>
							<option value="">Selecione</option>
							{cargos.map((cargo) => (
								<option key={cargo.id} value={cargo.id}>{cargo.nome} · {getCargoSetor(cargo, setores)}</option>
							))}
						</select>
					</label>
					<div className="space-y-1 text-sm font-bold text-slate-700">
						Setor vinculado
						<div className="min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">
							{selectedCargo ? getCargoSetor(selectedCargo, setores) : "Selecione um cargo"}
						</div>
					</div>
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

function UserPill({ colaborador, onClick }) {
	return (
		<button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2 text-left hover:bg-blue-50">
			<Avatar className="h-8 w-8" colaborador={colaborador} />
			<div className="min-w-0">
				<div className="truncate text-sm font-black text-slate-900">{colaborador.nome}</div>
				<div className="truncate text-xs font-semibold text-slate-500">{colaborador.formacao || "Formação não informada"}</div>
			</div>
		</button>
	);
}

export default function FinanceiroEquipePage({ canManage = false }) {
	const [setores, setSetores] = useState([]);
	const [cargos, setCargos] = useState([]);
	const [colaboradores, setColaboradores] = useState([]);
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState("");
	const [selectedColaborador, setSelectedColaborador] = useState(null);
	const [setorModal, setSetorModal] = useState(null);
	const [cargoModal, setCargoModal] = useState(null);
	const [colaboradorModal, setColaboradorModal] = useState(null);

	const loadEquipe = useCallback(async () => {
		setLoading(true);
		setMessage("");
		try {
			const response = await buscarEquipeFinanceiro();
			setSetores(response.setores || []);
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

	const responsibleGroups = useMemo(
		() => buildResponsibleHierarchy(setores, cargos, colaboradores),
		[setores, cargos, colaboradores],
	);

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
		const payload = { ...form };
		delete payload.setor;
		const response = colaboradorModal?.id
			? await atualizarColaboradorEquipeFinanceiro(colaboradorModal.id, payload)
			: await criarColaboradorEquipeFinanceiro(payload);
		setColaboradorModal(null);
		await loadEquipe();
		return response;
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
		let y = 96;
		responsibleGroups.forEach((group, groupIndex) => {
			if (y > 500) {
				pdf.addPage();
				y = 48;
			}
			pdf.setFillColor(248, 250, 252);
			pdf.setDrawColor(203, 213, 225);
			pdf.roundedRect(margin, y - 18, pageWidth - margin * 2, 32, 8, 8, "FD");
			pdf.setFont("helvetica", "bold");
			pdf.setFontSize(12);
			pdf.setTextColor(15, 23, 42);
			pdf.text(
				group.responsavel?.nome || `Hierarquia ${groupIndex + 1}`,
				margin + 12,
				y + 2,
			);
			y += 42;
			group.setores.forEach((setor) => {
				pdf.setDrawColor(147, 197, 253);
				pdf.line(margin + 24, y - 20, margin + 24, y + 4);
				pdf.line(margin + 24, y + 4, margin + 42, y + 4);
				pdf.setFont("helvetica", "bold");
				pdf.setFontSize(10);
				pdf.setTextColor(30, 64, 175);
				pdf.text(setor.nome || "Setor", margin + 50, y + 7);
				y += 28;
				setor.cargos.forEach((cargo) => {
					if (y > 520) {
						pdf.addPage();
						y = 48;
					}
					pdf.setFont("helvetica", "bold");
					pdf.setFontSize(9);
					pdf.setTextColor(15, 23, 42);
					pdf.text(cargo.nome || "Cargo", margin + 74, y + 7);
					pdf.setFont("helvetica", "normal");
					pdf.setFontSize(8);
					pdf.setTextColor(71, 85, 105);
					const nomes = cargo.membros.map((membro) => membro.nome).join(", ") || "Sem usuários vinculados";
					pdf.text(pdf.splitTextToSize(nomes, pageWidth - margin * 2 - 96), margin + 74, y + 22);
					y += 42 + Math.ceil(nomes.length / 120) * 10;
				});
			});
			y += 16;
		});
		pdf.save(`organograma-financeiro-${new Date().toISOString().slice(0, 10)}.pdf`);
	}

	return (
		<section className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div>
					<h2 className="text-lg font-black text-slate-950">Organograma Financeiro</h2>
					<p className="text-sm font-semibold text-slate-500">Setores na hierarquia, cargos dentro dos setores e usuários vinculados ao cargo.</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<button type="button" onClick={exportPdf} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
						<Download size={16} /> Baixar organograma
					</button>
					{canManage ? (
						<>
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
									<div className="text-xs font-bold text-slate-500">{getCargoSetor(cargo, setores)}</div>
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
					{!loading && !responsibleGroups.length ? (
						<div className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-500">
							<div className="mb-2 flex items-center gap-2 font-black text-slate-800"><UserRound size={16} /> Nenhum setor cadastrado</div>
							{canManage ? "Cadastre setores, cargos e usuários para montar o organograma." : "A equipe ainda não foi cadastrada."}
						</div>
					) : null}
					<div className="space-y-6">
						{responsibleGroups.map((group) => (
							<div key={group.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
								<div className="flex justify-center">
									{group.responsavel ? (
										<button type="button" onClick={() => setSelectedColaborador(group.responsavel)} className="flex min-w-64 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm">
											<Avatar className="h-12 w-12" colaborador={group.responsavel} />
											<div className="min-w-0">
												<div className="text-xs font-black uppercase text-slate-400">Responsável</div>
												<div className="truncate text-base font-black text-slate-900">{group.responsavel.nome}</div>
												<div className="text-xs font-bold text-slate-500">{group.setores.length} setores</div>
											</div>
										</button>
									) : (
										<div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-center text-sm font-black text-slate-500">
											Sem responsável definido
										</div>
									)}
								</div>
								<div className="mx-auto h-14 w-px bg-slate-300" />
								<div className="relative">
									{group.setores.length > 1 ? (
										<div className="absolute left-[12%] right-[12%] top-0 hidden h-px bg-slate-300 lg:block" />
									) : null}
									<div className="grid gap-4 pt-4 lg:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
									{group.setores.map((setor) => (
										<div key={setor.id} className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
											<div className="absolute left-1/2 top-[-16px] h-4 w-px bg-slate-300" />
											<div className="flex items-center gap-3">
												<span className="h-4 w-4 rounded-full" style={{ backgroundColor: setor.cor || DEFAULT_SETOR_COLOR }} />
												<div className="min-w-0">
													<h3 className="truncate text-base font-black text-slate-950">{setor.nome}</h3>
													<p className="text-xs font-bold text-slate-500">{setor.cargos.length} cargos · {setor.cargos.reduce((total, cargo) => total + cargo.membros.length, 0)} usuários</p>
												</div>
											</div>
											<div className="mx-auto my-3 h-6 w-px bg-slate-200" />
											<div className="grid gap-3">
												{setor.cargos.map((cargo) => (
													<div key={cargo.id} className="relative rounded-2xl border border-slate-200 bg-slate-50 p-4">
														<div className="absolute left-1/2 top-[-14px] h-3 w-px bg-slate-200" />
														<div className="flex items-start justify-between gap-2">
															<div>
																<div className="text-sm font-black text-slate-950">{cargo.nome}</div>
																{cargo.descricao ? <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{cargo.descricao}</p> : null}
															</div>
															<span className="h-3 w-3 rounded-full" style={{ backgroundColor: getCargoSetorColor(cargo, setores) }} />
														</div>
														<div className="mt-3 space-y-2">
															{cargo.membros.map((colaborador) => (
																<UserPill key={colaborador.id} colaborador={colaborador} onClick={() => setSelectedColaborador(colaborador)} />
															))}
															{!cargo.membros.length ? <div className="rounded-xl bg-white p-3 text-xs font-bold text-slate-400">Sem usuários vinculados.</div> : null}
														</div>
													</div>
												))}
												{!setor.cargos.length ? <div className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">Nenhum cargo neste setor.</div> : null}
											</div>
										</div>
									))}
								</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
			{setorModal ? <SetorModal colaboradorOptions={colaboradores} setor={setorModal.id ? setorModal : null} onClose={() => setSetorModal(null)} onSave={saveSetor} /> : null}
			{cargoModal ? <CargoModal cargo={cargoModal.id ? cargoModal : null} setores={setores} onClose={() => setCargoModal(null)} onSave={saveCargo} /> : null}
			{colaboradorModal ? <ColaboradorModal cargos={cargos} colaborador={colaboradorModal.id ? colaboradorModal : null} colaboradores={colaboradores} setores={setores} onClose={() => setColaboradorModal(null)} onDelete={deleteColaborador} onSave={saveColaborador} /> : null}
			{selectedColaborador && !colaboradorModal ? <DetailModal colaborador={selectedColaborador} onClose={() => setSelectedColaborador(null)} /> : null}
		</section>
	);
}
