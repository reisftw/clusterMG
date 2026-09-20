import { useEffect, useState } from "react";
import { CalendarDays, Edit3, LayoutGrid, Plus, RefreshCw, Trash2 } from "lucide-react";
import { createRotHoliday, deleteRotHoliday, fetchRotHolidays, fetchRotRegionals, updateRotHoliday } from "../../api/rotApi";
import ModalShell from "../../components/ui/ModalShell";
import RotCalendar from "../../components/ui/RotCalendar";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/useRotAuth";

const TYPE_LABEL = { NATIONAL: "NACIONAL", MUNICIPAL: "MUNICIPAL", REGIONAL: "REGIONAL" };
const TYPE_TONE = {
	NATIONAL: "bg-emerald-50 text-emerald-700",
	MUNICIPAL: "bg-purple-50 text-purple-700",
	REGIONAL: "bg-blue-50 text-blue-700",
};

// O driver pg devolve coluna `date` como Date (serializada em JSON como
// ISO completo, ex.: "2026-10-12T00:00:00.000Z") — sempre normaliza pros
// 10 primeiros chars antes de remontar como data local, senão vira
// "...T00:00:00.000ZT00:00:00" (Invalid Date).
function onlyDatePart(value) {
	return String(value).slice(0, 10);
}

function formatDate(value) {
	if (!value) return "";
	return new Date(`${onlyDatePart(value)}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getWeekday(value) {
	if (!value) return "";
	return new Date(`${onlyDatePart(value)}T00:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
}

// Fiel a rot/src/pages/HolidaysPage.tsx — grid de cards por feriado,
// filtrado por regional no backend (scopeRegionalFilter).
export default function HolidaysPage() {
	const { hasPermission } = useRotAuth();
	const canManage = hasPermission("rot.holidays.manage");
	const [items, setItems] = useState([]);
	const [regionals, setRegionals] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [modal, setModal] = useState(null);
	const [visao, setVisao] = useState("calendario");
	const [mesCalendario, setMesCalendario] = useState(() => {
		const hoje = new Date();
		return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
	});

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const [holidays, regionalList] = await Promise.all([fetchRotHolidays(), fetchRotRegionals()]);
			setItems(holidays);
			setRegionals(regionalList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os feriados.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const handleDelete = async (holiday) => {
		if (!window.confirm(`Excluir o feriado "${holiday.title}"?`)) return;
		setError("");
		try {
			await deleteRotHoliday(holiday.id);
			setItems((current) => current.filter((item) => item.id !== holiday.id));
		} catch (err) {
			setError(err?.message || "Não foi possível excluir o feriado.");
		}
	};

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-3">
					<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
						<CalendarDays size={24} />
					</span>
					<div>
						<h1 className="text-2xl font-black text-slate-950">Calendário de Feriados</h1>
						<p className="text-sm font-semibold text-slate-500">{items.length} feriado(s) cadastrado(s).</p>
					</div>
				</div>
				<div className="flex gap-2">
					<div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
						<button type="button" onClick={() => setVisao("calendario")} className={`rot-btn-tactile flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase ${visao === "calendario" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
							<CalendarDays size={14} /> Calendário
						</button>
						<button type="button" onClick={() => setVisao("lista")} className={`rot-btn-tactile flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black uppercase ${visao === "lista" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
							<LayoutGrid size={14} /> Lista
						</button>
					</div>
					<button type="button" onClick={load} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
						<RefreshCw size={16} /> Atualizar
					</button>
					{canManage ? (
						<button type="button" onClick={() => setModal({ holiday: null })} className="rot-btn-tactile inline-flex h-11 items-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 hover:bg-orange-700">
							<Plus size={17} /> Adicionar Feriado
						</button>
					) : null}
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{visao === "calendario" ? (
				<RotCalendar
					items={items}
					getDateKey={(holiday) => onlyDatePart(holiday.date)}
					month={mesCalendario}
					onMonthChange={setMesCalendario}
					dotColor="bg-orange-500"
					badgeColor="bg-orange-600"
					emptyLabel="Nenhum feriado neste dia."
					renderItem={(holiday) => (
						<div key={holiday.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
							<div className="min-w-0">
								<p className="truncate text-sm font-bold text-slate-800">{holiday.title}</p>
								<span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${TYPE_TONE[holiday.type]}`}>
									{holiday.type === "MUNICIPAL"
										? `MUNICIPAL — ${regionals.flatMap((r) => r.cities || []).find((c) => c.id === holiday.cityId)?.name || "Cidade"}`
										: holiday.type === "REGIONAL"
											? `REGIONAL — ${regionals.find((r) => r.id === holiday.regionalId)?.name || "Regional"}`
											: TYPE_LABEL[holiday.type]}
								</span>
							</div>
							{canManage ? (
								<div className="flex shrink-0 gap-1">
									<button type="button" onClick={() => setModal({ holiday })} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Edit3 size={14} /></button>
									<button type="button" onClick={() => handleDelete(holiday)} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
								</div>
							) : null}
						</div>
					)}
				/>
			) : items.length ? (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{items.map((holiday) => (
						<article key={holiday.id} className="rot-card-hover group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							{canManage ? (
								<div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
									<button type="button" onClick={() => setModal({ holiday })} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600">
										<Edit3 size={15} />
									</button>
									<button type="button" onClick={() => handleDelete(holiday)} className="rot-btn-tactile flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
										<Trash2 size={15} />
									</button>
								</div>
							) : null}
							<div className="mb-3 flex items-center gap-3">
								<span className={`flex h-10 w-10 items-center justify-center rounded-lg ${TYPE_TONE[holiday.type]}`}>
									<CalendarDays size={18} />
								</span>
								<div className="min-w-0">
									<h4 className="truncate font-black text-slate-900">{holiday.title}</h4>
									<span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${TYPE_TONE[holiday.type]}`}>
										{holiday.type === "MUNICIPAL"
											? `MUNICIPAL — ${regionals.flatMap((r) => r.cities || []).find((c) => c.id === holiday.cityId)?.name || "Cidade"}`
											: holiday.type === "REGIONAL"
												? `REGIONAL — ${regionals.find((r) => r.id === holiday.regionalId)?.name || "Regional"}`
												: TYPE_LABEL[holiday.type]}
									</span>
								</div>
							</div>
							<div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
								<span className="font-semibold">Data</span>
								<div className="text-right">
									<span className="block font-black text-slate-900">{formatDate(holiday.date)}</span>
									<span className="text-xs capitalize text-slate-500">{getWeekday(holiday.date)}</span>
								</div>
							</div>
						</article>
					))}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">Nenhum feriado cadastrado.</div>
			)}

			{modal ? (
				<HolidayFormModal
					holiday={modal.holiday}
					regionals={regionals}
					onClose={() => setModal(null)}
					onSaved={(saved) => {
						setItems((current) => {
							const exists = current.some((item) => item.id === saved.id);
							return exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [...current, saved].sort((a, b) => a.date.localeCompare(b.date));
						});
						setModal(null);
					}}
				/>
			) : null}
		</div>
	);
}

function HolidayFormModal({ holiday, regionals, onClose, onSaved }) {
	const isEdit = Boolean(holiday);
	const [title, setTitle] = useState(holiday?.title || "");
	const [date, setDate] = useState(holiday?.date ? String(holiday.date).slice(0, 10) : "");
	const [type, setType] = useState(holiday?.type || "REGIONAL");
	const [regionalId, setRegionalId] = useState(holiday?.regionalId || regionals[0]?.id || "");
	const [cityId, setCityId] = useState(holiday?.cityId || "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const cities = regionals.flatMap((regional) => (regional.cities || []).map((city) => ({ ...city, regionalName: regional.name })));

	const submit = async (event) => {
		event.preventDefault();
		if (!title.trim() || !date) {
			setError("Informe título e data.");
			return;
		}
		setSaving(true);
		setError("");
		try {
			const payload = { title: title.trim(), date, type, regionalId: type === "REGIONAL" ? regionalId : null, cityId: type === "MUNICIPAL" ? cityId : null };
			const saved = isEdit ? await updateRotHoliday(holiday.id, payload) : await createRotHoliday(payload);
			onSaved(saved);
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o feriado.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<ModalShell
			open
			title={isEdit ? "Editar feriado" : "Novo feriado"}
			icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><CalendarDays size={22} /></span>}
			onClose={onClose}
			size="md"
		>
			{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
			<form onSubmit={submit} className="space-y-4">
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Título</span>
					<input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Data</span>
					<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
				</label>
				<label className="block">
					<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Tipo</span>
					<select value={type} onChange={(e) => setType(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
						<option value="NATIONAL">Nacional</option>
						<option value="REGIONAL">Regional</option>
						<option value="MUNICIPAL">Municipal</option>
					</select>
				</label>
				{type === "REGIONAL" ? (
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Regional</span>
						<select value={regionalId} onChange={(e) => setRegionalId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
							{regionals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
						</select>
					</label>
				) : null}
				{type === "MUNICIPAL" ? (
					<label className="block">
						<span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Cidade</span>
						<select value={cityId} onChange={(e) => setCityId(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
							<option value="">Selecione...</option>
							{cities.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.regionalName})</option>)}
						</select>
					</label>
				) : null}
				<div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
					<button type="button" onClick={onClose} disabled={saving} className="rot-btn-tactile rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-60">Cancelar</button>
					<button type="submit" disabled={saving} className="rot-btn-tactile rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60">
						{saving ? "Salvando..." : isEdit ? "Salvar" : "Criar feriado"}
					</button>
				</div>
			</form>
		</ModalShell>
	);
}
