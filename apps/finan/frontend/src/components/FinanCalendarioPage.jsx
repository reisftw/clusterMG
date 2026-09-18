import {
	AlertTriangle,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	Pencil,
	Plus,
	Settings,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	createFinanCalendarCatalogItem,
	createFinanCalendarEvent,
	createFinanCalendarHoliday,
	createFinanCalendarRule,
	deleteFinanCalendarCatalogItem,
	deleteFinanCalendarEvent,
	deleteFinanCalendarHoliday,
	deleteFinanCalendarRule,
	fetchFinanCalendarCatalog,
	fetchFinanCalendarEvents,
	fetchFinanCalendarHolidays,
	fetchFinanCalendarRules,
	fetchFinanRoles,
	updateFinanCalendarEvent,
	updateFinanCalendarRule,
} from "../api/finanApi";
import { useFinanAuth } from "../state/FinanAuthContext";

// Mesmo padrao estrutural do calendario de Agendamentos
// (src/modules/agendamentos/components/AgendamentosPage.jsx): grade de 42
// celulas com Date nativo, sem lib de calendario. Diferencas: dots/badges
// coloridos por prioridade (configuravel, nao mais fixo), fins de
// semana/feriados destacados como "nao util", e eventos podem vir de uma
// regra recorrente ("todo N-esimo dia util do mes") em vez de data fixa.
const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const COLOR_CLASSES = {
	vermelho: { dot: "bg-red-500", badge: "bg-red-600", chip: "bg-red-50 text-red-700 border-red-200" },
	amarelo: { dot: "bg-amber-500", badge: "bg-amber-500", chip: "bg-amber-50 text-amber-700 border-amber-200" },
	verde: { dot: "bg-emerald-500", badge: "bg-emerald-600", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
	azul: { dot: "bg-blue-500", badge: "bg-blue-600", chip: "bg-blue-50 text-blue-700 border-blue-200" },
};

function dateKey(value) {
	return String(value || "").slice(0, 10);
}

function todayKey() {
	const now = new Date();
	return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

function buildCalendarDays(monthDate) {
	const year = monthDate.getFullYear();
	const month = monthDate.getMonth();
	const first = new Date(year, month, 1);
	const start = new Date(first);
	start.setDate(first.getDate() - first.getDay());

	return Array.from({ length: 42 }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
		const weekday = date.getDay();
		return {
			key,
			date,
			day: date.getDate(),
			currentMonth: date.getMonth() === month,
			isWeekend: weekday === 0 || weekday === 6,
		};
	});
}

function formatMonthTitle(date) {
	const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
	return label.charAt(0).toUpperCase() + label.slice(1);
}

function hasCalendarManagePermission(user) {
	if (!user) return false;
	if (user.isAdmin) return true;
	const permissions = Array.isArray(user.permissions) ? user.permissions : [];
	return permissions.includes("*") || permissions.includes("finan.calendario.manage");
}

export default function FinanCalendarioPage() {
	const { user } = useFinanAuth();
	const canManage = hasCalendarManagePermission(user);
	const [mes, setMes] = useState(() => {
		const now = new Date();
		return new Date(now.getFullYear(), now.getMonth(), 1);
	});
	const [eventos, setEventos] = useState([]);
	const [feriados, setFeriados] = useState([]);
	const [eventTypes, setEventTypes] = useState([]);
	const [priorities, setPriorities] = useState([]);
	const [leadTimes, setLeadTimes] = useState([]);
	const [rules, setRules] = useState([]);
	const [roles, setRoles] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [diaSelecionado, setDiaSelecionado] = useState("");
	const [editingEvent, setEditingEvent] = useState(null); // null | {} (novo) | evento existente
	const [editingRule, setEditingRule] = useState(null); // null | {} (nova) | regra existente
	const [settingsOpen, setSettingsOpen] = useState(false);

	const dias = useMemo(() => buildCalendarDays(mes), [mes]);
	// dias[i].key ja vem pronto (YYYY-MM-DD) de buildCalendarDays — NAO usar
	// dateKey(dias[i].date) aqui: dateKey() foi feita pra strings vindas da
	// API (ex.: "2026-09-08"), e dias[i].date e um objeto Date de verdade.
	// String(objetoDate) vira algo tipo "Sun Aug 30 2026 00:00:00 GMT-0300
	// (...)", entao dateKey cortava isso em "Sun Aug 30" — uma string que
	// nao bate no formato YYYY-MM-DD, o backend rejeitava silenciosamente e
	// tratava a busca como "sem filtro de data". Isso explicava por que
	// feriado e regra recorrente (que exigem from/to validos) nunca
	// apareciam, mas evento avulso (que nao exige) continuava aparecendo.
	const rangeFrom = dias[0]?.key;
	const rangeTo = dias[dias.length - 1]?.key;

	const typesById = useMemo(() => Object.fromEntries(eventTypes.map((item) => [item.id, item])), [eventTypes]);
	const prioritiesById = useMemo(() => Object.fromEntries(priorities.map((item) => [item.id, item])), [priorities]);
	const holidaysByDate = useMemo(() => Object.fromEntries(feriados.map((item) => [dateKey(item.holiday_date), item])), [feriados]);
	// So os eventos DENTRO do mes exibido (a grade tambem carrega uns dias
	// do mes anterior/seguinte pra completar as 6 semanas) — ordenados por
	// data, pro resumo abaixo do calendario.
	const monthEvents = useMemo(() => {
		const monthPrefix = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, "0")}`;
		return eventos
			.filter((event) => dateKey(event.event_date).startsWith(monthPrefix))
			.sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)));
	}, [eventos, mes]);

	const loadCatalogs = async () => {
		try {
			const [types, prios, leads, rulesList] = await Promise.all([
				fetchFinanCalendarCatalog("tipos"),
				fetchFinanCalendarCatalog("prioridades"),
				fetchFinanCalendarCatalog("antecedencias"),
				fetchFinanCalendarRules(),
			]);
			setEventTypes(types);
			setPriorities(prios);
			setLeadTimes(leads);
			setRules(rulesList);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar as configurações do calendário.");
		}

		// A lista de cargos so e usada dentro do checklist de "quem e avisado"
		// (RoleChecklist, em EventFormModal/RuleFormModal) — telas que so quem
		// tem finan.calendario.manage consegue abrir. Buscar isso pra QUALQUER
		// usuario autenticado disparava GET /finan/usuarios/roles, que exige
		// finan.usuarios.manage (permissao de RH, nao de calendario) — um
		// analista sem essa permissao via 403 aqui e a pagina toda mostrava
		// "Você não tem permissão para acessar esta área do Finan.", apesar do
		// calendario em si (leitura) funcionar normalmente (rota GET sem
		// permissao dedicada). Separado do Promise.all acima e feito so
		// quando faz sentido, e uma falha aqui nunca deve derrubar a tela.
		if (!canManage) return;
		try {
			const rolesList = await fetchFinanRoles();
			setRoles(rolesList.filter((role) => role.active !== false));
		} catch {
			// silencioso: sem a lista de cargos, o checklist so fica vazio —
			// nao e motivo pra mostrar erro de permissao numa tela de leitura.
		}
	};

	const loadEvents = async () => {
		setLoading(true);
		setError("");
		try {
			const [events, holidays] = await Promise.all([
				fetchFinanCalendarEvents({ from: rangeFrom, to: rangeTo }),
				fetchFinanCalendarHolidays({ from: rangeFrom, to: rangeTo }),
			]);
			setEventos(events);
			setFeriados(holidays);
		} catch (err) {
			setError(err?.message || "Não foi possível carregar o calendário.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadCatalogs();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		loadEvents();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mes]);

	const porData = useMemo(() => {
		const map = {};
		for (const event of eventos) {
			const key = dateKey(event.event_date);
			if (!map[key]) map[key] = [];
			map[key].push(event);
		}
		return map;
	}, [eventos]);

	const itensDoDia = diaSelecionado ? porData[diaSelecionado] || [] : [];

	const closeDayModal = () => setDiaSelecionado("");

	const saveEvent = async (payload) => {
		if (editingEvent?.id) {
			await updateFinanCalendarEvent(editingEvent.id, payload);
		} else {
			await createFinanCalendarEvent(payload);
		}
		setEditingEvent(null);
		await loadEvents();
	};

	const removeEvent = async (id) => {
		await deleteFinanCalendarEvent(id);
		await loadEvents();
	};

	const saveRule = async (payload) => {
		if (editingRule?.id) {
			await updateFinanCalendarRule(editingRule.id, payload);
		} else {
			await createFinanCalendarRule(payload);
		}
		setEditingRule(null);
		await loadCatalogs();
		await loadEvents();
	};

	const removeRule = async (id) => {
		await deleteFinanCalendarRule(id);
		await loadCatalogs();
		await loadEvents();
	};

	return (
		<section className="flex flex-col gap-4">
			<div className="finan-page-title">
				<div>
					<h1>Calendário Financeiro</h1>
					<p>Vencimentos, recebimentos, fechamentos e rotinas internas do setor.</p>
				</div>
				{canManage ? (
					<div className="flex items-center gap-2">
						<button
							type="button"
							className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
							onClick={() => setSettingsOpen(true)}
							title="Configurar calendário"
							aria-label="Configurar calendário"
						>
							<Settings size={18} />
						</button>
						<button
							type="button"
							className="finan-ghost-button"
							onClick={() => setEditingEvent({ event_date: diaSelecionado || todayKey() })}
						>
							<Plus size={16} />
							Novo evento
						</button>
					</div>
				) : null}
			</div>

			<div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500">
				{priorities.map((priority) => (
					<span key={priority.id} className="inline-flex items-center gap-1.5">
						<span className={`h-2.5 w-2.5 rounded-full ${COLOR_CLASSES[priority.color]?.dot || "bg-slate-400"}`} />
						{priority.label}
					</span>
				))}
				<span className="inline-flex items-center gap-1.5">
					<span className="h-2.5 w-2.5 rounded-full border border-slate-400 bg-slate-300" />
					Fim de semana
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span className="h-2.5 w-2.5 rounded-full border border-orange-300 bg-orange-100" />
					Feriado
				</span>
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="text-base font-black capitalize text-slate-950">{formatMonthTitle(mes)}</h2>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setMes((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
							className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
							aria-label="Mês anterior"
						>
							<ChevronLeft size={16} />
						</button>
						<button
							type="button"
							onClick={() => setMes((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
							className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
							aria-label="Próximo mês"
						>
							<ChevronRight size={16} />
						</button>
					</div>
				</div>

				{error ? <div className="finan-error mb-3">{error}</div> : null}

				<div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-400">
					{WEEKDAY_LABELS.map((label) => (
						<span key={label}>{label}</span>
					))}
				</div>
				<div className="mt-1 grid grid-cols-7 gap-1">
					{dias.map((dia) => {
						const itens = porData[dia.key] || [];
						const isToday = dia.key === todayKey();
						const holiday = holidaysByDate[dia.key];
						const isNonBusinessDay = dia.isWeekend || Boolean(holiday);
						const criticalCount = itens.filter((item) => prioritiesById[item.priority]?.color === "vermelho").length;
						return (
							<button
								key={dia.key}
								type="button"
								onClick={() => {
									if (!itens.length) return;
									setDiaSelecionado(dia.key);
								}}
								disabled={!itens.length}
								title={holiday ? holiday.name : undefined}
								className={`min-h-16 rounded-xl border p-2 text-left transition-colors disabled:cursor-default ${
									isToday
										? "border-blue-300 bg-blue-50"
										: holiday && dia.currentMonth
											? "border-orange-200 bg-orange-50"
											: isNonBusinessDay && dia.currentMonth
												? "border-slate-300 bg-slate-200"
												: dia.currentMonth
													? "border-slate-100 bg-slate-50 hover:bg-blue-50"
													: "border-slate-50 bg-slate-50/50 text-slate-300"
								} ${itens.length ? "cursor-pointer" : ""}`}
							>
								<div className="flex items-center justify-between gap-1">
									<span className={`text-xs font-semibold ${dia.currentMonth ? "text-slate-700" : "text-slate-300"}`}>
										{dia.day}
									</span>
									{itens.length > 0 ? (
										<span
											className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${
												criticalCount > 0 ? "bg-red-600" : "bg-blue-600"
											}`}
										>
											{itens.length}
										</span>
									) : null}
								</div>
								{holiday ? (
									<p className="mt-1 truncate text-[9px] font-bold uppercase text-slate-400">{holiday.name}</p>
								) : null}
								<div className="mt-2 flex flex-wrap gap-1">
									{itens.slice(0, 4).map((item) => (
										<span
											key={item.id}
											className={`h-1.5 w-1.5 rounded-full ${COLOR_CLASSES[prioritiesById[item.priority]?.color]?.dot || "bg-blue-500"}`}
											title={item.title}
										/>
									))}
								</div>
							</button>
						);
					})}
				</div>
				{loading ? <p className="mt-3 text-sm text-slate-400">Carregando...</p> : null}
			</div>

			<MonthSummaryCard
				monthLabel={formatMonthTitle(mes)}
				events={monthEvents}
				typesById={typesById}
				prioritiesById={prioritiesById}
				onSelect={(event) => setDiaSelecionado(dateKey(event.event_date))}
			/>

			{diaSelecionado ? (
				<DayModal
					dateKeyValue={diaSelecionado}
					items={itensDoDia}
					typesById={typesById}
					prioritiesById={prioritiesById}
					canManage={canManage}
					onClose={closeDayModal}
					onEditEvent={(event) => {
						closeDayModal();
						setEditingEvent(event);
					}}
					onEditRule={(ruleId) => {
						closeDayModal();
						const rule = rules.find((item) => item.id === ruleId);
						if (rule) setEditingRule(rule);
					}}
					onDeleteEvent={removeEvent}
					onDeleteRule={removeRule}
					onNew={() => {
						closeDayModal();
						setEditingEvent({ event_date: diaSelecionado });
					}}
				/>
			) : null}

			{editingEvent ? (
				<EventFormModal
					event={editingEvent}
					eventTypes={eventTypes}
					priorities={priorities}
					leadTimes={leadTimes}
					roles={roles}
					onClose={() => setEditingEvent(null)}
					onSave={saveEvent}
					onSwitchToRule={() => {
						setEditingEvent(null);
						setEditingRule({});
					}}
				/>
			) : null}

			{editingRule ? (
				<RuleFormModal
					rule={editingRule}
					eventTypes={eventTypes}
					priorities={priorities}
					leadTimes={leadTimes}
					roles={roles}
					onClose={() => setEditingRule(null)}
					onSave={saveRule}
				/>
			) : null}

			{settingsOpen ? (
				<CalendarSettingsModal
					eventTypes={eventTypes}
					priorities={priorities}
					leadTimes={leadTimes}
					rules={rules}
					onClose={() => setSettingsOpen(false)}
					onChanged={loadCatalogs}
					onEditRule={(rule) => {
						setSettingsOpen(false);
						setEditingRule(rule);
					}}
					onDeleteRule={removeRule}
				/>
			) : null}
		</section>
	);
}

