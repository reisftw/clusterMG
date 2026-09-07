import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchFinanCalendarCatalog, fetchFinanCalendarEvents, fetchFinanCalendarHolidays } from "../api/finanApi";

const COLOR_DOT = {
	vermelho: "bg-red-500",
	amarelo: "bg-amber-500",
	verde: "bg-emerald-500",
	azul: "bg-blue-500",
};

// Pra strings vindas da API (ex.: "2026-09-08" ou "2026-09-08T00:00:00.000Z").
function dateKey(value) {
	return String(value || "").slice(0, 10);
}

function pad2(value) {
	return String(value).padStart(2, "0");
}

// Pra objetos Date de verdade (ex.: os dias da semana computados aqui).
// NUNCA usar dateKey() num Date — String(objetoDate) vira algo tipo "Sun
// Aug 30 2026 00:00:00 GMT-0300 (...)", e cortar isso em 10 caracteres da
// "Sun Aug 30", uma string que nao bate no formato YYYY-MM-DD. Foi
// exatamente esse bug que fazia feriado/regra recorrente nunca aparecerem
// (o backend rejeitava a data invalida e tratava como "sem filtro").
function dateObjKey(date) {
	return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

function todayKey() {
	// Componentes LOCAIS (nao toISOString, que converte pra UTC — perto da
	// meia-noite local, isso jogava "hoje" pro dia seguinte pra quem esta
	// num fuso atras de UTC, tipo o Brasil).
	return dateObjKey(new Date());
}

// Segunda-feira da semana "relevante" — sempre segunda a sexta (dia
// util), nunca sabado/domingo. Se hoje for sabado/domingo, mostra a
// PROXIMA semana (a que esta por vir), nao a que acabou de passar — ver a
// mesma logica no ISO 8601 tecnicamente colocaria sabado/domingo na
// semana anterior, mas pra um dashboard de trabalho isso e inutil.
function mondayOf(date) {
	const d = new Date(date);
	const day = d.getDay(); // 0=dom..6=sab
	let diff;
	if (day === 0) diff = 1; // domingo -> proxima segunda
	else if (day === 6) diff = 2; // sabado -> proxima segunda
	else diff = 1 - day; // dia de semana -> segunda dessa mesma semana
	d.setDate(d.getDate() + diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

function buildWeekdays(monday) {
	return Array.from({ length: 5 }, (_, index) => {
		const date = new Date(monday);
		date.setDate(monday.getDate() + index);
		return date;
	});
}

const WEEKDAY_LABELS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

// Faixa da semana (seg-sex) pro Dashboard, abaixo do Resumo Matinal —
// versao compacta e so-leitura do Calendario Financeiro (sem
// criar/editar aqui; para isso, a pagina completa em Calendário
// Financeiro).
export default function FinanCalendarWeekStrip() {
	const [monday, setMonday] = useState(() => mondayOf(new Date()));
	const [events, setEvents] = useState([]);
	const [holidays, setHolidays] = useState([]);
	const [prioritiesById, setPrioritiesById] = useState({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const weekdays = useMemo(() => buildWeekdays(monday), [monday]);
	const from = dateObjKey(weekdays[0]);
	const to = dateObjKey(weekdays[4]);

	useEffect(() => {
		let active = true;
		setLoading(true);
		(async () => {
			try {
				const [weekEvents, weekHolidays, priorities] = await Promise.all([
					fetchFinanCalendarEvents({ from, to }),
					fetchFinanCalendarHolidays({ from, to }),
					fetchFinanCalendarCatalog("prioridades"),
				]);
				if (!active) return;
				setEvents(weekEvents);
				setHolidays(weekHolidays);
				setPrioritiesById(Object.fromEntries(priorities.map((item) => [item.id, item])));
			} catch (err) {
				if (active) setError(err?.message || "Não foi possível carregar a semana.");
			} finally {
				if (active) setLoading(false);
			}
		})();
		return () => {
			active = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [from, to]);

	const eventsByDate = useMemo(() => {
		const map = {};
		for (const event of events) {
			const key = dateKey(event.event_date);
			if (!map[key]) map[key] = [];
			map[key].push(event);
		}
		return map;
	}, [events]);

	const holidaysByDate = useMemo(
		() => Object.fromEntries(holidays.map((item) => [dateKey(item.holiday_date), item])),
		[holidays],
	);

	const monthLabel = new Date(monday).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="flex items-center gap-2 text-base font-black capitalize text-slate-950">
					<CalendarRange size={18} />
					Semana ({monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)})
				</h2>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setMonday((current) => {
							const next = new Date(current);
							next.setDate(current.getDate() - 7);
							return next;
						})}
						className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
						aria-label="Semana anterior"
					>
						<ChevronLeft size={16} />
					</button>
					<button
						type="button"
						onClick={() => setMonday(mondayOf(new Date()))}
						className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
					>
						Hoje
					</button>
					<button
						type="button"
						onClick={() => setMonday((current) => {
							const next = new Date(current);
							next.setDate(current.getDate() + 7);
							return next;
						})}
						className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
						aria-label="Próxima semana"
					>
						<ChevronRight size={16} />
					</button>
				</div>
			</div>

			{error ? <div className="finan-error mb-3">{error}</div> : null}

			<div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
				{weekdays.map((date, index) => {
					const key = dateObjKey(date);
					const isToday = key === todayKey();
					const holiday = holidaysByDate[key];
					const dayEvents = eventsByDate[key] || [];
					return (
						<div
							key={key}
							className={`rounded-xl border p-2 ${
								isToday
									? "border-blue-300 bg-blue-50"
									: holiday
										? "border-orange-200 bg-orange-50"
										: "border-slate-100 bg-slate-50"
							}`}
							title={holiday ? holiday.name : undefined}
						>
							<p className="text-[10px] font-bold uppercase text-slate-400">{WEEKDAY_LABELS[index]}</p>
							<p className="text-sm font-black text-slate-800">{date.getDate()}</p>
							{holiday ? (
								<p className="mt-0.5 truncate text-[9px] font-bold uppercase text-orange-600">{holiday.name}</p>
							) : null}
							<div className="mt-2 space-y-1">
								{dayEvents.slice(0, 3).map((event) => (
									<div key={event.id} className="flex items-center gap-1.5 truncate text-[11px] text-slate-600">
										<span
											className={`h-1.5 w-1.5 shrink-0 rounded-full ${
												COLOR_DOT[prioritiesById[event.priority]?.color] || "bg-blue-500"
											}`}
										/>
										<span className="truncate">{event.title}</span>
									</div>
								))}
								{dayEvents.length > 3 ? (
									<p className="text-[10px] font-bold text-slate-400">+{dayEvents.length - 3} mais</p>
								) : null}
							</div>
						</div>
					);
				})}
			</div>
			{loading ? <p className="mt-3 text-sm text-slate-400">Carregando...</p> : null}
		</div>
	);
}
