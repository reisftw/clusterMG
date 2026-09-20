import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ClipboardCheck, LayoutGrid, Palmtree, Plus, RefreshCw, Trash2, Umbrella, Users } from "lucide-react";
import { createRotAbsence, decideRotAbsence, deleteRotAbsence, fetchRotAbsences, requestRotAbsence } from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import RotCalendar from "../../components/ui/RotCalendar";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/useRotAuth";

const TYPE_LABEL = { ferias: "Férias", folga: "Folga", atestado: "Atestado" };
const TYPE_TONE = { ferias: "bg-blue-50 text-blue-600 border-blue-100", folga: "bg-purple-50 text-purple-600 border-purple-100", atestado: "bg-red-50 text-red-600 border-red-100" };
const STATUS_TONE = { pendente: "bg-amber-50 text-amber-700", aprovado: "bg-emerald-50 text-emerald-700", recusado: "bg-red-50 text-red-700" };

function formatDate(value) {
	if (!value) return "";
	return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

// Fiel a rot/src/pages/AbsencesPage.tsx + TimeOffPage.tsx, consolidados
// numa unica tela (ver 009_rot_absences.sql): KPIs, painel de aprovacao
// de pendentes e historico, com visao de calendario (mesmo padrao do
// agendamento do Retiradas, pedido explicito do usuario) alem da lista.
export default function AbsencesPage() {
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.absences.manage");
	const canApproveTimeoff = hasPermission("rot.timeoff.approve") || canManage;
	const canApproveVacations = hasPermission("rot.vacations.approve") || canManage;
	const [items, setItems] = useState([]);
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [launchModal, setLaunchModal] = useState(false);
	const [requestModal, setRequestModal] = useState(null); // "folga" | "ferias"
	const [busyId, setBusyId] = useState(null);
	const [visao, setVisao] = useState("calendario");
	const [mesCalendario, setMesCalendario] = useState(() => new Date());

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const data = await fetchRotAbsences();
			setItems(data.items);
			setUsers(data.users);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os registros.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const stats = useMemo(() => ({
		ferias: items.filter((i) => i.type === "ferias").length,
		folga: items.filter((i) => i.type === "folga").length,
		atestado: items.filter((i) => i.type === "atestado").length,
	}), [items]);

	const pending = items.filter((i) => i.status === "pendente" && ((i.type === "folga" && canApproveTimeoff) || (i.type === "ferias" && canApproveVacations)));
	const history = [...items].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));

	const decide = async (item, approved) => {
		setBusyId(item.id);
		setError("");
		try {
			const updated = await decideRotAbsence(item.id, approved);
			setItems((current) => current.map((i) => (i.id === updated.id ? { ...updated, userName: i.userName } : i)));
		} catch (err) {
			setError(err?.message || "Não foi possível decidir sobre a solicitação.");
		} finally {
			setBusyId(null);
		}
	};

	const handleDelete = async (item) => {
		if (!window.confirm(`Excluir este registro de ${TYPE_LABEL[item.type]?.toLowerCase()}?`)) return;
		try {
			await deleteRotAbsence(item.id);
			setItems((current) => current.filter((i) => i.id !== item.id));
		} catch (err) {
			setError(err?.message || "Não foi possível excluir o registro.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
						<Umbrella size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Ausências, Folgas e Férias</h1>
						<p className="text-sm font-semibold text-slate-500">{items.length} registro(s).</p>
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
					<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
						<RefreshCw size={16} /> Atualizar
					</button>
					<button type="button" onClick={() => setRequestModal("folga")} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-purple-600 px-4 text-sm font-black text-white shadow hover:bg-purple-700">
						<Plus size={16} /> Solicitar Folga
					</button>
					<button type="button" onClick={() => setRequestModal("ferias")} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow hover:bg-blue-700">
						<Plus size={16} /> Solicitar Férias
					</button>
					{canManage ? (
						<button type="button" onClick={() => setLaunchModal(true)} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white shadow hover:bg-slate-800">
							<Plus size={16} /> Lançar Ausência
						</button>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="grid gap-4 sm:grid-cols-3">
				<StatCard icon={Palmtree} label="Férias" value={stats.ferias} tone="bg-blue-50 text-blue-600" />
				<StatCard icon={Umbrella} label="Folgas" value={stats.folga} tone="bg-purple-50 text-purple-600" />
				<StatCard icon={ClipboardCheck} label="Atestados" value={stats.atestado} tone="bg-red-50 text-red-600" />
			</div>

			{pending.length ? (
				<div className="rounded-2xl border-t-4 border-orange-500 bg-white p-5 shadow-sm">
					<h3 className="mb-4 flex items-center gap-2 border-b pb-2 text-xs font-black uppercase tracking-widest text-blue-900">
						<AlertTriangle size={16} className="text-orange-500" /> Pendentes de aprovação
					</h3>
					<div className="space-y-3">
						{pending.map((item) => (
							<div key={item.id} className="rounded-xl border border-orange-100 bg-orange-50/30 p-4 shadow-sm">
								<div className="mb-2 flex justify-between">
									<div>
										<span className="block text-xs font-black uppercase text-blue-950">{item.userName}</span>
										<span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${TYPE_TONE[item.type]}`}>{TYPE_LABEL[item.type]}</span>
									</div>
									<span className="rounded border bg-white px-2 py-1 text-[10px] font-black text-orange-600">{formatDate(item.startDate)}{item.endDate !== item.startDate ? ` → ${formatDate(item.endDate)}` : ""}</span>
								</div>
								{item.reason ? <p className="my-2 text-[11px] italic text-slate-600">"{item.reason}"</p> : null}
								<div className="flex gap-2">
									<button type="button" disabled={busyId === item.id} onClick={() => decide(item, false)} className="rot-btn-tactile flex-1 rounded-lg border border-red-200 bg-white py-2 text-[10px] font-black uppercase text-red-600 disabled:opacity-60">Recusar</button>
									<button type="button" disabled={busyId === item.id} onClick={() => decide(item, true)} className="rot-btn-tactile flex-1 rounded-lg bg-orange-600 py-2 text-[10px] font-black uppercase text-white shadow disabled:opacity-60">Aprovar</button>
								</div>
							</div>
						))}
					</div>
				</div>
			) : null}

			{visao === "calendario" ? (
				<RotCalendar
					items={items}
					getDateKey={(item) => String(item.startDate).slice(0, 10)}
					month={mesCalendario}
					onMonthChange={setMesCalendario}
					dotColor="bg-orange-500"
					badgeColor="bg-orange-600"
					emptyLabel="Nenhuma ausência neste dia."
					renderItem={(item) => (
						<div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4 shadow-sm">
							<div className="mb-2 flex items-center justify-between gap-2">
								<div>
									<span className="block text-xs font-black uppercase text-blue-950">{item.userName}</span>
									<span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${TYPE_TONE[item.type]}`}>{TYPE_LABEL[item.type]}</span>
								</div>
								<span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${STATUS_TONE[item.status]}`}>{item.status}</span>
							</div>
							<p className="text-[11px] font-bold text-slate-600">{formatDate(item.startDate)} <span className="mx-1 text-slate-300">→</span> {formatDate(item.endDate)}</p>
							{item.reason ? <p className="mt-1 text-[11px] italic text-slate-500">"{item.reason}"</p> : null}
							<div className="mt-2 flex justify-end gap-2">
								{item.status === "pendente" && ((item.type === "folga" && canApproveTimeoff) || (item.type === "ferias" && canApproveVacations)) ? (
									<>
										<button type="button" disabled={busyId === item.id} onClick={() => decide(item, false)} className="rot-btn-tactile rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase text-red-600 disabled:opacity-60">Recusar</button>
										<button type="button" disabled={busyId === item.id} onClick={() => decide(item, true)} className="rot-btn-tactile rounded-lg bg-orange-600 px-3 py-1.5 text-[10px] font-black uppercase text-white shadow disabled:opacity-60">Aprovar</button>
									</>
								) : null}
								{canManage ? (
									<button type="button" onClick={() => handleDelete(item)} className="rot-btn-tactile rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500">
										<Trash2 size={16} />
									</button>
								) : null}
							</div>
						</div>
					)}
				/>
			) : (
				<div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
					<div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-5">
						<h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-950">
							<Users size={16} className="text-orange-500" /> Histórico de registros
						</h3>
					</div>
					<div className="overflow-x-auto">
						<table className="w-full min-w-[640px] text-left">
							<thead>
								<tr className="border-b border-slate-100">
									<th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Colaborador</th>
									<th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Tipo</th>
									<th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Período</th>
									<th className="p-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Status</th>
									{canManage ? <th className="p-4 text-right text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Ações</th> : null}
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-50">
								{history.map((item) => (
									<tr key={item.id} className="rot-row-hover">
										<td className="p-4 text-xs font-black uppercase text-blue-950">{item.userName}</td>
										<td className="p-4">
											<span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${TYPE_TONE[item.type]}`}>{TYPE_LABEL[item.type]}</span>
										</td>
										<td className="p-4 text-[11px] font-bold text-slate-600">{formatDate(item.startDate)} <span className="mx-1 text-slate-300">→</span> {formatDate(item.endDate)}</td>
										<td className="p-4">
											<span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${STATUS_TONE[item.status]}`}>{item.status}</span>
										</td>
										{canManage ? (
											<td className="p-4 text-right">
												<button type="button" onClick={() => handleDelete(item)} className="rot-btn-tactile rounded-xl p-2 text-slate-200 hover:bg-red-50 hover:text-red-500">
													<Trash2 size={16} />
												</button>
											</td>
										) : null}
									</tr>
								))}
								{!history.length ? (
									<tr>
										<td colSpan={5} className="p-10 text-center text-[10px] font-black uppercase text-slate-300">Nenhum registro encontrado</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{launchModal ?<LaunchAbsenceModal users={users} onClose={() => setLaunchModal(false)} onCreated={(created) => { setItems((c) => [created, ...c]); setLaunchModal(false); }} /> : null}
			{requestModal ? (
				<RequestAbsenceModal
					type={requestModal}
					onClose={() => setRequestModal(null)}
					onCreated={(created) => { setItems((c) => [created, ...c]); setRequestModal(null); }}
				/>
			) : null}
		</div>
	);
}

function StatCard({ icon: Icon, label, value, tone }) {
	return (
		<div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
				<Icon size={22} />
			</span>
			<div>
				<p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
				<p className="text-2xl font-black text-blue-950">{value}</p>
			</div>
		</div>
	);
}

function LaunchAbsenceModal({ users, onClose, onCreated }) {
	const [userId, setUserId] = useState(users[0]?.id || "");
	const [type, setType] = useState("ferias");
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [reason, setReason] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const submit = async (event) => {
		event.preventDefault();
		if (!userId || !startDate) {
			setError("Selecione o colaborador e a data.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const created = await createRotAbsence({ userId, type, startDate, endDate: endDate || startDate, reason });
			const userName = users.find((u) => u.id === userId)?.name;
			onCreated({ ...created, userName });
		} catch (err) {
			setError(err?.message || "Não foi possível lançar a ausência.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title="Lançar ausência" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><Umbrella size={22} /></span>} onClose={onClose} size="md">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Colaborador</span>
					<select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100">
						{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
					</select>
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Tipo</span>
					<select value={type} onChange={(e) => setType(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100">
						<option value="ferias">Férias</option>
						<option value="folga">Folga</option>
						<option value="atestado">Atestado</option>
					</select>
				</label>
				<div className="grid grid-cols-2 gap-3">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Início</span>
						<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Fim</span>
						<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
					</label>
				</div>
				<textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Observação (opcional)" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" />
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60">{saving ? "Salvando..." : "Lançar"}</button>
				</div>
			</form>
		</ModalShell>
	);
}

function RequestAbsenceModal({ type, onClose, onCreated }) {
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [reason, setReason] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const { user } = useRotAuth();

	const submit = async (event) => {
		event.preventDefault();
		if (!startDate) {
			setError("Informe a data.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const created = await requestRotAbsence({ type, startDate, endDate: endDate || startDate, reason });
			onCreated({ ...created, userName: user?.name });
		} catch (err) {
			setError(err?.message || "Não foi possível enviar a solicitação.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={type === "folga" ? "Solicitar folga" : "Solicitar férias"} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">{type === "folga" ? <Umbrella size={22} /> : <Palmtree size={22} />}</span>} onClose={onClose} size="sm">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<div className="grid grid-cols-2 gap-3">
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Início</span>
						<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} autoFocus className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" />
					</label>
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Fim</span>
						<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" />
					</label>
				</div>
				<textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Motivo" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" />
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-purple-600 px-4 py-2 text-sm font-black text-white hover:bg-purple-700 disabled:opacity-60">{saving ? "Enviando..." : "Solicitar"}</button>
				</div>
			</form>
		</ModalShell>
	);
}
