import { useEffect, useMemo, useState } from "react";
import { Edit3, Plus, RefreshCw, Search, Trash2, UserRound, UsersRound } from "lucide-react";
import { createRotTechnician, deleteRotTechnician, fetchRotCompanies, fetchRotRegionals, fetchRotTechnicians, updateRotTechnician } from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/useRotAuth";

const AREAS = [
	{ value: "delivery", label: "Delivery" },
	{ value: "field_service", label: "Field Service" },
	{ value: "rot", label: "ROT" },
];
const SCOPES = ["ROT", "FIELD", "DELIVERY"];

function initialForm(item) {
	return {
		userId: item?.userId || "",
		companyId: item?.companyId || "",
		regionalId: item?.regionalId || "",
		name: item?.name || "",
		email: item?.email || "",
		phone: item?.phone || "",
		cityName: item?.cityName || "",
		operationalArea: item?.operationalArea || "delivery",
		status: item?.status || "Ativo",
		operationScopes: item?.operationScopes?.length ? item.operationScopes : ["ROT"],
		notes: item?.notes || "",
	};
}

export default function TechniciansPage() {
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.technicians.manage");
	const [items, setItems] = useState([]);
	const [users, setUsers] = useState([]);
	const [companies, setCompanies] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [modal, setModal] = useState(null);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [techData, companyList, regionalList] = await Promise.all([fetchRotTechnicians(), fetchRotCompanies(), fetchRotRegionals()]);
			setItems(techData.items || []);
			setUsers(techData.users || []);
			setCompanies(companyList);
			setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar técnicos.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, []);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return items;
		return items.filter((item) => [item.name, item.companyName, item.regionalName, item.cityName, item.email].join(" ").toLowerCase().includes(needle));
	}, [items, query]);

	const stats = useMemo(() => ({
		total: items.length,
		delivery: items.filter((item) => item.operationalArea === "delivery").length,
		field: items.filter((item) => item.operationalArea === "field_service").length,
		rot: items.filter((item) => item.operationalArea === "rot").length,
	}), [items]);

	const remove = async (item) => {
		if (!window.confirm(`Inativar o técnico "${item.name}"?`)) return;
		await deleteRotTechnician(item.id);
		setItems((current) => current.filter((entry) => entry.id !== item.id));
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<PageHeader title="Técnicos" description="Cadastro operacional de técnicos, empresa, regional, área e escopo." icon={UsersRound} onRefresh={load} onCreate={canManage ? () => setModal({ item: null }) : null} createLabel="Novo técnico" />
			<div className="grid gap-3 md:grid-cols-4">
				<Kpi label="Técnicos" value={stats.total} />
				<Kpi label="Delivery" value={stats.delivery} />
				<Kpi label="Field" value={stats.field} />
				<Kpi label="ROT" value={stats.rot} />
			</div>
			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
			<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div><h2 className="text-xl font-black text-slate-950">Técnicos cadastrados</h2><p className="text-sm font-semibold text-blue-600">{filtered.length} registro(s)</p></div>
					<label className="relative">
						<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
						<input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 pl-11 pr-4 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 md:w-96" placeholder="Buscar por técnico, empresa ou regional" />
					</label>
				</div>
				<div className="grid gap-4 lg:grid-cols-3">
					{filtered.map((item) => (
						<article key={item.id} className="rot-card-hover rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
							<div className="flex items-start gap-3">
								<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><UserRound size={22} /></span>
								<div className="min-w-0 flex-1">
									<h3 className="truncate text-base font-black text-slate-950">{item.name}</h3>
									<p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">{item.companyName || "Sem empresa"} · {item.operationalArea}</p>
									<p className="mt-1 text-xs font-semibold text-slate-500">{item.regionalName || "Sem regional"} · {item.cityName || "Sem cidade"}</p>
								</div>
							</div>
							<div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs font-bold text-slate-600">
								{item.email || "Sem e-mail"} · {item.phone || "Sem telefone"}
							</div>
							{canManage ? <CardActions onEdit={() => setModal({ item })} onDelete={() => remove(item)} /> : null}
						</article>
					))}
				</div>
			</section>
			{modal ? <TechnicianModal item={modal.item} users={users} companies={companies} regionals={regionals} onClose={() => setModal(null)} onSaved={(saved) => { setItems((current) => current.some((entry) => entry.id === saved.id) ? current.map((entry) => entry.id === saved.id ? saved : entry) : [...current, saved]); setModal(null); }} /> : null}
		</div>
	);
}