function formatDayLabel(dateStr) {
	const [year, month, day] = String(dateStr).slice(0, 10).split("-").map(Number);
	return new Date(year, month - 1, day).toLocaleDateString("pt-BR", {
		weekday: "short",
		day: "2-digit",
	});
}

// Lista TODOS os eventos do mes exibido (avulsos + ocorrencias de regra),
// com a data, pra quem quiser ver tudo de uma vez sem precisar clicar dia
// por dia na grade.
function MonthSummaryCard({ monthLabel, events, typesById, prioritiesById, onSelect }) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
			<h2 className="mb-1 text-base font-black capitalize text-slate-950">Resumo de {monthLabel}</h2>
			<p className="mb-4 text-xs text-slate-500">
				Todos os eventos cadastrados neste mês, com a data — clique em um para ver os detalhes.
			</p>
			{events.length ? (
				<div className="flex flex-col divide-y divide-slate-100">
					{events.map((event) => {
						const style = COLOR_CLASSES[prioritiesById[event.priority]?.color] || COLOR_CLASSES.azul;
						return (
							<button
								key={event.id}
								type="button"
								onClick={() => onSelect(event)}
								className="flex items-center gap-3 py-2.5 text-left transition hover:bg-slate-50"
							>
								<span className="w-14 shrink-0 text-xs font-black uppercase text-slate-500">
									{formatDayLabel(event.event_date)}
								</span>
								<span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-bold text-slate-900">{event.title}</span>
									<span className="block truncate text-xs text-slate-400">
										{typesById[event.event_type]?.label || event.event_type}
										{event.description ? ` — ${event.description}` : ""}
									</span>
								</span>
							</button>
						);
					})}
				</div>
			) : (
				<p className="text-sm text-slate-400">Nenhum evento cadastrado neste mês.</p>
			)}
		</div>
	);
}

