import { useEffect, useState } from "react";
import { CalendarClock, CalendarDays, Edit3, ExternalLink, LayoutGrid, Plus, RefreshCw, Trash2 } from "lucide-react";
import { createRotActivity, deleteRotActivity, fetchRotActivities, fetchRotRegionals, updateRotActivity } from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import RotCalendar from "../../components/ui/RotCalendar";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";

const PRIORITY_TONE = { baixa: "bg-slate-100 text-slate-600", normal: "bg-blue-50 text-blue-700", alta: "bg-red-50 text-red-700" };
const STATUS_TONE = { pendente: "bg-amber-50 text-amber-700", concluida: "bg-emerald-50 text-emerald-700", cancelada: "bg-slate-100 text-slate-500" };

function formatDate(value) {
	if (!value) return "";
	return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR");
}

// Fiel ao modelo legado de Atividades (visita/atendimento comercial
// agendado, ver ActivityDocument em rot/src/types/firestore.ts).
export default function ActivitiesPage() {
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.activities.manage");
	const [items, setItems] = useState([]);
	const [technicians, setTechnicians] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [modal, setModal] = useState(null);
	const [statusFiltro, setStatusFiltro] = useState("todos");
	const [visao, setVisao] = useState("calendario");
	const [mesCalendario, setMesCalendario] = useState(() => new Date());

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [data, regionalList] = await Promise.all([fetchRotActivities(), fetchRotRegionals()]);
			setItems(data.items);
			setTechnicians(data.technicians);
			setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as atividades.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const visible = items.filter((i) => statusFiltro === "todos" || i.status === statusFiltro);

	const handleDelete = async (item) => {
		if (!window.confirm(`Excluir a atividade de "${item.clientName}"?`)) return;
		try {
			await deleteRotActivity(item.id);
			setItems((current) => current.filter((i) => i.id !== item.id));
		} catch (err) {
			setError(err?.message || "Não foi possível excluir a atividade.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
						<CalendarClock size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Atividades</h1>
						<p className="text-sm font-semibold text-slate-500">{items.length} atividade(s) registrada(s).</p>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					<div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
						<button type="button" onClick={() => setVisao("calendario")} className={`rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black uppercase ${visao === "calendario" ? "bg-orange-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>
							<CalendarDays size={14} /> Calendário
						</button>
						<button type="button" onClick={() => setVisao("lista")} className={`rot-btn-tactile inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black uppercase ${visao === "lista" ? "bg-orange-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}>
							<LayoutGrid size={14} /> Lista
						</button>
					</div>
					<select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
						<option value="todos">Todos</option>
						<option value="pendente">Pendente</option>
						<option value="concluida">Concluída</option>
						<option value="cancelada">Cancelada</option>
					</select>
					<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
						<RefreshCw size={16} /> Atualizar
					</button>
					{canManage ? (
						<button type="button" onClick={() => setModal({ item: null })} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 hover:bg-orange-700">
							<Plus size={17} /> Nova Atividade
						</button>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{visao === "calendario" ? (
				<RotCalendar
					items={visible}
					getDateKey={(item) => String(item.date).slice(0, 10)}
					month={mesCalendario}
					onMonthChange={setMesCalendario}
					dotColor="bg-orange-500"
					badgeColor="bg-orange-600"
					emptyLabel="Nenhuma atividade neste dia."
					renderItem={(item) => (
						<article key={item.id} className="rot-card-hover relative rounded-xl border border-slate-100 bg-slate-50 p-4 shadow-sm">
							{canManage ? (
								<div className="absolute right-3 top-3 flex gap-1">
									<button type="button" onClick={() => setModal({ item })} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Edit3 size={14} /></button>
									<button type="button" onClick={() => handleDelete(item)} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
								</div>
							) : null}
							<div className="mb-2 flex flex-wrap gap-1.5 pr-16">
								<span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${PRIORITY_TONE[item.priority]}`}>{item.priority}</span>
								<span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[item.status]}`}>{item.status}</span>
							</div>
							<h3 className="text-base font-black text-slate-900">{item.clientName}</h3>
							{item.companyContact ? <p className="text-xs font-semibold text-slate-400">{item.companyContact}</p> : null}
							<div className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-600">
								<p><b>{formatDate(item.date)}</b> {item.time ? `às ${item.time}` : ""}</p>
								{item.serviceDescription ? <p className="mt-1 italic">{item.serviceDescription}</p> : null}
							</div>
							<div className="mt-2 flex items-center justify-between text-xs">
								<span className="font-bold text-slate-500">{item.userName || "Sem técnico"}</span>
								{item.locationUrl ? <a href={item.locationUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-bold text-blue-600 hover:underline"><ExternalLink size={12} /> Local</a> : null}
							</div>
						</article>
					)}
				/>
			) : visible.length ? (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{visible.map((item) => (
						<article key={item.id} className="rot-card-hover relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							{canManage ? (
								<div className="absolute right-3 top-3 flex gap-1">
									<button type="button" onClick={() => setModal({ item })} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Edit3 size={14} /></button>
									<button type="button" onClick={() => handleDelete(item)} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
								</div>
							) : null}
							<div className="mb-2 flex flex-wrap gap-1.5 pr-16">
								<span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${PRIORITY_TONE[item.priority]}`}>{item.priority}</span>
								<span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[item.status]}`}>{item.status}</span>
							</div>
							<h3 className="text-base font-black text-slate-900">{item.clientName}</h3>
							{item.companyContact ? <p className="text-xs font-semibold text-slate-400">{item.companyContact}</p> : null}
							<div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
								<p><b>{formatDate(item.date)}</b> {item.time ? `às ${item.time}` : ""}</p>
								{item.serviceDescription ? <p className="mt-1 italic">{item.serviceDescription}</p> : null}
							</div>
							<div className="mt-2 flex items-center justify-between text-xs">
								<span className="font-bold text-slate-500">{item.userName || "Sem técnico"}</span>
								{item.locationUrl ? <a href={item.locationUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-bold text-blue-600 hover:underline"><ExternalLink size={12} /> Local</a> : null}
							</div>
						</article>
					))}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-16 text-center text-sm font-bold text-slate-400">Nenhuma atividade encontrada.</div>
			)}

			{modal ? (
				<ActivityFormModal
					item={modal.item}
					technicians={technicians}
					regionals={regionals}
					onClose={() => setModal(null)}
					onSaved={(saved) => {
						setItems((current) => {
							const exists = current.some((i) => i.id === saved.id);
							return exists ? current.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...current];
						});
						setModal(null);
					}}
				/>
			) : null}
		</div>
	);
}

function ActivityFormModal({ item, technicians, regionals, onClose, onSaved }) {
	const isEdit = Boolean(item);
	const [regionalId, setRegionalId] = useState(item?.regionalId || regionals[0]?.id || "");
	const [clientName, setClientName] = useState(item?.clientName || "");
	const [companyContact, setCompanyContact] = useState(item?.companyContact || "");
	const [date, setDate] = useState(item?.date ? String(item.date).slice(0, 10) : new Date().toISOString().slice(0, 10));
	const [time, setTime] = useState(item?.time || "");
	const [locationUrl, setLocationUrl] = useState(item?.locationUrl || "");
	const [priority, setPriority] = useState(item?.priority || "normal");
	const [status, setStatus] = useState(item?.status || "pendente");
	const [serviceDescription, setServiceDescription] = useState(item?.serviceDescription || "");
	const [requestedBy, setRequestedBy] = useState(item?.requestedBy || "");
	const [userId, setUserId] = useState(item?.userId || "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const regionalTechs = technicians.filter((t) => t.regionalId === regionalId);

	const submit = async (event) => {
		event.preventDefault();
		if (!regionalId || !clientName.trim() || !date) {
			setError("Informe regional, cliente e data.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const payload = { regionalId, clientName: clientName.trim(), companyContact, date, time, locationUrl, priority, status, serviceDescription, requestedBy, userId: userId || null };
			const saved = isEdit ? await updateRotActivity(item.id, payload) : await createRotActivity(payload);
			onSaved(saved);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a atividade.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={isEdit ? "Editar atividade" : "Nova atividade"} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><CalendarClock size={22} /></span>} onClose={onClose} size="lg">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Cliente</span>
						<input value={clientName} onChange={(e) => setClientName(e.target.value)} autoFocus className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Contato da empresa</span>
						<input value={companyContact} onChange={(e) => setCompanyContact(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
					</label>
				</div>
				<div className="grid gap-3 sm:grid-cols-3">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Data</span>
						<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Hora</span>
						<input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Prioridade</span>
						<select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
							<option value="baixa">Baixa</option>
							<option value="normal">Normal</option>
							<option value="alta">Alta</option>
						</select>
					</label>
				</div>
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Regional</span>
						<select value={regionalId} onChange={(e) => { setRegionalId(e.target.value); setUserId(""); }} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
							{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
						</select>
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Técnico responsável</span>
						<select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
							<option value="">Sem técnico</option>
							{regionalTechs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
						</select>
					</label>
				</div>
				{isEdit ? (
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Status</span>
						<select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
							<option value="pendente">Pendente</option>
							<option value="concluida">Concluída</option>
							<option value="cancelada">Cancelada</option>
						</select>
					</label>
				) : null}
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Link do local (opcional)</span>
					<input value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} placeholder="https://maps.google.com/..." className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Solicitado por</span>
					<input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Descrição do serviço</span>
					<textarea value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</label>
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">{saving ? "Salvando..." : isEdit ? "Salvar" : "Criar atividade"}</button>
				</div>
			</form>
		</ModalShell>
	);
}
