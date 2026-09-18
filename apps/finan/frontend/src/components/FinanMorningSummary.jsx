import { CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchFinanCalendarCatalog, fetchFinanCalendarEvents } from "../api/finanApi";
import { useFinanAuth } from "../state/FinanAuthContext";

const COLOR_DOT = {
	vermelho: "bg-red-500",
	amarelo: "bg-amber-500",
	verde: "bg-emerald-500",
	azul: "bg-blue-500",
};

// Extraido pra achado javascript:S3358 (ternario aninhado).
function resolveMorningSummaryMessage(loading, relevant, criticalCount) {
	if (loading) return "Carregando...";
	if (relevant.length === 0) {
		return "Nenhum evento do calendário financeiro para hoje.";
	}
	const criticalSuffix = criticalCount ? `, ${criticalCount} crítico(s)` : "";
	return `Hoje há ${relevant.length} evento(s) no calendário financeiro${criticalSuffix}.`;
}

function todayKey() {
	const now = new Date();
	return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

// Um evento so aparece pra quem NAO tem cargo nenhum marcado (visivel a
// todos, comportamento padrao) ou pra quem tem o cargo do usuario atual
// marcado em notify_role_ids — ver o mesmo campo no formulario de evento
// do Calendario Financeiro.
function isVisibleToUser(event, user) {
	if (user?.isAdmin) return true;
	const roles = Array.isArray(event.notify_role_ids) ? event.notify_role_ids : [];
	if (!roles.length) return true;
	return roles.includes(user?.role);
}

// Card "Resumo Matinal" (secao 5.2 da visao de produto do Finan): eventos
// de hoje do Calendario Financeiro relevantes pro cargo do usuario atual.
// Componente 100% independente (fetch proprio) — inserido no topo do
// Dashboard sem tocar no calculo/estado do dashboard financeiro existente.
export default function FinanMorningSummary() {
	const { user } = useFinanAuth();
	const [events, setEvents] = useState([]);
	const [prioritiesById, setPrioritiesById] = useState({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		let active = true;
		(async () => {
			try {
				const today = todayKey();
				const [todaysEvents, priorities] = await Promise.all([
					fetchFinanCalendarEvents({ from: today, to: today }),
					fetchFinanCalendarCatalog("prioridades"),
				]);
				if (!active) return;
				setEvents(todaysEvents);
				setPrioritiesById(Object.fromEntries(priorities.map((item) => [item.id, item])));
			} catch (err) {
				if (active) setError(err?.message || "Não foi possível carregar o resumo matinal.");
			} finally {
				if (active) setLoading(false);
			}
		})();
		return () => {
			active = false;
		};
	}, []);

	const relevant = events.filter((event) => isVisibleToUser(event, user));
	const criticalCount = relevant.filter((event) => prioritiesById[event.priority]?.color === "vermelho").length;

	return (
		<div className="finan-work-card">
			<div className="finan-card-heading">
				<div>
					<CalendarClock size={20} />
				</div>
				<div>
					<h2>Resumo matinal</h2>
					<p>{resolveMorningSummaryMessage(loading, relevant, criticalCount)}</p>
				</div>
			</div>
			{error ? <div className="finan-error mt-3">{error}</div> : null}
			{!loading && relevant.length > 0 ? (
				<ul className="mt-3 space-y-2">
					{relevant.map((event) => {
						const priority = prioritiesById[event.priority];
						return (
							<li key={event.id} className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
								<span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${COLOR_DOT[priority?.color] || "bg-blue-500"}`} />
								<span className="min-w-0">
									<strong className="text-slate-900">{event.title}</strong>
									{event.description ? <span className="text-slate-400"> — {event.description}</span> : null}
								</span>
							</li>
						);
					})}
				</ul>
			) : null}
		</div>
	);
}
