import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock3, Copy, PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import {
	createRotStockAdjustment,
	deleteRotStockAdjustment,
	fetchRotCompanies,
	fetchRotRegionals,
	fetchRotStockAdjustments,
	fetchRotTechnicians,
	updateRotStockAdjustment,
} from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";
import { CardActions, Field, Kpi, ModalActions, PageHeader } from "./TechniciansPage";

const STATUS = ["Registrado", "Em conferência", "Aprovado", "Divergente"];

function emptyForm(item) {
	const technicianAdjustments = normalizeTechnicianAdjustments(item);
	return {
		companyId: item?.companyId || "",
		technicianId: item?.technicianId || "",
		regionalId: item?.regionalId || "",
		code: item?.code || "",
		date: item?.date?.slice?.(0, 10) || new Date().toISOString().slice(0, 10),
		status: item?.status || "Registrado",
		city: item?.city || "",
		shift: item?.shift || "",
		technicianAdjustments,
		notes: item?.notes || "",
	};
}

function blankLaunch() {
	return {
		tecnicoId: "",
		tecnicoNome: "",
		tecnicoEmail: "",
		empresaId: "",
		empresaNome: "",
		itens: [blankMaterial()],
	};
}

function blankMaterial() {
	return { codigo: "", nome: "", descricao: "", unidade: "un", quantidade: 1 };
}

function normalizeTechnicianAdjustments(item) {
	const source = Array.isArray(item?.technicianAdjustments) && item.technicianAdjustments.length
		? item.technicianAdjustments
		: item?.technicianId || item?.items?.length
			? [{
				tecnicoId: item?.technicianId || "",
				tecnicoNome: item?.technicianName || "",
				empresaId: item?.companyId || "",
				empresaNome: item?.companyName || "",
				itens: item?.items || [],
			}]
			: [blankLaunch()];
	return source.map((launch) => ({
		tecnicoId: launch.tecnicoId || launch.technicianId || "",
		tecnicoNome: launch.tecnicoNome || launch.technicianName || "",
		tecnicoEmail: launch.tecnicoEmail || launch.technicianEmail || "",
		empresaId: launch.empresaId || launch.companyId || "",
		empresaNome: launch.empresaNome || launch.companyName || "",
		responsavel: launch.responsavel || launch.responsible || "",
		itens: (launch.itens || launch.items || [blankMaterial()]).map((entry) => ({
			produtoId: entry.produtoId || entry.productId || "",
			codigo: entry.codigo || entry.code || entry.produtoId || "",
			nome: entry.nome || entry.name || entry.descricao || entry.description || "",
			descricao: entry.descricao || entry.description || entry.nome || entry.name || "",
			categoria: entry.categoria || entry.category || "",
			unidade: entry.unidade || entry.unit || "un",
			quantidade: Number(entry.quantidade ?? entry.quantity ?? 1) || 1,
		})),
	}));
}

function buildPreview(form) {
	const lines = [
		`Código: ${form.code || "-"}`,
		`Data: ${form.date || "-"}`,
		form.city ? `Cidade: ${form.city}` : "",
		form.shift ? `Turno: ${form.shift}` : "",
		"",
		"Acerto por estoque:",
	].filter((line) => line !== "");
	form.technicianAdjustments.forEach((launch, index) => {
		lines.push(`${index + 1}. ${launch.tecnicoNome || "Técnico não informado"} - ${launch.empresaNome || "Empresa não informada"}`);
		(launch.itens || []).filter((entry) => entry.nome || entry.descricao || entry.codigo).forEach((entry) => {
			lines.push(`- ${entry.nome || entry.descricao || entry.codigo}: ${entry.quantidade || 1} ${entry.unidade || "un"}`);
		});
		lines.push("");
	});
	return lines.join("\n").trim();
}

