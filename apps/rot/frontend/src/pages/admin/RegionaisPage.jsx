import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronRight, MapPin, MapPinned, Pencil, Plus, RefreshCw, Trash2, UserCog } from "lucide-react";
import {
	createRotCity,
	createRotRegional,
	deleteRotCity,
	deleteRotRegional,
	fetchRotRegionals,
	fetchRotUsers,
	updateRotCity,
	updateRotRegional,
} from "../../api/rotApi";
import UserAvatar from "../../components/UserAvatar";
import ModalShell from "../../components/ui/ModalShell";
import Spinner from "../../components/ui/Spinner";

const RESPONSAVEL_TYPES = [
	{ type: "supervisor_rot", label: "Supervisor Operação" },
	{ type: "supervisor_field", label: "Supervisor FIELD" },
];

export default function RegionaisPage() {
	const [items, setItems] = useState([]);
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [modal, setModal] = useState(null);
	const [expanded, setExpanded] = useState({});

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [regionaisData, usersData] = await Promise.all([fetchRotRegionals(), fetchRotUsers().catch(() => [])]);
			setItems(regionaisData);
			setUsers(usersData);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as regionais.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, []);

	const totals = useMemo(() => {
		const cities = items.reduce((sum, item) => sum + (item.cities?.length || 0), 0);
		const agents = items.reduce((sum, item) => sum + (item.cities || []).filter((city) => String(city.tipo || city.sourcePayload?.tipo || "").includes("Agente")).length, 0);
		return { regionals: items.length, cities, agents };
	}, [items]);

	const patchRegional = (id, patch) => setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

	const handleDeleteRegional = async (regional) => {
		if (!window.confirm(`Excluir a regional "${regional.name}"? Isso também remove suas cidades.`)) return;
		setError("");
		try {
			await deleteRotRegional(regional.id);
			setItems((current) => current.filter((item) => item.id !== regional.id));
		} catch (err) {
			setError(err?.message || "Não foi possível excluir a regional.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-5">
			<section className="rounded-2xl border border-blue-100 bg-white px-5 py-5 shadow-sm">
				<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div className="flex items-center gap-4">
						<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><MapPin size={24} /></span>
						<div>
							<h1 className="text-2xl font-black text-slate-950">Regionais</h1>
							<p className="text-sm font-semibold text-slate-500">Regionais, cidades, supervisores, delivery e field service.</p>
						</div>
					</div>
					<div className="flex gap-2">
						<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"><RefreshCw size={16} /> Atualizar</button>
						<button type="button" onClick={() => setModal({ kind: "regional", regional: null })} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-blue-100 hover:bg-blue-700"><Plus size={17} /> Nova Regional</button>
					</div>
				</div>
			</section>

			<div className="grid grid-cols-3 gap-3">
				<SummaryCard label="Regionais" value={totals.regionals} tone="blue" />
				<SummaryCard label="Cidades" value={totals.cities} tone="green" />
				<SummaryCard label="Agentes Aut." value={totals.agents} tone="amber" />
			</div>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="space-y-2">
				{items.map((regional) => (
					<RegionalCard
						key={regional.id}
						regional={regional}
						expanded={Boolean(expanded[regional.id])}
						onToggle={() => setExpanded((current) => ({ ...current, [regional.id]: !current[regional.id] }))}
						onEditRegional={() => setModal({ kind: "regional", regional })}
						onManageCities={() => setModal({ kind: "cities", regional })}
						onManageResponsaveis={() => setModal({ kind: "responsaveis", regional })}
						onDelete={() => handleDeleteRegional(regional)}
					/>
				))}
				{!items.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhuma regional cadastrada ainda.</div> : null}
			</div>

			{modal?.kind === "regional" ? (
				<RegionalFormModal
					regional={modal.regional}
					onClose={() => setModal(null)}
					onCreated={(created) => { setItems((current) => [...current, { ...created, cities: [] }].sort((a, b) => a.name.localeCompare(b.name))); setModal(null); }}
					onUpdated={(updated) => { patchRegional(modal.regional.id, { name: updated.name }); setModal(null); }}
				/>
			) : null}

			{modal?.kind === "cities" ? (
				<CitiesModal regional={items.find((item) => item.id === modal.regional.id) || modal.regional} onClose={() => setModal(null)} onChange={(cities) => patchRegional(modal.regional.id, { cities })} />
			) : null}

			{modal?.kind === "responsaveis" ? (
				<ResponsaveisModal regional={items.find((item) => item.id === modal.regional.id) || modal.regional} users={users} onClose={() => setModal(null)} onSaved={(responsaveis) => { patchRegional(modal.regional.id, { responsaveis }); setModal(null); }} />
			) : null}
		</div>
	);
}

function SummaryCard({ label, value, tone }) {
	const classes = {
		blue: "bg-blue-50 border-blue-100 text-blue-700",
		green: "bg-emerald-50 border-emerald-100 text-emerald-700",
		amber: "bg-amber-50 border-amber-100 text-amber-700",
	};
	return <div className={`rounded-2xl border p-4 text-center ${classes[tone]}`}><p className="text-3xl font-black">{value}</p><p className="mt-0.5 text-xs font-bold">{label}</p></div>;
}

function RegionalCard({ regional, expanded, onToggle, onEditRegional, onManageCities, onManageResponsaveis, onDelete }) {
	const filled = RESPONSAVEL_TYPES.map(({ type, label }) => ({ label, data: regional.responsaveis?.find((item) => item.type === type) || null }));
	const agentCount = (regional.cities || []).filter((city) => String(city.tipo || city.sourcePayload?.tipo || "").includes("Agente")).length;

	return (
		<article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
			<button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50">
				<div className="flex min-w-0 flex-wrap items-center gap-3">
					<span className="text-slate-400">{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
					<span className="font-black tracking-wide text-slate-950">{regional.name}</span>
					<span className="rounded-xl border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">{regional.cities?.length || 0} cidades</span>
					{agentCount > 0 ? <span className="rounded-xl border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700">{agentCount} ag.</span> : null}
					<span className="rounded-xl border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">Delivery / Field Service</span>
				</div>
				<div className="flex shrink-0 gap-1" onClick={(event) => event.stopPropagation()} role="presentation">
					<button type="button" onClick={onEditRegional} title="Editar regional" className="rot-btn-tactile flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil size={16} /></button>
					<button type="button" onClick={onDelete} title="Excluir regional" className="rot-btn-tactile flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
				</div>
			</button>
			{expanded ? (
				<div className="space-y-4 border-t border-slate-100 p-5">
					<div>
						<div className="mb-2 flex items-center justify-between">
							<p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-400"><Building2 size={13} /> Cidades</p>
							<button type="button" onClick={onManageCities} className="rot-btn-tactile text-xs font-black text-blue-600 hover:underline">Gerenciar</button>
						</div>
						{regional.cities.length ? (
							<div className="flex flex-wrap gap-1.5">
								{regional.cities.map((city) => <span key={city.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{city.name}</span>)}
							</div>
						) : <p className="text-xs font-semibold text-slate-400">Nenhuma cidade cadastrada.</p>}
					</div>
					<div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
						<div className="mb-2 flex items-center justify-between">
							<p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-400"><UserCog size={13} /> Responsáveis</p>
							<button type="button" onClick={onManageResponsaveis} className="rot-btn-tactile text-xs font-black text-blue-600 hover:underline">Editar</button>
						</div>
						<div className="grid gap-2 md:grid-cols-2">
							{filled.map(({ label, data }) => (
								<div key={label} className="flex items-center gap-2.5 rounded-lg bg-white px-3 py-2 shadow-sm">
									{data?.user ? <UserAvatar src={data.user.avatarUrl} name={data.user.name} className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-[11px] font-black text-blue-700" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-400"><UserCog size={14} /></span>}
									<div className="min-w-0 flex-1"><p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="truncate text-sm font-bold text-slate-800">{data?.user?.name || "Não definido"}</p></div>
									{data?.city ? <span className="flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-700"><MapPinned size={11} /> {data.city.name}</span> : null}
								</div>
							))}
						</div>
					</div>
				</div>
			) : null}
		</article>
	);
}

function RegionalFormModal({ regional, onClose, onCreated, onUpdated }) {
	const isEdit = Boolean(regional);
	const [name, setName] = useState(regional?.name || "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		if (!name.trim()) return;
		setSaving(true); setError("");
		try {
			if (isEdit) onUpdated(await updateRotRegional(regional.id, { name: name.trim() }));
			else onCreated(await createRotRegional({ name: name.trim() }));
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a regional.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={isEdit ? "Editar regional" : "Nova regional"} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><MapPin size={22} /></span>} onClose={onClose} size="sm">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Nome da regional</span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus className="input-field" /></label>
				<Actions saving={saving} onClose={onClose} submitLabel={isEdit ? "Salvar" : "Criar regional"} />
			</form>
		</ModalShell>
	);
}

function CitiesModal({ regional, onClose, onChange }) {
	const [cities, setCities] = useState(regional.cities);
	const [newName, setNewName] = useState("");
	const [editingId, setEditingId] = useState(null);
	const [editingName, setEditingName] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const sync = (next) => { setCities(next); onChange(next); };
	const addCity = async (event) => {
		event.preventDefault();
		if (!newName.trim()) return;
		setBusy(true); setError("");
		try {
			const city = await createRotCity(regional.id, { name: newName.trim() });
			sync([...cities, city].sort((a, b) => a.name.localeCompare(b.name)));
			setNewName("");
		} catch (err) {
			setError(err?.message || "Não foi possível adicionar a cidade.");
		} finally {
			setBusy(false);
		}
	};
	const saveRename = async (city) => {
		if (!editingName.trim() || editingName === city.name) { setEditingId(null); return; }
		setBusy(true); setError("");
		try {
			const updated = await updateRotCity(city.id, { name: editingName.trim() });
			sync(cities.map((item) => (item.id === city.id ? updated : item)));
			setEditingId(null);
		} catch (err) {
			setError(err?.message || "Não foi possível renomear a cidade.");
		} finally {
			setBusy(false);
		}
	};
	const removeCity = async (city) => {
		if (!window.confirm(`Excluir a cidade "${city.name}"?`)) return;
		setBusy(true); setError("");
		try {
			await deleteRotCity(city.id);
			sync(cities.filter((item) => item.id !== city.id));
		} catch (err) {
			setError(err?.message || "Não foi possível excluir a cidade.");
		} finally {
			setBusy(false);
		}
	};
	return (
		<ModalShell open title={`Cidades — ${regional.name}`} description="Cidades usadas como cidade base dos responsáveis e no cadastro de usuários." icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Building2 size={22} /></span>} onClose={onClose} size="md">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<div className="space-y-2">
				{cities.map((city) => (
					<div key={city.id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
						{editingId === city.id ? <input value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus onKeyDown={(event) => event.key === "Enter" && saveRename(city)} className="h-9 flex-1 rounded-lg border border-blue-300 px-3 text-sm font-semibold outline-none focus:ring-4 focus:ring-blue-100" /> : <span className="flex-1 text-sm font-bold text-slate-800">{city.name}</span>}
						{editingId === city.id ? <button type="button" onClick={() => saveRename(city)} disabled={busy} className="rot-btn-tactile rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-60">Salvar</button> : <button type="button" onClick={() => { setEditingId(city.id); setEditingName(city.name); }} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil size={14} /></button>}
						<button type="button" onClick={() => removeCity(city)} disabled={busy} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"><Trash2 size={14} /></button>
					</div>
				))}
				{!cities.length ? <p className="text-sm font-semibold text-slate-400">Nenhuma cidade cadastrada ainda.</p> : null}
			</div>
			<form onSubmit={addCity} className="mt-4 flex gap-2 border-t border-slate-100 pt-4"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nova cidade" className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /><button type="submit" disabled={busy} className="rot-btn-tactile inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"><Plus size={15} /> Adicionar</button></form>
		</ModalShell>
	);
}

function ResponsaveisModal({ regional, users, onClose, onSaved }) {
	const [draft, setDraft] = useState(() => RESPONSAVEL_TYPES.map(({ type }) => {
		const current = regional.responsaveis?.find((item) => item.type === type);
		return { type, userId: current?.userId || "", cityId: current?.cityId || "", phone: current?.phone || "" };
	}));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const userOptions = useMemo(() => [...users.filter((user) => user.regionalId === regional.id), ...users.filter((user) => user.regionalId !== regional.id)], [users, regional.id]);
	const setField = (index, field, value) => setDraft((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
	const save = async (event) => {
		event.preventDefault();
		setSaving(true); setError("");
		try {
			const updated = await updateRotRegional(regional.id, { responsaveis: draft });
			onSaved(updated.responsaveis);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar os responsáveis.");
		} finally {
			setSaving(false);
		}
	};
	return (
		<ModalShell open title={`Responsáveis — ${regional.name}`} description="O nome vem do cadastro de usuários." icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><UserCog size={22} /></span>} onClose={onClose} size="md">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={save} className="space-y-5">
				{RESPONSAVEL_TYPES.map(({ type, label }, index) => (
					<div key={type} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
						<p className="mb-3 text-sm font-black text-slate-800">{label}</p>
						<div className="grid gap-3 sm:grid-cols-2">
							<label className="sm:col-span-2"><span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Usuário</span><select value={draft[index].userId} onChange={(event) => setField(index, "userId", event.target.value)} className="input-field"><option value="">Não definido</option>{userOptions.map((user) => <option key={user.id} value={user.id}>{user.name} (@{user.username}){user.regionalId !== regional.id ? " — outra regional" : ""}</option>)}</select></label>
							<label><span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Cidade base</span><select value={draft[index].cityId} onChange={(event) => setField(index, "cityId", event.target.value)} className="input-field"><option value="">Sem cidade base</option>{regional.cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
							<label><span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Telefone</span><input value={draft[index].phone} onChange={(event) => setField(index, "phone", event.target.value)} className="input-field" placeholder="(00) 00000-0000" /></label>
						</div>
					</div>
				))}
				<Actions saving={saving} onClose={onClose} submitLabel="Salvar responsáveis" />
			</form>
		</ModalShell>
	);
}

function Actions({ saving, onClose, submitLabel }) {
	return <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button><button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">{saving ? "Salvando..." : submitLabel}</button></div>;
}