function DayModal({
	dateKeyValue,
	items,
	typesById,
	prioritiesById,
	canManage,
	onClose,
	onEditEvent,
	onEditRule,
	onDeleteEvent,
	onDeleteRule,
	onNew,
}) {
	const [year, month, day] = dateKeyValue.split("-");
	const label = new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("pt-BR", {
		weekday: "long",
		day: "2-digit",
		month: "long",
	});

	return (
		<div className="fixed inset-0 z-layout-modal flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
			<div className="w-full max-w-2xl rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl">
				<div className="mb-4 flex items-start justify-between gap-3">
					<div>
						<h3 className="text-base font-black capitalize text-slate-950">{label}</h3>
						<p className="text-sm text-slate-500">{items.length} evento(s)</p>
					</div>
					<div className="flex items-center gap-2">
						{canManage ? (
							<button
								type="button"
								onClick={onNew}
								className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
							>
								<Plus size={14} />
								Novo neste dia
							</button>
						) : null}
						<button
							type="button"
							onClick={onClose}
							className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
							aria-label="Fechar"
						>
							<X size={16} />
						</button>
					</div>
				</div>
				<div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
					{items.map((item) => {
						const priority = prioritiesById[item.priority];
						const style = COLOR_CLASSES[priority?.color] || COLOR_CLASSES.azul;
						const isRuleOccurrence = Boolean(item.rule_id);
						return (
							<div key={item.id} className="rounded-xl bg-slate-50 p-3">
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
											<strong className="truncate text-sm text-slate-950">{item.title}</strong>
											{isRuleOccurrence ? (
												<span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-400">
													Recorrente
												</span>
											) : null}
										</div>
										<p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
											{typesById[item.event_type]?.label || item.event_type} · {priority?.label || item.priority}
										</p>
										{item.description ? (
											<p className="mt-1 text-sm text-slate-600">{item.description}</p>
										) : null}
										{item.responsible_name ? (
											<p className="mt-1 text-xs text-slate-400">Responsável: {item.responsible_name}</p>
										) : null}
									</div>
									{canManage ? (
										<div className="flex shrink-0 items-center gap-1">
											<button
												type="button"
												onClick={() => (isRuleOccurrence ? onEditRule(item.rule_id) : onEditEvent(item))}
												className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-200"
												aria-label="Editar"
											>
												<Pencil size={14} />
											</button>
											<button
												type="button"
												onClick={() => {
													if (isRuleOccurrence) {
														// eslint-disable-next-line no-alert
														if (window.confirm("Excluir a ROTINA RECORRENTE inteira (todos os meses), não só esta ocorrência?")) {
															onDeleteRule(item.rule_id);
														}
													} else {
														onDeleteEvent(item.id);
													}
												}}
												className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50"
												aria-label="Excluir"
											>
												<Trash2 size={14} />
											</button>
										</div>
									) : null}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function LeadTimeChecklist({ leadTimes, value, onChange }) {
	const selected = new Set(value || []);
	const toggle = (days) => {
		const next = new Set(selected);
		if (next.has(days)) next.delete(days);
		else next.add(days);
		onChange(Array.from(next).sort((a, b) => a - b));
	};
	return (
		<div className="flex flex-col gap-1.5 text-left">
			<span className="text-xs font-bold uppercase tracking-wide text-slate-500">
				Avisar com antecedência (checklist)
			</span>
			<div className="flex flex-wrap gap-2">
				{leadTimes.map((lead) => (
					<label
						key={lead.id}
						className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
							selected.has(lead.days)
								? "border-blue-400 bg-blue-50 text-blue-700"
								: "border-slate-200 text-slate-600 hover:bg-slate-50"
						}`}
					>
						<input
							type="checkbox"
							className="sr-only"
							checked={selected.has(lead.days)}
							onChange={() => toggle(lead.days)}
						/>
						{lead.label}
					</label>
				))}
				{!leadTimes.length ? (
					<span className="text-xs text-slate-400">Nenhuma antecedência cadastrada ainda.</span>
				) : null}
			</div>
		</div>
	);
}

function RoleChecklist({ roles, value, onChange }) {
	const selected = new Set(value || []);
	const toggle = (roleId) => {
		const next = new Set(selected);
		if (next.has(roleId)) next.delete(roleId);
		else next.add(roleId);
		onChange(Array.from(next));
	};
	return (
		<div className="flex flex-col gap-1.5 text-left">
			<span className="text-xs font-bold uppercase tracking-wide text-slate-500">
				Avisar/mostrar no Resumo Matinal para os cargos
			</span>
			<div className="flex flex-wrap gap-2">
				{roles.map((role) => (
					<label
						key={role.id}
						className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
							selected.has(role.id)
								? "border-blue-400 bg-blue-50 text-blue-700"
								: "border-slate-200 text-slate-600 hover:bg-slate-50"
						}`}
					>
						<input
							type="checkbox"
							className="sr-only"
							checked={selected.has(role.id)}
							onChange={() => toggle(role.id)}
						/>
						{role.name || role.id}
					</label>
				))}
				{!roles.length ? (
					<span className="text-xs text-slate-400">Nenhum cargo cadastrado ainda.</span>
				) : null}
			</div>
			<span className="text-[11px] text-slate-400">
				Nenhum cargo marcado = visível para todo mundo (padrão atual).
			</span>
		</div>
	);
}

function EventFormModal({ event, eventTypes, priorities, leadTimes, roles, onClose, onSave, onSwitchToRule }) {
	const [title, setTitle] = useState(event?.title || "");
	const [description, setDescription] = useState(event?.description || "");
	const [eventDate, setEventDate] = useState(dateKey(event?.event_date) || todayKey());
	const [eventType, setEventType] = useState(event?.event_type || eventTypes[0]?.id || "");
	const [priority, setPriority] = useState(event?.priority || priorities[0]?.id || "");
	const [alertDaysBefore, setAlertDaysBefore] = useState(event?.alert_days_before || []);
	const [notifyRoleIds, setNotifyRoleIds] = useState(event?.notify_role_ids || []);
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);

	// Se o modal abrir antes dos catalogos (tipos/prioridades) terminarem de
	// carregar, o valor inicial do useState acima fica "" pra sempre (nao
	// reage a props que chegam depois) — sem isso, o formulario submete tipo/
	// prioridade vazios e o backend rejeita com 400 silenciosamente ignorado.
	useEffect(() => {
		if (!eventType && eventTypes.length) setEventType(eventTypes[0].id);
	}, [eventTypes, eventType]);
	useEffect(() => {
		if (!priority && priorities.length) setPriority(priorities[0].id);
	}, [priorities, priority]);

	const submit = async (submitEvent) => {
		submitEvent.preventDefault();
		setError("");
		if (!title.trim()) {
			setError("Informe um título.");
			return;
		}
		setSaving(true);
		try {
			await onSave({ title: title.trim(), description, eventDate, eventType, priority, alertDaysBefore, notifyRoleIds });
		} catch (err) {
			setError(err?.message || "Não foi possível salvar o evento.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-layout-modal flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
			<div className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="flex items-center gap-2 text-base font-black text-slate-950">
						<CalendarDays size={18} />
						{event?.id ? "Editar evento" : "Novo evento"}
					</h3>
					<button
						type="button"
						onClick={onClose}
						className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
						aria-label="Fechar"
					>
						<X size={16} />
					</button>
				</div>

				{!event?.id ? (
					<button
						type="button"
						onClick={onSwitchToRule}
						className="mb-4 w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-left text-xs font-bold text-slate-500 transition hover:bg-slate-50"
					>
						Prefere uma data fixa recorrente? (ex.: "todo 5º dia útil do mês") →{" "}
						<span className="text-blue-600 underline">criar regra recorrente</span>
					</button>
				) : null}

				<form onSubmit={submit} className="flex flex-col gap-3">
					<label className="flex flex-col gap-1 text-sm font-bold text-slate-600">
						Título
						<input
							value={title}
							onChange={(evt) => setTitle(evt.target.value)}
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm font-bold text-slate-600">
						Data
						<input
							type="date"
							value={eventDate}
							onChange={(evt) => setEventDate(evt.target.value)}
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						/>
					</label>
					<div className="grid grid-cols-2 gap-3">
						<label className="flex flex-col gap-1 text-sm font-bold text-slate-600">
							Tipo
							<select
								value={eventType}
								onChange={(evt) => setEventType(evt.target.value)}
								className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
							>
								{eventTypes.map((item) => (
									<option key={item.id} value={item.id}>
										{item.label}
									</option>
								))}
							</select>
						</label>
						<label className="flex flex-col gap-1 text-sm font-bold text-slate-600">
							Prioridade
							<select
								value={priority}
								onChange={(evt) => setPriority(evt.target.value)}
								className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
							>
								{priorities.map((item) => (
									<option key={item.id} value={item.id}>
										{item.label}
									</option>
								))}
							</select>
						</label>
					</div>
					<LeadTimeChecklist leadTimes={leadTimes} value={alertDaysBefore} onChange={setAlertDaysBefore} />
					<RoleChecklist roles={roles} value={notifyRoleIds} onChange={setNotifyRoleIds} />
					<label className="flex flex-col gap-1 text-sm font-bold text-slate-600">
						Descrição (opcional)
						<textarea
							value={description}
							onChange={(evt) => setDescription(evt.target.value)}
							rows={3}
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						/>
					</label>
					{error ? (
						<div className="finan-error" role="alert">
							<AlertTriangle size={16} />
							<span>{error}</span>
						</div>
					) : null}
					<button
						type="submit"
						disabled={saving}
						className="mt-1 w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:from-orange-600 hover:to-orange-700 disabled:opacity-60"
					>
						{saving ? "Salvando..." : "Salvar evento"}
					</button>
				</form>
			</div>
		</div>
	);
}

function RuleFormModal({ rule, eventTypes, priorities, leadTimes, roles, onClose, onSave }) {
	const [title, setTitle] = useState(rule?.title || "");
	const [description, setDescription] = useState(rule?.description || "");
	const [eventType, setEventType] = useState(rule?.event_type || eventTypes[0]?.id || "");
	const [priority, setPriority] = useState(rule?.priority || priorities[0]?.id || "");
	const [nthBusinessDay, setNthBusinessDay] = useState(rule?.nth_business_day || 5);
	const [businessDayCity, setBusinessDayCity] = useState(rule?.business_day_city || "");
	const [alertDaysBefore, setAlertDaysBefore] = useState(rule?.alert_days_before || []);
	const [notifyRoleIds, setNotifyRoleIds] = useState(rule?.notify_role_ids || []);
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!eventType && eventTypes.length) setEventType(eventTypes[0].id);
	}, [eventTypes, eventType]);
	useEffect(() => {
		if (!priority && priorities.length) setPriority(priorities[0].id);
	}, [priorities, priority]);

	const submit = async (submitEvent) => {
		submitEvent.preventDefault();
		setError("");
		if (!title.trim()) {
			setError("Informe um título.");
			return;
		}
		setSaving(true);
		try {
			await onSave({
				title: title.trim(),
				description,
				eventType,
				priority,
				nthBusinessDay: Number(nthBusinessDay),
				businessDayCity: businessDayCity.trim() || null,
				alertDaysBefore,
				notifyRoleIds,
			});
		} catch (err) {
			setError(err?.message || "Não foi possível salvar a regra.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-layout-modal flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
			<div className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="flex items-center gap-2 text-base font-black text-slate-950">
						<CalendarDays size={18} />
						{rule?.id ? "Editar regra recorrente" : "Nova regra recorrente"}
					</h3>
					<button
						type="button"
						onClick={onClose}
						className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
						aria-label="Fechar"
					>
						<X size={16} />
					</button>
				</div>
				<p className="mb-4 text-xs text-slate-500">
					Todo mês o Finan calcula automaticamente a data e mostra no calendário — ex.:
					"Pagamento, todo 5º dia útil do mês".
				</p>
				<form onSubmit={submit} className="flex flex-col gap-3">
					<label className="flex flex-col gap-1 text-sm font-bold text-slate-600">
						Título
						<input
							value={title}
							onChange={(evt) => setTitle(evt.target.value)}
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						/>
					</label>
					<div className="grid grid-cols-2 gap-3">
						<label className="flex flex-col gap-1 text-sm font-bold text-slate-600">
							Dia útil do mês
							<input
								type="number"
								min={1}
								max={23}
								value={nthBusinessDay}
								onChange={(evt) => setNthBusinessDay(evt.target.value)}
								className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
							/>
						</label>
						<label className="flex flex-col gap-1 text-sm font-bold text-slate-600">
							Cidade (feriado local, opcional)
							<input
								value={businessDayCity}
								onChange={(evt) => setBusinessDayCity(evt.target.value)}
								placeholder="Deixe em branco = só feriados nacionais"
								className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
							/>
						</label>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<label className="flex flex-col gap-1 text-sm font-bold text-slate-600">
							Tipo
							<select
								value={eventType}
								onChange={(evt) => setEventType(evt.target.value)}
								className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
							>
								{eventTypes.map((item) => (
									<option key={item.id} value={item.id}>
										{item.label}
									</option>
								))}
							</select>
						</label>
						<label className="flex flex-col gap-1 text-sm font-bold text-slate-600">
							Prioridade
							<select
								value={priority}
								onChange={(evt) => setPriority(evt.target.value)}
								className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
							>
								{priorities.map((item) => (
									<option key={item.id} value={item.id}>
										{item.label}
									</option>
								))}
							</select>
						</label>
					</div>
					<LeadTimeChecklist leadTimes={leadTimes} value={alertDaysBefore} onChange={setAlertDaysBefore} />
					<RoleChecklist roles={roles} value={notifyRoleIds} onChange={setNotifyRoleIds} />
					<label className="flex flex-col gap-1 text-sm font-bold text-slate-600">
						Descrição (opcional)
						<textarea
							value={description}
							onChange={(evt) => setDescription(evt.target.value)}
							rows={3}
							className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
						/>
					</label>
					{error ? (
						<div className="finan-error" role="alert">
							<AlertTriangle size={16} />
							<span>{error}</span>
						</div>
					) : null}
					<button
						type="submit"
						disabled={saving}
						className="mt-1 w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:from-orange-600 hover:to-orange-700 disabled:opacity-60"
					>
						{saving ? "Salvando..." : "Salvar regra"}
					</button>
				</form>
			</div>
		</div>
	);
}

function CalendarSettingsModal({ eventTypes, priorities, leadTimes, rules, onClose, onChanged, onEditRule, onDeleteRule }) {
	const [tab, setTab] = useState("tipos");

	return (
		<div className="fixed inset-0 z-layout-modal flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
			<div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl">
				<div className="mb-4 flex items-center justify-between">
					<h3 className="flex items-center gap-2 text-base font-black text-slate-950">
						<Settings size={18} />
						Configurar calendário
					</h3>
					<button
						type="button"
						onClick={onClose}
						className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
						aria-label="Fechar"
					>
						<X size={16} />
					</button>
				</div>
				<div className="mb-4 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
					{[
						["tipos", "Tipos de rotina"],
						["prioridades", "Prioridades"],
						["antecedencias", "Antecedência de alerta"],
						["feriados", "Feriados municipais"],
						["regras", "Regras recorrentes"],
					].map(([value, label]) => (
						<button
							key={value}
							type="button"
							onClick={() => setTab(value)}
							className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
								tab === value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
							}`}
						>
							{label}
						</button>
					))}
				</div>

				{tab === "tipos" ? (
					<CatalogEditor kind="tipos" items={eventTypes} label="Tipo" onChanged={onChanged} />
				) : null}
				{tab === "prioridades" ? (
					<CatalogEditor kind="prioridades" items={priorities} label="Prioridade" withColor onChanged={onChanged} />
				) : null}
				{tab === "antecedencias" ? (
					<CatalogEditor kind="antecedencias" items={leadTimes} label="Antecedência" withDays onChanged={onChanged} />
				) : null}
				{tab === "feriados" ? <HolidaysEditor /> : null}
				{tab === "regras" ? (
					<RulesEditor
						rules={rules}
						eventTypes={eventTypes}
						priorities={priorities}
						onEdit={onEditRule}
						onDelete={onDeleteRule}
					/>
				) : null}
			</div>
		</div>
	);
}

function RulesEditor({ rules, eventTypes, priorities, onEdit, onDelete }) {
	const typesById = Object.fromEntries(eventTypes.map((item) => [item.id, item]));
	const prioritiesById = Object.fromEntries(priorities.map((item) => [item.id, item]));

	return (
		<div className="flex flex-col gap-2">
			<p className="text-xs text-slate-500">
				Todas as regras recorrentes ativas — o Finan calcula a data (N-ésimo dia útil de
				cada mês) automaticamente e mostra a ocorrência no calendário.
			</p>
			{rules.map((rule) => (
				<div key={rule.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
					<div className="min-w-0">
						<strong className="block truncate text-sm text-slate-800">{rule.title}</strong>
						<span className="text-xs text-slate-500">
							{typesById[rule.event_type]?.label || rule.event_type} ·{" "}
							{prioritiesById[rule.priority]?.label || rule.priority} · todo {rule.nth_business_day}º dia
							útil{rule.business_day_city ? ` (feriados de ${rule.business_day_city})` : ""}
						</span>
						<p className="mt-1 text-[11px] font-bold text-slate-400">
							{rule.next_occurrences?.length
								? `Próximas datas: ${rule.next_occurrences
										.map((date) => date.split("-").reverse().join("/"))
										.join(", ")}`
								: "Não foi possível calcular as próximas datas."}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<button
							type="button"
							onClick={() => onEdit(rule)}
							className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-200"
							aria-label="Editar"
						>
							<Pencil size={14} />
						</button>
						<button
							type="button"
							onClick={() => {
								// eslint-disable-next-line no-alert
								if (window.confirm("Excluir esta regra recorrente (todos os meses)?")) onDelete(rule.id);
							}}
							className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50"
							aria-label="Excluir"
						>
							<Trash2 size={14} />
						</button>
					</div>
				</div>
			))}
			{!rules.length ? (
				<p className="text-sm text-slate-400">Nenhuma regra recorrente cadastrada ainda.</p>
			) : null}
		</div>
	);
}

function CatalogEditor({ kind, items, label, withColor, withDays, onChanged }) {
	const [newLabel, setNewLabel] = useState("");
	const [newColor, setNewColor] = useState("azul");
	const [newDays, setNewDays] = useState(3);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const add = async () => {
		if (!newLabel.trim() && !withDays) {
			setError(`Informe um nome pra ${label.toLowerCase()}.`);
			return;
		}
		setError("");
		setSaving(true);
		try {
			const payload = withDays
				? { days: Number(newDays), label: newLabel.trim() || undefined }
				: withColor
					? { label: newLabel.trim(), color: newColor }
					: { label: newLabel.trim() };
			await createFinanCalendarCatalogItem(kind, payload);
			setNewLabel("");
			await onChanged();
		} catch (err) {
			setError(err?.message || "Não foi possível adicionar.");
		} finally {
			setSaving(false);
		}
	};

	const remove = async (id) => {
		await deleteFinanCalendarCatalogItem(kind, id);
		await onChanged();
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="space-y-1.5">
				{items.map((item) => (
					<div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
						<span className="flex items-center gap-2 text-sm font-bold text-slate-700">
							{withColor ? (
								<span className={`h-2.5 w-2.5 rounded-full ${COLOR_CLASSES[item.color]?.dot || "bg-slate-400"}`} />
							) : null}
							{item.label}
							{withDays ? <span className="text-xs font-normal text-slate-400">({item.days} dias)</span> : null}
						</span>
						<button
							type="button"
							onClick={() => remove(item.id)}
							className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50"
							aria-label="Remover"
						>
							<Trash2 size={13} />
						</button>
					</div>
				))}
				{!items.length ? <p className="text-sm text-slate-400">Nada cadastrado ainda.</p> : null}
			</div>
			<div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
				{withDays ? (
					<input
						type="number"
						min={1}
						max={365}
						value={newDays}
						onChange={(evt) => setNewDays(evt.target.value)}
						className="w-20 rounded-xl border border-slate-200 px-2 py-2 text-sm font-semibold text-slate-900"
					/>
				) : (
					<input
						value={newLabel}
						onChange={(evt) => setNewLabel(evt.target.value)}
						placeholder={`Novo(a) ${label.toLowerCase()}...`}
						className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
					/>
				)}
				{withColor ? (
					<select
						value={newColor}
						onChange={(evt) => setNewColor(evt.target.value)}
						className="rounded-xl border border-slate-200 px-2 py-2 text-sm font-semibold text-slate-900"
					>
						<option value="vermelho">Vermelho</option>
						<option value="amarelo">Amarelo</option>
						<option value="verde">Verde</option>
						<option value="azul">Azul</option>
					</select>
				) : null}
				<button
					type="button"
					onClick={add}
					disabled={saving}
					className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
				>
					Adicionar
				</button>
			</div>
			{error ? <div className="finan-error">{error}</div> : null}
		</div>
	);
}

function HolidaysEditor() {
	const [holidays, setHolidays] = useState([]);
	const [loading, setLoading] = useState(true);
	const [date, setDate] = useState("");
	const [name, setName] = useState("");
	const [city, setCity] = useState("");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);

	const year = new Date().getFullYear();

	const load = async () => {
		setLoading(true);
		try {
			// Passar from/to (ano corrente) e o que dispara a sincronizacao com
			// a BrasilAPI no backend — sem intervalo, so lista o que ja estiver
			// no banco (por isso esta tela tambem serve de diagnostico: se
			// "sincronizados" aparecer zerado, a sincronizacao nao esta
			// funcionando em produção).
			setHolidays(await fetchFinanCalendarHolidays({ from: `${year}-01-01`, to: `${year}-12-31` }));
		} catch (err) {
			setError(err?.message || "Não foi possível carregar os feriados.");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const municipalHolidays = holidays.filter((item) => item.scope === "municipal");
	const nationalHolidaysCount = holidays.filter((item) => item.scope === "nacional").length;

	const add = async () => {
		if (!date || !name.trim() || !city.trim()) {
			setError("Informe data, nome e cidade.");
			return;
		}
		setError("");
		setSaving(true);
		try {
			await createFinanCalendarHoliday({ date, name: name.trim(), city: city.trim() });
			setDate("");
			setName("");
			setCity("");
			await load();
		} catch (err) {
			setError(err?.message || "Não foi possível adicionar o feriado.");
		} finally {
			setSaving(false);
		}
	};

	const remove = async (id) => {
		await deleteFinanCalendarHoliday(id);
		await load();
	};

	return (
		<div className="flex flex-col gap-3">
			<p className="text-xs text-slate-500">
				Feriados nacionais são sincronizados automaticamente (BrasilAPI). Aqui você cadastra feriados
				municipais — aparecem destacados no calendário como dia não útil.
			</p>
			{!loading ? (
				<p className={`text-xs font-bold ${nationalHolidaysCount > 0 ? "text-emerald-600" : "text-red-600"}`}>
					{nationalHolidaysCount > 0
						? `✓ ${nationalHolidaysCount} feriado(s) nacional(is) sincronizado(s) para ${year}.`
						: `⚠ Nenhum feriado nacional sincronizado para ${year} — o servidor pode não estar conseguindo acessar a BrasilAPI.`}
				</p>
			) : null}
			{loading ? <p className="text-sm text-slate-400">Carregando...</p> : null}
			<div className="space-y-1.5">
				{municipalHolidays.map((item) => (
					<div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
						<span className="text-sm font-bold text-slate-700">
							{dateKey(item.holiday_date)} · {item.name} <span className="text-slate-400">({item.city})</span>
						</span>
						<button
							type="button"
							onClick={() => remove(item.id)}
							className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50"
							aria-label="Remover"
						>
							<Trash2 size={13} />
						</button>
					</div>
				))}
				{!municipalHolidays.length && !loading ? (
					<p className="text-sm text-slate-400">Nenhum feriado municipal cadastrado ainda.</p>
				) : null}
			</div>
			<div className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
				<input
					type="date"
					value={date}
					onChange={(evt) => setDate(evt.target.value)}
					className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
				/>
				<input
					value={name}
					onChange={(evt) => setName(evt.target.value)}
					placeholder="Nome do feriado"
					className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
				/>
				<input
					value={city}
					onChange={(evt) => setCity(evt.target.value)}
					placeholder="Cidade"
					className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
				/>
			</div>
			<button
				type="button"
				onClick={add}
				disabled={saving}
				className="self-start rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
			>
				Adicionar feriado municipal
			</button>
			{error ? <div className="finan-error">{error}</div> : null}
		</div>
	);
}