export default function StockAdjustmentsPage() {
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.stock_adjustments.manage");
	const [items, setItems] = useState([]);
	const [companies, setCompanies] = useState([]);
	const [technicians, setTechnicians] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [modal, setModal] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [adjustments, companyList, techData, regionalList] = await Promise.all([
				fetchRotStockAdjustments(),
				fetchRotCompanies(),
				fetchRotTechnicians(),
				fetchRotRegionals(),
			]);
			setItems(adjustments);
			setCompanies(companyList);
			setTechnicians(techData.items || []);
			setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os acertos de estoque.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, []);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return items;
		return items.filter((item) => [item.code, item.companyName, item.technicianName, item.regionalName, item.status].join(" ").toLowerCase().includes(needle));
	}, [items, query]);

	const stats = useMemo(() => ({
		total: items.length,
		approved: items.filter((item) => item.status === "Aprovado").length,
		pending: items.filter((item) => item.status !== "Aprovado").length,
		divergent: items.filter((item) => item.status === "Divergente").length,
		lines: items.reduce((sum, item) => sum + (item.items?.length || 0), 0),
	}), [items]);

	const remove = async (item) => {
		if (!window.confirm(`Excluir o acerto "${item.code || item.technicianName}"?`)) return;
		await deleteRotStockAdjustment(item.id);
		setItems((current) => current.filter((entry) => entry.id !== item.id));
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<PageHeader title="Acerto de Estoque" description="Registre conferências de materiais por empresa, regional e técnico." icon={ClipboardCheck} onRefresh={load} onCreate={canManage ? () => setModal({ item: null }) : null} createLabel="Novo acerto" />
			<div className="grid gap-3 md:grid-cols-4">
				<Kpi label="Acertos" value={stats.total} />
				<Kpi label="Aprovados" value={stats.approved} />
				<Kpi label="Pendentes" value={stats.pending} />
				<Kpi label="Itens" value={stats.lines} />
			</div>
			<section className="grid gap-3 lg:grid-cols-3">
				<StatusCard icon={CheckCircle2} label="Aprovados" value={stats.approved} tone="emerald" description="Conferidos e liberados" />
				<StatusCard icon={Clock3} label="Em aberto" value={stats.pending} tone="blue" description="Registrados ou em conferência" />
				<StatusCard icon={AlertTriangle} label="Divergentes" value={stats.divergent} tone="amber" description="Precisam de correção" />
			</section>
			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div><h2 className="text-xl font-black text-slate-950">Acertos cadastrados</h2><p className="text-sm font-semibold text-blue-600">{filtered.length} registro(s)</p></div>
					<label className="relative">
						<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
						<input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 pl-11 pr-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 md:w-96" placeholder="Buscar por técnico, código ou regional" />
					</label>
				</div>
				<div className="grid gap-4 xl:grid-cols-3">
					{filtered.map((item) => (
						<article key={item.id} className="rot-card-hover rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
							<div className="flex items-start gap-3">
								<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><PackagePlus size={22} /></span>
								<div className="min-w-0 flex-1">
									<h3 className="truncate text-base font-black text-slate-950">{item.code || "Acerto sem código"}</h3>
									<p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">{(item.companyNames?.length ? item.companyNames.join(", ") : item.companyName) || "Sem empresa"} · {item.regionalName || "Sem regional"}</p>
									<p className="mt-1 text-xs font-semibold text-slate-500">{(item.technicianNames?.length ? item.technicianNames.join(", ") : item.technicianName) || "Sem técnico"} · {item.date?.slice?.(0, 10) || "-"}</p>
								</div>
								<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{item.status}</span>
							</div>
							<div className="mt-4 grid grid-cols-3 gap-2">
								<MiniInfo label="Itens" value={item.items?.length || 0} />
								<MiniInfo label="Empresa" value={item.companyName ? "Sim" : "-"} />
								<MiniInfo label="Regional" value={item.regionalName ? "Sim" : "-"} />
							</div>
							{item.notes ? <p className="mt-3 line-clamp-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">{item.notes}</p> : null}
							{canManage ? <CardActions onEdit={() => setModal({ item })} onDelete={() => remove(item)} /> : null}
						</article>
					))}
				</div>
			</section>
			{modal ? <AdjustmentModal item={modal.item} companies={companies} technicians={technicians} regionals={regionals} onClose={() => setModal(null)} onSaved={(saved) => { setItems((current) => current.some((entry) => entry.id === saved.id) ? current.map((entry) => entry.id === saved.id ? saved : entry) : [saved, ...current]); setModal(null); }} /> : null}
		</div>
	);
}

function StatusCard({ icon: Icon, label, value, description, tone }) {
	const tones = {
		emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
		blue: "bg-blue-50 text-blue-700 border-blue-100",
		amber: "bg-amber-50 text-amber-700 border-amber-100",
	};
	return (
		<div className={`rounded-2xl border p-4 shadow-sm ${tones[tone] || tones.blue}`}>
			<div className="flex items-center gap-3">
				<span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/75"><Icon size={20} /></span>
				<div>
					<p className="text-xs font-black uppercase tracking-wide opacity-80">{label}</p>
					<p className="text-2xl font-black">{value}</p>
					<p className="text-xs font-bold opacity-75">{description}</p>
				</div>
			</div>
		</div>
	);
}

function MiniInfo({ label, value }) {
	return <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-black text-slate-800">{value}</p></div>;
}

