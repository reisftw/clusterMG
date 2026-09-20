import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, Edit3, Globe, History, Plus, RefreshCw, Trash2, User, Zap } from "lucide-react";
import { createRotShift, deleteRotShift, fetchRotRegionals, fetchRotShifts, updateRotShift } from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import RotCalendar from "../../components/ui/RotCalendar";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/useRotAuth";

const SHIFT_TYPE_LABEL = { plantao: "Plantão", escala: "Escala", on_call: "Sobreaviso" };

function formatDateTime(value) {
	if (!value) return "";
	return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function toInputValue(value) {
	if (!value) return "";
	const date = new Date(value);
	const pad = (n) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Fiel a rot/src/pages/GlobalShiftsPage.tsx + MyShiftsPage.tsx +
// ShiftCards.tsx, consolidado numa unica tabela (rot_shifts, com campo
// "tipo") em vez das varias colecoes legadas equivalentes.
export default function ShiftsPage() {
	const { user, hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.shifts.manage");
	const [shifts, setShifts] = useState([]);
	const [technicians, setTechnicians] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [modal, setModal] = useState(null);
	const [aba, setAba] = useState("meus");
	const [mesCalendario, setMesCalendario] = useState(() => new Date());

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [data, regionalList] = await Promise.all([fetchRotShifts(), fetchRotRegionals()]);
			setShifts(data.items);
			setTechnicians(data.technicians);
			setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os plantões.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const now = Date.now();
	const isActive = (shift) => now >= new Date(shift.start).getTime() && now <= new Date(shift.end).getTime();

	const activeGlobal = useMemo(() => shifts.filter(isActive), [shifts]);

	const myShifts = useMemo(() => shifts.filter((s) => s.teamIds.includes(user?.id)), [shifts, user]);
	const myActive = myShifts.filter(isActive);
	const myFuture = myShifts.filter((s) => new Date(s.start).getTime() > now).sort((a, b) => new Date(a.start) - new Date(b.start));
	const myPast = myShifts.filter((s) => new Date(s.end).getTime() < now).sort((a, b) => new Date(b.start) - new Date(a.start));

	const handleDelete = async (shift) => {
		if (!window.confirm("Excluir este plantão?")) return;
		try {
			await deleteRotShift(shift.id);
			setShifts((current) => current.filter((s) => s.id !== shift.id));
		} catch (err) {
			setError(err?.message || "Não foi possível excluir o plantão.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
						<Calendar size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Turnos / Escala</h1>
						<p className="text-sm font-semibold text-slate-500">{shifts.length} plantão(ões) cadastrado(s).</p>
					</div>
				</div>
				<div className="flex gap-2">
					<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
						<RefreshCw size={16} /> Atualizar
					</button>
					{canManage ? (
						<button type="button" onClick={() => setModal({ shift: null })} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 hover:bg-orange-700">
							<Plus size={17} /> Novo Plantão
						</button>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
				<button type="button" onClick={() => setAba("meus")} className={`rounded-lg px-4 py-2 text-xs font-black uppercase transition ${aba === "meus" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Meus Plantões</button>
				<button type="button" onClick={() => setAba("geral")} className={`rounded-lg px-4 py-2 text-xs font-black uppercase transition ${aba === "geral" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Visão Geral</button>
				<button type="button" onClick={() => setAba("historico")} className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-black uppercase transition ${aba === "historico" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
					<History size={14} /> Histórico
				</button>
			</div>

			{aba === "historico" ? (
				<RotCalendar
					items={shifts}
					getDateKey={(shift) => String(shift.start).slice(0, 10)}
					month={mesCalendario}
					onMonthChange={setMesCalendario}
					dotColor="bg-purple-500"
					badgeColor="bg-purple-600"
					emptyLabel="Nenhum plantão neste dia."
					renderItem={(shift) => {
						const members = shift.teamIds.map((id) => technicians.find((t) => t.id === id)).filter(Boolean);
						const regional = regionals.find((r) => r.id === shift.regionalId);
						return (
							<div key={shift.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
								<div className="mb-1.5 flex items-center justify-between gap-2">
									<span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black uppercase text-purple-700">{SHIFT_TYPE_LABEL[shift.tipo] || shift.tipo}</span>
									<span className="text-[11px] font-bold text-slate-500">{formatDateTime(shift.start)} → {formatDateTime(shift.end)}</span>
								</div>
								<p className="text-[11px] font-semibold text-slate-500">{regional?.name || "Regional"}</p>
								<div className="mt-1.5 flex flex-wrap gap-1.5">
									{members.length ? members.map((m) => (
										<span key={m.id} className="flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs font-medium text-slate-700"><User size={12} className="text-purple-500" />{m.name}</span>
									)) : <span className="text-xs italic text-slate-400">Sem equipe definida.</span>}
								</div>
							</div>
						);
					}}
				/>
			) : aba === "geral" ? (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{activeGlobal.length ? activeGlobal.map((shift) => (
						<ShiftCard key={shift.id} shift={shift} technicians={technicians} regionals={regionals} canManage={canManage} onEdit={() => setModal({ shift })} onDelete={() => handleDelete(shift)} />
					)) : (
						<div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">
							<Globe className="mx-auto mb-3 opacity-30" size={36} />
							Nenhuma equipe em plantão no momento em toda a rede.
						</div>
					)}
				</div>
			) : (
				<div className="space-y-8">
					{myActive.length ? (
						<div>
							<h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-orange-600"><Zap size={18} /> Plantão em andamento</h2>
							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
								{myActive.map((shift) => <ShiftCard key={shift.id} shift={shift} technicians={technicians} regionals={regionals} canManage={canManage} onEdit={() => setModal({ shift })} onDelete={() => handleDelete(shift)} />)}
							</div>
						</div>
					) : null}

					<div>
						<h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-blue-900"><Calendar size={18} /> Próximos plantões</h2>
						{myFuture.length ? (
							<div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
								{myFuture.map((shift) => <ShiftCard key={shift.id} shift={shift} technicians={technicians} regionals={regionals} canManage={canManage} compact onEdit={() => setModal({ shift })} onDelete={() => handleDelete(shift)} />)}
							</div>
						) : <p className="text-sm italic text-slate-400">Nenhum agendamento futuro.</p>}
					</div>

					<div className="border-t border-slate-100 pt-6">
						<h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-slate-400"><History size={18} /> Histórico</h2>
						{myPast.length ? (
							<div className="grid gap-4 opacity-80 hover:opacity-100 md:grid-cols-2 xl:grid-cols-3">
								{myPast.map((shift) => <ShiftCard key={shift.id} shift={shift} technicians={technicians} regionals={regionals} canManage={canManage} concluded onEdit={() => setModal({ shift })} onDelete={() => handleDelete(shift)} />)}
							</div>
						) : <p className="text-sm italic text-slate-400">Nenhum histórico disponível.</p>}
					</div>
				</div>
			)}

			{modal ? (
				<ShiftFormModal
					shift={modal.shift}
					technicians={technicians}
					regionals={regionals}
					user={user}
					onClose={() => setModal(null)}
					onSaved={(saved) => {
						setShifts((current) => {
							const exists = current.some((s) => s.id === saved.id);
							return exists ? current.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...current];
						});
						setModal(null);
					}}
				/>
			) : null}
		</div>
	);
}

function ShiftCard({ shift, technicians, regionals, canManage, onEdit, onDelete, compact, concluded }) {
	const members = shift.teamIds.map((id) => technicians.find((t) => t.id === id)).filter(Boolean);
	const regional = regionals.find((r) => r.id === shift.regionalId);

	if (compact) {
		return (
			<div className="rot-card-hover flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
				<span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600"><Calendar size={20} /></span>
				<div className="mb-3 w-full rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
					<div className="mb-1 flex justify-between border-b border-slate-200 pb-1">
						<span className="text-xs font-black uppercase text-slate-400">Início</span>
						<span className="font-black text-blue-950">{formatDateTime(shift.start)}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-xs font-black uppercase text-slate-400">Fim</span>
						<span className="font-black text-blue-950">{formatDateTime(shift.end)}</span>
					</div>
				</div>
				<div className="flex flex-wrap justify-center gap-1.5">
					{members.map((m) => <span key={m.id} className="rounded border bg-white px-1.5 py-0.5 text-xs font-medium text-slate-700">{m.name.split(" ")[0]}</span>)}
				</div>
			</div>
		);
	}

	return (
		<article className="rot-card-hover relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			{concluded ? <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">CONCLUÍDO</span> : null}
			{canManage ? (
				<div className="absolute right-3 top-3 flex gap-1">
					<button type="button" onClick={onEdit} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Edit3 size={14} /></button>
					<button type="button" onClick={onDelete} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
				</div>
			) : null}
			<div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-slate-400">
				<Clock size={14} /> {regional?.name || "Regional"}
			</div>
			<div className="mb-3 rounded-xl bg-slate-50 p-3 text-sm">
				<div className="mb-1 flex justify-between"><span className="text-xs font-bold text-slate-400">Início</span><span className="font-black text-blue-950">{formatDateTime(shift.start)}</span></div>
				<div className="flex justify-between"><span className="text-xs font-bold text-slate-400">Fim</span><span className="font-black text-blue-950">{formatDateTime(shift.end)}</span></div>
			</div>
			<p className="mb-2 text-[10px] font-black uppercase text-slate-400">Equipe escalada</p>
			<div className="flex flex-wrap gap-1.5">
				{members.length ? members.map((m) => (
					<span key={m.id} className="flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs font-medium text-slate-700"><User size={12} className="text-blue-500" />{m.name}</span>
				)) : <span className="text-xs italic text-slate-400">Sem equipe definida.</span>}
			</div>
		</article>
	);
}

const SHIFT_DURATIONS = [
	{ value: "24", label: "24h" },
	{ value: "48", label: "48h" },
	{ value: "72", label: "72h" },
	{ value: "madrugada", label: "Madrugada (00-08)" },
	{ value: "noite", label: "Noite (18-24)" },
	{ value: "custom", label: "Personalizado (Data/Hora)" },
];

// Mesma logica de calculo do app antigo (rot/src, GlobalShiftsPage.tsx):
// madrugada/noite usam so a DATA do campo "Inicio" e fixam o horario
// (ignoram a hora digitada); 24/48/72h somam horas em cima do
// inicio exato; personalizado usa um segundo datetime-local pro fim.
function computeShiftRange(startValue, duration, customEndValue) {
	const start = new Date(startValue);
	if (Number.isNaN(start.getTime())) return { error: "Informe uma data/hora de início válida." };
	if (duration === "madrugada" || duration === "noite") {
		const y = start.getFullYear(), m = start.getMonth(), d = start.getDate();
		const range = duration === "madrugada"
			? { start: new Date(y, m, d, 0, 0, 0), end: new Date(y, m, d, 8, 0, 0) }
			: { start: new Date(y, m, d, 18, 0, 0), end: new Date(y, m, d, 23, 59, 59) };
		return range;
	}
	if (duration === "custom") {
		if (!customEndValue) return { error: "Para horário personalizado, informe o término do plantão." };
		const end = new Date(customEndValue);
		if (Number.isNaN(end.getTime()) || end <= start) return { error: "O término deve ser depois do início." };
		return { start, end };
	}
	const hours = parseInt(duration, 10) || 24;
	return { start, end: new Date(start.getTime() + hours * 60 * 60 * 1000) };
}

function ShiftFormModal({ shift, technicians, regionals, user, onClose, onSaved }) {
	const isEdit = Boolean(shift);
	// So global pode lancar plantao em qualquer regional; um supervisor/lider
	// regional so ve/escolhe a(s) propria(s) regional(is) — regionalIds ja
	// inclui a principal + extras cadastradas em Usuarios (backend valida o
	// mesmo em POST/PUT /shifts, isso aqui e so pra nao nem oferecer a opcao).
	const allowedRegionals = user?.isGlobal
		? regionals
		: regionals.filter((r) => (user?.regionalIds?.length ? user.regionalIds : [user?.regionalId]).includes(r.id));
	const [start, setStart] = useState(toInputValue(shift?.start) || "");
	const [duration, setDuration] = useState("24");
	const [customEnd, setCustomEnd] = useState(toInputValue(shift?.end) || "");
	const [regionalId, setRegionalId] = useState(shift?.regionalId || allowedRegionals[0]?.id || "");
	const [teamIds, setTeamIds] = useState(shift?.teamIds || []);
	const [notes, setNotes] = useState(shift?.notes || "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const regionalTechs = technicians.filter((t) => t.regionalId === regionalId);
	const toggleTech = (id) => setTeamIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

	const submit = async (event) => {
		event.preventDefault();
		if (!start || !regionalId) {
			setError("Informe início e regional.");
			return;
		}
		const range = computeShiftRange(start, duration, customEnd);
		if (range.error) {
			setError(range.error);
			return;
		}
		setSaving(true);
		setError("");
		try {
			const payload = { start: range.start.toISOString(), end: range.end.toISOString(), regionalId, teamIds, notes };
			const saved = isEdit ? await updateRotShift(shift.id, payload) : await createRotShift(payload);
			onSaved(saved);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o plantão.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell open title={isEdit ? "Editar plantão" : "Novo plantão"} icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Calendar size={22} /></span>} onClose={onClose} size="lg">
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Início / Dia</span>
					<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</label>
				<div>
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Duração</span>
					<div className="flex flex-wrap gap-1.5">
						{SHIFT_DURATIONS.map((option) => (
							<button
								key={option.value}
								type="button"
								onClick={() => setDuration(option.value)}
								className={`rot-btn-tactile rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${duration === option.value ? "border-orange-500 bg-orange-100 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
							>
								{option.label}
							</button>
						))}
					</div>
					{duration === "custom" ? (
						<label className="mt-2 block rounded-xl border border-slate-200 bg-slate-50 p-3">
							<span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">Término do plantão</span>
							<input type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
						</label>
					) : null}
				</div>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Regional</span>
					<select value={regionalId} onChange={(e) => { setRegionalId(e.target.value); setTeamIds([]); }} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
						{allowedRegionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
					</select>
					{!user?.isGlobal && allowedRegionals.length > 1 ? (
						<span className="mt-1 block text-[11px] font-semibold text-slate-400">Você pode lançar plantão em {allowedRegionals.length} regionais.</span>
					) : null}
				</label>
				<div>
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Equipe</span>
					<div className="flex flex-wrap gap-1.5">
						{regionalTechs.length ? regionalTechs.map((t) => (
							<button key={t.id} type="button" onClick={() => toggleTech(t.id)} className={`rot-btn-tactile rounded-lg px-3 py-1.5 text-xs font-bold ${teamIds.includes(t.id) ? "bg-orange-600 text-white" : "border border-slate-200 text-slate-600"}`}>{t.name}</button>
						)) : <p className="text-xs font-semibold text-slate-400">Nenhum técnico nesta regional.</p>}
					</div>
				</div>
				<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observações (opcional)" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">{saving ? "Salvando..." : isEdit ? "Salvar" : "Criar plantão"}</button>
				</div>
			</form>
		</ModalShell>
	);
}
