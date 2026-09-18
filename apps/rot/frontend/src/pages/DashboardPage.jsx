import { AlertTriangle, Boxes, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, ClipboardCheck, Clock, Medal, PackageCheck, Palmtree, ShieldCheck, Trophy, UsersRound, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { fetchRotAbsences, fetchRotActivities, fetchRotHolidays, fetchRotOperationDashboard, fetchRotRanking, fetchRotShifts } from "../api/rotApi";
import ModalShell from "../components/ui/ModalShell";
import Spinner from "../components/ui/Spinner";
import UserAvatar from "../components/UserAvatar";
import { useRotAuth } from "../state/RotAuthContext";

const ABSENCE_TYPE_LABEL = { ferias: "Férias", folga: "Folga", atestado: "Atestado" };
const HOLIDAY_TYPE_LABEL = { NATIONAL: "Nacional", MUNICIPAL: "Municipal", REGIONAL: "Regional" };
const SHIFT_TYPE_LABEL = { plantao: "Plantão", escala: "Escala", on_call: "Sobreaviso" };

function pad2(value) {
	return String(value).padStart(2, "0");
}

// Componentes LOCAIS (nao toISOString, que joga pra UTC e perto da
// meia-noite local pode empurrar "hoje" pro dia seguinte) — mesmo
// cuidado documentado em FinanCalendarWeekStrip.jsx.
function dateObjKey(date) {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function dateKey(value) {
	return String(value || "").slice(0, 10);
}

function todayKey() {
	return dateObjKey(new Date());
}

function todayStart() {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
}

function sundayOf(date) {
	const d = new Date(date);
	d.setDate(d.getDate() - d.getDay());
	d.setHours(0, 0, 0, 0);
	return d;
}

function buildWeekDays(sunday) {
	return Array.from({ length: 7 }, (_, index) => {
		const date = new Date(sunday);
		date.setDate(sunday.getDate() + index);
		return date;
	});
}

function formatShortDate(value) {
	if (!value) return "";
	return new Date(`${dateKey(value)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatLongDate(value) {
	if (!value) return "";
	return new Date(`${dateKey(value)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatDateTime(value) {
	if (!value) return "";
	return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Todas as datas (YYYY-MM-DD) entre start e end, inclusive — usado pra
// espalhar ausencias de varios dias pelas colunas certas da semana.
function eachDateKeyBetween(startValue, endValue) {
	const keys = [];
	const start = new Date(`${dateKey(startValue)}T00:00:00`);
	const end = new Date(`${dateKey(endValue || startValue)}T00:00:00`);
	if (Number.isNaN(start.getTime())) return keys;
	const cursor = new Date(start);
	let guard = 0;
	while (cursor <= end && guard < 400) {
		keys.push(dateObjKey(cursor));
		cursor.setDate(cursor.getDate() + 1);
		guard += 1;
	}
	return keys;
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DASHBOARD_LABELS = { ROT: "Dashboard ROT", FIELD: "Dashboard Field", DELIVERY: "Dashboard Delivery" };
const OPERATION_SCOPE_LABELS = { ROT: "ROT", FIELD: "Field", DELIVERY: "Delivery", FIELD_SERVICE: "Field" };
const DASHBOARD_LIST_PAGE_SIZE = 5;

function normalizeDashboardScope(value) {
	const normalized = String(value || "").toUpperCase();
	if (normalized === "FIELD_SERVICE") return "FIELD";
	if (["ROT", "FIELD", "DELIVERY"].includes(normalized)) return normalized;
	return "";
}

function isLeadershipUser(user) {
	if (!user) return false;
	if (user.isAdmin || user.permissions?.includes("*")) return true;
	const haystack = `${user.role || ""} ${user.roleName || ""}`.toLowerCase();
	return ["supervisor", "lider", "líder", "coordenador", "gerente", "gestor"].some((term) => haystack.includes(term));
}

// Dashboard da Operação preenchido com dados reais dos modulos ja migrados —
// ranking, proximos plantoes, quem esta de ferias/afastado, proximos
// feriados e uma faixa de calendario da semana (mesmo padrao
// visual/funcional do FinanCalendarWeekStrip do Finan, adaptado pra
// semana inteira Dom-Sab por causa da natureza 24/7 da operacao de
// campo). O cabecalho de saudacao/data NAO aparece aqui de novo — a
// topbar (Shell.jsx) ja mostra "Ola, {nome}" e a data por cima de toda
// pagina, repetir isso no corpo era informacao duplicada (feedback
// direto do usuario). Cada card e cada dia da semana sao clicaveis e
// abrem um modal com a lista completa (nao so o preview truncado).
// Tudo montado no cliente reaproveitando os endpoints que os modulos
// (Ranking/Escala/Ausencias/Feriados/Atividades) ja expõem, sem rota
// nova no backend nem duplicar a regra de escopo regional (que ja vem
// aplicada em cada resposta).
export default function DashboardPage() {
	const { hasPermission, user } = useRotAuth();
	const canRank = hasPermission("rot.ranking.view");
	const canShift = ["rot.shifts.view", "rot.shifts.manage"].some(hasPermission);
	const canAbsence = ["rot.absences.view", "rot.absences.manage", "rot.timeoff.view", "rot.timeoff.approve", "rot.vacations.view", "rot.vacations.approve"].some(hasPermission);
	const canActivity = ["rot.activities.view", "rot.activities.manage"].some(hasPermission);
	const canRompimento = ["rot.rompimentos.view", "rot.rompimentos.manage"].some(hasPermission);
	const dashboardOptions = useMemo(() => {
		if (user?.isAdmin) return ["ROT", "FIELD", "DELIVERY"];
		const scopes = (user?.operationScopes || ["ROT"]).map(normalizeDashboardScope).filter(Boolean);
		return [...new Set(scopes)].length ? [...new Set(scopes)] : ["ROT"];
	}, [user]);
	const [activeDashboard, setActiveDashboard] = useState(() => dashboardOptions[0] || "ROT");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [ranking, setRanking] = useState([]);
	const [shifts, setShifts] = useState({ items: [], technicians: [] });
	const [absences, setAbsences] = useState({ items: [], users: [] });
	const [holidays, setHolidays] = useState([]);
	const [activities, setActivities] = useState({ items: [], technicians: [] });
	const [weekSunday, setWeekSunday] = useState(() => sundayOf(new Date()));
	const [modal, setModal] = useState(null);

	useEffect(() => {
		if (!dashboardOptions.includes(activeDashboard)) setActiveDashboard(dashboardOptions[0] || "ROT");
	}, [activeDashboard, dashboardOptions]);

	useEffect(() => {
		let active = true;
		(async () => {
			if (activeDashboard !== "ROT") {
				setLoading(false);
				return;
			}
			setLoading(true);
			setError("");
			try {
				const now = new Date();
				const firstOfMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
				const [rankingData, shiftsData, absencesData, holidaysData, activitiesData] = await Promise.all([
					canRank ? fetchRotRanking({ dataInicio: firstOfMonth, dataFim: dateObjKey(now) }) : [],
					canShift ? fetchRotShifts() : { items: [], technicians: [] },
					canAbsence ? fetchRotAbsences() : { items: [], users: [] },
					fetchRotHolidays(),
					canActivity ? fetchRotActivities() : { items: [], technicians: [] },
				]);
				if (!active) return;
				setRanking(rankingData);
				setShifts(shiftsData);
				setAbsences(absencesData);
				setHolidays(holidaysData);
				setActivities(activitiesData);
			} catch (err) {
				if (active) setError(err?.message || "Não foi possível carregar os dados do dashboard.");
			} finally {
				if (active) setLoading(false);
			}
		})();
		return () => {
			active = false;
		};
	}, [activeDashboard, canRank, canShift, canAbsence, canActivity]);

	const rankingSorted = useMemo(() => [...ranking].sort((a, b) => b.points - a.points), [ranking]);

	const upcomingShiftsAll = useMemo(() => {
		const now = new Date();
		const techById = Object.fromEntries((shifts.technicians || []).map((t) => [t.id, t.name]));
		return (shifts.items || [])
			.filter((s) => new Date(s.end) >= now)
			.sort((a, b) => new Date(a.start) - new Date(b.start))
			.map((s) => ({ ...s, teamNames: (s.teamIds || []).map((id) => techById[id]).filter(Boolean) }));
	}, [shifts]);

	const absencesAll = useMemo(() => {
		const today = todayStart();
		const limit = new Date(today);
		limit.setDate(limit.getDate() + 30);
		return (absences.items || [])
			.filter((a) => a.status === "aprovado")
			.filter((a) => new Date(`${dateKey(a.endDate)}T23:59:59`) >= today && new Date(`${dateKey(a.startDate)}T00:00:00`) <= limit)
			.sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
			.map((a) => ({ ...a, active: new Date(`${dateKey(a.startDate)}T00:00:00`) <= today }));
	}, [absences]);

	const holidaysAll = useMemo(() => {
		const today = todayStart();
		return (holidays || [])
			.filter((h) => new Date(`${dateKey(h.date)}T00:00:00`) >= today)
			.sort((a, b) => new Date(a.date) - new Date(b.date));
	}, [holidays]);

	const weekDays = useMemo(() => buildWeekDays(weekSunday), [weekSunday]);
	const monthLabel = useMemo(() => {
		const label = weekSunday.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
		return label.charAt(0).toUpperCase() + label.slice(1);
	}, [weekSunday]);

	const weekByDay = useMemo(() => {
		const map = {};
		for (const day of weekDays) map[dateObjKey(day)] = { activities: [], shifts: [], absences: [], holidays: [] };
		for (const activity of activities.items || []) {
			const key = dateKey(activity.date);
			if (map[key]) map[key].activities.push(activity);
		}
		for (const shift of shifts.items || []) {
			const key = dateKey(shift.start);
			if (map[key]) map[key].shifts.push(shift);
		}
		for (const absence of absences.items || []) {
			if (absence.status !== "aprovado") continue;
			for (const key of eachDateKeyBetween(absence.startDate, absence.endDate)) {
				if (map[key]) map[key].absences.push(absence);
			}
		}
		for (const holiday of holidays || []) {
			const key = dateKey(holiday.date);
			if (map[key]) map[key].holidays.push(holiday);
		}
		return map;
	}, [weekDays, activities, shifts, absences, holidays]);

	const selector = <DashboardSwitcher options={dashboardOptions} active={activeDashboard} onChange={setActiveDashboard} />;

	if (activeDashboard !== "ROT") {
		return (
			<div className="space-y-6">
				{selector}
				<OperationDashboard operation={activeDashboard} />
			</div>
		);
	}

	if (loading) return <Spinner fullScreen />;

	return (
		<div className="space-y-6">
			{selector}
			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
				<div className="min-w-0">
					<h1 className="text-lg font-black text-slate-950">Ações de campo</h1>
					<p className="text-sm font-semibold text-slate-500">Registre APR e abra rompimentos direto pela dashboard.</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<NavLink
						to="/apr?novo=1"
						className="rot-btn-tactile rot-apr-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-black"
					>
						<ShieldCheck size={18} />
						<span>Enviar APR</span>
					</NavLink>
					{canRompimento ? (
						<NavLink
							to="/rompimentos?novo=1"
							className="rot-btn-tactile inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white shadow-lg shadow-red-200 hover:bg-red-700"
						>
							<Zap size={18} />
							<span>Novo Rompimento</span>
						</NavLink>
					) : null}
				</div>
			</section>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
				<DashboardCard visible={canRank} icon={Trophy} title="Ranking do mês" tone="bg-amber-50 text-amber-600" linkTo="/ranking" onOpen={() => setModal({ type: "ranking" })}>
					{rankingSorted.length ? (
						<ul className="space-y-2">
							{rankingSorted.slice(0, 5).map((row, index) => (
								<li key={row.id} className="flex items-center gap-2.5">
									<span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${index === 0 ? "bg-amber-400 text-amber-950" : "bg-slate-100 text-slate-500"}`}>
										{index === 0 ? <Medal size={12} /> : index + 1}
									</span>
									<UserAvatar src={row.avatarUrl} name={row.name} className="flex h-7 w-7 shrink-0 overflow-hidden rounded-full bg-blue-600 text-[10px] font-black text-white" />
									<span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">{row.name}</span>
									<span className="shrink-0 text-xs font-black text-amber-600">{row.points} pts</span>
								</li>
							))}
						</ul>
					) : (
						<EmptyMini label="Sem chamados pontuados neste mês." />
					)}
				</DashboardCard>

				<DashboardCard visible={canShift} icon={Clock} title="Próximos plantões" tone="bg-purple-50 text-purple-600" linkTo="/turnos" onOpen={() => setModal({ type: "shifts" })}>
					{upcomingShiftsAll.length ? (
						<ul className="space-y-2.5">
							{upcomingShiftsAll.slice(0, 5).map((s) => (
								<li key={s.id} className="rounded-xl bg-slate-50 p-2.5">
									<div className="flex items-center justify-between gap-2">
										<span className="text-[10px] font-black uppercase text-purple-600">{SHIFT_TYPE_LABEL[s.tipo] || s.tipo}</span>
										<span className="text-[10px] font-bold text-slate-400">{formatDateTime(s.start)}</span>
									</div>
									<p className="mt-1 truncate text-xs font-semibold text-slate-600">
										{s.teamNames.length ? s.teamNames.join(", ") : "Sem equipe definida"}
									</p>
								</li>
							))}
						</ul>
					) : (
						<EmptyMini label="Nenhum plantão programado." />
					)}
				</DashboardCard>

				<DashboardCard visible={canAbsence} icon={Palmtree} title="Férias e afastamentos" tone="bg-blue-50 text-blue-600" linkTo="/ausencias" onOpen={() => setModal({ type: "absences" })}>
					{absencesAll.length ? (
						<ul className="space-y-2.5">
							{absencesAll.slice(0, DASHBOARD_LIST_PAGE_SIZE).map((a) => (
								<li key={a.id} className="rounded-xl bg-slate-50 p-2.5">
									<div className="flex items-center justify-between gap-2">
										<span className="truncate text-xs font-black text-slate-800">{a.userName}</span>
										<span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${a.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
											{a.active ? "Agora" : "Em breve"}
										</span>
									</div>
									<p className="mt-1 text-[11px] font-bold text-slate-500">
										{ABSENCE_TYPE_LABEL[a.type] || a.type} · {formatShortDate(a.startDate)} - {formatShortDate(a.endDate)}
									</p>
								</li>
							))}
						</ul>
					) : (
						<EmptyMini label="Ninguém de férias ou afastado no momento." />
					)}
				</DashboardCard>

				<DashboardCard icon={CalendarDays} title="Próximos feriados" tone="bg-orange-50 text-orange-600" linkTo="/feriados" onOpen={() => setModal({ type: "holidays" })}>
					{holidaysAll.length ? (
						<ul className="space-y-2.5">
							{holidaysAll.slice(0, 5).map((h) => (
								<li key={h.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-2.5">
									<span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">{h.title}</span>
									<span className="shrink-0 text-[10px] font-black text-orange-600">{formatShortDate(h.date)}</span>
								</li>
							))}
						</ul>
					) : (
						<EmptyMini label="Nenhum feriado nos próximos dias." />
					)}
				</DashboardCard>
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
					<h2 className="flex items-center gap-2 text-base font-black text-slate-950">
						<CalendarRange size={18} className="text-blue-600" />
						Semana · {monthLabel}
					</h2>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setWeekSunday((current) => { const next = new Date(current); next.setDate(current.getDate() - 7); return next; })}
							className="rot-btn-tactile inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
							aria-label="Semana anterior"
						>
							<ChevronLeft size={16} />
						</button>
						<button
							type="button"
							onClick={() => setWeekSunday(sundayOf(new Date()))}
							className="rot-btn-tactile rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
						>
							Hoje
						</button>
						<button
							type="button"
							onClick={() => setWeekSunday((current) => { const next = new Date(current); next.setDate(current.getDate() + 7); return next; })}
							className="rot-btn-tactile inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
							aria-label="Próxima semana"
						>
							<ChevronRight size={16} />
						</button>
					</div>
				</div>

				<div className="mb-3 flex flex-wrap gap-3 text-[10px] font-bold uppercase text-slate-500">
					<Legend color="bg-blue-500" label="Agenda" />
					<Legend color="bg-purple-500" label="Plantão" />
					<Legend color="bg-orange-500" label="Férias/Ausência" />
					<Legend color="bg-red-500" label="Feriado" />
				</div>

				<div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
					{weekDays.map((date, index) => {
						const key = dateObjKey(date);
						const isToday = key === todayKey();
						const day = weekByDay[key] || { activities: [], shifts: [], absences: [], holidays: [] };
						const total = day.activities.length + day.shifts.length + day.absences.length + day.holidays.length;
						return (
							<button
								key={key}
								type="button"
								onClick={() => setModal({ type: "day", dateKey: key, date, data: day })}
								className={`rot-btn-tactile rounded-xl border p-2.5 text-left transition ${
									isToday ? "border-blue-300 bg-blue-50" : day.holidays.length ? "border-red-200 bg-red-50/40" : "border-slate-100 bg-slate-50 hover:bg-blue-50/60"
								}`}
							>
								<p className="text-[10px] font-bold uppercase text-slate-400">{WEEKDAY_LABELS[index]}</p>
								<p className="text-sm font-black text-slate-800">{date.getDate()}</p>
								{day.holidays.length ? (
									<p className="mt-0.5 truncate text-[9px] font-black uppercase text-red-600">{day.holidays[0].title}</p>
								) : null}
								<div className="mt-2 space-y-1">
									{[
										...day.activities.map((item) => ({ id: `atv-${item.id}`, color: "bg-blue-500", label: item.clientName })),
										...day.shifts.map((item) => ({ id: `sft-${item.id}`, color: "bg-purple-500", label: SHIFT_TYPE_LABEL[item.tipo] || item.tipo })),
										...day.absences.map((item) => ({ id: `abs-${item.id}`, color: "bg-orange-500", label: item.userName })),
									].slice(0, DASHBOARD_LIST_PAGE_SIZE).map((item) => (
										<WeekChip key={item.id} color={item.color} label={item.label} />
									))}
									{total > DASHBOARD_LIST_PAGE_SIZE ? <p className="text-[9px] font-bold text-slate-400">+{total - DASHBOARD_LIST_PAGE_SIZE} mais</p> : null}
									{!total ? <p className="text-[10px] text-slate-300">—</p> : null}
								</div>
							</button>
						);
					})}
				</div>
			</div>

			{modal ? <DashboardModal modal={modal} onClose={() => setModal(null)} rankingSorted={rankingSorted} upcomingShiftsAll={upcomingShiftsAll} absencesAll={absencesAll} holidaysAll={holidaysAll} /> : null}
		</div>
	);
}

function DashboardSwitcher({ options, active, onChange }) {
	if (!options?.length || options.length === 1) return null;
	return (
		<section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
			<div className="min-w-0">
				<p className="text-[10px] font-black uppercase tracking-wider text-blue-600">Dashboard por operação</p>
				<h1 className="text-lg font-black text-slate-950">{DASHBOARD_LABELS[active] || "Dashboard"}</h1>
			</div>
			<div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1">
				{options.map((option) => (
					<button
						key={option}
						type="button"
						onClick={() => onChange(option)}
						className={`rot-btn-tactile rounded-xl px-3 py-2 text-xs font-black transition ${
							active === option ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:bg-white/70"
						}`}
					>
						{OPERATION_SCOPE_LABELS[option] || option}
					</button>
				))}
			</div>
		</section>
	);
}

function OperationDashboard({ operation }) {
	const { user } = useRotAuth();
	const canSeeManagement = isLeadershipUser(user);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [data, setData] = useState(null);
	const [weekSunday, setWeekSunday] = useState(() => sundayOf(new Date()));
	const [modal, setModal] = useState(null);

	useEffect(() => {
		let active = true;
		setLoading(true);
		setError("");
		fetchRotOperationDashboard(operation)
			.then((payload) => {
				if (active) setData(payload);
			})
			.catch((err) => {
				if (active) setError(err?.message || "Não foi possível carregar a dashboard da operação.");
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [operation]);

	const eventsByDay = useMemo(() => {
		const map = {};
		for (const day of buildWeekDays(weekSunday)) map[dateObjKey(day)] = [];
		for (const event of data?.weekEvents || []) {
			const key = dateKey(event.date);
			if (map[key]) map[key].push(event);
		}
		return map;
	}, [data, weekSunday]);

	const weekDays = useMemo(() => buildWeekDays(weekSunday), [weekSunday]);
	const monthLabel = useMemo(() => {
		const label = weekSunday.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
		return label.charAt(0).toUpperCase() + label.slice(1);
	}, [weekSunday]);
	const isField = operation === "FIELD";
	const title = isField ? "Dashboard Field" : "Dashboard Delivery";

	if (loading) return <Spinner fullScreen={false} />;

	return (
		<div className="space-y-6">
			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			<section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
				<div className="min-w-0">
					<h1 className="text-lg font-black text-slate-950">{title}</h1>
					<p className="text-sm font-semibold text-slate-500">Acertos, uso de materiais, APR e checklists da semana.</p>
				</div>
				<NavLink
					to="/apr?novo=1"
					className="rot-btn-tactile rot-apr-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-black"
				>
					<ShieldCheck size={18} />
					<span>Enviar APR</span>
				</NavLink>
			</section>

			<div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${canSeeManagement ? "xl:grid-cols-5" : "xl:grid-cols-3"}`}>
				<MetricCard icon={ClipboardCheck} title="Acertos da semana" value={data?.stats?.adjustmentsWeek || 0} tone="bg-blue-50 text-blue-600" />
				<MetricCard icon={UsersRound} title="Técnicos ativos" value={data?.stats?.activeTechnicians || 0} tone="bg-emerald-50 text-emerald-600" />
				<MetricCard icon={ShieldCheck} title="APR enviadas" value={data?.stats?.aprWeek || 0} tone="bg-cyan-50 text-cyan-600" />
				{canSeeManagement ? <MetricCard icon={AlertTriangle} title="Checklists pendentes" value={data?.stats?.checklistAlerts || 0} tone={(data?.stats?.checklistAlerts || 0) ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"} /> : null}
				{canSeeManagement ? <MetricCard icon={PackageCheck} title="Checklists feitos" value={data?.stats?.checklistsDone || 0} tone="bg-purple-50 text-purple-600" /> : null}
			</div>

			{canSeeManagement ? <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
				<UsageLeaderCard icon={Zap} title="Mais utilizou fibra" data={data?.topFiber} empty="Sem fibra lançada nesta semana." tone="bg-orange-50 text-orange-600" />
				<UsageLeaderCard icon={Boxes} title="Mais utilizou equipamento" data={data?.topEquipment} empty="Sem equipamento lançado nesta semana." tone="bg-indigo-50 text-indigo-600" />
				<SupervisorChecklistCard items={data?.supervisorChecklists || []} />
			</div> : null}

			<div className={`grid grid-cols-1 gap-4 ${canSeeManagement ? "xl:grid-cols-[1.1fr_0.9fr]" : ""}`}>
				<RecentAdjustmentsCard items={data?.recentAdjustments || []} onOpen={() => setModal({ type: "recentAdjustments", items: data?.recentAdjustments || [] })} />
				{canSeeManagement ? <ChecklistAlertsCard items={data?.checklistAlerts || []} onOpen={() => setModal({ type: "checklistAlerts", items: data?.checklistAlerts || [] })} /> : null}
			</div>

			<OperationWeekCalendar
				weekDays={weekDays}
				eventsByDay={eventsByDay}
				monthLabel={monthLabel}
				setWeekSunday={setWeekSunday}
				onOpenDay={(payload) => setModal(payload)}
			/>

			{modal?.type === "day" ? (
				<ModalShell
					open
					title={formatLongDate(modal.dateKey)}
					description={`${modal.items.length} registro(s) nesta operação`}
					icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><CalendarRange size={22} /></span>}
					onClose={() => setModal(null)}
					size="md"
				>
					{modal.items.length ? (
						<PaginatedList items={modal.items}>
							{(pageItems) => (
								<ul className="space-y-2">
									{pageItems.map((item) => (
								<li key={item.id} className="rounded-xl bg-slate-50 p-3">
									<p className="text-sm font-black text-slate-800">{item.title}</p>
									<p className="text-xs font-semibold text-slate-500">{item.description}</p>
								</li>
									))}
								</ul>
							)}
						</PaginatedList>
					) : (
						<EmptyMini label="Nada registrado neste dia." />
					)}
				</ModalShell>
			) : null}
			{modal?.type === "recentAdjustments" ? (
				<DashboardListModal
					title="Últimos acertos da semana"
					items={modal.items}
					onClose={() => setModal(null)}
					renderItem={(item) => (
						<li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
							<div className="min-w-0">
								<p className="truncate text-sm font-black text-slate-800">{item.technicianName}</p>
								<p className="truncate text-xs font-semibold text-slate-500">{item.companyName || item.regionalName || "Sem empresa informada"} · {item.itemsCount} item(ns)</p>
							</div>
							<div className="shrink-0 text-right">
								<p className="text-xs font-black text-blue-600">{formatShortDate(item.date)}</p>
								<p className="text-[10px] font-bold text-slate-400">{item.status}</p>
							</div>
						</li>
					)}
				/>
			) : null}
			{modal?.type === "checklistAlerts" ? (
				<DashboardListModal
					title="Alertas de checklist"
					items={modal.items}
					onClose={() => setModal(null)}
					renderItem={(item) => (
						<li key={item.id} className={`rounded-xl border p-3 ${item.severity === "overdue" ? "border-red-100 bg-red-50" : "border-amber-100 bg-amber-50"}`}>
							<div className="flex items-center justify-between gap-2">
								<p className="truncate text-sm font-black text-slate-800">{item.name}</p>
								<span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${item.severity === "overdue" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
									{item.severity === "overdue" ? "Vencido" : "Pendente"}
								</span>
							</div>
							<p className="mt-1 text-xs font-semibold text-slate-500">{item.regionalName || item.statusName || "Sem regional"} · {item.nextInspectionAt ? formatDateTime(item.nextInspectionAt) : "Sem data prevista"}</p>
						</li>
					)}
				/>
			) : null}
		</div>
	);
}

function MetricCard({ icon: Icon, title, value, tone }) {
	return (
		<div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex items-center gap-3">
				<span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
					<Icon size={20} />
				</span>
				<div className="min-w-0">
					<p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{title}</p>
					<p className="text-2xl font-black text-slate-950">{value}</p>
				</div>
			</div>
		</div>
	);
}

function UsageLeaderCard({ icon: Icon, title, data, empty, tone }) {
	const topItems = data?.items ? Object.entries(data.items).sort((a, b) => b[1] - a[1]).slice(0, DASHBOARD_LIST_PAGE_SIZE) : [];
	return (
		<div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="mb-3 flex items-center gap-2">
				<span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
					<Icon size={18} />
				</span>
				<h3 className="text-xs font-black uppercase tracking-wide text-slate-700">{title}</h3>
			</div>
			{data ? (
				<div>
					<p className="truncate text-lg font-black text-slate-950">{data.name}</p>
					<p className="text-sm font-bold text-slate-500">{data.quantity.toLocaleString("pt-BR")} unidade(s)</p>
					{topItems.length ? (
						<ul className="mt-3 space-y-1.5">
							{topItems.map(([name, quantity]) => (
								<li key={name} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
									<span className="truncate">{name}</span>
									<span className="shrink-0 text-slate-900">{quantity.toLocaleString("pt-BR")}</span>
								</li>
							))}
						</ul>
					) : null}
				</div>
			) : (
				<EmptyMini label={empty} />
			)}
		</div>
	);
}

function RecentAdjustmentsCard({ items, onOpen }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<CardTitleWithMore title="Últimos acertos da semana" count={items.length} onOpen={onOpen} />
			{items.length ? (
				<ul className="space-y-2">
					{items.slice(0, DASHBOARD_LIST_PAGE_SIZE).map((item) => (
						<li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
							<div className="min-w-0">
								<p className="truncate text-sm font-black text-slate-800">{item.technicianName}</p>
								<p className="truncate text-xs font-semibold text-slate-500">{item.companyName || item.regionalName || "Sem empresa informada"} · {item.itemsCount} item(ns)</p>
							</div>
							<div className="shrink-0 text-right">
								<p className="text-xs font-black text-blue-600">{formatShortDate(item.date)}</p>
								<p className="text-[10px] font-bold text-slate-400">{item.status}</p>
							</div>
						</li>
					))}
				</ul>
			) : (
				<EmptyMini label="Sem acertos registrados nesta semana." />
			)}
		</div>
	);
}

function ChecklistAlertsCard({ items, onOpen }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<CardTitleWithMore title="Alertas de checklist" count={items.length} onOpen={onOpen} />
			{items.length ? (
				<ul className="space-y-2">
					{items.slice(0, DASHBOARD_LIST_PAGE_SIZE).map((item) => (
						<li key={item.id} className={`rounded-xl border p-3 ${item.severity === "overdue" ? "border-red-100 bg-red-50" : "border-amber-100 bg-amber-50"}`}>
							<div className="flex items-center justify-between gap-2">
								<p className="truncate text-sm font-black text-slate-800">{item.name}</p>
								<span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${item.severity === "overdue" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
									{item.severity === "overdue" ? "Vencido" : "Pendente"}
								</span>
							</div>
							<p className="mt-1 text-xs font-semibold text-slate-500">{item.regionalName || item.statusName || "Sem regional"} · {item.nextInspectionAt ? formatDateTime(item.nextInspectionAt) : "Sem data prevista"}</p>
						</li>
					))}
				</ul>
			) : (
				<EmptyMini label="Nenhum checklist vencendo ou pendente." />
			)}
		</div>
	);
}

function SupervisorChecklistCard({ items }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<h3 className="mb-3 text-sm font-black text-slate-950">Checklists por supervisor</h3>
			{items.length ? (
				<ul className="space-y-2">
					{items.slice(0, DASHBOARD_LIST_PAGE_SIZE).map((item) => (
						<li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
							<span className="min-w-0 truncate text-xs font-black text-slate-700">{item.name}</span>
							<span className="shrink-0 rounded-full bg-purple-100 px-2.5 py-1 text-[10px] font-black text-purple-700">{item.total}</span>
						</li>
					))}
				</ul>
			) : (
				<EmptyMini label="Nenhum checklist concluído nesta semana." />
			)}
		</div>
	);
}

function OperationWeekCalendar({ weekDays, eventsByDay, monthLabel, setWeekSunday, onOpenDay }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<h2 className="flex items-center gap-2 text-base font-black text-slate-950">
					<CalendarRange size={18} className="text-blue-600" />
					Semana · {monthLabel}
				</h2>
				<div className="flex items-center gap-2">
					<button type="button" onClick={() => setWeekSunday((current) => { const next = new Date(current); next.setDate(current.getDate() - 7); return next; })} className="rot-btn-tactile inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Semana anterior">
						<ChevronLeft size={16} />
					</button>
					<button type="button" onClick={() => setWeekSunday(sundayOf(new Date()))} className="rot-btn-tactile rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
						Hoje
					</button>
					<button type="button" onClick={() => setWeekSunday((current) => { const next = new Date(current); next.setDate(current.getDate() + 7); return next; })} className="rot-btn-tactile inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Próxima semana">
						<ChevronRight size={16} />
					</button>
				</div>
			</div>

			<div className="mb-3 flex flex-wrap gap-3 text-[10px] font-bold uppercase text-slate-500">
				<Legend color="bg-blue-500" label="Acerto" />
				<Legend color="bg-purple-500" label="Checklist" />
			</div>

			<div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
				{weekDays.map((date, index) => {
					const key = dateObjKey(date);
					const isToday = key === todayKey();
					const items = eventsByDay[key] || [];
					return (
						<button
							key={key}
							type="button"
							onClick={() => onOpenDay({ dateKey: key, items })}
							className={`rot-btn-tactile rounded-xl border p-2.5 text-left transition ${isToday ? "border-blue-300 bg-blue-50" : "border-slate-100 bg-slate-50 hover:bg-blue-50/60"}`}
						>
							<p className="text-[10px] font-bold uppercase text-slate-400">{WEEKDAY_LABELS[index]}</p>
							<p className="text-sm font-black text-slate-800">{date.getDate()}</p>
							<div className="mt-2 space-y-1">
								{items.slice(0, DASHBOARD_LIST_PAGE_SIZE).map((item) => (
									<WeekChip key={item.id} color={item.type === "checklist" ? "bg-purple-500" : "bg-blue-500"} label={item.title} />
								))}
								{items.length > DASHBOARD_LIST_PAGE_SIZE ? <p className="text-[9px] font-bold text-slate-400">+{items.length - DASHBOARD_LIST_PAGE_SIZE} mais</p> : null}
								{!items.length ? <p className="text-[10px] text-slate-300">—</p> : null}
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

function DashboardModal({ modal, onClose, rankingSorted, upcomingShiftsAll, absencesAll, holidaysAll }) {
	if (modal.type === "ranking") {
		return (
			<ModalShell open title="Ranking do mês" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Trophy size={22} /></span>} onClose={onClose} size="md">
				{rankingSorted.length ? (
					<PaginatedList items={rankingSorted}>
						{(pageItems, startIndex) => (
							<ul className="space-y-2">
								{pageItems.map((row, index) => (
							<li key={row.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
								<span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${startIndex + index === 0 ? "bg-amber-400 text-amber-950" : "bg-slate-200 text-slate-600"}`}>
									{startIndex + index === 0 ? <Medal size={14} /> : startIndex + index + 1}
								</span>
								<UserAvatar src={row.avatarUrl} name={row.name} className="flex h-9 w-9 shrink-0 overflow-hidden rounded-full bg-blue-600 text-xs font-black text-white" />
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-black text-slate-800">{row.name}</p>
									<p className="text-[11px] font-semibold text-slate-400">{row.roleName || row.role}</p>
								</div>
								<div className="shrink-0 text-right">
									<p className="text-sm font-black text-amber-600">{row.points} pts</p>
									<p className="text-[10px] font-bold text-slate-400">{row.ticketsCount} chamado(s)</p>
								</div>
							</li>
								))}
							</ul>
						)}
					</PaginatedList>
				) : (
					<EmptyMini label="Sem chamados pontuados neste mês." />
				)}
			</ModalShell>
		);
	}

	if (modal.type === "shifts") {
		return (
			<ModalShell open title="Próximos plantões" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-600"><Clock size={22} /></span>} onClose={onClose} size="md">
				{upcomingShiftsAll.length ? (
					<PaginatedList items={upcomingShiftsAll}>
						{(pageItems) => (
							<ul className="space-y-2.5">
								{pageItems.map((s) => (
							<li key={s.id} className="rounded-xl bg-slate-50 p-3">
								<div className="flex items-center justify-between gap-2">
									<span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-black uppercase text-purple-700">{SHIFT_TYPE_LABEL[s.tipo] || s.tipo}</span>
									<span className="text-[11px] font-bold text-slate-500">{formatDateTime(s.start)} → {formatDateTime(s.end)}</span>
								</div>
								<p className="mt-1.5 text-xs font-semibold text-slate-600">{s.teamNames.length ? s.teamNames.join(", ") : "Sem equipe definida"}</p>
								{s.notes ? <p className="mt-1 text-[11px] italic text-slate-400">{s.notes}</p> : null}
							</li>
								))}
							</ul>
						)}
					</PaginatedList>
				) : (
					<EmptyMini label="Nenhum plantão programado." />
				)}
			</ModalShell>
		);
	}

	if (modal.type === "absences") {
		return (
			<ModalShell open title="Férias e afastamentos" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Palmtree size={22} /></span>} onClose={onClose} size="md">
				{absencesAll.length ? (
					<PaginatedList items={absencesAll}>
						{(pageItems) => (
							<ul className="space-y-2.5">
								{pageItems.map((a) => (
							<li key={a.id} className="rounded-xl bg-slate-50 p-3">
								<div className="flex items-center justify-between gap-2">
									<span className="text-sm font-black text-slate-800">{a.userName}</span>
									<span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${a.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
										{a.active ? "Em curso" : "Em breve"}
									</span>
								</div>
								<p className="mt-1 text-[11px] font-bold text-slate-500">
									{ABSENCE_TYPE_LABEL[a.type] || a.type} · {formatLongDate(a.startDate)} até {formatLongDate(a.endDate)}
								</p>
								{a.reason ? <p className="mt-1 text-[11px] italic text-slate-400">"{a.reason}"</p> : null}
							</li>
								))}
							</ul>
						)}
					</PaginatedList>
				) : (
					<EmptyMini label="Ninguém de férias ou afastado no momento." />
				)}
			</ModalShell>
		);
	}

	if (modal.type === "holidays") {
		return (
			<ModalShell open title="Próximos feriados" icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><CalendarDays size={22} /></span>} onClose={onClose} size="md">
				{holidaysAll.length ? (
					<PaginatedList items={holidaysAll}>
						{(pageItems) => (
							<ul className="space-y-2">
								{pageItems.map((h) => (
							<li key={h.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
								<div className="min-w-0">
									<p className="truncate text-sm font-bold text-slate-800">{h.title}</p>
									<span className="text-[10px] font-black uppercase text-slate-400">{HOLIDAY_TYPE_LABEL[h.type] || h.type}</span>
								</div>
								<span className="shrink-0 text-xs font-black text-orange-600">{formatLongDate(h.date)}</span>
							</li>
								))}
							</ul>
						)}
					</PaginatedList>
				) : (
					<EmptyMini label="Nenhum feriado nos próximos dias." />
				)}
			</ModalShell>
		);
	}

	if (modal.type === "day") {
		const { data } = modal;
		const total = data.activities.length + data.shifts.length + data.absences.length + data.holidays.length;
		return (
			<ModalShell
				open
				title={formatLongDate(modal.dateKey)}
				description={`${total} registro(s) neste dia`}
				icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><CalendarRange size={22} /></span>}
				onClose={onClose}
				size="lg"
			>
				<div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
					{data.holidays.length ? (
						<DaySection title="Feriado" color="bg-red-500">
							{data.holidays.map((h) => (
								<p key={h.id} className="text-sm font-bold text-slate-700">{h.title} <span className="text-xs font-semibold text-slate-400">({HOLIDAY_TYPE_LABEL[h.type] || h.type})</span></p>
							))}
						</DaySection>
					) : null}
					{data.activities.length ? (
						<DaySection title="Agenda" color="bg-blue-500">
							{data.activities.map((item) => (
								<div key={item.id} className="rounded-xl bg-slate-50 p-3">
									<p className="text-sm font-black text-slate-800">{item.clientName}</p>
									<p className="text-[11px] font-semibold text-slate-500">{item.time ? `às ${item.time}` : ""} {item.userName ? `· ${item.userName}` : ""}</p>
								</div>
							))}
						</DaySection>
					) : null}
					{data.shifts.length ? (
						<DaySection title="Plantão" color="bg-purple-500">
							{data.shifts.map((s) => (
								<div key={s.id} className="rounded-xl bg-slate-50 p-3">
									<p className="text-xs font-black uppercase text-purple-700">{SHIFT_TYPE_LABEL[s.tipo] || s.tipo}</p>
									<p className="mt-0.5 text-[11px] font-semibold text-slate-500">{formatDateTime(s.start)} → {formatDateTime(s.end)}</p>
								</div>
							))}
						</DaySection>
					) : null}
					{data.absences.length ? (
						<DaySection title="Férias/Ausência" color="bg-orange-500">
							{data.absences.map((a) => (
								<p key={a.id} className="text-sm font-bold text-slate-700">{a.userName} <span className="text-xs font-semibold text-slate-400">({ABSENCE_TYPE_LABEL[a.type] || a.type})</span></p>
							))}
						</DaySection>
					) : null}
					{!total ? <EmptyMini label="Nada registrado neste dia." /> : null}
				</div>
			</ModalShell>
		);
	}

	return null;
}

function DaySection({ title, color, children }) {
	return (
		<div>
			<h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
				<span className={`h-2 w-2 rounded-full ${color}`} /> {title}
			</h4>
			<div className="space-y-1.5">{children}</div>
		</div>
	);
}

function CardTitleWithMore({ title, count, onOpen }) {
	return (
		<div className="mb-3 flex items-center justify-between gap-3">
			<h3 className="text-sm font-black text-slate-950">{title}</h3>
			{count > DASHBOARD_LIST_PAGE_SIZE ? (
				<button type="button" onClick={onOpen} className="rot-btn-tactile rounded-lg px-2 py-1 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50">
					Ver tudo
				</button>
			) : null}
		</div>
	);
}

function DashboardListModal({ title, items, renderItem, onClose }) {
	return (
		<ModalShell
			open
			title={title}
			description={`${items.length} registro(s)`}
			icon={<span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><CalendarRange size={22} /></span>}
			onClose={onClose}
			size="lg"
		>
			{items.length ? (
				<PaginatedList items={items}>
					{(pageItems) => <ul className="space-y-2">{pageItems.map(renderItem)}</ul>}
				</PaginatedList>
			) : (
				<EmptyMini label="Nenhum registro encontrado." />
			)}
		</ModalShell>
	);
}

function PaginatedList({ items, children, pageSize = DASHBOARD_LIST_PAGE_SIZE }) {
	const [page, setPage] = useState(1);
	const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const start = (safePage - 1) * pageSize;
	const pageItems = items.slice(start, start + pageSize);

	useEffect(() => {
		if (page > totalPages) setPage(totalPages);
	}, [page, totalPages]);

	return (
		<div className="space-y-3">
			<div className="max-h-[60vh] overflow-y-auto pr-1">{children(pageItems, start)}</div>
			{items.length > pageSize ? (
				<div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs font-bold text-slate-400">
						Mostrando {start + 1}-{Math.min(start + pageSize, items.length)} de {items.length}
					</p>
					<div className="flex items-center gap-2">
						<button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1} className="rot-btn-tactile rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 disabled:opacity-40">
							Anterior
						</button>
						<span className="text-xs font-black text-slate-500">{safePage}/{totalPages}</span>
						<button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages} className="rot-btn-tactile rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 disabled:opacity-40">
							Próxima
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}

function DashboardCard({ icon: Icon, title, tone, linkTo, onOpen, children, visible = true }) {
	if (!visible) return null;
	// min-w-0 e obrigatorio aqui: cada card e um item de grid, e sem isso
	// o texto "truncate" (white-space:nowrap) la dentro impede o card de
	// encolher — o item de grid herda a largura minima do CONTEUDO (o
	// nome completo do tecnico/plantao, sem quebrar linha), empurrando a
	// pagina inteira pra um scroll horizontal no celular (bug real visto
	// em producao, print do usuario).
	return (
		<div className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
			<button type="button" onClick={onOpen} className="rot-btn-tactile -m-1 mb-2 flex items-center justify-between rounded-xl p-1 text-left hover:bg-slate-50">
				<div className="flex items-center gap-2">
					<span className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}>
						<Icon size={16} />
					</span>
					<h3 className="text-xs font-black uppercase tracking-wide text-slate-700">{title}</h3>
				</div>
			</button>
			<div className="min-w-0 flex-1 cursor-pointer" onClick={onOpen}>{children}</div>
			{linkTo ? (
				<NavLink to={linkTo} onClick={(e) => e.stopPropagation()} className="mt-3 self-start text-[10px] font-black uppercase text-slate-400 hover:text-blue-600">
					Ver módulo completo
				</NavLink>
			) : null}
		</div>
	);
}

function EmptyMini({ label }) {
	return <p className="py-4 text-center text-xs font-semibold text-slate-400">{label}</p>;
}

function Legend({ color, label }) {
	return (
		<span className="flex items-center gap-1.5">
			<span className={`h-2 w-2 rounded-full ${color}`} />
			{label}
		</span>
	);
}

function WeekChip({ color, label }) {
	return (
		<div className="flex items-center gap-1.5 truncate text-[10px] font-semibold text-slate-600">
			<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
			<span className="truncate">{label}</span>
		</div>
	);
}