function TechnicianModal({ item, users, companies, regionals, onClose, onSaved }) {
	const [form, setForm] = useState(() => initialForm(item));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
	const submit = async () => {
		setSaving(true); setError("");
		try {
			const saved = item ? await updateRotTechnician(item.id, form) : await createRotTechnician(form);
			onSaved(saved);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar técnico.");
		} finally {
			setSaving(false);
		}
	};
	return (
		<ModalShell open title={item ? "Editar técnico" : "Cadastrar técnico"} description="Dados operacionais usados nos fluxos de estoque, entrega e auditoria." icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><UserRound size={22} /></span>} onClose={onClose} size="lg">
			<div className="space-y-4">
				{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
				<div className="grid gap-4 md:grid-cols-2">
					<Field label="Usuário vinculado"><select value={form.userId} onChange={(event) => update("userId", event.target.value)} className="input-field"><option value="">Sem usuário</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
					<Field label="Empresa"><select value={form.companyId} onChange={(event) => update("companyId", event.target.value)} className="input-field"><option value="">Sem empresa</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
					<Field label="Nome"><input value={form.name} onChange={(event) => update("name", event.target.value)} className="input-field" /></Field>
					<Field label="Regional"><select value={form.regionalId} onChange={(event) => update("regionalId", event.target.value)} className="input-field"><option value="">Sem regional</option>{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
					<Field label="E-mail"><input value={form.email} onChange={(event) => update("email", event.target.value)} className="input-field" /></Field>
					<Field label="Telefone"><input value={form.phone} onChange={(event) => update("phone", event.target.value)} className="input-field" /></Field>
					<Field label="Cidade"><input value={form.cityName} onChange={(event) => update("cityName", event.target.value)} className="input-field" /></Field>
					<Field label="Área"><select value={form.operationalArea} onChange={(event) => update("operationalArea", event.target.value)} className="input-field">{AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select></Field>
				</div>
				<CheckGroup title="Escopo operacional" options={SCOPES} values={form.operationScopes} onChange={(values) => update("operationScopes", values.length ? values : ["ROT"])} />
				<Field label="Observações"><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} className="input-field min-h-24" /></Field>
				<ModalActions saving={saving} disabled={!form.name.trim()} onClose={onClose} onSubmit={submit} />
			</div>
		</ModalShell>
	);
}

export function PageHeader({ title, description, icon: Icon, onRefresh, onCreate, createLabel }) {
	return (
		<section className="rounded-2xl border border-blue-100 bg-white px-5 py-5 shadow-sm">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div className="flex items-center gap-4">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={24} /></span>
					<div><h1 className="text-2xl font-black text-slate-950">{title}</h1><p className="text-sm font-semibold text-slate-500">{description}</p></div>
				</div>
				<div className="flex gap-2">
					<button type="button" onClick={onRefresh} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"><RefreshCw size={16} /> Atualizar</button>
					{onCreate ? <button type="button" onClick={onCreate} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-blue-100 hover:bg-blue-700"><Plus size={17} /> {createLabel}</button> : null}
				</div>
			</div>
		</section>
	);
}

export function Kpi({ label, value }) {
	return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-slate-950">{value}</p></div>;
}

export function Field({ label, children }) {
	return <label className="block space-y-1.5"><span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}

export function CheckGroup({ title, options, values, onChange }) {
	return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">{title}</p><div className="flex flex-wrap gap-2">{options.map((option) => <label key={option} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={values.includes(option)} onChange={() => onChange(values.includes(option) ? values.filter((item) => item !== option) : [...values, option])} />{option}</label>)}</div></div>;
}

export function ModalActions({ saving, disabled, onClose, onSubmit }) {
	return <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="rot-btn-tactile rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button><button type="button" disabled={saving || disabled} onClick={onSubmit} className="rot-btn-tactile rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Salvando..." : "Salvar"}</button></div>;
}

export function CardActions({ onEdit, onDelete }) {
	return <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onEdit} className="rot-btn-tactile flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><Edit3 size={16} /></button><button type="button" onClick={onDelete} className="rot-btn-tactile flex h-10 w-10 items-center justify-center rounded-xl border border-red-100 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button></div>;
}