function AdjustmentModal({ item, companies, technicians, regionals, onClose, onSaved }) {
	const [form, setForm] = useState(() => emptyForm(item));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [copied, setCopied] = useState(false);
	const companiesMap = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
	const techniciansMap = useMemo(() => new Map(technicians.map((tech) => [tech.id, tech])), [technicians]);
	const previewText = useMemo(() => buildPreview(form), [form]);
	const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
	const updateLaunch = (index, patch) => {
		setForm((current) => {
			const technicianAdjustments = current.technicianAdjustments.map((launch, i) => (i === index ? { ...launch, ...patch } : launch));
			const first = technicianAdjustments[0] || {};
			return {
				...current,
				companyId: first.empresaId || current.companyId,
				technicianId: first.tecnicoId || current.technicianId,
				technicianAdjustments,
			};
		});
	};
	const selectTechnician = (index, technicianId) => {
		const technician = techniciansMap.get(technicianId);
		const company = companiesMap.get(technician?.companyId);
		updateLaunch(index, {
			tecnicoId: technicianId,
			tecnicoNome: technician?.name || "",
			tecnicoEmail: technician?.email || "",
			empresaId: technician?.companyId || company?.id || "",
			empresaNome: company?.name || technician?.companyName || "",
		});
		if (technician?.regionalId) update("regionalId", technician.regionalId);
	};
	const updateMaterial = (launchIndex, itemIndex, patch) => {
		setForm((current) => ({
			...current,
			technicianAdjustments: current.technicianAdjustments.map((launch, i) => {
				if (i !== launchIndex) return launch;
				return {
					...launch,
					itens: launch.itens.map((entry, j) => (j === itemIndex ? { ...entry, ...patch } : entry)),
				};
			}),
		}));
	};
	const addLaunch = () => setForm((current) => ({ ...current, technicianAdjustments: [...current.technicianAdjustments, blankLaunch()] }));
	const removeLaunch = (index) => setForm((current) => ({ ...current, technicianAdjustments: current.technicianAdjustments.filter((_, i) => i !== index).length ? current.technicianAdjustments.filter((_, i) => i !== index) : [blankLaunch()] }));
	const addMaterial = (launchIndex) => setForm((current) => ({
		...current,
		technicianAdjustments: current.technicianAdjustments.map((launch, index) => index === launchIndex ? { ...launch, itens: [...launch.itens, blankMaterial()] } : launch),
	}));
	const removeMaterial = (launchIndex, itemIndex) => setForm((current) => ({
		...current,
		technicianAdjustments: current.technicianAdjustments.map((launch, index) => {
			if (index !== launchIndex) return launch;
			const itens = launch.itens.filter((_, i) => i !== itemIndex);
			return { ...launch, itens: itens.length ? itens : [blankMaterial()] };
		}),
	}));
	const submit = async () => {
		setSaving(true); setError("");
		try {
			const cleanLaunches = form.technicianAdjustments.map((launch) => ({
				...launch,
				itens: launch.itens.filter((entry) => entry.nome || entry.descricao || entry.codigo),
			})).filter((launch) => launch.tecnicoId || launch.tecnicoNome || launch.itens.length);
			const first = cleanLaunches[0] || {};
			const payload = {
				...form,
				companyId: first.empresaId || form.companyId || "",
				technicianId: first.tecnicoId || form.technicianId || "",
				technicianAdjustments: cleanLaunches,
			};
			const saved = item ? await updateRotStockAdjustment(item.id, payload) : await createRotStockAdjustment(payload);
			onSaved(saved);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o acerto.");
		} finally {
			setSaving(false);
		}
	};
	return (
		<ModalShell open title={item ? "Editar acerto" : "Novo acerto de estoque"} description="Lançamento por cidade com vários técnicos no mesmo acerto." icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><ClipboardCheck size={22} /></span>} onClose={onClose} size="6xl">
			<div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
				<div className="space-y-4">
				{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
				<div className="grid gap-4 md:grid-cols-2">
					<Field label="Código"><input value={form.code} onChange={(event) => update("code", event.target.value)} className="input-field" /></Field>
					<Field label="Data"><input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} className="input-field" /></Field>
					<Field label="Regional"><select value={form.regionalId} onChange={(event) => update("regionalId", event.target.value)} className="input-field"><option value="">Sem regional</option>{regionals.map((regional) => <option key={regional.id} value={regional.id}>{regional.name}</option>)}</select></Field>
					<Field label="Status"><select value={form.status} onChange={(event) => update("status", event.target.value)} className="input-field">{STATUS.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
					<Field label="Cidade"><input value={form.city} onChange={(event) => update("city", event.target.value)} className="input-field" placeholder="Cidade do acerto" /></Field>
					<Field label="Turno"><input value={form.shift} onChange={(event) => update("shift", event.target.value)} className="input-field" placeholder="manhã, tarde..." /></Field>
				</div>

				<div className="space-y-3">
					<div className="flex items-center justify-between gap-3">
						<p className="text-sm font-black text-slate-900">Técnicos incluídos no acerto</p>
						<button type="button" onClick={addLaunch} className="rot-btn-tactile inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">
							<Plus size={14} /> Adicionar técnico
						</button>
					</div>
					{form.technicianAdjustments.map((launch, launchIndex) => (
						<div key={`launch-${launchIndex}`} className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
							<div className="grid gap-3 md:grid-cols-[1fr_auto]">
								<Field label={`Técnico ${launchIndex + 1}`}>
									<select value={launch.tecnicoId} onChange={(event) => selectTechnician(launchIndex, event.target.value)} className="input-field bg-white">
										<option value="">Selecione</option>
										{technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name} · {tech.companyName || companiesMap.get(tech.companyId)?.name || "-"}</option>)}
									</select>
								</Field>
								<button type="button" onClick={() => removeLaunch(launchIndex)} className="mt-6 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-red-100 bg-white text-red-500 hover:bg-red-50">
									<Trash2 size={16} />
								</button>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								<Field label="Empresa"><input value={launch.empresaNome} onChange={(event) => updateLaunch(launchIndex, { empresaNome: event.target.value })} className="input-field bg-white" /></Field>
								<Field label="E-mail técnico"><input value={launch.tecnicoEmail || ""} onChange={(event) => updateLaunch(launchIndex, { tecnicoEmail: event.target.value })} className="input-field bg-white" /></Field>
							</div>
							<div className="space-y-3">
								<div className="flex items-center justify-between gap-3">
									<p className="text-xs font-black uppercase tracking-wide text-slate-500">Materiais deste técnico</p>
									<button type="button" onClick={() => addMaterial(launchIndex)} className="rot-btn-tactile inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">
										<Plus size={14} /> Adicionar item
									</button>
								</div>
								{launch.itens.map((material, materialIndex) => (
									<div key={`${launchIndex}-${materialIndex}`} className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-3 md:grid-cols-[0.7fr_1fr_90px_72px_44px]">
										<input value={material.codigo || ""} onChange={(event) => updateMaterial(launchIndex, materialIndex, { codigo: event.target.value })} className="input-field" placeholder="Código" />
										<input value={material.nome || material.descricao || ""} onChange={(event) => updateMaterial(launchIndex, materialIndex, { nome: event.target.value, descricao: event.target.value })} className="input-field" placeholder="Material" />
										<input value={material.unidade || "un"} onChange={(event) => updateMaterial(launchIndex, materialIndex, { unidade: event.target.value })} className="input-field" placeholder="un" />
										<input type="number" min="0" value={material.quantidade || 1} onChange={(event) => updateMaterial(launchIndex, materialIndex, { quantidade: Number(event.target.value) || 0 })} className="input-field" />
										<button type="button" onClick={() => removeMaterial(launchIndex, materialIndex)} className="inline-flex h-12 items-center justify-center rounded-xl border border-red-100 text-red-500 hover:bg-red-50">
											<Trash2 size={16} />
										</button>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
				<Field label="Observações"><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} className="input-field min-h-20" /></Field>
				<ModalActions saving={saving} disabled={!form.code.trim() && !form.technicianAdjustments.some((launch) => launch.tecnicoId || launch.tecnicoNome)} onClose={onClose} onSubmit={submit} />
				</div>
				<div className="space-y-4">
					<div className="rounded-2xl border border-slate-200 bg-white p-4">
						<div className="mb-3 flex items-center justify-between gap-3">
							<div>
								<p className="text-sm font-black text-slate-950">Preview de WhatsApp</p>
								<p className="text-xs font-semibold text-slate-500">Texto enxuto para copiar e colar</p>
							</div>
							<button
								type="button"
								onClick={async () => {
									await navigator.clipboard?.writeText(previewText);
									setCopied(true);
									setTimeout(() => setCopied(false), 1800);
								}}
								className="rot-btn-tactile inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
							>
								<Copy size={14} /> Copiar
							</button>
						</div>
						<textarea readOnly value={previewText} className="min-h-[28rem] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-mono text-xs text-slate-700 outline-none" />
						{copied ? <p className="mt-2 text-xs font-black text-emerald-600">Preview copiado.</p> : null}
					</div>
				</div>
			</div>
		</ModalShell>
	);
}
