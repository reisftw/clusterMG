import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, HandCoins, PackageCheck, PackageX, Search } from "lucide-react";
import {
	createRotTechDelivery,
	deleteRotTechDelivery,
	fetchRotCompanies,
	fetchRotRegionals,
	fetchRotTechDeliveries,
	fetchRotTechnicians,
	updateRotTechDelivery,
} from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";
import { CardActions, Field, Kpi, ModalActions, PageHeader } from "./TechniciansPage";

const TYPES = ["Entrega", "Devolução", "Troca"];
const STATUS = ["Pendente", "Entregue", "Conferida", "Cancelada"];

function initialForm(item) {
	return {
		companyId: item?.companyId || "",
		technicianId: item?.technicianId || "",
		regionalId: item?.regionalId || "",
		date: item?.date?.slice?.(0, 10) || new Date().toISOString().slice(0, 10),
		type: item?.type || "Entrega",
		status: item?.status || "Pendente",
		signature: item?.signature || "",
		itemsText: (item?.items || []).map((entry) => `${entry.codigo || ""}; ${entry.descricao || ""}; ${entry.quantidade || 1}`).join("\n"),
		notes: item?.notes || "",
	};
}

function parseItems(text) {
	return String(text || "").split(/\r?\n/).map((line) => {
		const [codigo = "", descricao = "", quantidade = "1"] = line.split(";").map((part) => part.trim());
		return { codigo, descricao, quantidade: Number(quantidade.replace(",", ".")) || 1 };
	}).filter((item) => item.codigo || item.descricao);
}

export default function TechDeliveriesPage() {
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.tech_deliveries.manage");
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
			const [deliveries, companyList, techData, regionalList] = await Promise.all([
				fetchRotTechDeliveries(),
				fetchRotCompanies(),
				fetchRotTechnicians(),
				fetchRotRegionals(),
			]);
			setItems(deliveries);
			setCompanies(companyList);
			setTechnicians(techData.items || []);
			setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar entregas.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, []);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return items;
		return items.filter((item) => [item.companyName, item.technicianName, item.regionalName, item.type, item.status, item.signature].join(" ").toLowerCase().includes(needle));
	}, [items, query]);

	const stats = useMemo(() => ({
		total: items.length,
		done: items.filter((item) => item.status === "Entregue" || item.status === "Conferida").length,
		pending: items.filter((item) => item.status === "Pendente").length,
		canceled: items.filter((item) => item.status === "Cancelada").length,
		lines: items.reduce((sum, item) => sum + (item.items?.length || 0), 0),
	}), [items]);

	const remove = async (item) => {
		if (!window.confirm(`Excluir a entrega de "${item.technicianName || item.type}"?`)) return;
		await deleteRotTechDelivery(item.id);
		setItems((current) => current.filter((entry) => entry.id !== item.id));
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<PageHeader title="Entrega Técnicos" description="Controle a entrega, troca e devolução de materiais para técnicos." icon={PackageCheck} onRefresh={load} onCreate={canManage ? () => setModal({ item: null }) : null} createLabel="Nova entrega" />
			<div className="grid gap-3 md:grid-cols-4">
				<Kpi label="Registros" value={stats.total} />
				<Kpi label="Concluídos" value={stats.done} />
				<Kpi label="Pendentes" value={stats.pending} />
				<Kpi label="Itens" value={stats.lines} />
			</div>
			<section className="grid gap-3 lg:grid-cols-3">
				<DeliveryStatus icon={CheckCircle2} label="Entregues / conferidas" value={stats.done} tone="emerald" />
				<DeliveryStatus icon={Clock3} label="Pendentes" value={stats.pending} tone="blue" />
				<DeliveryStatus icon={PackageX} label="Canceladas" value={stats.canceled} tone="red" />
			</section>
			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div><h2 className="text-xl font-black text-slate-950">Entregas registradas</h2><p className="text-sm font-semibold text-blue-600">{filtered.length} registro(s)</p></div>
					<label className="relative">
						<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
						<input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 pl-11 pr-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 md:w-96" placeholder="Buscar por técnico, empresa ou status" />
					</label>
				</div>
				<div className="grid gap-4 xl:grid-cols-3">
					{filtered.map((item) => (
						<article key={item.id} className="rot-card-hover rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
							<div className="flex items-start gap-3">
								<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><HandCoins size={22} /></span>
								<div className="min-w-0 flex-1">
									<h3 className="truncate text-base font-black text-slate-950">{item.technicianName || "Sem técnico"}</h3>
									<p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">{item.companyName || "Sem empresa"} · {item.regionalName || "Sem regional"}</p>
									<p className="mt-1 text-xs font-semibold text-slate-500">{item.type} · {item.date?.slice?.(0, 10) || "-"}</p>
								</div>
								<span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{item.status}</span>
							</div>
							<div className="mt-4 grid grid-cols-3 gap-2">
								<MiniInfo label="Itens" value={item.items?.length || 0} />
								<MiniInfo label="Tipo" value={item.type || "-"} />
								<MiniInfo label="Assinatura" value={item.signature ? "Sim" : "-"} />
							</div>
							{item.notes ? <p className="mt-3 line-clamp-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">{item.notes}</p> : null}
							{canManage ? <CardActions onEdit={() => setModal({ item })} onDelete={() => remove(item)} /> : null}
						</article>
					))}
				</div>
			</section>
			{modal ? <DeliveryModal item={modal.item} companies={companies} technicians={technicians} regionals={regionals} onClose={() => setModal(null)} onSaved={(saved) => { setItems((current) => current.some((entry) => entry.id === saved.id) ? current.map((entry) => entry.id === saved.id ? saved : entry) : [saved, ...current]); setModal(null); }} /> : null}
		</div>
	);
}

