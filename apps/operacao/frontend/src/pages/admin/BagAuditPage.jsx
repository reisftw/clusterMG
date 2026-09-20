import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Search, ShieldCheck } from "lucide-react";
import {
	createRotBagAudit,
	deleteRotBagAudit,
	fetchRotBagAudits,
	fetchRotRegionals,
	fetchRotTechnicians,
	updateRotBagAudit,
} from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/useRotAuth";
import { CardActions, Field, Kpi, ModalActions, PageHeader } from "./TechniciansPage";

const STATUS = ["Pendente", "Aprovada", "Reprovada", "Revisar"];
const QUESTIONS = [
	"Bolsa organizada",
	"Materiais conferidos",
	"EPIs em posse",
	"Ferramentas em bom estado",
	"Sem divergências críticas",
];

function initialForm(item) {
	const responses = item?.responses || {};
	return {
		technicianId: item?.technicianId || "",
		regionalId: item?.regionalId || "",
		date: item?.date?.slice?.(0, 10) || new Date().toISOString().slice(0, 10),
		status: item?.status || "Pendente",
		score: Number(item?.score || 0),
		responses,
		notes: item?.notes || "",
	};
}

export default function BagAuditPage() {
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.bag_audit.manage");
	const [items, setItems] = useState([]);
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
			const [audits, techData, regionalList] = await Promise.all([fetchRotBagAudits(), fetchRotTechnicians(), fetchRotRegionals()]);
			setItems(audits);
			setTechnicians(techData.items || []);
			setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar auditorias.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, []);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return items;
		return items.filter((item) => [item.technicianName, item.regionalName, item.status, item.notes].join(" ").toLowerCase().includes(needle));
	}, [items, query]);

	const stats = useMemo(() => ({
		total: items.length,
		approved: items.filter((item) => item.status === "Aprovada").length,
		failed: items.filter((item) => item.status === "Reprovada").length,
		average: items.length ? Math.round(items.reduce((sum, item) => sum + Number(item.score || 0), 0) / items.length) : 0,
	}), [items]);

	const remove = async (item) => {
		if (!window.confirm(`Excluir a auditoria de "${item.technicianName || "técnico"}"?`)) return;
		await deleteRotBagAudit(item.id);
		setItems((current) => current.filter((entry) => entry.id !== item.id));
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<PageHeader title="Auditoria Bolsa" description="Confira bolsa, EPIs, ferramentas e divergências operacionais." icon={ShieldCheck} onRefresh={load} onCreate={canManage ? () => setModal({ item: null }) : null} createLabel="Nova auditoria" />
			<div className="grid gap-3 md:grid-cols-4">
				<Kpi label="Auditorias" value={stats.total} />
				<Kpi label="Aprovadas" value={stats.approved} />
				<Kpi label="Reprovadas" value={stats.failed} />
				<Kpi label="Score médio" value={`${stats.average}%`} />
			</div>
			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div><h2 className="text-xl font-black text-slate-950">Auditorias registradas</h2><p className="text-sm font-semibold text-blue-600">{filtered.length} registro(s)</p></div>
					<label className="relative">
						<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
						<input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 pl-11 pr-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 md:w-96" placeholder="Buscar por técnico, regional ou status" />
					</label>
				</div>
				<div className="grid gap-4 xl:grid-cols-3">
					{filtered.map((item) => (
						<article key={item.id} className="rot-card-hover rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
							<div className="flex items-start gap-3">
								<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700"><ClipboardList size={22} /></span>
								<div className="min-w-0 flex-1">
									<h3 className="truncate text-base font-black text-slate-950">{item.technicianName || "Sem técnico"}</h3>
									<p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">{item.regionalName || "Sem regional"} · {item.date?.slice?.(0, 10) || "-"}</p>
									<p className="mt-1 text-xs font-semibold text-slate-500">{Object.values(item.responses || {}).filter(Boolean).length} requisito(s) atendido(s)</p>
								</div>
								<span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">{item.score}%</span>
							</div>
							<div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs font-bold text-slate-600">Status: {item.status}</div>
							{canManage ? <CardActions onEdit={() => setModal({ item })} onDelete={() => remove(item)} /> : null}
						</article>
					))}
				</div>
			</section>
			{modal ? <AuditModal item={modal.item} technicians={technicians} regionals={regionals} onClose={() => setModal(null)} onSaved={(saved) => { setItems((current) => current.some((entry) => entry.id === saved.id) ? current.map((entry) => entry.id === saved.id ? saved : entry) : [saved, ...current]); setModal(null); }} /> : null}
		</div>
	);
}

function AuditModal({ item, technicians, regionals, onClose, onSaved }) {
	const [form, setForm] = useState(() => initialForm(item));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
	const updateResponse = (question, value) => setForm((current) => ({ ...current, responses: { ...current.responses, [question]: value } }));
	const score = Math.round((Object.values(form.responses || {}).filter(Boolean).length / QUESTIONS.length) * 100);
	const submit = async () => {
		setSaving(true); setError("");
		try {
			const payload = { ...form, score };
			const saved = item ? await updateRotBagAudit(item.id, payload) : await createRotBagAudit(payload);
			onSaved(saved);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar auditoria.");
		} finally {
			setSaving(false);
		}
	};
	return (
		<ModalShell open title={item ? "Editar auditoria" : "Nova auditoria de bolsa"} description="Registre os itens conferidos e o status final da auditoria." icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-700"><ShieldCheck size={22} /></span>} onClose={onClose} size="lg">
			<div className="space-y-4">
				{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
				<div className="grid gap-4 md:grid-cols-2">
					<Field label="Técnico"><select value={form.technicianId} onChange={(event) => update("technicianId", event.target.value)} className="input-field"><option value="">Sem técnico</option>{technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</select></Field>
					<Field label="Regional"><select value={form.regionalId} onChange={(event) => update("regionalId", event.target.value)} className="input-field"><option value="">Sem regional</option>{regionals.map((regional) => <option key={regional.id} value={regional.id}>{regional.name}</option>)}</select></Field>
					<Field label="Data"><input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} className="input-field" /></Field>
					<Field label="Status"><select value={form.status} onChange={(event) => update("status", event.target.value)} className="input-field">{STATUS.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
				</div>
				<div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
					<div className="mb-3 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Checklist</p><p className="text-sm font-black text-blue-700">{score}%</p></div>
					<div className="grid gap-2 md:grid-cols-2">
						{QUESTIONS.map((question) => (
							<label key={question} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm">
								<input type="checkbox" checked={Boolean(form.responses?.[question])} onChange={(event) => updateResponse(question, event.target.checked)} />
								{question}
							</label>
						))}
					</div>
				</div>
				<Field label="Observações"><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} className="input-field min-h-24" /></Field>
				<ModalActions saving={saving} disabled={!form.technicianId} onClose={onClose} onSubmit={submit} />
			</div>
		</ModalShell>
	);
}
