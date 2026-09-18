import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { fetchDssExecutions } from "../../api/rotApi";
import RotCalendar from "../../components/ui/RotCalendar";
import Spinner from "../../components/ui/Spinner";
import { useRotAuth } from "../../state/RotAuthContext";
import { EXECUTION_STATUS_BADGE, EXECUTION_STATUS_LABEL } from "./DssScheduleDetailPage";

function pad2(value) {
	return String(value).padStart(2, "0");
}

function monthBounds(date) {
	const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
	const end = new Date(date.getFullYear(), date.getMonth() + 2, 0);
	return {
		dateFrom: `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`,
		dateTo: `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`,
	};
}

export default function DssCalendarPage() {
	const navigate = useNavigate();
	const { hasPermission } = useRotAuth();
	const canSeeBroad = hasPermission("dss.execucao.visualizar_abrangencia") || hasPermission("dss.execucao.visualizar_todos");
	const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		setLoading(true);
		setError("");
		const { dateFrom, dateTo } = monthBounds(month);
		fetchDssExecutions({ dateFrom, dateTo, scope: canSeeBroad ? undefined : "mine" })
			.then(setItems)
			.catch((err) => setError(err?.message || "Não foi possível carregar o calendário."))
			.finally(() => setLoading(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [month]);

	return (
		<div className="space-y-6">
			<header className="flex items-center gap-3">
				<span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><CalendarDays size={24} /></span>
				<div>
					<h1 className="text-2xl font-black text-slate-950">DSS · Calendário</h1>
					<p className="text-sm font-semibold text-slate-500">Prazos das execuções programadas.</p>
				</div>
			</header>

			{error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

			{loading ? <Spinner /> : (
				<RotCalendar
					items={items}
					getDateKey={(item) => item.dueDate}
					month={month}
					onMonthChange={setMonth}
					dotColor="bg-orange-500"
					badgeColor="bg-orange-600"
					emptyLabel="Nenhum DSS neste dia."
					renderItem={(item) => (
						<button
							type="button"
							onClick={() => navigate(`/seguranca-trabalho/dss/execucoes/${item.id}`)}
							className="flex w-full flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-orange-300"
						>
							<div className="flex items-center justify-between gap-2">
								<p className="font-bold text-slate-900">{item.themeTitle || "—"}</p>
								<span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${EXECUTION_STATUS_BADGE[item.status] || ""}`}>{EXECUTION_STATUS_LABEL[item.status] || item.status}</span>
							</div>
							<p className="text-xs font-semibold text-slate-500">{item.weekLabel} · {item.operationType} · {item.regionalName}{item.baseName ? ` · ${item.baseName}` : ""}</p>
						</button>
					)}
				/>
			)}
		</div>
	);
}