function DeliveryStatus({ icon: Icon, label, value, tone }) {
	const tones = {
		emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
		blue: "border-blue-100 bg-blue-50 text-blue-700",
		red: "border-red-100 bg-red-50 text-red-700",
	};
	return (
		<div className={`rounded-2xl border p-4 shadow-sm ${tones[tone] || tones.blue}`}>
			<div className="flex items-center gap-3">
				<span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/75"><Icon size={20} /></span>
				<div>
					<p className="text-xs font-black uppercase tracking-wide opacity-80">{label}</p>
					<p className="text-2xl font-black">{value}</p>
				</div>
			</div>
		</div>
	);
}

function MiniInfo({ label, value }) {
	return <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-black text-slate-800">{value}</p></div>;
}

function DeliveryModal({ item, companies, technicians, regionals, onClose, onSaved }) {
	const [form, setForm] = useState(() => initialForm(item));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
	const submit = async () => {
		setSaving(true); setError("");
		try {
			const payload = { ...form, items: parseItems(form.itemsText) };
			const saved = item ? await updateRotTechDelivery(item.id, payload) : await createRotTechDelivery(payload);
			onSaved(saved);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a entrega.");
		} finally {
			setSaving(false);
		}
	};
	return (
		<ModalShell open title={item ? "Editar entrega" : "Nova entrega"} description="Use uma linha por material no formato: código; descrição; quantidade." icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><PackageCheck size={22} /></span>} onClose={onClose} size="lg">
			<div className="space-y-4">
				{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
				<div className="grid gap-4 md:grid-cols-2">
					<Field label="Empresa"><select value={form.companyId} onChange={(event) => update("companyId", event.target.value)} className="input-field"><option value="">Sem empresa</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
					<Field label="Técnico"><select value={form.technicianId} onChange={(event) => update("technicianId", event.target.value)} className="input-field"><option value="">Sem técnico</option>{technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</select></Field>
					<Field label="Regional"><select value={form.regionalId} onChange={(event) => update("regionalId", event.target.value)} className="input-field"><option value="">Sem regional</option>{regionals.map((regional) => <option key={regional.id} value={regional.id}>{regional.name}</option>)}</select></Field>
					<Field label="Data"><input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} className="input-field" /></Field>
					<Field label="Tipo"><select value={form.type} onChange={(event) => update("type", event.target.value)} className="input-field">{TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
					<Field label="Status"><select value={form.status} onChange={(event) => update("status", event.target.value)} className="input-field">{STATUS.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
				</div>
				<Field label="Itens"><textarea value={form.itemsText} onChange={(event) => update("itemsText", event.target.value)} className="input-field min-h-32 font-mono text-xs" placeholder="COD001; Cabo drop; 2" /></Field>
				<Field label="Assinatura / recebedor"><input value={form.signature} onChange={(event) => update("signature", event.target.value)} className="input-field" /></Field>
				<Field label="Observações"><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} className="input-field min-h-20" /></Field>
				<ModalActions saving={saving} disabled={!form.technicianId} onClose={onClose} onSubmit={submit} />
			</div>
		</ModalShell>
	);
}
